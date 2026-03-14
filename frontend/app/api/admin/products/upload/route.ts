/**
 * POST /api/admin/products/upload
 *
 * Upload a product image to Supabase Storage.
 * Returns the public URL of the uploaded image.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/admin-auth';
import { adminSupabase } from '@/app/lib/admin-supabase';

const BUCKET = 'product-images';

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 });

  const file = formData.get('file') as File | null;
  const sku = (formData.get('sku') as string | null)?.trim().toUpperCase() ?? '';

  if (!file) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  if (!sku) return NextResponse.json({ error: 'SKU is required to name the file.' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const fileName = `${sku}.${ext}`;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  const { error } = await adminSupabase.storage
    .from(BUCKET)
    .upload(fileName, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: urlData } = adminSupabase.storage.from(BUCKET).getPublicUrl(fileName);

  return NextResponse.json({ url: urlData.publicUrl, fileName });
}
