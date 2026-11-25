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
  PlusCircle,
  AlertTriangle,
  Users,
  Search,
  Send,
  X,
  CreditCard,
  TrendingUp,
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
  source_account_id?: string;
  destination_account_id?: string;
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

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Forms
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
    let deposits = 0;
    let transfers = 0;
    let fees = 0;
    for (const t of transactions) {
      const amt = Number(t.amount || 0);
      fees += Number(t.fee_amount || 0);
      if (t.type === 'deposit' || t.type === 'refund') deposits += amt;
      else transfers += amt;
    }
    return { deposits, transfers, fees };
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
      const idemKey = `web-tx-${crypto.randomUUID()}`;
      await apiFetch('/transfers', {
        method: 'POST',
        token,
        idempotencyKey: idemKey,
        body: JSON.stringify(parsed.data),
      });
      setAmount('');
      setDescription('');
      notify('ok', 'Transfer completed atomically and recorded in the double-entry ledger.');
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
      notify('ok', `Simulated deposit of $${depositAmount} credited to your wallet.`);
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
      <div className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-slate-900/80 p-10 text-center shadow-2xl backdrop-blur">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 text-slate-950">
          <CreditCard className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold text-white">Welcome to FinCore Simulated Wallet</h1>
        <p className="mt-2 text-sm text-slate-400">
          Sign in with a synthetic customer or operations account to explore interactive wallet cards, double-entry
          transfers, live cashflow analytics, disputes, and risk alerts.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 hover:brightness-110"
        >
          Go to Sign In
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Floating Toast Notification */}
      {feedback && (
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-xl border px-4 py-3 text-xs font-medium shadow-2xl backdrop-blur-xl ${
            feedback.type === 'ok'
              ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-200'
              : 'border-rose-500/40 bg-rose-950/90 text-rose-200'
          }`}
        >
          <span>{feedback.msg}</span>
          <button onClick={() => setFeedback(null)} className="text-white/60 hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Top Hero Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Good day, {user?.fullName?.split(' ')[0] || 'Customer'}
          </h1>
          <p className="text-xs text-slate-400">
            Total Simulated Balance:{' '}
            <span className="font-semibold text-emerald-400">${totalAvailable.toFixed(2)} USD</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab('transfer')}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-3.5 py-2 text-xs font-semibold text-slate-950 shadow-md shadow-emerald-500/20 transition hover:brightness-110"
          >
            <Send className="h-3.5 w-3.5" />
            Send Money
          </button>
          <button
            onClick={() => setShowDepositModal(true)}
            className="flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3.5 py-2 text-xs font-medium text-sky-300 transition hover:bg-sky-500/20"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Add Test Funds
          </button>
          {srcWalletId && (
            <button
              onClick={handleExportStatement}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-800"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          )}
          <button
            onClick={loadData}
            title="Refresh"
            className="rounded-lg border border-white/10 bg-slate-900 p-2 text-slate-400 hover:text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Virtual Wallet Cards + KPI Summary */}
      <section className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7 grid gap-4 sm:grid-cols-2">
          {wallets.map((w) => (
            <div
              key={w.id}
              onClick={() => setSrcWalletId(w.id)}
              className={`cursor-pointer rounded-2xl border p-5 transition-all ${
                srcWalletId === w.id
                  ? 'border-emerald-500/50 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/40 shadow-lg shadow-emerald-500/10'
                  : 'border-white/10 bg-slate-900/70 hover:border-white/25'
              }`}
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    copyAccountNumber(w.account_number);
                  }}
                  className="flex items-center gap-1.5 rounded-md bg-white/5 px-2 py-1 text-[11px] font-mono text-slate-300 hover:bg-white/10"
                >
                  {w.account_number}
                  {copiedAcc === w.account_number ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3 text-slate-400" />
                  )}
                </button>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    w.status === 'active'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-rose-500/15 text-rose-300'
                  }`}
                >
                  {w.status} · SIMULATED
                </span>
              </div>
              <div className="mt-5 text-3xl font-bold tracking-tight text-white">
                ${Number(w.available_balance).toFixed(2)}{' '}
                <span className="text-xs font-normal text-slate-400">{w.currency}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                <span>Ledger: ${Number(w.balance).toFixed(2)}</span>
                {srcWalletId === w.id && <span className="text-emerald-400 font-medium">Active Wallet</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Cashflow Mini KPI Panel */}
        <div className="lg:col-span-5 grid grid-cols-3 gap-3 rounded-2xl border border-white/10 bg-slate-900/70 p-5">
          <div className="flex flex-col justify-between">
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-400" />
              Inflows
            </div>
            <div className="text-lg font-bold text-emerald-400">+${stats.deposits.toFixed(2)}</div>
            <div className="text-[10px] text-slate-500">Deposits &amp; refunds</div>
          </div>
          <div className="flex flex-col justify-between border-x border-white/10 px-3">
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <ArrowUpRight className="h-3.5 w-3.5 text-rose-400" />
              Outflows
            </div>
            <div className="text-lg font-bold text-white">${stats.transfers.toFixed(2)}</div>
            <div className="text-[10px] text-slate-500">Transfers sent</div>
          </div>
          <div className="flex flex-col justify-between pl-1">
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <TrendingUp className="h-3.5 w-3.5 text-amber-400" />
              Fees
            </div>
            <div className="text-lg font-bold text-amber-300">${stats.fees.toFixed(2)}</div>
            <div className="text-[10px] text-slate-500">Platform fees</div>
          </div>
        </div>
      </section>

      {/* Interactive Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-white/10 pb-px overflow-x-auto">
        {(
          [
            { id: 'overview', label: 'Transactions & Ledger' },
            { id: 'transfer', label: 'Send Money' },
            { id: 'beneficiaries', label: `Beneficiaries (${beneficiaries.length})` },
            { id: 'disputes', label: 'Disputes' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Overview / Transactions */}
      {activeTab === 'overview' && (
        <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search reference, description, status..."
                className="w-full rounded-lg border border-white/10 bg-slate-950 py-2 pl-8 pr-3 text-xs text-white outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              {['all', 'transfer', 'deposit', 'reversal', 'refund'].map((f) => (
                <button
                  key={f}
                  onClick={() => setTypeFilter(f)}
                  className={`rounded-lg px-2.5 py-1 capitalize transition ${
                    typeFilter === f
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-white/5 text-slate-400 hover:text-white'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 text-slate-400">
                <tr>
                  <th className="py-2.5 pr-4">Reference</th>
                  <th className="py-2.5 pr-4">Type</th>
                  <th className="py-2.5 pr-4">Amount</th>
                  <th className="py-2.5 pr-4">Fee</th>
                  <th className="py-2.5 pr-4">Status</th>
                  <th className="py-2.5">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No matching transactions found.
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => setSelectedTx(t)}
                      className="cursor-pointer transition-colors hover:bg-white/[0.04]"
                    >
                      <td className="py-3 pr-4 font-mono text-slate-200">{t.reference}</td>
                      <td className="py-3 pr-4 capitalize text-slate-300">{t.type}</td>
                      <td
                        className={`py-3 pr-4 font-semibold ${
                          t.type === 'deposit' || t.type === 'refund' ? 'text-emerald-400' : 'text-white'
                        }`}
                      >
                        {t.type === 'deposit' || t.type === 'refund' ? '+' : '-'}${Number(t.amount).toFixed(2)}
                      </td>
                      <td className="py-3 pr-4 text-slate-400">${Number(t.fee_amount).toFixed(2)}</td>
                      <td className="py-3 pr-4">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ${
                            t.status === 'completed'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : t.status === 'reversed'
                              ? 'bg-amber-500/15 text-amber-300'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="py-3 text-slate-400">{t.description}</td>
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
            className="lg:col-span-7 rounded-2xl border border-white/10 bg-slate-900/70 p-6 space-y-4"
          >
            <h2 className="flex items-center gap-2 text-base font-semibold text-white">
              <Send className="h-4 w-4 text-emerald-400" />
              Send Simulated Transfer
            </h2>
            {beneficiaries.length > 0 && (
              <div>
                <div className="text-[11px] text-slate-400 mb-1.5">Quick-fill from saved beneficiaries:</div>
                <div className="flex flex-wrap gap-1.5">
                  {beneficiaries.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setDestAccNum(b.account_number)}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-200 hover:border-emerald-500/50"
                    >
                      {b.name} ({b.account_number})
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-300">Source Wallet</label>
              <select
                value={srcWalletId}
                onChange={(e) => setSrcWalletId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-xs text-white"
              >
                {wallets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.account_number} (${Number(w.available_balance).toFixed(2)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300">Destination Account Number</label>
              <input
                value={destAccNum}
                onChange={(e) => setDestAccNum(e.target.value)}
                placeholder="e.g. FC-1001-0002"
                className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-xs text-white outline-none focus:border-emerald-500"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-300">Amount (USD)</label>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="25.00"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-xs text-white outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300">Description</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Invoice or note"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-xs text-white outline-none focus:border-emerald-500"
                />
              </div>
            </div>
            <button
              disabled={submitting}
              type="submit"
              className="w-full rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 py-2.5 text-xs font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 hover:brightness-110 disabled:opacity-50"
            >
              {submitting ? 'Processing Atomic Transfer...' : 'Submit Transfer'}
            </button>
          </form>

          {/* Live Fee & Ledger Preview */}
          <div className="lg:col-span-5 rounded-2xl border border-white/10 bg-slate-900/50 p-6 space-y-4">
            <h3 className="text-sm font-semibold text-white">Live Double-Entry Preview</h3>
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Principal Amount</span>
                <span className="text-white font-mono">
                  ${!Number.isNaN(parsedTransferAmount) && parsedTransferAmount > 0 ? parsedTransferAmount.toFixed(2) : '0.00'}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Platform Fee (SYS-FEE-USD)</span>
                <span className="text-amber-300 font-mono">${previewFee.toFixed(2)}</span>
              </div>
              <div className="border-t border-white/10 pt-2.5 flex justify-between font-semibold text-white">
                <span>Total Source Debit</span>
                <span className="text-emerald-400 font-mono">${previewTotal.toFixed(2)}</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Every transfer generates an idempotency key, locks involved accounts in deterministic UUID order, and
              verifies <code className="text-slate-300">SUM(DEBIT) == SUM(CREDIT)</code> in PostgreSQL before commit.
            </p>
          </div>
        </section>
      )}

      {/* Tab 3: Beneficiaries */}
      {activeTab === 'beneficiaries' && (
        <section className="grid gap-6 lg:grid-cols-12">
          <form
            onSubmit={handleAddBeneficiary}
            className="lg:col-span-4 rounded-2xl border border-white/10 bg-slate-900/70 p-5 space-y-3"
          >
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Users className="h-4 w-4 text-indigo-400" />
              Add Beneficiary
            </h2>
            <input
              required
              value={beneficiaryName}
              onChange={(e) => setBeneficiaryName(e.target.value)}
              placeholder="Recipient Name"
              className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
            />
            <input
              required
              value={beneficiaryAcc}
              onChange={(e) => setBeneficiaryAcc(e.target.value)}
              placeholder="Account Number (e.g. FC-1001-0002)"
              className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
            />
            <button type="submit" className="w-full rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white hover:bg-indigo-500">
              Save Beneficiary
            </button>
          </form>

          <div className="lg:col-span-8 grid gap-3 sm:grid-cols-2">
            {beneficiaries.length === 0 ? (
              <div className="sm:col-span-2 rounded-2xl border border-white/10 bg-slate-900/40 p-8 text-center text-xs text-slate-500">
                No saved beneficiaries yet.
              </div>
            ) : (
              beneficiaries.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/70 p-4"
                >
                  <div>
                    <div className="text-sm font-semibold text-white">{b.name}</div>
                    <div className="text-xs font-mono text-slate-400">{b.account_number}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDestAccNum(b.account_number);
                      setActiveTab('transfer');
                    }}
                    className="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/25"
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
        <section className="max-w-xl rounded-2xl border border-white/10 bg-slate-900/70 p-6">
          <form onSubmit={handleRaiseDispute} className="space-y-3.5">
            <h2 className="flex items-center gap-2 text-base font-semibold text-white">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              Raise Transaction Dispute
            </h2>
            <select
              required
              value={disputeTxId}
              onChange={(e) => setDisputeTxId(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-xs text-white"
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
              className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-xs text-white"
            />
            <textarea
              required
              value={disputeDesc}
              onChange={(e) => setDisputeDesc(e.target.value)}
              placeholder="Describe the issue..."
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-xs text-white"
            />
            <button type="submit" className="w-full rounded-lg bg-amber-500 py-2.5 text-xs font-semibold text-slate-950 hover:bg-amber-400">
              Submit Dispute
            </button>
          </form>
        </section>
      )}

      {/* Transaction Detail Drawer */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md border-l border-white/10 bg-slate-950 p-6 flex flex-col justify-between">
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-400">Transaction Receipt</div>
                  <div className="text-lg font-bold font-mono text-white">{selectedTx.reference}</div>
                </div>
                <button onClick={() => setSelectedTx(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Status</span>
                  <span className="font-semibold uppercase text-emerald-400">{selectedTx.status}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Type</span>
                  <span className="capitalize text-white">{selectedTx.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Amount</span>
                  <span className="font-mono text-white">${Number(selectedTx.amount).toFixed(2)} USD</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Fee</span>
                  <span className="font-mono text-slate-300">${Number(selectedTx.fee_amount).toFixed(2)} USD</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Description</span>
                  <span className="text-slate-200">{selectedTx.description || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Timestamp</span>
                  <span className="text-slate-300">{new Date(selectedTx.created_at).toLocaleString()}</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                setDisputeTxId(selectedTx.id);
                setSelectedTx(null);
                setActiveTab('disputes');
              }}
              className="w-full rounded-lg border border-amber-500/40 bg-amber-500/10 py-2.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20"
            >
              Dispute This Transaction
            </button>
          </div>
        </div>
      )}

      {/* Sandbox Deposit Modal */}
      {showDepositModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <form
            onSubmit={handleDeposit}
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Add Sandbox Funds</h3>
              <button type="button" onClick={() => setShowDepositModal(false)} className="text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400">Credits simulated USD from SYS-SETTLEMENT-USD into your active wallet.</p>
            <input
              required
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white"
            />
            <div className="flex gap-2">
              {['100.00', '500.00', '1000.00'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setDepositAmount(preset)}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 py-1.5 text-xs text-slate-300 hover:bg-white/10"
                >
                  +${preset}
                </button>
              ))}
            </div>
            <button
              disabled={submitting}
              type="submit"
              className="w-full rounded-lg bg-sky-500 py-2.5 text-xs font-semibold text-slate-950 hover:bg-sky-400"
            >
              {submitting ? 'Crediting...' : 'Confirm Sandbox Deposit'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
