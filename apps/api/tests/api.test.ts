import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { app } from '../src/app';
import { env } from '../src/config/env';
import { pool } from '../src/db/pool';

jest.mock('../src/db/pool', () => ({
  pool: { query: jest.fn(), connect: jest.fn(), end: jest.fn() },
  withTransaction: jest.fn(),
}));

function makeToken(role: string, id = 'user-1') {
  return jwt.sign({ sub: id, email: `${role}@fincore.sim`, role, type: 'access' }, env.JWT_ACCESS_SECRET, {
    expiresIn: '15m',
  });
}

describe('FinCore REST API Security, RBAC & Webhook Replay Tests (Assessments 02, 04, 08, 12)', () => {
  test('GET /health returns 200 simulated-sandbox status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  test('POST /api/v1/transfers rejects unauthenticated requests with 401', async () => {
    const res = await request(app).post('/api/v1/transfers').send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('POST /api/v1/transfers requires Idempotency-Key header', async () => {
    const token = makeToken('customer');
    const res = await request(app)
      .post('/api/v1/transfers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sourceAccountId: '11111111-1111-1111-1111-111111111111',
        destinationAccountId: '22222222-2222-2222-2222-222222222222',
        amount: '10.00',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('POST /api/v1/transfers/:id/reverse enforces RBAC (customer gets 403)', async () => {
    const token = makeToken('customer');
    const res = await request(app)
      .post('/api/v1/transfers/11111111-1111-1111-1111-111111111111/reverse')
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Unauthorized attempt' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('POST /api/v1/payments/webhooks/sandbox rejects invalid HMAC signature', async () => {
    (pool.query as jest.Mock).mockResolvedValue({ rowCount: 1, rows: [] });
    const res = await request(app)
      .post('/api/v1/payments/webhooks/sandbox')
      .set('X-Sandbox-Signature', 'invalid_sig')
      .send({
        event_id: 'evt_bad_1',
        event_type: 'payment_intent.succeeded',
        provider_intent_id: 'pi_sandbox_1',
      });
    expect(res.status).toBe(401);
  });

  test('POST /api/v1/payments/webhooks/sandbox deduplicates replayed event_id', async () => {
    const payload = {
      event_id: 'evt_replay_1',
      event_type: 'payment_intent.succeeded',
      provider_intent_id: 'pi_sandbox_1',
    };
    const sig = crypto
      .createHmac('sha256', env.SANDBOX_PAYMENT_WEBHOOK_SECRET)
      .update(JSON.stringify(payload))
      .digest('hex');

    // Simulate duplicate: INSERT ON CONFLICT DO NOTHING returns rowCount 0
    (pool.query as jest.Mock).mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await request(app)
      .post('/api/v1/payments/webhooks/sandbox')
      .set('X-Sandbox-Signature', sig)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ignored_duplicate');
  });
});
