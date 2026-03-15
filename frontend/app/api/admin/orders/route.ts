/**
 * GET /api/admin/orders
 *
 * Returns paginated list of all carts/orders with optional status filter.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/admin-auth';
import { adminSupabase } from '@/app/lib/admin-supabase';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') ?? '';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
  const limit = 20;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = adminSupabase
    .from('carts')
    .select(
      'id, phone, farmer_name, total_amount, status, payment_reference, order_reference, delivery_address, last_known_state, placed_at, created_at, updated_at',
      { count: 'exact' }
    )
    .order('updated_at', { ascending: false })
    .range(from, to);

  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ orders: data ?? [], total: count ?? 0, page, limit });
}
