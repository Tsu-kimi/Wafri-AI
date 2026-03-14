/**
 * GET  /api/admin/products  — list all products
 * POST /api/admin/products  — create new product
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/admin-auth';
import { adminSupabase } from '@/app/lib/admin-supabase';

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') ?? '';
  const category = searchParams.get('category') ?? '';
  const activeOnly = searchParams.get('active') === 'true';

  let query = adminSupabase
    .from('products')
    .select('id, sku, name, category, description, dosage_notes, base_price, unit, min_order_qty, max_order_qty, is_active, image_url, disease_tags, states_available, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (q) query = query.ilike('name', `%${q}%`);
  if (category) query = query.eq('category', category);
  if (activeOnly) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ products: data ?? [] });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });

  const {
    sku, name, category, description, dosage_notes,
    base_price, unit, min_order_qty, max_order_qty,
    is_active, image_url, disease_tags, states_available,
  } = body;

  if (!sku || !name || !category || base_price == null) {
    return NextResponse.json({ error: 'sku, name, category, base_price are required.' }, { status: 400 });
  }

  const { data, error } = await adminSupabase
    .from('products')
    .insert({
      sku: sku.trim().toUpperCase(),
      name: name.trim(),
      category,
      description: description ?? '',
      dosage_notes: dosage_notes ?? '',
      base_price: Number(base_price),
      unit: unit ?? 'piece',
      min_order_qty: min_order_qty ?? 1,
      max_order_qty: max_order_qty ?? 1000,
      is_active: is_active ?? true,
      image_url: image_url ?? '',
      disease_tags: disease_tags ?? [],
      states_available: states_available ?? [],
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A product with this SKU already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ product: data }, { status: 201 });
}
