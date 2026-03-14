import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/admin-auth';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ admin });
}
