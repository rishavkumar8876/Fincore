'use client';

import React from 'react';
import { Provider, useDispatch, useSelector } from 'react-redux';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldAlert, Wallet, Activity, LogOut, LogIn, Sparkles } from 'lucide-react';
import { clearSession, RootState, store } from '@/store/store';

function Navbar() {
  const user = useSelector((s: RootState) => s.auth.user);
  const dispatch = useDispatch();
  const pathname = usePathname();
  const isStaff =
    user && ['support_agent', 'operations_analyst', 'finance_admin', 'platform_admin'].includes(user.role);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
      <div className="bg-gradient-to-r from-amber-500/15 via-amber-400/10 to-emerald-500/15 border-b border-amber-500/20 px-4 py-1 text-center text-[11px] font-medium text-amber-200/90 flex items-center justify-center gap-1.5">
        <Sparkles className="h-3 w-3 text-amber-400" />
        SIMULATED SANDBOX ENVIRONMENT — Synthetic balances &amp; test-mode payments only. No real money.
      </div>
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 text-slate-950 shadow-lg shadow-emerald-500/20 transition-transform group-hover:scale-105">
              <Wallet className="h-4 w-4 stroke-[2.5]" />
            </div>
            <span className="text-lg font-bold tracking-tight text-white">
              Fin<span className="text-emerald-400">Core</span>
            </span>
          </Link>

          <nav className="hidden sm:flex items-center gap-1.5 text-sm">
            <Link
              href="/"
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                pathname === '/'
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              Wallet &amp; Transfers
            </Link>
            {isStaff && (
              <Link
                href="/ops"
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  pathname === '/ops'
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                    : 'text-sky-400 hover:bg-sky-500/10'
                }`}
              >
                <Activity className="h-3.5 w-3.5" />
                Operations Console
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              <div className="flex items-center gap-2.5 rounded-full border border-white/10 bg-slate-900/90 py-1 pl-1.5 pr-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-[11px] font-bold text-white">
                  {user.fullName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <span className="text-xs font-medium text-slate-200 hidden sm:inline">{user.fullName}</span>
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                  {user.role.replace('_', ' ')}
                </span>
              </div>
              <button
                onClick={() => dispatch(clearSession())}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-200"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-1.5 text-xs font-semibold text-slate-950 shadow-md shadow-emerald-500/20 transition hover:brightness-110"
            >
              <LogIn className="h-3.5 w-3.5" />
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <div className="min-h-screen flex flex-col bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black text-slate-100">
        <Navbar />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
        <footer className="border-t border-white/10 py-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
          <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
          FinCore Educational Sandbox — Double-entry ledger, settlements, and risk scores are simulated.
        </footer>
      </div>
    </Provider>
  );
}
