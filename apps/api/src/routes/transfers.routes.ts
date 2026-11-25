import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { requireAuth, requireRole } from '../middleware/auth';
import { evaluateRiskWithAnalytics } from '../services/analyticsClient';
import { executeReversal, executeTransfer } from '../services/ledgerService';
import { sendSandboxNotification } from '../services/notificationService';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';

export const transfersRouter = Router();

transfersRouter.use(requireAuth);

const createTransferSchema = z.object({
  sourceAccountId: z.string().uuid(),
  destinationAccountId: z.string().uuid().optional(),
  destinationAccountNumber: z.string().min(4).max(32).optional(),
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/),
  description: z.string().max(200).optional(),
});

transfersRouter.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 100);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const isStaff = ['operations_analyst', 'finance_admin', 'platform_admin', 'support_agent'].includes(req.user!.role);

    const result = isStaff
      ? await pool.query(
          `SELECT * FROM transactions ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
          [limit, offset]
        )
      : await pool.query(
          `SELECT t.*
           FROM transactions t
           JOIN accounts a ON a.id = t.source_account_id OR a.id = t.destination_account_id
           WHERE a.user_id = $1
           GROUP BY t.id
           ORDER BY t.created_at DESC
           LIMIT $2 OFFSET $3`,
          [req.user!.id, limit, offset]
        );

    res.status(200).json({ data: result.rows, pagination: { limit, offset } });
  } catch (err) {
    next(err);
  }
});

transfersRouter.post('/', async (req, res, next) => {
  try {
    const idempotencyKey = req.header('idempotency-key');
    if (!idempotencyKey) {
      throw new ValidationError('Idempotency-Key header is required');
    }

    const body = createTransferSchema.parse(req.body);

    const srcRes = await pool.query(`SELECT id, user_id FROM accounts WHERE id = $1`, [body.sourceAccountId]);
    if (srcRes.rowCount === 0) throw new NotFoundError('Source wallet not found');
    if (srcRes.rows[0].user_id !== req.user!.id && req.user!.role === 'customer') {
      throw new ForbiddenError('You do not own the source wallet');
    }

    let destinationAccountId = body.destinationAccountId;
    if (!destinationAccountId && body.destinationAccountNumber) {
      const dstRes = await pool.query(`SELECT id FROM accounts WHERE account_number = $1`, [
        body.destinationAccountNumber,
      ]);
      if (dstRes.rowCount === 0) throw new NotFoundError('Destination account number not found');
      destinationAccountId = dstRes.rows[0].id;
    }
    if (!destinationAccountId) {
      throw new ValidationError('Either destinationAccountId or destinationAccountNumber is required');
    }

    // Velocity & risk evaluation (Decision support)
    const velRes = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour')::int AS count_1h,
         COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS count_24h,
         COALESCE(SUM(amount) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'), 0)::text AS vol_24h,
         COALESCE(AVG(amount), 0)::text AS avg_amt
       FROM transactions
       WHERE created_by = $1 AND type = 'transfer'`,
      [req.user!.id]
    );
    const vel = velRes.rows[0];
    const risk = await evaluateRiskWithAnalytics({
      amount: body.amount,
      tx_count_1h: vel.count_1h ?? 0,
      tx_count_24h: vel.count_24h ?? 0,
      volume_24h: vel.vol_24h ?? '0.00',
      avg_tx_amount: vel.avg_amt ?? '0.00',
      is_new_beneficiary: false,
    });

    const result = await executeTransfer({
      idempotencyKey,
      sourceAccountId: body.sourceAccountId,
      destinationAccountId,
      amount: body.amount,
      feeAmount: '0.2500',
      description: body.description,
      actorId: req.user!.id,
      actorRole: req.user!.role,
      requestId: req.requestId,
    });

    if (!result.idempotentReplay && risk.should_flag) {
      await pool.query(
        `INSERT INTO risk_alerts (user_id, transaction_id, alert_type, severity, risk_score, factors)
         VALUES ($1, $2, 'velocity_or_amount_anomaly', $3, $4, $5::jsonb)`,
        [req.user!.id, result.transaction.id, risk.severity, risk.risk_score, JSON.stringify(risk.factors)]
      );
    }

    if (!result.idempotentReplay) {
      await sendSandboxNotification({
        userId: req.user!.id,
        channel: 'email_sandbox',
        recipient: req.user!.email,
        subject: `FinCore Transfer ${result.transaction.reference}`,
        body: `Your simulated transfer of $${body.amount} USD completed. Ref: ${result.transaction.reference}`,
      });
    }

    res.status(result.idempotentReplay ? 200 : 201).json({
      data: {
        ...result,
        riskEvaluation: risk,
      },
    });
  } catch (err) {
    next(err);
  }
});

transfersRouter.post(
  '/:id/reverse',
  requireRole('finance_admin', 'platform_admin'),
  async (req, res, next) => {
    try {
      const idempotencyKey = req.header('idempotency-key') || `rev-${req.params.id}`;
      const { reason } = z.object({ reason: z.string().min(3).max(255) }).parse(req.body);

      const result = await executeReversal({
        idempotencyKey,
        parentTransactionId: String(req.params.id),
        reason,
        type: 'reversal',
        actorId: req.user!.id,
        actorRole: req.user!.role,
        requestId: req.requestId,
      });

      res.status(result.idempotentReplay ? 200 : 201).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

transfersRouter.post(
  '/:id/refund',
  requireRole('support_agent', 'finance_admin', 'platform_admin'),
  async (req, res, next) => {
    try {
      const idempotencyKey = req.header('idempotency-key') || `ref-${req.params.id}`;
      const { reason } = z.object({ reason: z.string().min(3).max(255) }).parse(req.body);

      const result = await executeReversal({
        idempotencyKey,
        parentTransactionId: String(req.params.id),
        reason,
        type: 'refund',
        actorId: req.user!.id,
        actorRole: req.user!.role,
        requestId: req.requestId,
      });

      res.status(result.idempotentReplay ? 200 : 201).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);
