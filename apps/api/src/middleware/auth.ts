import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { pool } from '../db/pool';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';
import { UserRole } from './requestContext';

interface AccessPayload {
  sub: string;
  email: string;
  role: UserRole;
  type: 'access';
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  if (!header || !header.startsWith('Bearer ')) {
    next(new UnauthorizedError('Missing or invalid Authorization header'));
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload;
    if (payload.type !== 'access') {
      next(new UnauthorizedError('Invalid token type'));
      return;
    }
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired access token'));
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      next(new ForbiddenError(`Role '${req.user.role}' is not authorized for this action`));
      return;
    }
    next();
  };
}

/**
 * Sensitive-action re-authentication check (Assessment 04).
 * Requires X-Reauth-Token header issued via /auth/reauth, single-use and scoped.
 */
export function requireReauth(actionScope: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }
      const rawToken = req.header('x-reauth-token');
      if (!rawToken) {
        throw new ForbiddenError(`Re-authentication required for '${actionScope}'`);
      }

      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const result = await pool.query(
        `UPDATE reauth_tokens
         SET used_at = NOW()
         WHERE token_hash = $1
           AND user_id = $2
           AND action_scope = $3
           AND used_at IS NULL
           AND expires_at > NOW()
         RETURNING id`,
        [tokenHash, req.user.id, actionScope]
      );

      if (result.rowCount === 0) {
        throw new ForbiddenError('Invalid, expired, or already used re-authentication token');
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
