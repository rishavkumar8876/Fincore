import { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { withTransaction } from '../db/pool';
import { ConflictError, InsufficientFundsError, NotFoundError, ValidationError } from '../utils/errors';
import { recordAudit } from './auditService';

const SCALE = 10000n; // 4 decimal places (NUMERIC(18,4))

export function parseScaledAmount(input: string): bigint {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,4})?$/.test(trimmed)) {
    throw new ValidationError(`Invalid monetary amount format: '${input}'`);
  }
  const [whole, frac = ''] = trimmed.split('.');
  const paddedFrac = frac.padEnd(4, '0');
  return BigInt(whole) * SCALE + BigInt(paddedFrac);
}

export function formatScaledAmount(scaled: bigint): string {
  const sign = scaled < 0n ? '-' : '';
  const abs = scaled < 0n ? -scaled : scaled;
  const whole = abs / SCALE;
  const frac = (abs % SCALE).toString().padStart(4, '0');
  return `${sign}${whole}.${frac}`;
}

interface LockedAccount {
  id: string;
  user_id: string | null;
  account_type: string;
  currency: string;
  balance: string;
  available_balance: string;
  status: string;
}

/**
 * Lock accounts in deterministic UUID order to prevent PostgreSQL deadlocks
 * under concurrent transfers (Assessment 07).
 */
async function lockAccountsInOrder(client: PoolClient, accountIds: string[]): Promise<Map<string, LockedAccount>> {
  const uniqueSorted = [...new Set(accountIds)].sort();
  const map = new Map<string, LockedAccount>();
  for (const id of uniqueSorted) {
    const res = await client.query<LockedAccount>(
      `SELECT id, user_id, account_type, currency, balance::text, available_balance::text, status
       FROM accounts
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );
    if (res.rowCount === 0) {
      throw new NotFoundError(`Account ${id} not found`);
    }
    map.set(id, res.rows[0]);
  }
  return map;
}

export interface TransferParams {
  idempotencyKey: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: string;
  feeAmount?: string;
  description?: string;
  actorId: string;
  actorRole: string;
  requestId?: string;
}

const SYSTEM_FEE_ACCOUNT_ID = '00000000-0000-0000-0000-000000000002';
const SYSTEM_SETTLEMENT_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';

export async function executeTransfer(params: TransferParams) {
  if (params.sourceAccountId === params.destinationAccountId) {
    throw new ValidationError('Source and destination accounts must be different');
  }

  const amountScaled = parseScaledAmount(params.amount);
  const feeScaled = params.feeAmount ? parseScaledAmount(params.feeAmount) : 0n;
  if (amountScaled <= 0n) {
    throw new ValidationError('Transfer amount must be greater than zero');
  }

  return withTransaction(async (client) => {
    // Idempotency check inside transaction
    const existing = await client.query(
      `SELECT * FROM transactions WHERE idempotency_key = $1`,
      [params.idempotencyKey]
    );
    if (existing.rowCount && existing.rowCount > 0) {
      return { transaction: existing.rows[0], idempotentReplay: true };
    }

    const lockIds = [params.sourceAccountId, params.destinationAccountId];
    if (feeScaled > 0n) lockIds.push(SYSTEM_FEE_ACCOUNT_ID);
    const accounts = await lockAccountsInOrder(client, lockIds);

    const src = accounts.get(params.sourceAccountId)!;
    const dst = accounts.get(params.destinationAccountId)!;

    if (src.status !== 'active' || dst.status !== 'active') {
      throw new ConflictError('Both source and destination accounts must be active');
    }
    if (src.currency !== dst.currency) {
      throw new ValidationError('Cross-currency transfers are not supported in this wallet');
    }

    const srcAvailable = parseScaledAmount(src.available_balance);
    const srcBalance = parseScaledAmount(src.balance);
    const totalDebit = amountScaled + feeScaled;

    if (src.account_type === 'wallet' && srcAvailable < totalDebit) {
      throw new InsufficientFundsError();
    }

    const txRef = `TX-${uuidv4().slice(0, 12).toUpperCase()}`;
    const txRes = await client.query(
      `INSERT INTO transactions
       (idempotency_key, reference, type, status, source_account_id, destination_account_id, amount, fee_amount, currency, description, created_by)
       VALUES ($1, $2, 'transfer', 'completed', $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        params.idempotencyKey,
        txRef,
        params.sourceAccountId,
        params.destinationAccountId,
        formatScaledAmount(amountScaled),
        formatScaledAmount(feeScaled),
        src.currency,
        params.description ?? 'Wallet transfer',
        params.actorId,
      ]
    );
    const tx = txRes.rows[0];

    // Debit source (principal + fee)
    const newSrcBalance = srcBalance - totalDebit;
    const newSrcAvail = srcAvailable - totalDebit;
    await client.query(
      `UPDATE accounts SET balance = $1, available_balance = $2, version = version + 1, updated_at = NOW() WHERE id = $3`,
      [formatScaledAmount(newSrcBalance), formatScaledAmount(newSrcAvail), src.id]
    );
    await client.query(
      `INSERT INTO ledger_entries (transaction_id, account_id, entry_type, amount, currency, balance_after)
       VALUES ($1, $2, 'DEBIT', $3, $4, $5)`,
      [tx.id, src.id, formatScaledAmount(totalDebit), src.currency, formatScaledAmount(newSrcBalance)]
    );

    // Credit destination (principal)
    const dstBalance = parseScaledAmount(dst.balance) + amountScaled;
    const dstAvail = parseScaledAmount(dst.available_balance) + amountScaled;
    await client.query(
      `UPDATE accounts SET balance = $1, available_balance = $2, version = version + 1, updated_at = NOW() WHERE id = $3`,
      [formatScaledAmount(dstBalance), formatScaledAmount(dstAvail), dst.id]
    );
    await client.query(
      `INSERT INTO ledger_entries (transaction_id, account_id, entry_type, amount, currency, balance_after)
       VALUES ($1, $2, 'CREDIT', $3, $4, $5)`,
      [tx.id, dst.id, formatScaledAmount(amountScaled), dst.currency, formatScaledAmount(dstBalance)]
    );

    // Credit system fee account if fee > 0
    if (feeScaled > 0n) {
      const feeAcc = accounts.get(SYSTEM_FEE_ACCOUNT_ID)!;
      const newFeeBal = parseScaledAmount(feeAcc.balance) + feeScaled;
      const newFeeAvail = parseScaledAmount(feeAcc.available_balance) + feeScaled;
      await client.query(
        `UPDATE accounts SET balance = $1, available_balance = $2, version = version + 1, updated_at = NOW() WHERE id = $3`,
        [formatScaledAmount(newFeeBal), formatScaledAmount(newFeeAvail), feeAcc.id]
      );
      await client.query(
        `INSERT INTO ledger_entries (transaction_id, account_id, entry_type, amount, currency, balance_after)
         VALUES ($1, $2, 'CREDIT', $3, $4, $5)`,
        [tx.id, feeAcc.id, formatScaledAmount(feeScaled), feeAcc.currency, formatScaledAmount(newFeeBal)]
      );
    }

    // Assert double-entry balance invariant in DB
    await client.query(`SELECT assert_transaction_balanced($1)`, [tx.id]);

    await recordAudit(
      {
        actorId: params.actorId,
        actorRole: params.actorRole,
        action: 'TRANSFER_COMPLETED',
        resourceType: 'transaction',
        resourceId: tx.id,
        requestId: params.requestId,
        details: { reference: txRef, amount: formatScaledAmount(amountScaled), fee: formatScaledAmount(feeScaled) },
      },
      client
    );

    return { transaction: tx, idempotentReplay: false };
  });
}

