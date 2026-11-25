'use client';

import React from 'react';
import { Provider, useDispatch, useSelector } from 'react-redux';
import Link from 'next/link';
import { ShieldAlert, Wallet, Activity, LogOut, LogIn } from 'lucide-react';
import { clearSession, RootState, store } from '@/store/store';

function Navbar() {
  const user = useSelector((s: RootState) => s.auth.user);
  const dispatch = useDispatch();
  const isStaff = user && ['support_agent', 'operations_analyst', 'finance_admin', 'platform_admin'].includes(user.role);

  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur">
      <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-1.5 text-center text-xs font-medium text-amber-300">
        SIMULATED SANDBOX ENVIRONMENT — Synthetic balances &amp; test-mode payments only. No real money.
      </div>
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold text-emerald-400">
            <Wallet className="h-5 w-5" />
            FinCore
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/" className="text-slate-300 hover:text-white">
              Customer Wallet
            </Link>
            {isStaff && (
              <Link href="/ops" className="flex items-center gap-1 text-sky-400 hover:text-sky-300">
                <Activity className="h-4 w-4" />
                Operations Console
              </Link>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                {user.fullName} <span className="text-emerald-400">({user.role})</span>
              </span>
              <button
                onClick={() => dispatch(clearSession())}
                className="flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
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
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-slate-800 py-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
          <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
          FinCore Educational Sandbox — All ledger entries, settlements, and risk scores are simulated.
        </footer>
      </div>
    </Provider>
  );
}
