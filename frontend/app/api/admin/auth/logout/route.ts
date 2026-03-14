import { NextResponse } from 'next/server';
import { clearAdminCookie } from '@/app/lib/admin-auth';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearAdminCookie(response);
  return response;
}