export async function executeSandboxDeposit(params: {
  idempotencyKey: string;
  destinationAccountId: string;
  amount: string;
  description?: string;
  actorId: string;
  actorRole: string;
  requestId?: string;
}) {
  const amountScaled = parseScaledAmount(params.amount);
  if (amountScaled <= 0n) {
    throw new ValidationError('Deposit amount must be greater than zero');
  }

  return withTransaction(async (client) => {
    const existing = await client.query(`SELECT * FROM transactions WHERE idempotency_key = $1`, [params.idempotencyKey]);
    if (existing.rowCount && existing.rowCount > 0) {
      return { transaction: existing.rows[0], idempotentReplay: true };
    }

    const accounts = await lockAccountsInOrder(client, [SYSTEM_SETTLEMENT_ACCOUNT_ID, params.destinationAccountId]);
    const settlement = accounts.get(SYSTEM_SETTLEMENT_ACCOUNT_ID)!;
    const dst = accounts.get(params.destinationAccountId)!;

    if (dst.status !== 'active') {
      throw new ConflictError('Destination account is not active');
    }

    const txRef = `DEP-${uuidv4().slice(0, 12).toUpperCase()}`;
    const txRes = await client.query(
      `INSERT INTO transactions
       (idempotency_key, reference, type, status, source_account_id, destination_account_id, amount, fee_amount, currency, description, created_by)
       VALUES ($1, $2, 'deposit', 'completed', $3, $4, $5, 0, $6, $7, $8)
       RETURNING *`,
      [
        params.idempotencyKey,
        txRef,
        settlement.id,
        dst.id,
        formatScaledAmount(amountScaled),
        dst.currency,
        params.description ?? 'Simulated sandbox deposit',
        params.actorId,
      ]
    );
    const tx = txRes.rows[0];

    const newStlBal = BigInt(Math.round(Number(settlement.balance) * 10000)) - amountScaled;
    await client.query(
      `UPDATE accounts SET balance = $1, available_balance = $1, version = version + 1, updated_at = NOW() WHERE id = $2`,
      [formatScaledAmount(newStlBal), settlement.id]
    );
    await client.query(
      `INSERT INTO ledger_entries (transaction_id, account_id, entry_type, amount, currency, balance_after)
       VALUES ($1, $2, 'DEBIT', $3, $4, $5)`,
      [tx.id, settlement.id, formatScaledAmount(amountScaled), dst.currency, formatScaledAmount(newStlBal)]
    );

    const newDstBal = parseScaledAmount(dst.balance) + amountScaled;
    const newDstAvail = parseScaledAmount(dst.available_balance) + amountScaled;
    await client.query(
      `UPDATE accounts SET balance = $1, available_balance = $2, version = version + 1, updated_at = NOW() WHERE id = $3`,
      [formatScaledAmount(newDstBal), formatScaledAmount(newDstAvail), dst.id]
    );
    await client.query(
      `INSERT INTO ledger_entries (transaction_id, account_id, entry_type, amount, currency, balance_after)
       VALUES ($1, $2, 'CREDIT', $3, $4, $5)`,
      [tx.id, dst.id, formatScaledAmount(amountScaled), dst.currency, formatScaledAmount(newDstBal)]
    );

    await client.query(`SELECT assert_transaction_balanced($1)`, [tx.id]);

    await recordAudit(
      {
        actorId: params.actorId,
        actorRole: params.actorRole,
        action: 'DEPOSIT_COMPLETED',
        resourceType: 'transaction',
        resourceId: tx.id,
        requestId: params.requestId,
        details: { reference: txRef, amount: formatScaledAmount(amountScaled) },
      },
      client
    );

    return { transaction: tx, idempotentReplay: false };
  });
}

