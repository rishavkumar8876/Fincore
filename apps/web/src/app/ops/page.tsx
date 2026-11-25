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
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
        Operations Console requires a staff role (`support_agent`, `operations_analyst`, `finance_admin`, or
        `platform_admin`).
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Operations &amp; Risk Console</h1>
          <p className="text-xs text-slate-500">
            Role: <span className="font-semibold text-indigo-600">{user.role}</span> · Decision-support &amp; audit tools
          </p>
        </div>
        <button
          onClick={loadOps}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Risk Alerts</div>
          <div className="mt-1 text-2xl font-bold text-amber-600">{alerts.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Disputes</div>
          <div className="mt-1 text-2xl font-bold text-indigo-600">{disputes.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Settlement Batches</div>
          <div className="mt-1 text-2xl font-bold text-emerald-600">{settlements.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Recent Audit Events</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{auditLogs.length}</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <AlertOctagon className="h-4 w-4 text-amber-500" />
            Risk Alerts ({alerts.length})
          </h2>
          <p className="mt-1 text-[11px] text-amber-700">
            Risk scores are decision support for operations analysts, not proof of fraud.
          </p>
          <div className="mt-3 space-y-2.5">
            {alerts.length === 0 ? (
              <p className="text-xs text-slate-400">No risk alerts recorded.</p>
            ) : (
              alerts.map((a) => (
                <div key={a.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">{a.alert_type}</span>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                      {a.severity} · {a.status}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                    <div className="h-full bg-amber-500" style={{ width: `${Math.min(100, Number(a.risk_score))}%` }} />
                  </div>
                  <div className="flex gap-1.5 pt-1">
                    <button
                      onClick={() => updateAlertStatus(a.id, 'acknowledged')}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-100"
                    >
                      Acknowledge
                    </button>
                    <button
                      onClick={() => updateAlertStatus(a.id, 'resolved_false_positive')}
                      className="rounded bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100"
                    >
                      False Positive
                    </button>
                    <button
                      onClick={() => updateAlertStatus(a.id, 'escalated')}
                      className="rounded bg-rose-50 px-2 py-1 text-[10px] font-medium text-rose-700 hover:bg-rose-100"
                    >
                      Escalate
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ShieldCheck className="h-4 w-4 text-indigo-600" />
            Customer Disputes ({disputes.length})
          </h2>
          <div className="mt-3 space-y-2.5">
            {disputes.length === 0 ? (
              <p className="text-xs text-slate-400">No disputes in queue.</p>
            ) : (
              disputes.map((d) => (
                <div key={d.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">{d.reason}</span>
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-indigo-700">
                      {d.status}
                    </span>
                  </div>
                  <p className="text-slate-600">{d.description}</p>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => updateDisputeStatus(d.id, 'under_review')}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-100"
                    >
                      Under Review
                    </button>
                    <button
                      onClick={() => updateDisputeStatus(d.id, 'resolved_refunded')}
                      className="rounded bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100"
                    >
                      Approve Refund
                    </button>
                    <button
                      onClick={() => updateDisputeStatus(d.id, 'resolved_rejected')}
                      className="rounded bg-rose-50 px-2 py-1 text-[10px] font-medium text-rose-700 hover:bg-rose-100"
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

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Scale className="h-4 w-4 text-emerald-600" />
            Settlement Reconciliation
          </h2>
          <form onSubmit={handleReconcile} className="grid gap-2 sm:grid-cols-2">
            <input
              value={batchRef}
              onChange={(e) => setBatchRef(e.target.value)}
              placeholder="Batch Reference"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
            />
            <input
              value={expectedAmt}
              onChange={(e) => setExpectedAmt(e.target.value)}
              placeholder="Expected"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
            />
            <input
              value={settledAmt}
              onChange={(e) => setSettledAmt(e.target.value)}
              placeholder="Settled"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
            />
            <button type="submit" className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700">
              Record Batch
            </button>
          </form>
          <div className="space-y-1.5">
            {settlements.map((s) => (
              <div key={s.id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                <span className="font-mono text-slate-800">{s.batch_reference}</span>
                <span>
                  ${Number(s.expected_amount).toFixed(2)} vs ${Number(s.settled_amount).toFixed(2)} (
                  <span className={s.status === 'matched' ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
                    {s.status}
                  </span>
                  )
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <FileText className="h-4 w-4 text-indigo-600" />
            Immutable Audit Trail
          </h2>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {auditLogs.length === 0 ? (
              <p className="text-xs text-slate-400">No audit events loaded.</p>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                  <div>
                    <span className="font-mono font-medium text-indigo-700">{log.action}</span>
                    <span className="ml-2 text-slate-500">({log.resource_type})</span>
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
