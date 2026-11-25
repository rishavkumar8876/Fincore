'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { ShieldCheck, AlertOctagon, Scale } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { RootState } from '@/store/store';

interface RiskAlert {
  id: string;
  alert_type: string;
  severity: string;
  risk_score: string;
  status: string;
  created_at: string;
}

interface Dispute {
  id: string;
  transaction_id: string;
  reason: string;
  status: string;
  created_at: string;
}

interface Settlement {
  id: string;
  batch_reference: string;
  expected_amount: string;
  settled_amount: string;
  discrepancy_amount: string;
  status: string;
}

export default function OperationsPage() {
  const token = useSelector((s: RootState) => s.auth.accessToken);
  const user = useSelector((s: RootState) => s.auth.user);
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [batchRef, setBatchRef] = useState('BATCH-2026-01');
  const [expectedAmt, setExpectedAmt] = useState('1000.00');
  const [settledAmt, setSettledAmt] = useState('1000.00');
  const [error, setError] = useState<string | null>(null);

  const loadOps = useCallback(async () => {
    if (!token) return;
    try {
      const [dRes, aRes, sRes] = await Promise.all([
        apiFetch<{ data: Dispute[] }>('/ops/disputes', { token }),
        apiFetch<{ data: RiskAlert[] }>('/ops/risk-alerts', { token }).catch(() => ({ data: [] })),
        apiFetch<{ data: Settlement[] }>('/ops/settlements', { token }).catch(() => ({ data: [] })),
      ]);
      setDisputes(dRes.data);
      setAlerts(aRes.data);
      setSettlements(sRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load operations data');
    }
  }, [token]);

  useEffect(() => {
    loadOps();
  }, [loadOps]);

  async function handleReconcile(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch('/ops/settlements/reconcile', {
        method: 'POST',
        token,
        body: JSON.stringify({ batchReference: batchRef, expectedAmount: expectedAmt, settledAmount: settledAmt }),
      });
      await loadOps();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reconciliation failed');
    }
  }

  if (!user || user.role === 'customer') {
    return (
      <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-6 text-sm text-rose-200">
        Operations Console requires staff role (`support_agent`, `operations_analyst`, `finance_admin`, or
        `platform_admin`).
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Operations &amp; Risk Console</h1>
          <p className="text-xs text-slate-400">
            Role: <span className="text-sky-400">{user.role}</span> · Decision-support tooling only
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">{error}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Risk Alerts */}
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <AlertOctagon className="h-4 w-4 text-amber-400" />
            Risk Alerts ({alerts.length})
          </h2>
          <p className="mt-1 text-[11px] text-amber-300/80">
            Risk scores are decision support for operations analysts, not proof of fraud.
          </p>
          <div className="mt-3 space-y-2">
            {alerts.length === 0 ? (
              <p className="text-xs text-slate-500">No open risk alerts.</p>
            ) : (
              alerts.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded bg-slate-950 p-2.5 text-xs">
                  <div>
                    <div className="font-medium text-white">{a.alert_type}</div>
                    <div className="text-slate-400">
                      Score: {a.risk_score} · Severity: {a.severity}
                    </div>
                  </div>
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-amber-300">{a.status}</span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Disputes */}
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ShieldCheck className="h-4 w-4 text-sky-400" />
            Customer Disputes ({disputes.length})
          </h2>
          <div className="mt-3 space-y-2">
            {disputes.length === 0 ? (
              <p className="text-xs text-slate-500">No disputes in queue.</p>
            ) : (
              disputes.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded bg-slate-950 p-2.5 text-xs">
                  <div>
                    <div className="font-medium text-white">{d.reason}</div>
                    <div className="font-mono text-[11px] text-slate-400">{d.transaction_id}</div>
                  </div>
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-sky-300">{d.status}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Settlement Reconciliation */}
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Scale className="h-4 w-4 text-emerald-400" />
          Settlement Reconciliation
        </h2>
        <form onSubmit={handleReconcile} className="grid gap-3 md:grid-cols-4">
          <input
            value={batchRef}
            onChange={(e) => setBatchRef(e.target.value)}
            placeholder="Batch Reference"
            className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
          />
          <input
            value={expectedAmt}
            onChange={(e) => setExpectedAmt(e.target.value)}
            placeholder="Expected Amount"
            className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
          />
          <input
            value={settledAmt}
            onChange={(e) => setSettledAmt(e.target.value)}
            placeholder="Settled Amount"
            className="rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
          />
          <button type="submit" className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white">
            Record Reconciliation
          </button>
        </form>
        <div className="space-y-1.5">
          {settlements.map((s) => (
            <div key={s.id} className="flex justify-between rounded bg-slate-950 px-3 py-2 text-xs">
              <span className="font-mono text-slate-200">{s.batch_reference}</span>
              <span>
                Expected ${Number(s.expected_amount).toFixed(2)} vs Settled ${Number(s.settled_amount).toFixed(2)} (
                <span className={s.status === 'matched' ? 'text-emerald-400' : 'text-rose-400'}>{s.status}</span>)
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
