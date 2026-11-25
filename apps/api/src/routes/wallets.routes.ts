import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool';
import { requireAuth, requireRole } from '../middleware/auth';
import { executeSandboxDeposit } from '../services/ledgerService';
import { recordAudit } from '../services/auditService';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';

export const walletsRouter = Router();

walletsRouter.use(requireAuth);

walletsRouter.get('/', async (req, res, next) => {
  try {
    const isStaff = ['operations_analyst', 'finance_admin', 'platform_admin', 'support_agent'].includes(req.user!.role);
    const result = isStaff
      ? await pool.query(
          `SELECT a.*, u.email AS owner_email, u.full_name AS owner_name
           FROM accounts a
           LEFT JOIN users u ON u.id = a.user_id
           ORDER BY a.created_at DESC LIMIT 100`
        )
      : await pool.query(
          `SELECT * FROM accounts WHERE user_id = $1 AND account_type = 'wallet' ORDER BY created_at ASC`,
          [req.user!.id]
        );
    res.status(200).json({ data: result.rows });
  } catch (err) {
    next(err);
  }
});

walletsRouter.post('/', async (req, res, next) => {
  try {
    const { currency } = z.object({ currency: z.literal('USD').default('USD') }).parse(req.body ?? {});
    const accNum = `FC-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`;
    const result = await pool.query(
      `INSERT INTO accounts (user_id, account_number, account_type, currency, balance, available_balance)
       VALUES ($1, $2, 'wallet', $3, 0.0000, 0.0000)
       RETURNING *`,
      [req.user!.id, accNum, currency]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

walletsRouter.post('/deposit', async (req, res, next) => {
  try {
    const idempotencyKey = req.header('idempotency-key');
    if (!idempotencyKey) {
      throw new ValidationError('Idempotency-Key header is required');
    }
    const body = z
      .object({
        accountId: z.string().uuid(),
        amount: z.string().regex(/^\d+(\.\d{1,4})?$/),
        description: z.string().max(200).optional(),
      })
      .parse(req.body);

    const acc = await pool.query(`SELECT user_id FROM accounts WHERE id = $1`, [body.accountId]);
    if (acc.rowCount === 0) throw new NotFoundError('Wallet not found');
    if (acc.rows[0].user_id !== req.user!.id && req.user!.role === 'customer') {
      throw new ForbiddenError('Cannot deposit to another user wallet directly');
    }

    const result = await executeSandboxDeposit({
      idempotencyKey,
      destinationAccountId: body.accountId,
      amount: body.amount,
      description: body.description,
      actorId: req.user!.id,
      actorRole: req.user!.role,
      requestId: req.requestId,
    });

    res.status(result.idempotentReplay ? 200 : 201).json({ data: result });
  } catch (err) {
    next(err);
  }
});

walletsRouter.get('/:id/ledger', async (req, res, next) => {
  try {
    const acc = await pool.query(`SELECT id, user_id FROM accounts WHERE id = $1`, [req.params.id]);
    if (acc.rowCount === 0) throw new NotFoundError('Account not found');
    if (acc.rows[0].user_id !== req.user!.id && req.user!.role === 'customer') {
      throw new ForbiddenError();
    }

    const limit = Math.min(Number(req.query.limit ?? 50), 100);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);

    const entries = await pool.query(
      `SELECT le.*, t.reference, t.type AS tx_type, t.description
       FROM ledger_entries le
       JOIN transactions t ON t.id = le.transaction_id
       WHERE le.account_id = $1
       ORDER BY le.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.id, limit, offset]
    );
    res.status(200).json({ data: entries.rows, pagination: { limit, offset } });
  } catch (err) {
    next(err);
  }
});

walletsRouter.get('/:id/statement', async (req, res, next) => {
  try {
    const acc = await pool.query(`SELECT * FROM accounts WHERE id = $1`, [req.params.id]);
    if (acc.rowCount === 0) throw new NotFoundError('Account not found');
    if (acc.rows[0].user_id !== req.user!.id && req.user!.role === 'customer') {
      throw new ForbiddenError();
    }

    const entries = await pool.query(
      `SELECT le.id, le.entry_type, le.amount, le.balance_after, le.created_at, t.reference, t.type, t.description
       FROM ledger_entries le
       JOIN transactions t ON t.id = le.transaction_id
       WHERE le.account_id = $1
       ORDER BY le.created_at ASC`,
      [req.params.id]
    );

    if (req.query.format === 'csv') {
      const header = 'date,reference,type,entry_type,amount,balance_after,description\n';
      const rows = entries.rows
        .map(
          (r) =>
            `${r.created_at.toISOString()},${r.reference},${r.type},${r.entry_type},${r.amount},${r.balance_after},"${(r.description || '').replace(/"/g, '""')}"`
        )
        .join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="statement-${acc.rows[0].account_number}.csv"`);
      res.status(200).send(header + rows);
      return;
    }

    res.status(200).json({
      data: {
        account: acc.rows[0],
        entries: entries.rows,
        simulatedNotice: 'Simulated statement for FinCore sandbox environment.',
      },
    });
  } catch (err) {
    next(err);
  }
});

walletsRouter.patch(
  '/:id/status',
  requireRole('operations_analyst', 'finance_admin', 'platform_admin'),
  async (req, res, next) => {
    try {
      const { status } = z.object({ status: z.enum(['active', 'frozen', 'closed']) }).parse(req.body);
      const result = await pool.query(
        `UPDATE accounts SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [status, req.params.id]
      );
      if (result.rowCount === 0) throw new NotFoundError('Account not found');

      await recordAudit({
        actorId: req.user!.id,
        actorRole: req.user!.role,
        action: 'ACCOUNT_STATUS_UPDATED',
        resourceType: 'account',
        resourceId: String(req.params.id),
        requestId: req.requestId,
        details: { status },
      });

      res.status(200).json({ data: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);
