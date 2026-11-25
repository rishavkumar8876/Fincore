import crypto from 'crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { env } from '../config/env';
import { pool, withTransaction } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { recordAudit } from '../services/auditService';
import { ConflictError, UnauthorizedError, ValidationError } from '../utils/errors';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  fullName: z.string().min(2).max(150),
  phone: z.string().max(30).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  mfaCode: z.string().optional(),
});

function signAccessToken(user: { id: string; email: string; role: string }): string {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role, type: 'access' }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

authRouter.post('/register', async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const email = body.email.toLowerCase();

    const result = await withTransaction(async (client) => {
      const existing = await client.query(`SELECT id FROM users WHERE email = $1`, [email]);
      if (existing.rowCount && existing.rowCount > 0) {
        throw new ConflictError('An account with this email already exists');
      }

      const passwordHash = await bcrypt.hash(body.password, 10);
      const userRes = await client.query(
        `INSERT INTO users (email, password_hash, full_name, phone, role)
         VALUES ($1, $2, $3, $4, 'customer')
         RETURNING id, email, full_name, role, mfa_enabled, created_at`,
        [email, passwordHash, body.fullName, body.phone ?? null]
      );
      const user = userRes.rows[0];

      const accNum = `FC-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`;
      const walletRes = await client.query(
        `INSERT INTO accounts (user_id, account_number, account_type, currency, balance, available_balance)
         VALUES ($1, $2, 'wallet', 'USD', 0.0000, 0.0000)
         RETURNING id, account_number, currency, balance, available_balance, status`,
        [user.id, accNum]
      );

      await recordAudit(
        {
          actorId: user.id,
          actorRole: user.role,
          action: 'USER_REGISTERED',
          resourceType: 'user',
          resourceId: user.id,
          ipAddress: req.ip,
          requestId: req.requestId,
        },
        client
      );

      return { user, wallet: walletRes.rows[0] };
    });

    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const email = body.email.toLowerCase();

    const userRes = await pool.query(
      `SELECT id, email, password_hash, full_name, role, mfa_enabled, is_active FROM users WHERE email = $1`,
      [email]
    );
    if (userRes.rowCount === 0) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const user = userRes.rows[0];
    if (!user.is_active) {
      throw new UnauthorizedError('Account is deactivated');
    }

    const valid = await bcrypt.compare(body.password, user.password_hash);
    if (!valid) {
      await recordAudit({
        actorId: user.id,
        actorRole: user.role,
        action: 'LOGIN_FAILED',
        resourceType: 'user',
        resourceId: user.id,
        ipAddress: req.ip,
        requestId: req.requestId,
      });
      throw new UnauthorizedError('Invalid email or password');
    }

    if (user.mfa_enabled) {
      if (!body.mfaCode) {
        res.status(200).json({ data: { mfaRequired: true, message: 'Enter simulated MFA code (sandbox: 123456)' } });
        return;
      }
      if (body.mfaCode !== '123456') {
        throw new UnauthorizedError('Invalid MFA verification code');
      }
    }

    const accessToken = signAccessToken(user);
    const rawRefresh = uuidv4() + '.' + crypto.randomBytes(24).toString('hex');
    const refreshHash = hashToken(rawRefresh);

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2, NOW() + INTERVAL '7 days', $3, $4)`,
      [user.id, refreshHash, req.ip ?? null, req.header('user-agent') ?? null]
    );

    await recordAudit({
      actorId: user.id,
      actorRole: user.role,
      action: 'LOGIN_SUCCESS',
      resourceType: 'user',
      resourceId: user.id,
      ipAddress: req.ip,
      requestId: req.requestId,
    });

    res.status(200).json({
      data: {
        accessToken,
        refreshToken: rawRefresh,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          mfaEnabled: user.mfa_enabled,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = z.object({ refreshToken: z.string().min(10) }).parse(req.body);
    const tokenHash = hashToken(refreshToken);

    const tokenRes = await pool.query(
      `SELECT rt.id, rt.user_id, u.email, u.role, u.is_active
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1 AND rt.revoked_at IS NULL AND rt.expires_at > NOW()`,
      [tokenHash]
    );

    if (tokenRes.rowCount === 0 || !tokenRes.rows[0].is_active) {
      throw new UnauthorizedError('Invalid or revoked refresh token');
    }

    const row = tokenRes.rows[0];
    const accessToken = signAccessToken({ id: row.user_id, email: row.email, role: row.role });
    res.status(200).json({ data: { accessToken } });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = z.object({ refreshToken: z.string().min(10) }).parse(req.body);
    await pool.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1`, [hashToken(refreshToken)]);
    res.status(200).json({ data: { loggedOut: true } });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/mfa/toggle', requireAuth, async (req, res, next) => {
  try {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    await pool.query(`UPDATE users SET mfa_enabled = $1, updated_at = NOW() WHERE id = $2`, [enabled, req.user!.id]);
    await recordAudit({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: enabled ? 'MFA_ENABLED' : 'MFA_DISABLED',
      resourceType: 'user',
      resourceId: req.user!.id,
      ipAddress: req.ip,
      requestId: req.requestId,
    });
    res.status(200).json({ data: { mfaEnabled: enabled } });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/reauth', requireAuth, async (req, res, next) => {
  try {
    const body = z
      .object({
        password: z.string().min(1),
        actionScope: z.string().min(2).max(64),
      })
      .parse(req.body);

    const userRes = await pool.query(`SELECT password_hash FROM users WHERE id = $1`, [req.user!.id]);
    if (userRes.rowCount === 0) throw new UnauthorizedError();

    const valid = await bcrypt.compare(body.password, userRes.rows[0].password_hash);
    if (!valid) {
      throw new ValidationError('Invalid password for re-authentication');
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    await pool.query(
      `INSERT INTO reauth_tokens (user_id, token_hash, action_scope, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '5 minutes')`,
      [req.user!.id, hashToken(rawToken), body.actionScope]
    );

    res.status(200).json({ data: { reauthToken: rawToken, expiresInSeconds: 300, actionScope: body.actionScope } });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, email, full_name, phone, role, mfa_enabled, kyc_status, created_at FROM users WHERE id = $1`,
      [req.user!.id]
    );
    res.status(200).json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});
