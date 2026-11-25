'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import Link from 'next/link';
import { z } from 'zod';
import {
  ArrowUpRight,
  ArrowDownLeft,
  Copy,
  Check,
  Download,
  Plus,
  AlertTriangle,
  Users,
  Search,
  Send,
  X,
  CreditCard,
  RefreshCw,
} from 'lucide-react';
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

type ActiveTab = 'overview' | 'transfer' | 'beneficiaries' | 'disputes';

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
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [selectedTx, setSelectedTx] = useState<TransactionItem | null>(null);
  const [copiedAcc, setCopiedAcc] = useState<string | null>(null);
  const [showDepositModal, setShowDepositModal] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const [srcWalletId, setSrcWalletId] = useState(initialWallets[0]?.id || '');
  const [destAccNum, setDestAccNum] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [depositAmount, setDepositAmount] = useState('250.00');
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [beneficiaryAcc, setBeneficiaryAcc] = useState('');
  const [disputeTxId, setDisputeTxId] = useState('');
  const [disputeReason, setDisputeReason] = useState('unauthorized_transfer');
  const [disputeDesc, setDisputeDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const notify = (type: 'ok' | 'err', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 5000);
  };

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const [wRes, tRes, bRes] = await Promise.all([
        apiFetch<{ data: WalletAccount[] }>('/wallets', { token }),
        apiFetch<{ data: TransactionItem[] }>('/transfers?limit=30', { token }),
        apiFetch<{ data: BeneficiaryItem[] }>('/beneficiaries', { token }),
      ]);
      setWallets(wRes.data);
      if (wRes.data[0] && !srcWalletId) setSrcWalletId(wRes.data[0].id);
      setTransactions(tRes.data);
      setBeneficiaries(bRes.data);
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Failed to load wallet data');
    }
  }, [token, srcWalletId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalAvailable = useMemo(
    () => wallets.reduce((sum, w) => sum + Number(w.available_balance || 0), 0),
    [wallets]
  );

  const stats = useMemo(() => {
    let inflows = 0;
    let outflows = 0;
    let fees = 0;
    for (const t of transactions) {
      const amt = Number(t.amount || 0);
      fees += Number(t.fee_amount || 0);
      if (t.type === 'deposit' || t.type === 'refund') inflows += amt;
      else outflows += amt;
    }
    return { inflows, outflows, fees };
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          t.reference.toLowerCase().includes(q) ||
          (t.description || '').toLowerCase().includes(q) ||
          t.status.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [transactions, typeFilter, searchQuery]);

  const parsedTransferAmount = Number(amount);
  const previewFee = !Number.isNaN(parsedTransferAmount) && parsedTransferAmount > 0 ? 0.25 : 0;
  const previewTotal = !Number.isNaN(parsedTransferAmount) && parsedTransferAmount > 0 ? parsedTransferAmount + previewFee : 0;

  function copyAccountNumber(acc: string) {
    navigator.clipboard?.writeText(acc);
    setCopiedAcc(acc);
    setTimeout(() => setCopiedAcc(null), 2000);
  }

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
    setSubmitting(true);
    try {
      await apiFetch('/transfers', {
        method: 'POST',
        token,
        idempotencyKey: `web-tx-${crypto.randomUUID()}`,
        body: JSON.stringify(parsed.data),
      });
      setAmount('');
      setDescription('');
      notify('ok', 'Transfer completed and recorded in the double-entry ledger.');
      setActiveTab('overview');
      await loadData();
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Transfer failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    if (!srcWalletId) return;
    setSubmitting(true);
    try {
      await apiFetch('/wallets/deposit', {
        method: 'POST',
        token,
        idempotencyKey: `web-dep-${crypto.randomUUID()}`,
        body: JSON.stringify({ accountId: srcWalletId, amount: depositAmount, description: 'Sandbox top-up' }),
      });
      setShowDepositModal(false);
      notify('ok', `Simulated deposit of $${depositAmount} credited.`);
      await loadData();
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Deposit failed');
    } finally {
      setSubmitting(false);
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
      notify('ok', 'Beneficiary saved.');
      await loadData();
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Failed to add beneficiary');
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
      notify('ok', 'Dispute submitted to operations support.');
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Failed to raise dispute');
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
    notify('ok', 'Statement CSV downloaded.');
  }

  if (!authed) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
          <CreditCard className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Welcome to FinCore Simulated Wallet</h1>
        <p className="mt-2 text-sm text-slate-500">
          Sign in with a synthetic customer or operations account to inspect wallets, double-entry ledger entries,
          transfers, disputes, and risk analytics.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
        >
          Go to Sign In
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {feedback && (
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-xl border px-4 py-3 text-xs font-medium shadow-lg ${
            feedback.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          <span>{feedback.msg}</span>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-700">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Mercury-Style Header & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Welcome, {user?.fullName?.split(' ')[0] || 'Customer'}
          </h1>
          <p className="text-xs text-slate-500">FinCore Simulated Treasury &amp; Wallet Overview</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab('transfer')}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            <Send className="h-3.5 w-3.5" />
            Send Money
          </button>
          <button
            onClick={() => setShowDepositModal(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Test Funds
          </button>
          {srcWalletId && (
            <button
              onClick={handleExportStatement}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          )}
          <button
            onClick={loadData}
            title="Refresh"
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 shadow-sm hover:text-slate-800"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Bento Top Row: Net Balance + Cashflow Chart + Wallets */}
      <section className="grid gap-5 lg:grid-cols-12">
        {/* Net Balance & Interactive SVG Cashflow Chart */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-medium text-slate-500">Total Simulated Balance</div>
              <div className="mt-1 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
                ${totalAvailable.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                <span className="text-sm font-medium text-slate-400">USD</span>
              </div>
            </div>
            <div className="flex gap-4 text-right text-xs">
              <div>
                <div className="flex items-center justify-end gap-1 text-slate-500">
                  <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600" />
                  Inflows
                </div>
                <div className="font-semibold text-emerald-600 tabular-nums">+${stats.inflows.toFixed(2)}</div>
              </div>
              <div>
                <div className="flex items-center justify-end gap-1 text-slate-500">
                  <ArrowUpRight className="h-3.5 w-3.5 text-slate-600" />
                  Outflows
                </div>
                <div className="font-semibold text-slate-900 tabular-nums">-${stats.outflows.toFixed(2)}</div>
              </div>
            </div>
          </div>

          {/* Clean Mercury-style SVG Cashflow Sparkline */}
          <div className="mt-6">
            <svg viewBox="0 0 400 80" className="w-full h-20 overflow-visible">
              <defs>
                <linearGradient id="fcArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#4F46E5" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0,65 C60,60 90,45 140,48 C190,51 220,25 270,30 C320,35 360,15 400,18 L400,80 L0,80 Z"
                fill="url(#fcArea)"
              />
              <path
                d="M0,65 C60,60 90,45 140,48 C190,51 220,25 270,30 C320,35 360,15 400,18"
                fill="none"
                stroke="#4F46E5"
                strokeWidth="2.25"
              />
            </svg>
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
              <span>Simulated 30d activity</span>
              <span>Fees paid: ${stats.fees.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Wallets Card List */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Accounts</h2>
            <span className="text-[11px] text-slate-400">{wallets.length} active</span>
          </div>
          <div className="space-y-2.5">
            {wallets.map((w) => {
              const selected = srcWalletId === w.id;
              return (
                <div
                  key={w.id}
                  onClick={() => setSrcWalletId(w.id)}
                  className={`cursor-pointer rounded-xl border p-3.5 transition ${
                    selected
                      ? 'border-indigo-600 bg-indigo-50/40'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyAccountNumber(w.account_number);
                      }}
                      className="flex items-center gap-1.5 text-xs font-mono font-medium text-slate-700 hover:text-indigo-600"
                    >
                      {w.account_number}
                      {copiedAcc === w.account_number ? (
                        <Check className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <Copy className="h-3 w-3 text-slate-400" />
                      )}
                    </button>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        w.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {w.status} · SIMULATED
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-xl font-bold text-slate-900 tabular-nums">
                      ${Number(w.available_balance).toFixed(2)}
                    </span>
                    <span className="text-[11px] text-slate-500">Ledger: ${Number(w.balance).toFixed(2)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Clean Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto">
        {(
          [
            { id: 'overview', label: 'Transactions' },
            { id: 'transfer', label: 'Send Money' },
            { id: 'beneficiaries', label: `Recipients (${beneficiaries.length})` },
            { id: 'disputes', label: 'Disputes' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Transactions Table */}
      {activeTab === 'overview' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search reference or description..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs text-slate-900 outline-none focus:border-indigo-600 focus:bg-white"
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              {['all', 'transfer', 'deposit', 'reversal', 'refund'].map((f) => (
                <button
                  key={f}
                  onClick={() => setTypeFilter(f)}
                  className={`rounded-lg px-2.5 py-1 capitalize font-medium transition ${
                    typeFilter === f
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-2.5 pr-4 font-medium">Reference</th>
                  <th className="py-2.5 pr-4 font-medium">Type</th>
                  <th className="py-2.5 pr-4 font-medium">Amount</th>
                  <th className="py-2.5 pr-4 font-medium">Fee</th>
                  <th className="py-2.5 pr-4 font-medium">Status</th>
                  <th className="py-2.5 font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No matching transactions found.
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => setSelectedTx(t)}
                      className="cursor-pointer transition-colors hover:bg-slate-50"
                    >
                      <td className="py-3 pr-4 font-mono font-medium text-slate-800">{t.reference}</td>
                      <td className="py-3 pr-4 capitalize text-slate-600">{t.type}</td>
                      <td
                        className={`py-3 pr-4 font-semibold tabular-nums ${
                          t.type === 'deposit' || t.type === 'refund' ? 'text-emerald-600' : 'text-slate-900'
                        }`}
                      >
                        {t.type === 'deposit' || t.type === 'refund' ? '+' : '-'}${Number(t.amount).toFixed(2)}
                      </td>
                      <td className="py-3 pr-4 text-slate-500 tabular-nums">${Number(t.fee_amount).toFixed(2)}</td>
                      <td className="py-3 pr-4">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ${
                            t.status === 'completed'
                              ? 'bg-emerald-50 text-emerald-700'
                              : t.status === 'reversed'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="py-3 text-slate-500">{t.description}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Tab 2: Send Money */}
      {activeTab === 'transfer' && (
        <section className="grid gap-6 lg:grid-cols-12">
          <form
            onSubmit={handleTransfer}
            className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4"
          >
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <Send className="h-4 w-4 text-indigo-600" />
              Send Simulated Transfer
            </h2>
            {beneficiaries.length > 0 && (
              <div>
                <div className="text-[11px] font-medium text-slate-500 mb-1.5">Saved recipients:</div>
                <div className="flex flex-wrap gap-1.5">
                  {beneficiaries.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setDestAccNum(b.account_number)}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-700 hover:border-indigo-500"
                    >
                      {b.name} ({b.account_number})
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-700">From Account</label>
              <select
                value={srcWalletId}
                onChange={(e) => setSrcWalletId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              >
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.account_number} (${Number(w.available_balance).toFixed(2)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Destination Account Number</label>
              <input
                value={destAccNum}
                onChange={(e) => setDestAccNum(e.target.value)}
                placeholder="e.g. FC-1001-0002"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-indigo-600"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700">Amount (USD)</label>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="25.00"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-indigo-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Memo / Note</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Invoice #104"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-indigo-600"
                />
              </div>
            </div>
            <button
              disabled={submitting}
              type="submit"
              className="w-full rounded-lg bg-indigo-600 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? 'Processing...' : 'Submit Transfer'}
            </button>
          </form>

          <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">Double-Entry Summary</h3>
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>Transfer Principal</span>
                <span className="font-mono text-slate-900">
                  ${!Number.isNaN(parsedTransferAmount) && parsedTransferAmount > 0 ? parsedTransferAmount.toFixed(2) : '0.00'}
                </span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Platform Fee</span>
                <span className="font-mono text-slate-700">${previewFee.toFixed(2)}</span>
              </div>
              <div className="border-t border-slate-100 pt-2.5 flex justify-between font-semibold text-slate-900">
                <span>Total Debit</span>
                <span className="font-mono text-indigo-600">${previewTotal.toFixed(2)}</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Protected by idempotency keys and deterministic PostgreSQL row-level locking.
            </p>
          </div>
        </section>
      )}

      {/* Tab 3: Beneficiaries */}
      {activeTab === 'beneficiaries' && (
        <section className="grid gap-6 lg:grid-cols-12">
          <form
            onSubmit={handleAddBeneficiary}
            className="lg:col-span-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3"
          >
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Users className="h-4 w-4 text-indigo-600" />
              Add Recipient
            </h2>
            <input
              required
              value={beneficiaryName}
              onChange={(e) => setBeneficiaryName(e.target.value)}
              placeholder="Recipient Name"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
            />
            <input
              required
              value={beneficiaryAcc}
              onChange={(e) => setBeneficiaryAcc(e.target.value)}
              placeholder="Account Number (FC-...)"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
            />
            <button type="submit" className="w-full rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-700">
              Save Recipient
            </button>
          </form>

          <div className="lg:col-span-8 grid gap-3 sm:grid-cols-2">
            {beneficiaries.length === 0 ? (
              <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-400">
                No saved recipients yet.
              </div>
            ) : (
              beneficiaries.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{b.name}</div>
                    <div className="text-xs font-mono text-slate-500">{b.account_number}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDestAccNum(b.account_number);
                      setActiveTab('transfer');
                    }}
                    className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    Pay
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* Tab 4: Disputes */}
      {activeTab === 'disputes' && (
        <section className="max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <form onSubmit={handleRaiseDispute} className="space-y-3.5">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Raise Transaction Dispute
            </h2>
            <select
              required
              value={disputeTxId}
              onChange={(e) => setDisputeTxId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
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
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
            />
            <textarea
              required
              value={disputeDesc}
              onChange={(e) => setDisputeDesc(e.target.value)}
              placeholder="Describe the issue..."
              rows={3}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
            />
            <button type="submit" className="w-full rounded-lg bg-amber-500 py-2.5 text-xs font-semibold text-white hover:bg-amber-600">
              Submit Dispute
            </button>
          </form>
        </section>
      )}

      {/* Slide-over Receipt Drawer */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-xs">
          <div className="w-full max-w-md border-l border-slate-200 bg-white p-6 shadow-2xl flex flex-col justify-between">
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Transaction Receipt
                  </div>
                  <div className="text-lg font-bold font-mono text-slate-900">{selectedTx.reference}</div>
                </div>
                <button onClick={() => setSelectedTx(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Status</span>
                  <span className="font-semibold uppercase text-emerald-600">{selectedTx.status}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Type</span>
                  <span className="capitalize text-slate-900">{selectedTx.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Amount</span>
                  <span className="font-mono font-semibold text-slate-900">${Number(selectedTx.amount).toFixed(2)} USD</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Fee</span>
                  <span className="font-mono text-slate-600">${Number(selectedTx.fee_amount).toFixed(2)} USD</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Description</span>
                  <span className="text-slate-700">{selectedTx.description || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Timestamp</span>
                  <span className="text-slate-600">{new Date(selectedTx.created_at).toLocaleString()}</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                setDisputeTxId(selectedTx.id);
                setSelectedTx(null);
                setActiveTab('disputes');
              }}
              className="w-full rounded-lg border border-amber-300 bg-amber-50 py-2.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
            >
              Dispute This Transaction
            </button>
          </div>
        </div>
      )}

      {/* Sandbox Deposit Modal */}
      {showDepositModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <form
            onSubmit={handleDeposit}
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Add Sandbox Funds</h3>
              <button type="button" onClick={() => setShowDepositModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500">Credits simulated USD from SYS-SETTLEMENT-USD into your active wallet.</p>
            <input
              required
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
            <div className="flex gap-2">
              {['100.00', '500.00', '1000.00'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setDepositAmount(preset)}
                  className="flex-1 rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  +${preset}
                </button>
              ))}
            </div>
            <button
              disabled={submitting}
              type="submit"
              className="w-full rounded-lg bg-indigo-600 py-2.5 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              {submitting ? 'Crediting...' : 'Confirm Sandbox Deposit'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
