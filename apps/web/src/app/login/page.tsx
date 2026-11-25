'use client';

import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useRouter } from 'next/navigation';
import { Building2, ArrowRight, ShieldCheck } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { AuthUser, setSession } from '@/store/store';

const DEMO_PERSONAS = [
  { label: 'Alice Carter', role: 'Customer', email: 'alice.customer@fincore.sim', tag: 'bg-emerald-50 text-emerald-700' },
  { label: 'Bob Miller', role: 'Customer', email: 'bob.customer@fincore.sim', tag: 'bg-emerald-50 text-emerald-700' },
  { label: 'Olivia Analyst', role: 'Ops Analyst', email: 'analyst@fincore.sim', tag: 'bg-sky-50 text-sky-700' },
  { label: 'Frank Finance', role: 'Finance Admin', email: 'finance@fincore.sim', tag: 'bg-indigo-50 text-indigo-700' },
  { label: 'Sam Support', role: 'Support Agent', email: 'support@fincore.sim', tag: 'bg-amber-50 text-amber-700' },
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
    <div className="w-full max-w-md space-y-6">
      <div className="text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
          <Building2 className="h-5 w-5" />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
          {mode === 'login' ? 'Sign in to FinCore' : 'Create your FinCore wallet'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Simulated banking &amp; double-entry ledger sandbox
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
        <div className="mb-5">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span className="font-medium">Demo accounts (1-click fill)</span>
            <span>
              Pass: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">FinCore!Demo2026</code>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_PERSONAS.map((demo) => (
              <button
                key={demo.email}
                type="button"
                onClick={() => setEmail(demo.email)}
                className={`rounded-lg border p-2 text-left transition ${
                  email === demo.email
                    ? 'border-indigo-600 bg-indigo-50/60 ring-1 ring-indigo-600'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="text-xs font-semibold text-slate-900 truncate">{demo.label}</div>
                <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${demo.tag}`}>
                  {demo.role}
                </span>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-slate-700">Full Name</label>
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-700">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
            />
          </div>
          {mfaRequired && (
            <div>
              <label className="block text-xs font-medium text-amber-700">Simulated MFA Code (enter 123456)</label>
              <input
                required
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                placeholder="123456"
                className="mt-1 w-full rounded-lg border border-amber-400 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
              />
            </div>
          )}

          <button
            disabled={loading}
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : mode === 'login' ? 'Sign in' : 'Create account'}
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <div className="mt-5 border-t border-slate-100 pt-4 text-center">
          <button
            type="button"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            {mode === 'login' ? 'Need a simulated customer account? Register' : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
        <ShieldCheck className="h-4 w-4 text-emerald-600" />
        Protected by JWT, RBAC &amp; PostgreSQL row-level locking
      </div>
    </div>
  );
}
