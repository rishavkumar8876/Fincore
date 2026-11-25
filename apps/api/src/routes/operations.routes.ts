import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { requireAuth, requireRole } from '../middleware/auth';
import { recordAudit } from '../services/auditService';
import { NotFoundError } from '../utils/errors';

export const operationsRouter = Router();

operationsRouter.use(requireAuth);

// --- Disputes ---
operationsRouter.get('/disputes', async (req, res, next) => {
  try {
    const isStaff = ['support_agent', 'operations_analyst', 'finance_admin', 'platform_admin'].includes(req.user!.role);
    const result = isStaff
      ? await pool.query(`SELECT * FROM disputes ORDER BY created_at DESC LIMIT 100`)
      : await pool.query(`SELECT * FROM disputes WHERE user_id = $1 ORDER BY created_at DESC`, [req.user!.id]);
    res.status(200).json({ data: result.rows });
  } catch (err) {
    next(err);
  }
});

operationsRouter.post('/disputes', async (req, res, next) => {
  try {
    const body = z
      .object({
        transactionId: z.string().uuid(),
        reason: z.string().min(3).max(64),
        description: z.string().min(5).max(1000),
      })
      .parse(req.body);

    const tx = await pool.query(`SELECT id FROM transactions WHERE id = $1`, [body.transactionId]);
    if (tx.rowCount === 0) throw new NotFoundError('Transaction not found');

    const result = await pool.query(
      `INSERT INTO disputes (transaction_id, user_id, reason, description)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [body.transactionId, req.user!.id, body.reason, body.description]
    );

    await recordAudit({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'DISPUTE_OPENED',
      resourceType: 'dispute',
      resourceId: result.rows[0].id,
      requestId: req.requestId,
    });

    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

operationsRouter.patch(
  '/disputes/:id',
  requireRole('support_agent', 'operations_analyst', 'finance_admin', 'platform_admin'),
  async (req, res, next) => {
    try {
      const body = z
        .object({
          status: z.enum(['under_review', 'resolved_refunded', 'resolved_rejected']),
          resolutionNotes: z.string().max(1000).optional(),
        })
        .parse(req.body);

      const result = await pool.query(
        `UPDATE disputes
         SET status = $1, resolution_notes = $2, assigned_to = $3, updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [body.status, body.resolutionNotes ?? null, req.user!.id, req.params.id]
      );
      if (result.rowCount === 0) throw new NotFoundError('Dispute not found');
      res.status(200).json({ data: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

// --- Risk Alerts ---
operationsRouter.get(
  '/risk-alerts',
  requireRole('operations_analyst', 'finance_admin', 'platform_admin'),
  async (_req, res, next) => {
    try {
      const result = await pool.query(`SELECT * FROM risk_alerts ORDER BY created_at DESC LIMIT 100`);
      res.status(200).json({
        data: result.rows,
        disclaimer: 'Risk scores are decision support for operations analysts, not proof of fraud.',
      });
    } catch (err) {
      next(err);
    }
  }
);

operationsRouter.patch(
  '/risk-alerts/:id',
  requireRole('operations_analyst', 'finance_admin', 'platform_admin'),
  async (req, res, next) => {
    try {
      const { status } = z
        .object({ status: z.enum(['acknowledged', 'resolved_false_positive', 'escalated']) })
        .parse(req.body);
      const result = await pool.query(
        `UPDATE risk_alerts SET status = $1, reviewed_by = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
        [status, req.user!.id, req.params.id]
      );
      if (result.rowCount === 0) throw new NotFoundError('Risk alert not found');
      res.status(200).json({ data: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

// --- Settlements & Reconciliation ---
operationsRouter.get(
  '/settlements',
  requireRole('operations_analyst', 'finance_admin', 'platform_admin'),
  async (_req, res, next) => {
    try {
      const result = await pool.query(`SELECT * FROM settlements ORDER BY created_at DESC LIMIT 50`);
      res.status(200).json({ data: result.rows });
    } catch (err) {
      next(err);
    }
  }
);

operationsRouter.post(
  '/settlements/reconcile',
  requireRole('operations_analyst', 'finance_admin', 'platform_admin'),
  async (req, res, next) => {
    try {
      const body = z
        .object({
          batchReference: z.string().min(3).max(64),
          expectedAmount: z.string().regex(/^\d+(\.\d{1,4})?$/),
          settledAmount: z.string().regex(/^\d+(\.\d{1,4})?$/),
          notes: z.string().max(500).optional(),
        })
        .parse(req.body);

      const status = Number(body.expectedAmount) === Number(body.settledAmount) ? 'matched' : 'mismatched';
      const result = await pool.query(
        `INSERT INTO settlements (batch_reference, expected_amount, settled_amount, status, reconciled_by, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [body.batchReference, body.expectedAmount, body.settledAmount, status, req.user!.id, body.notes ?? null]
      );
      res.status(201).json({ data: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

// --- Audit Logs ---
operationsRouter.get(
  '/audit-logs',
  requireRole('operations_analyst', 'finance_admin', 'platform_admin'),
  async (req, res, next) => {
    try {
      const limit = Math.min(Number(req.query.limit ?? 50), 100);
      const result = await pool.query(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1`, [limit]);
      res.status(200).json({ data: result.rows });
    } catch (err) {
      next(err);
    }
  }
);

// --- Sandbox Notifications ---
operationsRouter.get('/notifications', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user!.id]
    );
    res.status(200).json({ data: result.rows });
  } catch (err) {
    next(err);
  }
});
