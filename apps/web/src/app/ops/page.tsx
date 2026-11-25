'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { ShieldCheck, AlertOctagon, Scale, FileText, RefreshCw } from 'lucide-react';
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
  description: string;
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

interface AuditLog {
  id: string;
  actor_role: string;
  action: string;
  resource_type: string;
  created_at: string;
}

export default function OperationsPage() {
  const token = useSelector((s: RootState) => s.auth.accessToken);
  const user = useSelector((s: RootState) => s.auth.user);
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [batchRef, setBatchRef] = useState('BATCH-2026-01');
  const [expectedAmt, setExpectedAmt] = useState('1000.00');
  const [settledAmt, setSettledAmt] = useState('1000.00');
  const [error, setError] = useState<string | null>(null);

  const loadOps = useCallback(async () => {
    if (!token) return;
    try {
      const [dRes, aRes, sRes, lRes] = await Promise.all([
        apiFetch<{ data: Dispute[] }>('/ops/disputes', { token }),
        apiFetch<{ data: RiskAlert[] }>('/ops/risk-alerts', { token }).catch(() => ({ data: [] })),
        apiFetch<{ data: Settlement[] }>('/ops/settlements', { token }).catch(() => ({ data: [] })),
        apiFetch<{ data: AuditLog[] }>('/ops/audit-logs?limit=15', { token }).catch(() => ({ data: [] })),
      ]);
      setDisputes(dRes.data);
      setAlerts(aRes.data);
      setSettlements(sRes.data);
      setAuditLogs(lRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load operations data');
    }
  }, [token]);

  useEffect(() => {
    loadOps();
  }, [loadOps]);

  async function updateAlertStatus(id: string, status: 'acknowledged' | 'resolved_false_positive' | 'escalated') {
    await apiFetch(`/ops/risk-alerts/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ status }),
    });
    await loadOps();
  }

  async function updateDisputeStatus(id: string, status: 'under_review' | 'resolved_refunded' | 'resolved_rejected') {
    await apiFetch(`/ops/disputes/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ status }),
    });
    await loadOps();
  }

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
      <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-sm text-rose-200">
        Operations Console requires a staff role (`support_agent`, `operations_analyst`, `finance_admin`, or
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
            Role: <span className="text-sky-400 font-semibold">{user.role}</span> · Decision-support &amp; audit tools
          </p>
        </div>
        <button
          onClick={loadOps}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 hover:text-white"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">{error}</div>
      )}

      {/* KPI Row */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4">
          <div className="text-xs text-slate-400">Risk Alerts</div>
          <div className="mt-1 text-2xl font-bold text-amber-400">{alerts.length}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4">
          <div className="text-xs text-slate-400">Disputes</div>
          <div className="mt-1 text-2xl font-bold text-sky-400">{disputes.length}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4">
          <div className="text-xs text-slate-400">Settlement Batches</div>
          <div className="mt-1 text-2xl font-bold text-emerald-400">{settlements.length}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-900/70 p-4">
          <div className="text-xs text-slate-400">Recent Audit Events</div>
          <div className="mt-1 text-2xl font-bold text-white">{auditLogs.length}</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Risk Alerts */}
        <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <AlertOctagon className="h-4 w-4 text-amber-400" />
            Risk Alerts ({alerts.length})
          </h2>
          <p className="mt-1 text-[11px] text-amber-300/80">
            Risk scores are decision support for operations analysts, not proof of fraud.
          </p>
          <div className="mt-3 space-y-2.5">
            {alerts.length === 0 ? (
              <p className="text-xs text-slate-500">No risk alerts recorded.</p>
            ) : (
              alerts.map((a) => (
                <div key={a.id} className="rounded-xl border border-white/5 bg-slate-950/70 p-3 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">{a.alert_type}</span>
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-300">
                      {a.severity} · {a.status}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-amber-400" style={{ width: `${Math.min(100, Number(a.risk_score))}%` }} />
                  </div>
                  <div className="flex gap-1.5 pt-1">
                    <button
                      onClick={() => updateAlertStatus(a.id, 'acknowledged')}
                      className="rounded bg-white/5 px-2 py-1 text-[10px] text-slate-300 hover:bg-white/10"
                    >
                      Acknowledge
                    </button>
                    <button
                      onClick={() => updateAlertStatus(a.id, 'resolved_false_positive')}
                      className="rounded bg-emerald-500/15 px-2 py-1 text-[10px] text-emerald-300 hover:bg-emerald-500/25"
                    >
                      False Positive
                    </button>
                    <button
                      onClick={() => updateAlertStatus(a.id, 'escalated')}
                      className="rounded bg-rose-500/15 px-2 py-1 text-[10px] text-rose-300 hover:bg-rose-500/25"
                    >
                      Escalate
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Disputes */}
        <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ShieldCheck className="h-4 w-4 text-sky-400" />
            Customer Disputes ({disputes.length})
          </h2>
          <div className="mt-3 space-y-2.5">
            {disputes.length === 0 ? (
              <p className="text-xs text-slate-500">No disputes in queue.</p>
            ) : (
              disputes.map((d) => (
                <div key={d.id} className="rounded-xl border border-white/5 bg-slate-950/70 p-3 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">{d.reason}</span>
                    <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-sky-300">
                      {d.status}
                    </span>
                  </div>
                  <p className="text-slate-400">{d.description}</p>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => updateDisputeStatus(d.id, 'under_review')}
                      className="rounded bg-white/5 px-2 py-1 text-[10px] text-slate-300 hover:bg-white/10"
                    >
                      Under Review
                    </button>
                    <button
                      onClick={() => updateDisputeStatus(d.id, 'resolved_refunded')}
                      className="rounded bg-emerald-500/15 px-2 py-1 text-[10px] text-emerald-300 hover:bg-emerald-500/25"
                    >
                      Approve Refund
                    </button>
                    <button
                      onClick={() => updateDisputeStatus(d.id, 'resolved_rejected')}
                      className="rounded bg-rose-500/15 px-2 py-1 text-[10px] text-rose-300 hover:bg-rose-500/25"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Settlement Reconciliation & Audit Logs */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Scale className="h-4 w-4 text-emerald-400" />
            Settlement Reconciliation
          </h2>
          <form onSubmit={handleReconcile} className="grid gap-2 sm:grid-cols-2">
            <input
              value={batchRef}
              onChange={(e) => setBatchRef(e.target.value)}
              placeholder="Batch Reference"
              className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
            />
            <input
              value={expectedAmt}
              onChange={(e) => setExpectedAmt(e.target.value)}
              placeholder="Expected"
              className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
            />
            <input
              value={settledAmt}
              onChange={(e) => setSettledAmt(e.target.value)}
              placeholder="Settled"
              className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
            />
            <button type="submit" className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950">
              Record Batch
            </button>
          </form>
          <div className="space-y-1.5">
            {settlements.map((s) => (
              <div key={s.id} className="flex justify-between rounded-lg bg-slate-950/70 px-3 py-2 text-xs">
                <span className="font-mono text-slate-200">{s.batch_reference}</span>
                <span>
                  ${Number(s.expected_amount).toFixed(2)} vs ${Number(s.settled_amount).toFixed(2)} (
                  <span className={s.status === 'matched' ? 'text-emerald-400' : 'text-rose-400'}>{s.status}</span>)
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <FileText className="h-4 w-4 text-indigo-400" />
            Immutable Audit Trail
          </h2>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {auditLogs.length === 0 ? (
              <p className="text-xs text-slate-500">No audit events loaded.</p>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between rounded-lg bg-slate-950/70 px-3 py-2 text-xs">
                  <div>
                    <span className="font-mono text-emerald-300">{log.action}</span>
                    <span className="ml-2 text-slate-400">({log.resource_type})</span>
                  </div>
                  <span className="text-[11px] text-slate-500">{log.actor_role || 'system'}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
