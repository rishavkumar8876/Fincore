'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import Link from 'next/link';
import { z } from 'zod';
import { ArrowUpRight, Download, PlusCircle, AlertTriangle, Users } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { RootState } from '@/store/store';

export interface WalletAccount {
  id: string;
  account_number: string;
  currency: string;
  balance: string;
  available_balance: string;
  status: 'active' | 'frozen' | 'closed';
}

export interface TransactionItem {
  id: string;
  reference: string;
  type: string;
  status: string;
  amount: string;
  fee_amount: string;
  description: string;
  created_at: string;
}

export interface BeneficiaryItem {
  id: string;
  name: string;
  account_number: string;
  bank_code: string;
}

const transferFormSchema = z.object({
  sourceAccountId: z.string().uuid('Select a source wallet'),
  destinationAccountNumber: z.string().min(4, 'Enter destination account number'),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Enter a valid positive amount (e.g. 25.00)'),
  description: z.string().max(200).optional(),
});

export function CustomerDashboardView({
  initialWallets = [],
  initialTransactions = [],
  isAuthenticated = false,
}: {
  initialWallets?: WalletAccount[];
  initialTransactions?: TransactionItem[];
  isAuthenticated?: boolean;
}) {
  const token = useSelector((s: RootState) => s.auth.accessToken);
  const user = useSelector((s: RootState) => s.auth.user);
  const authed = Boolean(token) || isAuthenticated;

  const [wallets, setWallets] = useState<WalletAccount[]>(initialWallets);
  const [transactions, setTransactions] = useState<TransactionItem[]>(initialTransactions);
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryItem[]>([]);
  const [srcWalletId, setSrcWalletId] = useState(initialWallets[0]?.id || '');
  const [destAccNum, setDestAccNum] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [depositAmount, setDepositAmount] = useState('100.00');
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [beneficiaryAcc, setBeneficiaryAcc] = useState('');
  const [disputeTxId, setDisputeTxId] = useState('');
  const [disputeReason, setDisputeReason] = useState('unauthorized_transfer');
  const [disputeDesc, setDisputeDesc] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const [wRes, tRes, bRes] = await Promise.all([
        apiFetch<{ data: WalletAccount[] }>('/wallets', { token }),
        apiFetch<{ data: TransactionItem[] }>('/transfers?limit=20', { token }),
        apiFetch<{ data: BeneficiaryItem[] }>('/beneficiaries', { token }),
      ]);
      setWallets(wRes.data);
      if (wRes.data[0] && !srcWalletId) setSrcWalletId(wRes.data[0].id);
      setTransactions(tRes.data);
      setBeneficiaries(bRes.data);
    } catch (err) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Failed to load data' });
    }
  }, [token, srcWalletId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const parsed = transferFormSchema.safeParse({
      sourceAccountId: srcWalletId,
      destinationAccountNumber: destAccNum,
      amount,
      description,
    });
    if (!parsed.success) {
      setFeedback({ type: 'err', msg: parsed.error.issues[0].message });
      return;
    }
    try {
      const idemKey = `web-tx-${crypto.randomUUID()}`;
      await apiFetch('/transfers', {
        method: 'POST',
        token,
        idempotencyKey: idemKey,
        body: JSON.stringify(parsed.data),
      });
      setAmount('');
      setDescription('');
      setFeedback({ type: 'ok', msg: 'Simulated transfer completed and recorded in double-entry ledger.' });
      await loadData();
    } catch (err) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Transfer failed' });
    }
  }

  async function handleDeposit() {
    if (!srcWalletId) return;
    setFeedback(null);
    try {
      await apiFetch('/wallets/deposit', {
        method: 'POST',
        token,
        idempotencyKey: `web-dep-${crypto.randomUUID()}`,
        body: JSON.stringify({ accountId: srcWalletId, amount: depositAmount, description: 'Sandbox top-up' }),
      });
      setFeedback({ type: 'ok', msg: `Simulated deposit of $${depositAmount} credited.` });
      await loadData();
    } catch (err) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Deposit failed' });
    }
  }

  async function handleAddBeneficiary(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch('/beneficiaries', {
        method: 'POST',
        token,
        body: JSON.stringify({ name: beneficiaryName, accountNumber: beneficiaryAcc }),
      });
      setBeneficiaryName('');
      setBeneficiaryAcc('');
      await loadData();
    } catch (err) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Failed to add beneficiary' });
    }
  }

  async function handleRaiseDispute(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch('/ops/disputes', {
        method: 'POST',
        token,
        body: JSON.stringify({ transactionId: disputeTxId, reason: disputeReason, description: disputeDesc }),
      });
      setDisputeTxId('');
      setDisputeDesc('');
      setFeedback({ type: 'ok', msg: 'Dispute submitted to operations support.' });
    } catch (err) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Failed to raise dispute' });
    }
  }

  async function handleExportStatement() {
    if (!srcWalletId || !token) return;
    const csv = await apiFetch<string>(`/wallets/${srcWalletId}/statement?format=csv`, { token });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fincore-statement-${srcWalletId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!authed) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center">
        <h1 className="text-2xl font-bold text-white">Welcome to FinCore Simulated Wallet</h1>
        <p className="mt-2 text-sm text-slate-400">
          Sign in with a synthetic customer or operations account to inspect wallets, double-entry ledger entries,
          transfers, disputes, and risk analytics.
        </p>
        <Link
          href="/login"
          className="mt-5 inline-block rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Go to Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Customer Wallet Dashboard</h1>
          <p className="text-xs text-slate-400">
            Signed in as {user?.email || 'Simulated Customer'} · Simulated Balances Only
          </p>
        </div>
        {srcWalletId && (
          <button
            onClick={handleExportStatement}
            className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
          >
            <Download className="h-3.5 w-3.5" />
            Export Statement (CSV)
          </button>
        )}
      </div>

      {feedback && (
        <div
          className={`rounded-md border p-3 text-xs ${
            feedback.type === 'ok'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
          }`}
        >
          {feedback.msg}
        </div>
      )}

      {/* Wallet Cards */}
      <section className="grid gap-4 md:grid-cols-2">
        {wallets.map((w) => (
          <div key={w.id} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-slate-400">{w.account_number}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  w.status === 'active' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
                }`}
              >
                {w.status} · SIMULATED
              </span>
            </div>
            <div className="mt-3 text-3xl font-bold text-white">
              ${Number(w.available_balance).toFixed(2)} <span className="text-sm text-slate-400">{w.currency}</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">Ledger Balance: ${Number(w.balance).toFixed(2)}</p>
          </div>
        ))}
      </section>

      {/* Actions Grid */}
      <section className="grid gap-6 lg:grid-cols-3">
        {/* Transfer Form */}
        <form onSubmit={handleTransfer} className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ArrowUpRight className="h-4 w-4 text-emerald-400" />
            Send Simulated Transfer
          </h2>
          <div>
            <label className="block text-xs text-slate-400">Source Wallet</label>
            <select
              value={srcWalletId}
              onChange={(e) => setSrcWalletId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white"
            >
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.account_number} (${Number(w.available_balance).toFixed(2)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400">Destination Account Number</label>
            <input
              value={destAccNum}
              onChange={(e) => setDestAccNum(e.target.value)}
              placeholder="e.g. FC-1001-0002"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400">Amount (USD, +$0.25 fee)</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="25.00"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Invoice or note"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-md bg-emerald-600 py-2 text-xs font-medium text-white hover:bg-emerald-500"
          >
            Submit Transfer
          </button>
        </form>

        {/* Sandbox Top-up & Beneficiaries */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <PlusCircle className="h-4 w-4 text-sky-400" />
              Sandbox Deposit (Test Funds)
            </h2>
            <div className="flex gap-2">
              <input
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
              />
              <button
                type="button"
                onClick={handleDeposit}
                className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
              >
                Add Funds
              </button>
            </div>
          </div>

          <form onSubmit={handleAddBeneficiary} className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-2.5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Users className="h-4 w-4 text-indigo-400" />
              Beneficiaries ({beneficiaries.length})
            </h2>
            <input
              required
              value={beneficiaryName}
              onChange={(e) => setBeneficiaryName(e.target.value)}
              placeholder="Beneficiary Name"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
            />
            <input
              required
              value={beneficiaryAcc}
              onChange={(e) => setBeneficiaryAcc(e.target.value)}
              placeholder="Account Number (FC-...)"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
            />
            <button type="submit" className="w-full rounded-md bg-indigo-600 py-1.5 text-xs font-medium text-white">
              Save Beneficiary
            </button>
            <div className="space-y-1 pt-1">
              {beneficiaries.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setDestAccNum(b.account_number)}
                  className="flex w-full justify-between rounded bg-slate-950 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
                >
                  <span>{b.name}</span>
                  <span className="font-mono text-slate-400">{b.account_number}</span>
                </button>
              ))}
            </div>
          </form>
        </div>

        {/* Raise Dispute */}
        <form onSubmit={handleRaiseDispute} className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            Raise Transaction Dispute
          </h2>
          <select
            required
            value={disputeTxId}
            onChange={(e) => setDisputeTxId(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white"
          >
            <option value="">Select transaction...</option>
            {transactions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.reference} — ${Number(t.amount).toFixed(2)} ({t.status})
              </option>
            ))}
          </select>
          <input
            value={disputeReason}
            onChange={(e) => setDisputeReason(e.target.value)}
            placeholder="Reason"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white"
          />
          <textarea
            required
            value={disputeDesc}
            onChange={(e) => setDisputeDesc(e.target.value)}
            placeholder="Describe the issue..."
            rows={3}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white"
          />
          <button type="submit" className="w-full rounded-md bg-amber-600 py-2 text-xs font-medium text-white">
            Submit Dispute
          </button>
        </form>
      </section>

      {/* Transaction History */}
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="text-sm font-semibold text-white mb-3">Recent Transactions</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 text-slate-400">
              <tr>
                <th className="py-2 pr-4">Reference</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Amount</th>
                <th className="py-2 pr-4">Fee</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-slate-500">
                    No transactions yet.
                  </td>
                </tr>
              ) : (
                transactions.map((t) => (
                  <tr key={t.id}>
                    <td className="py-2.5 pr-4 font-mono text-slate-200">{t.reference}</td>
                    <td className="py-2.5 pr-4 capitalize">{t.type}</td>
                    <td className="py-2.5 pr-4 font-medium text-white">${Number(t.amount).toFixed(2)}</td>
                    <td className="py-2.5 pr-4 text-slate-400">${Number(t.fee_amount).toFixed(2)}</td>
                    <td className="py-2.5 pr-4">
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-emerald-300">
                        {t.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-400">{t.description}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default function HomePage() {
  return <CustomerDashboardView />;
}
