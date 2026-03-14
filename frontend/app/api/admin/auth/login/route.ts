/**
 * POST /api/admin/auth/login
 *
 * Verify admin email + password, set httpOnly JWT cookie on success.
 */

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { adminSupabase } from '@/app/lib/admin-supabase';
import { signAdminToken, setAdminCookie } from '@/app/lib/admin-auth';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = (body?.email ?? '').toLowerCase().trim();
  const password = body?.password ?? '';

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  }

  const { data: admin, error } = await adminSupabase
    .from('admin_users')
    .select('id, email, name, role, password_hash, is_active')
    .eq('email', email)
    .single();

  if (error || !admin) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  }

  if (!admin.is_active) {
    return NextResponse.json({ error: 'Account is disabled.' }, { status: 403 });
  }

  const valid = await bcrypt.compare(password, admin.password_hash);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  }

  await adminSupabase
    .from('admin_users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', admin.id);

  const token = await signAdminToken({
    adminId: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
  });

  const response = NextResponse.json({
    ok: true,
    admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
  });

  setAdminCookie(response, token);
  return response;
}
