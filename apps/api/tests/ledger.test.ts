import {
  executeReversal,
  executeTransfer,
  formatScaledAmount,
  parseScaledAmount,
} from '../src/services/ledgerService';
import * as dbPool from '../src/db/pool';
import { ConflictError, InsufficientFundsError, ValidationError } from '../src/utils/errors';

jest.mock('../src/db/pool', () => ({
  pool: { query: jest.fn(), connect: jest.fn(), end: jest.fn() },
  withTransaction: jest.fn(),
}));

const SRC_ID = '11111111-1111-1111-1111-111111111111';
const DST_ID = '22222222-2222-2222-2222-222222222222';
const FEE_ID = '00000000-0000-0000-0000-000000000002';

describe('Double-Entry Ledger & Transfer Consistency Engine (Assessments 03, 07, 12)', () => {
  test('parseScaledAmount and formatScaledAmount preserve exact 4-decimal precision', () => {
    expect(parseScaledAmount('100.25')).toBe(1002500n);
    expect(parseScaledAmount('0.0001')).toBe(1n);
    expect(formatScaledAmount(1002500n)).toBe('100.2500');
    expect(() => parseScaledAmount('-5.00')).toThrow(ValidationError);
    expect(() => parseScaledAmount('12.34567')).toThrow(ValidationError);
  });

  test('executes balanced transfer with deterministic UUID lock ordering', async () => {
    const queries: Array<{ sql: string; params?: unknown[] }> = [];
    const mockClient = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (sql.includes('FROM transactions WHERE idempotency_key')) {
          return { rowCount: 0, rows: [] };
        }
        if (sql.includes('FROM accounts') && sql.includes('FOR UPDATE')) {
          const id = params?.[0];
          if (id === FEE_ID) {
            return {
              rowCount: 1,
              rows: [{ id: FEE_ID, user_id: null, account_type: 'system_fee', currency: 'USD', balance: '10.0000', available_balance: '10.0000', status: 'active' }],
            };
          }
          if (id === SRC_ID) {
            return {
              rowCount: 1,
              rows: [{ id: SRC_ID, user_id: 'u1', account_type: 'wallet', currency: 'USD', balance: '500.0000', available_balance: '500.0000', status: 'active' }],
            };
          }
          return {
            rowCount: 1,
            rows: [{ id: DST_ID, user_id: 'u2', account_type: 'wallet', currency: 'USD', balance: '100.0000', available_balance: '100.0000', status: 'active' }],
          };
        }
        if (sql.includes('INSERT INTO transactions')) {
          return { rowCount: 1, rows: [{ id: 'tx-1', reference: 'TX-TEST', status: 'completed' }] };
        }
        return { rowCount: 1, rows: [] };
      }),
    };

    (dbPool.withTransaction as jest.Mock).mockImplementation(async (fn) => fn(mockClient));

    const res = await executeTransfer({
      idempotencyKey: 'idem-1',
      sourceAccountId: SRC_ID,
      destinationAccountId: DST_ID,
      amount: '100.00',
      feeAmount: '0.25',
      actorId: 'u1',
      actorRole: 'customer',
    });

    expect(res.idempotentReplay).toBe(false);
    expect(res.transaction.id).toBe('tx-1');

    // Verify deterministic lock order: FEE_ID (0000...) < SRC_ID (1111...) < DST_ID (2222...)
    const lockCalls = queries.filter((q) => q.sql.includes('FOR UPDATE')).map((q) => q.params?.[0]);
    expect(lockCalls).toEqual([FEE_ID, SRC_ID, DST_ID]);

    // Verify DB balance invariant assertion was called
    expect(queries.some((q) => q.sql.includes('assert_transaction_balanced'))).toBe(true);
  });

  test('returns idempotentReplay=true without debiting twice on duplicate idempotency key', async () => {
    const mockClient = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM transactions WHERE idempotency_key')) {
          return { rowCount: 1, rows: [{ id: 'tx-existing', reference: 'TX-OLD', status: 'completed' }] };
        }
        return { rowCount: 0, rows: [] };
      }),
    };
    (dbPool.withTransaction as jest.Mock).mockImplementation(async (fn) => fn(mockClient));

    const res = await executeTransfer({
      idempotencyKey: 'idem-dup',
      sourceAccountId: SRC_ID,
      destinationAccountId: DST_ID,
      amount: '50.00',
      actorId: 'u1',
      actorRole: 'customer',
    });

    expect(res.idempotentReplay).toBe(true);
    expect(res.transaction.id).toBe('tx-existing');
    expect(mockClient.query).toHaveBeenCalledTimes(1);
  });

  test('rejects transfer when source wallet has insufficient funds', async () => {
    const mockClient = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('FROM transactions WHERE idempotency_key')) return { rowCount: 0, rows: [] };
        if (sql.includes('FOR UPDATE')) {
          const id = params?.[0];
          const bal = id === SRC_ID ? '10.0000' : '100.0000';
          return {
            rowCount: 1,
            rows: [{ id, user_id: 'u1', account_type: 'wallet', currency: 'USD', balance: bal, available_balance: bal, status: 'active' }],
          };
        }
        return { rowCount: 0, rows: [] };
      }),
    };
    (dbPool.withTransaction as jest.Mock).mockImplementation(async (fn) => fn(mockClient));

    await expect(
      executeTransfer({
        idempotencyKey: 'idem-low',
        sourceAccountId: SRC_ID,
        destinationAccountId: DST_ID,
        amount: '50.00',
        actorId: 'u1',
        actorRole: 'customer',
      })
    ).rejects.toThrow(InsufficientFundsError);
  });

  test('rejects reversal if parent transaction is already reversed', async () => {
    const mockClient = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM transactions WHERE idempotency_key')) return { rowCount: 0, rows: [] };
        if (sql.includes('FROM transactions WHERE id = $1 FOR UPDATE')) {
          return { rowCount: 1, rows: [{ id: 'tx-1', status: 'reversed' }] };
        }
        return { rowCount: 0, rows: [] };
      }),
    };
    (dbPool.withTransaction as jest.Mock).mockImplementation(async (fn) => fn(mockClient));

    await expect(
      executeReversal({
        idempotencyKey: 'rev-1',
        parentTransactionId: 'tx-1',
        reason: 'Duplicate reversal attempt',
        type: 'reversal',
        actorId: 'admin-1',
        actorRole: 'finance_admin',
      })
    ).rejects.toThrow(ConflictError);
  });
});
