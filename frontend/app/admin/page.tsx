'use client';

import React, { useState, useEffect } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Metrics {
  products: { total: number; active: number; inactive: number };
  farmers: { total: number };
  orders: { total: number; byStatus: Record<string, number> };
  revenue: { total: number };
  recentOrders: RecentOrder[];
}

interface RecentOrder {
  id: string;
  phone: string;
  farmer_name: string | null;
  total_amount: number;
  status: string;
  placed_at: string | null;
  created_at: string;
  last_known_state: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  active: '#6B7D56',
  pending_payment: '#d29922',
  payment_received: '#3fb950',
  ready_for_dispatch: '#58a6ff',
  dispatched: '#8b949e',
  completed: '#3fb950',
  cancelled: '#f85149',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  pending_payment: 'Pending Payment',
  payment_received: 'Paid',
  ready_for_dispatch: 'Ready to Ship',
  dispatched: 'Dispatched',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{
      background: 'var(--color-bone-light)', borderRadius: 12,
      padding: '20px 24px',
      boxShadow: '0 1px 8px rgba(58,68,46,0.07)',
      borderLeft: `4px solid ${color ?? 'var(--color-sage)'}`,
    }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--color-forest)', fontFamily: 'var(--font-fraunces)', marginTop: 6 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? '#8b949e';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 20,
      background: `${color}22`, color,
      fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/metrics')
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(setMetrics)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  if (error || !metrics) return <ErrorState error={error} />;

  const totalRevenue = metrics.revenue.total;
  const paidOrders = (metrics.orders.byStatus['payment_received'] ?? 0)
    + (metrics.orders.byStatus['completed'] ?? 0);

  return (
    <div style={{ maxWidth: 1200, display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div>
        <h2 style={{ fontSize: 24, fontFamily: 'var(--font-fraunces)', color: 'var(--color-forest)', fontWeight: 700 }}>
          Dashboard Overview
        </h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginTop: 4 }}>
          Real-time metrics for the WafriAI platform
        </p>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        <StatCard label="Total Products" value={metrics.products.total}
          sub={`${metrics.products.active} active · ${metrics.products.inactive} inactive`}
          color="var(--color-sage)" />
        <StatCard label="Registered Users" value={metrics.farmers.total}
          sub="Farmers with verified phone"
          color="#3fb950" />
        <StatCard label="Total Orders" value={metrics.orders.total}
          sub={`${paidOrders} paid`}
          color="#58a6ff" />
        <StatCard
          label="Total Revenue"
          value={`₦${totalRevenue.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`}
          sub="From paid & completed orders"
          color="#d29922"
        />
      </div>

      {/* Order status breakdown */}
      <div style={{ background: 'var(--color-bone-light)', borderRadius: 12, padding: 24, boxShadow: '0 1px 8px rgba(58,68,46,0.07)' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-forest)', marginBottom: 16, fontFamily: 'var(--font-fraunces)' }}>
          Orders by Status
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {Object.entries(metrics.orders.byStatus).map(([status, count]) => (
            <div key={status} style={{
              background: '#fff', borderRadius: 8, padding: '10px 16px',
              display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120,
            }}>
              <StatusBadge status={status} />
              <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-forest)', fontFamily: 'var(--font-fraunces)' }}>
                {count}
              </span>
            </div>
          ))}
          {Object.keys(metrics.orders.byStatus).length === 0 && (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>No orders yet.</p>
          )}
        </div>
      </div>

      {/* Recent orders */}
      <div style={{ background: 'var(--color-bone-light)', borderRadius: 12, padding: 24, boxShadow: '0 1px 8px rgba(58,68,46,0.07)' }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-forest)', marginBottom: 16, fontFamily: 'var(--font-fraunces)' }}>
          Recent Orders
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Customer', 'Phone', 'State', 'Amount', 'Status', 'Date'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.recentOrders.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)' }}>
                    No orders yet
                  </td>
                </tr>
              )}
              {metrics.recentOrders.map(order => (
                <tr key={order.id} style={{ borderBottom: '1px solid rgba(107,125,86,0.1)' }}>
                  <td style={tdStyle}>{order.farmer_name ?? '—'}</td>
                  <td style={tdStyle}>{order.phone}</td>
                  <td style={tdStyle}>{order.last_known_state ?? '—'}</td>
                  <td style={tdStyle}>
                    {order.total_amount != null && !Number.isNaN(Number(order.total_amount))
                      ? `₦${Number(order.total_amount).toLocaleString()}`
                      : '—'}
                  </td>
                  <td style={tdStyle}><StatusBadge status={order.status} /></td>
                  <td style={{ ...tdStyle, color: 'var(--color-text-muted)' }}>
                    {new Date(order.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {metrics.recentOrders.length > 0 && (
          <div style={{ marginTop: 12, textAlign: 'right' }}>
            <a href="/admin/orders" style={{ fontSize: 13, color: 'var(--color-sage)', fontWeight: 600 }}>
              View all orders →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '8px 12px',
  borderBottom: '2px solid rgba(107,125,86,0.2)',
  fontWeight: 600, color: 'var(--color-text-muted)',
  fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 12px',
  color: 'var(--color-text)',
};

function LoadingState() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{
          height: 80, background: 'rgba(107,125,86,0.08)', borderRadius: 12,
          animation: 'fade-in 0.5s ease',
        }} />
      ))}
    </div>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <div style={{
      background: 'rgba(248,81,73,0.08)', border: '1px solid var(--color-error)',
      borderRadius: 12, padding: 24, color: 'var(--color-error)',
    }}>
      Failed to load metrics: {error}
    </div>
  );
}
