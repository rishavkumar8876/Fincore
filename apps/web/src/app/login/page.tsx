'use client';

import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { AuthUser, setSession } from '@/store/store';

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
    <div className="mx-auto max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
      <h1 className="text-xl font-semibold text-white">
        {mode === 'login' ? 'Sign in to FinCore Sandbox' : 'Create Customer Account'}
      </h1>
      <p className="mt-1 text-xs text-slate-400">
        Demo synthetic accounts use password <code className="text-emerald-400">FinCore!Demo2026</code>
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        {[
          { label: 'Customer (Alice)', email: 'alice.customer@fincore.sim' },
          { label: 'Analyst', email: 'analyst@fincore.sim' },
          { label: 'Finance Admin', email: 'finance@fincore.sim' },
          { label: 'Support', email: 'support@fincore.sim' },
        ].map((demo) => (
          <button
            key={demo.email}
            type="button"
            onClick={() => setEmail(demo.email)}
            className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-slate-300 hover:border-emerald-500"
          >
            {demo.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs text-rose-300">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        {mode === 'register' && (
          <div>
            <label className="block text-xs text-slate-300">Full Name</label>
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </div>
        )}
        <div>
          <label className="block text-xs text-slate-300">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-300">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </div>
        {mfaRequired && (
          <div>
            <label className="block text-xs text-amber-300">Simulated MFA Code (use 123456)</label>
            <input
              required
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              placeholder="123456"
              className="mt-1 w-full rounded-md border border-amber-500/50 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </div>
        )}

        <button
          disabled={loading}
          type="submit"
          className="w-full rounded-md bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {loading ? 'Processing...' : mode === 'login' ? 'Sign In' : 'Register & Create Wallet'}
        </button>
      </form>

      <button
        type="button"
        onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        className="mt-4 text-xs text-slate-400 hover:text-emerald-400"
      >
        {mode === 'login' ? 'Need a simulated customer account? Register' : 'Already have an account? Sign in'}
      </button>
    </div>
  );
}
