'use client';

import React, { useState } from 'react';
import { Provider, useDispatch, useSelector } from 'react-redux';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Users,
  ShieldAlert,
  Activity,
  LogOut,
  LogIn,
  Menu,
  X,
  Building2,
} from 'lucide-react';
import { clearSession, RootState, store } from '@/store/store';

function ShellLayout({ children }: { children: React.ReactNode }) {
  const user = useSelector((s: RootState) => s.auth.user);
  const dispatch = useDispatch();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isStaff =
    user && ['support_agent', 'operations_analyst', 'finance_admin', 'platform_admin'].includes(user.role);

  const navItems = [
    { href: '/', label: 'Home & Accounts', icon: LayoutDashboard },
    ...(isStaff ? [{ href: '/ops', label: 'Operations Console', icon: Activity }] : []),
  ];

  // Login page uses full-bleed clean layout without sidebar
  if (pathname === '/login') {
    return (
      <div className="min-h-screen bg-[#F6F8FA] flex flex-col">
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-center text-xs font-medium text-amber-800">
          SIMULATED SANDBOX ENVIRONMENT — Synthetic balances &amp; test-mode payments only. No real money.
        </div>
        <main className="flex-1 flex items-center justify-center p-4 sm:p-8">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F8FA] flex flex-col">
      {/* Sandbox Banner */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-center text-[11px] font-medium text-amber-900">
        SIMULATED SANDBOX — Synthetic balances &amp; test-mode payments only. No real money.
      </div>

      <div className="flex flex-1">
        {/* Left Sidebar (Mercury / Stripe style) */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-slate-200 bg-white transition-transform duration-200 lg:static lg:translate-x-0 flex flex-col justify-between ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div>
            <div className="flex h-16 items-center justify-between border-b border-slate-100 px-5">
              <Link href="/" className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
                  <Building2 className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-bold tracking-tight text-slate-900">FinCore</div>
                  <div className="text-[10px] font-medium text-slate-500">Digital Treasury</div>
                </div>
              </Link>
              <button onClick={() => setMobileOpen(false)} className="lg:hidden text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="p-3 space-y-1">
              {navItems.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? 'text-indigo-600' : 'text-slate-400'}`} />
                    {item.label}
                  </Link>
                );
              })}

              {!isStaff && user && (
                <div className="pt-4 px-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Quick Links
                  </div>
                  <div className="space-y-1 text-xs text-slate-500">
                    <div className="flex items-center gap-2 py-1">
                      <ArrowLeftRight className="h-3.5 w-3.5 text-slate-400" />
                      Instant Transfers
                    </div>
                    <div className="flex items-center gap-2 py-1">
                      <Users className="h-3.5 w-3.5 text-slate-400" />
                      Saved Beneficiaries
                    </div>
                  </div>
                </div>
              )}
            </nav>
          </div>

          {/* Sidebar Footer: User / Auth */}
          <div className="border-t border-slate-100 p-4">
            {user ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                    {user.fullName
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-slate-900">{user.fullName}</div>
                    <div className="truncate text-[11px] text-slate-500 capitalize">
                      {user.role.replace('_', ' ')}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => dispatch(clearSession())}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                <LogIn className="h-3.5 w-3.5" />
                Sign in
              </Link>
            )}
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Mobile Topbar */}
          <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
            <button onClick={() => setMobileOpen(true)} className="text-slate-600">
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-sm font-bold text-slate-900">FinCore</span>
            <div className="w-5" />
          </header>

          <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-8">{children}</main>

          <footer className="border-t border-slate-200 bg-white py-3 px-6 text-center text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
            FinCore Educational Sandbox — Double-entry ledger, settlements, and risk scores are simulated.
          </footer>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <ShellLayout>{children}</ShellLayout>
    </Provider>
  );
}