export async function executeReversal(params: {
  idempotencyKey: string;
  parentTransactionId: string;
  reason: string;
  type: 'refund' | 'reversal';
  actorId: string;
  actorRole: string;
  requestId?: string;
}) {
  return withTransaction(async (client) => {
    const existing = await client.query(`SELECT * FROM transactions WHERE idempotency_key = $1`, [params.idempotencyKey]);
    if (existing.rowCount && existing.rowCount > 0) {
      return { transaction: existing.rows[0], idempotentReplay: true };
    }

    const parentRes = await client.query(`SELECT * FROM transactions WHERE id = $1 FOR UPDATE`, [params.parentTransactionId]);
    if (parentRes.rowCount === 0) {
      throw new NotFoundError('Original transaction not found');
    }
    const parent = parentRes.rows[0];
    if (parent.status !== 'completed') {
      throw new ConflictError(`Cannot reverse transaction in status '${parent.status}'`);
    }

    const origEntries = await client.query(
      `SELECT account_id, entry_type, amount::text, currency FROM ledger_entries WHERE transaction_id = $1`,
      [parent.id]
    );
    const accountIds = origEntries.rows.map((r) => r.account_id as string);
    const accounts = await lockAccountsInOrder(client, accountIds);

    const revRef = `REV-${uuidv4().slice(0, 12).toUpperCase()}`;
    const revRes = await client.query(
      `INSERT INTO transactions
       (idempotency_key, reference, type, status, source_account_id, destination_account_id, amount, fee_amount, currency, description, parent_transaction_id, created_by)
       VALUES ($1, $2, $3, 'completed', $4, $5, $6, 0, $7, $8, $9, $10)
       RETURNING *`,
      [
        params.idempotencyKey,
        revRef,
        params.type,
        parent.destination_account_id,
        parent.source_account_id,
        parent.amount,
        parent.currency,
        params.reason,
        parent.id,
        params.actorId,
      ]
    );
    const revTx = revRes.rows[0];

    for (const entry of origEntries.rows) {
      const acc = accounts.get(entry.account_id)!;
      const amtScaled = parseScaledAmount(entry.amount);
      const invertedType = entry.entry_type === 'DEBIT' ? 'CREDIT' : 'DEBIT';

      const curBal = BigInt(Math.round(Number(acc.balance) * 10000));
      const curAvail = BigInt(Math.round(Number(acc.available_balance) * 10000));
      const delta = invertedType === 'CREDIT' ? amtScaled : -amtScaled;

      const newBal = curBal + delta;
      const newAvail = curAvail + delta;
      if (acc.account_type === 'wallet' && newAvail < 0n) {
        throw new InsufficientFundsError('Insufficient funds in recipient wallet for reversal');
      }

      acc.balance = formatScaledAmount(newBal);
      acc.available_balance = formatScaledAmount(newAvail);

      await client.query(
        `UPDATE accounts SET balance = $1, available_balance = $2, version = version + 1, updated_at = NOW() WHERE id = $3`,
        [acc.balance, acc.available_balance, acc.id]
      );
      await client.query(
        `INSERT INTO ledger_entries (transaction_id, account_id, entry_type, amount, currency, balance_after)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [revTx.id, acc.id, invertedType, entry.amount, entry.currency, acc.balance]
      );
    }

    await client.query(`UPDATE transactions SET status = 'reversed', updated_at = NOW() WHERE id = $1`, [parent.id]);
    await client.query(`SELECT assert_transaction_balanced($1)`, [revTx.id]);

    await recordAudit(
      {
        actorId: params.actorId,
        actorRole: params.actorRole,
        action: `${params.type.toUpperCase()}_COMPLETED`,
        resourceType: 'transaction',
        resourceId: revTx.id,
        requestId: params.requestId,
        details: { parentTransactionId: parent.id, reason: params.reason },
      },
      client
    );

    return { transaction: revTx, idempotentReplay: false };
  });
}
