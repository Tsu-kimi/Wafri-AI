/**
 * POST /api/admin/setup
 *
 * First-run setup: creates the first admin account.
 * Only works when zero admin users exist in the database.
 */

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { adminSupabase } from '@/app/lib/admin-supabase';

export async function GET() {
  const { count } = await adminSupabase
    .from('admin_users')
    .select('*', { count: 'exact', head: true });

  return NextResponse.json({ needsSetup: (count ?? 0) === 0 });
}

export async function POST(req: NextRequest) {
  const { count } = await adminSupabase
    .from('admin_users')
    .select('*', { count: 'exact', head: true });

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: 'Admin already configured. Use login instead.' },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { email, name, password } = body ?? {};

  if (!email || !name || !password || password.length < 8) {
    return NextResponse.json(
      { error: 'email, name, and password (min 8 chars) are required.' },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const { data, error } = await adminSupabase
    .from('admin_users')
    .insert({ email: email.toLowerCase(), name, password_hash: passwordHash, role: 'super_admin' })
    .select('id, email, name, role')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, admin: data }, { status: 201 });
}
