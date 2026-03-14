/**
 * GET /api/admin/metrics
 *
 * Returns dashboard KPI metrics aggregated from Supabase.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/admin-auth';
import { adminSupabase } from '@/app/lib/admin-supabase';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [
    productsResult,
    farmersResult,
    cartsResult,
    revenueResult,
    recentOrdersResult,
    orderStatusResult,
  ] = await Promise.all([
    // Total products (active + inactive)
    adminSupabase.from('products').select('is_active', { count: 'exact' }),

    // Total farmers (registered with phone)
    adminSupabase.from('farmers').select('*', { count: 'exact', head: true }).not('phone_number', 'is', null),

    // Total unique carts/orders
    adminSupabase.from('carts').select('*', { count: 'exact', head: true }),

    // Total revenue from paid orders
    adminSupabase
      .from('carts')
      .select('total_amount')
      .in('status', ['payment_received', 'ready_for_dispatch', 'dispatched', 'completed']),

    // Recent 10 orders
    adminSupabase
      .from('carts')
      .select('id, phone, farmer_name, total_amount, status, placed_at, created_at, last_known_state')
      .order('created_at', { ascending: false })
      .limit(10),

    // Orders grouped by status
    adminSupabase
      .from('carts')
      .select('status'),
  ]);

  const totalProducts = productsResult.count ?? 0;
  const activeProducts = (productsResult.data ?? []).filter((p: { is_active: boolean }) => p.is_active).length;

  const totalFarmers = farmersResult.count ?? 0;
  const totalOrders = cartsResult.count ?? 0;

  const totalRevenue = (revenueResult.data ?? []).reduce(
    (sum: number, row: { total_amount: number | string }) => sum + Number(row.total_amount ?? 0),
    0
  );

  // Status breakdown
  const statusCounts: Record<string, number> = {};
  for (const row of (orderStatusResult.data ?? [])) {
    const s = row.status as string;
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  return NextResponse.json({
    products: { total: totalProducts, active: activeProducts, inactive: totalProducts - activeProducts },
    farmers: { total: totalFarmers },
    orders: { total: totalOrders, byStatus: statusCounts },
    revenue: { total: totalRevenue },
    recentOrders: recentOrdersResult.data ?? [],
  });
}
