'use client';

import React, { useState, useEffect, createContext, useContext } from 'react';
import { useRouter, usePathname } from 'next/navigation';

// ── Admin auth context ─────────────────────────────────────────────────────

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

const AdminCtx = createContext<{
  admin: AdminUser | null;
  logout: () => Promise<void>;
} | null>(null);

export function useAdmin() {
  const ctx = useContext(AdminCtx);
  if (!ctx) throw new Error('useAdmin must be used inside AdminLayout');
  return ctx;
}

// ── Sidebar navigation items ────────────────────────────────────────────────

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: '▦' },
  { href: '/admin/products', label: 'Products', icon: '⬡' },
  { href: '/admin/orders', label: 'Orders', icon: '⬡' },
  { href: '/admin/users', label: 'Users', icon: '⬡' },
];

// ── Main layout component ────────────────────────────────────────────────────

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (pathname === '/admin/login' || pathname === '/admin/setup') {
      setLoading(false);
      return;
    }
    fetch('/api/admin/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.admin) {
          setAdmin(data.admin);
        } else {
          router.push('/admin/login');
        }
      })
      .catch(() => router.push('/admin/login'))
      .finally(() => setLoading(false));
  }, [pathname, router]);

  async function logout() {
    await fetch('/api/admin/auth/logout', { method: 'POST' });
    setAdmin(null);
    router.push('/admin/login');
  }

  if (pathname === '/admin/login' || pathname === '/admin/setup') {
    return (
      <div style={{ minHeight: '100svh', background: 'var(--color-bg)', overflow: 'auto' }}>
        {children}
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100svh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--color-bg)',
      }}>
        <span style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-inter)' }}>
          Loading…
        </span>
      </div>
    );
  }

  return (
    <AdminCtx.Provider value={{ admin, logout }}>
      <div style={{ display: 'flex', height: '100svh', overflow: 'hidden', background: 'var(--color-bg)' }}>
        {/* ── Sidebar ── */}
        <aside style={{
          width: sidebarOpen ? 240 : 64,
          flexShrink: 0,
          background: 'var(--color-forest)',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.2s ease',
          overflow: 'hidden',
        }}>
          {/* Logo */}
          <div style={{
            padding: '20px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            minHeight: 72,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: 'var(--color-sage)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>W</span>
            </div>
            {sidebarOpen && (
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-fraunces)' }}>
                  WafriAI
                </div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Admin Panel</div>
              </div>
            )}
          </div>

          {/* Nav links */}
          <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {NAV.map(({ href, label, icon }) => {
              const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
              return (
                <a
                  key={href}
                  href={href}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px', borderRadius: 8,
                    background: active ? 'rgba(107,125,86,0.35)' : 'transparent',
                    color: active ? '#fff' : 'rgba(255,255,255,0.65)',
                    textDecoration: 'none',
                    fontSize: 14,
                    fontWeight: active ? 600 : 400,
                    transition: 'background 0.15s, color 0.15s',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={e => {
                    if (!active) (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.08)';
                  }}
                  onMouseLeave={e => {
                    if (!active) (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
                  }}
                >
                  <NavIcon name={label} active={active} />
                  {sidebarOpen && <span>{label}</span>}
                </a>
              );
            })}
          </nav>

          {/* Admin info at bottom */}
          {admin && sidebarOpen && (
            <div style={{
              padding: '16px', borderTop: '1px solid rgba(255,255,255,0.1)',
            }}>
              <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: 600 }}>{admin.name}</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 2 }}>{admin.email}</div>
              <button
                onClick={logout}
                style={{
                  marginTop: 10, width: '100%', padding: '7px 0',
                  background: 'rgba(255,255,255,0.1)', border: 'none',
                  borderRadius: 6, color: 'rgba(255,255,255,0.7)',
                  cursor: 'pointer', fontSize: 12, transition: 'background 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.18)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)'; }}
              >
                Sign out
              </button>
            </div>
          )}
        </aside>

        {/* ── Main content ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Top bar */}
          <header style={{
            height: 56, background: 'var(--color-bone-light)',
            borderBottom: '1px solid rgba(107,125,86,0.2)',
            display: 'flex', alignItems: 'center',
            padding: '0 24px', gap: 16, flexShrink: 0,
          }}>
            <button
              onClick={() => setSidebarOpen(p => !p)}
              style={{
                width: 32, height: 32, border: 'none',
                background: 'transparent', cursor: 'pointer',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 5,
              }}
            >
              {[0,1,2].map(i => (
                <span key={i} style={{
                  display: 'block', width: 18, height: 2,
                  background: 'var(--color-text)', borderRadius: 1,
                }} />
              ))}
            </button>
            <span style={{
              flex: 1, fontFamily: 'var(--font-fraunces)',
              fontSize: 16, color: 'var(--color-forest)', fontWeight: 600,
            }}>
              {NAV.find(n => n.href === '/admin' ? pathname === '/admin' : pathname.startsWith(n.href))?.label ?? 'Admin'}
            </span>
            {admin && (
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                {admin.name}
              </span>
            )}
          </header>

          {/* Page content */}
          <main style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
            {children}
          </main>
        </div>
      </div>
    </AdminCtx.Provider>
  );
}

// ── Icon component using SVG paths ─────────────────────────────────────────

function NavIcon({ name, active }: { name: string; active: boolean }) {
  const color = active ? '#fff' : 'rgba(255,255,255,0.65)';
  const size = 18;
  const icons: Record<string, React.ReactNode> = {
    Dashboard: (
      <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={2} style={{ flexShrink: 0 }}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
    Products: (
      <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={2} style={{ flexShrink: 0 }}>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
    Orders: (
      <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={2} style={{ flexShrink: 0 }}>
        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </svg>
    ),
    Users: (
      <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={2} style={{ flexShrink: 0 }}>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  };
  return <>{icons[name] ?? null}</>;
}
