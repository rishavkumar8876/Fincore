import crypto from 'crypto';
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { env } from '../config/env';
import { pool } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { executeSandboxDeposit } from '../services/ledgerService';
import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../utils/errors';

export const paymentsRouter = Router();

paymentsRouter.post('/intents', requireAuth, async (req, res, next) => {
  try {
    const idempotencyKey = req.header('idempotency-key');
    if (!idempotencyKey) throw new ValidationError('Idempotency-Key header is required');

    const body = z
      .object({
        accountId: z.string().uuid(),
        amount: z.string().regex(/^\d+(\.\d{1,4})?$/),
      })
      .parse(req.body);

    const existing = await pool.query(`SELECT * FROM payment_intents WHERE idempotency_key = $1`, [idempotencyKey]);
    if (existing.rowCount && existing.rowCount > 0) {
      res.status(200).json({ data: existing.rows[0], idempotentReplay: true });
      return;
    }

    const acc = await pool.query(`SELECT user_id FROM accounts WHERE id = $1`, [body.accountId]);
    if (acc.rowCount === 0) throw new NotFoundError('Wallet not found');
    if (acc.rows[0].user_id !== req.user!.id && req.user!.role === 'customer') {
      throw new ForbiddenError();
    }

    const providerIntentId = `pi_sandbox_${uuidv4().slice(0, 14)}`;
    const result = await pool.query(
      `INSERT INTO payment_intents (user_id, account_id, idempotency_key, provider, provider_intent_id, amount, currency, status)
       VALUES ($1, $2, $3, 'sandbox_pay', $4, $5, 'USD', 'requires_confirmation')
       RETURNING *`,
      [req.user!.id, body.accountId, idempotencyKey, providerIntentId, body.amount]
    );

    res.status(201).json({ data: result.rows[0], idempotentReplay: false });
  } catch (err) {
    next(err);
  }
});

paymentsRouter.post('/intents/:id/confirm', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE payment_intents
       SET status = 'processing', updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND status = 'requires_confirmation'
       RETURNING *`,
      [req.params.id, req.user!.id]
    );
    if (result.rowCount === 0) {
      throw new NotFoundError('Payment intent not found or cannot be confirmed');
    }
    res.status(200).json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * Sandbox Webhook Receiver (Assessment 08).
 * Verifies HMAC-SHA256 signature in X-Sandbox-Signature and deduplicates by event_id.
 */
paymentsRouter.post('/webhooks/sandbox', async (req, res, next) => {
  try {
    const signature = req.header('x-sandbox-signature');
    const rawPayload = JSON.stringify(req.body);
    const expectedSig = crypto
      .createHmac('sha256', env.SANDBOX_PAYMENT_WEBHOOK_SECRET)
      .update(rawPayload)
      .digest('hex');

    const signatureValid =
      Boolean(signature) &&
      signature!.length === expectedSig.length &&
      crypto.timingSafeEqual(Buffer.from(signature!), Buffer.from(expectedSig));

    const eventSchema = z.object({
      event_id: z.string().min(3),
      event_type: z.enum(['payment_intent.succeeded', 'payment_intent.failed']),
      provider_intent_id: z.string().min(3),
    });

    const parsed = eventSchema.parse(req.body);

    if (!signatureValid) {
      await pool.query(
        `INSERT INTO webhook_events (provider, event_id, event_type, signature_valid, payload, status, error_message)
         VALUES ('sandbox_pay', $1, $2, FALSE, $3::jsonb, 'failed', 'Invalid HMAC signature')
         ON CONFLICT (event_id) DO NOTHING`,
        [parsed.event_id, parsed.event_type, rawPayload]
      );
      throw new UnauthorizedError('Invalid webhook signature');
    }

    // Deduplicate event_id
    const insertRes = await pool.query(
      `INSERT INTO webhook_events (provider, event_id, event_type, signature_valid, payload, status)
       VALUES ('sandbox_pay', $1, $2, TRUE, $3::jsonb, 'received')
       ON CONFLICT (event_id) DO NOTHING
       RETURNING id`,
      [parsed.event_id, parsed.event_type, rawPayload]
    );

    if (insertRes.rowCount === 0) {
      res.status(200).json({ data: { status: 'ignored_duplicate', eventId: parsed.event_id } });
      return;
    }

    const intentRes = await pool.query(`SELECT * FROM payment_intents WHERE provider_intent_id = $1`, [
      parsed.provider_intent_id,
    ]);
    if (intentRes.rowCount === 0) {
      await pool.query(
        `UPDATE webhook_events SET status = 'failed', error_message = 'Intent not found' WHERE event_id = $1`,
        [parsed.event_id]
      );
      throw new NotFoundError('Payment intent not found');
    }

    const intent = intentRes.rows[0];
    if (parsed.event_type === 'payment_intent.succeeded') {
      await executeSandboxDeposit({
        idempotencyKey: `wh-${parsed.event_id}`,
        destinationAccountId: intent.account_id,
        amount: intent.amount,
        description: `Sandbox payment intent ${intent.provider_intent_id}`,
        actorId: intent.user_id,
        actorRole: 'customer',
      });
      await pool.query(`UPDATE payment_intents SET status = 'succeeded', updated_at = NOW() WHERE id = $1`, [intent.id]);
    } else {
      await pool.query(`UPDATE payment_intents SET status = 'failed', updated_at = NOW() WHERE id = $1`, [intent.id]);
    }

    await pool.query(`UPDATE webhook_events SET status = 'processed', processed_at = NOW() WHERE event_id = $1`, [
      parsed.event_id,
    ]);

    res.status(200).json({ data: { status: 'processed', eventId: parsed.event_id } });
  } catch (err) {
    next(err);
  }
});
