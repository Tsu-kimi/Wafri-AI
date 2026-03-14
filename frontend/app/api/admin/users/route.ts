/**
 * GET /api/admin/users
 *
 * Returns paginated list of registered farmers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/admin-auth';
import { adminSupabase } from '@/app/lib/admin-supabase';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') ?? '';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
  const limit = 20;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = adminSupabase
    .from('farmers')
    .select(
      'id, phone_number, name, state, pin_set_at, failed_pin_attempts, locked_until, created_at',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  if (q) query = query.or(`name.ilike.%${q}%,phone_number.ilike.%${q}%`);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ users: data ?? [], total: count ?? 0, page, limit });
}
