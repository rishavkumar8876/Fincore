'use client';

import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Zap, Lock, ArrowRight, UserCheck } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { AuthUser, setSession } from '@/store/store';

const DEMO_PERSONAS = [
  { label: 'Alice Carter', role: 'Customer', email: 'alice.customer@fincore.sim', badge: 'bg-emerald-500/15 text-emerald-300' },
  { label: 'Bob Miller', role: 'Customer', email: 'bob.customer@fincore.sim', badge: 'bg-emerald-500/15 text-emerald-300' },
  { label: 'Olivia Analyst', role: 'Ops Analyst', email: 'analyst@fincore.sim', badge: 'bg-sky-500/15 text-sky-300' },
  { label: 'Frank Finance', role: 'Finance Admin', email: 'finance@fincore.sim', badge: 'bg-purple-500/15 text-purple-300' },
  { label: 'Sam Support', role: 'Support Agent', email: 'support@fincore.sim', badge: 'bg-amber-500/15 text-amber-300' },
];

export default function LoginPage() {
  const dispatch = useDispatch();
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('alice.customer@fincore.sim');
  const [password, setPassword] = useState('FinCore!Demo2026');
  const [fullName, setFullName] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'register') {
        await apiFetch('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email, password, fullName }),
        });
        setMode('login');
      }
      const res = await apiFetch<{
        data: {
          mfaRequired?: boolean;
          accessToken?: string;
          refreshToken?: string;
          user?: AuthUser;
        };
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, mfaCode: mfaRequired ? mfaCode : undefined }),
      });

      if (res.data.mfaRequired) {
        setMfaRequired(true);
        return;
      }

      if (res.data.accessToken && res.data.refreshToken && res.data.user) {
        dispatch(
          setSession({
            user: res.data.user,
            accessToken: res.data.accessToken,
            refreshToken: res.data.refreshToken,
          })
        );
        router.push(res.data.user.role === 'customer' ? '/' : '/ops');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-8 py-4 lg:grid-cols-12 items-center">
      {/* Left Hero Panel */}
      <div className="lg:col-span-6 space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
          <Lock className="h-3.5 w-3.5" />
          Double-Entry Ledger &amp; Sandbox Payments
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
          Modern Digital Banking,{' '}
          <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            Simulated Safely.
          </span>
        </h1>
        <p className="text-sm leading-relaxed text-slate-400">
          Explore atomic wallet transfers, immutable PostgreSQL ledger entries, FastAPI decimal risk analytics,
          disputes, and settlement reconciliation using synthetic accounts.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <Zap className="h-5 w-5 text-emerald-400" />
            <h3 className="mt-2 text-xs font-semibold text-white">Idempotent Transfers</h3>
            <p className="mt-1 text-[11px] text-slate-400">Row-level locks &amp; unique keys prevent duplicate debits.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <ShieldCheck className="h-5 w-5 text-cyan-400" />
            <h3 className="mt-2 text-xs font-semibold text-white">5-Role RBAC &amp; Audit</h3>
            <p className="mt-1 text-[11px] text-slate-400">Separate Customer, Support, Analyst &amp; Finance consoles.</p>
          </div>
        </div>
      </div>

      {/* Right Auth Card */}
      <div className="lg:col-span-6 rounded-2xl border border-white/10 bg-slate-900/90 p-6 sm:p-8 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">
            {mode === 'login' ? 'Sign in to FinCore' : 'Create Customer Wallet'}
          </h2>
          <span className="text-[11px] text-slate-400">
            Pass: <code className="text-emerald-400">FinCore!Demo2026</code>
          </span>
        </div>

        {/* 1-Click Persona Switcher */}
        <div className="mt-4">
          <div className="text-[11px] font-medium text-slate-400 mb-2 flex items-center gap-1.5">
            <UserCheck className="h-3.5 w-3.5 text-emerald-400" />
            Quick-fill Synthetic Persona:
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {DEMO_PERSONAS.map((demo) => {
              const selected = email === demo.email;
              return (
                <button
                  key={demo.email}
                  type="button"
                  onClick={() => setEmail(demo.email)}
                  className={`rounded-lg border p-2 text-left transition ${
                    selected
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-white/10 bg-slate-950/60 hover:border-white/25'
                  }`}
                >
                  <div className="text-xs font-medium text-white truncate">{demo.label}</div>
                  <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${demo.badge}`}>
                    {demo.role}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-slate-300">Full Name</label>
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
                className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-300">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-300">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500"
            />
          </div>
          {mfaRequired && (
            <div>
              <label className="block text-xs font-medium text-amber-300">Simulated MFA Code (enter 123456)</label>
              <input
                required
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                placeholder="123456"
                className="mt-1 w-full rounded-lg border border-amber-500/50 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none"
              />
            </div>
          )}

          <button
            disabled={loading}
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:brightness-110 disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : mode === 'login' ? 'Sign In to Dashboard' : 'Create Account & Wallet'}
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <div className="mt-5 border-t border-white/10 pt-4 text-center">
          <button
            type="button"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            className="text-xs text-slate-400 hover:text-emerald-400 transition-colors"
          >
            {mode === 'login' ? 'New customer? Create a simulated wallet' : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}
