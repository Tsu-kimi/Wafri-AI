/**
 * PUT    /api/admin/products/[id]  — update product
 * DELETE /api/admin/products/[id]  — delete product
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/app/lib/admin-auth';
import { adminSupabase } from '@/app/lib/admin-supabase';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });

  const {
    sku, name, category, description, dosage_notes,
    base_price, unit, min_order_qty, max_order_qty,
    is_active, image_url, disease_tags, states_available,
  } = body;

  const updates: Record<string, unknown> = {};
  if (sku != null) updates.sku = sku.trim().toUpperCase();
  if (name != null) updates.name = name.trim();
  if (category != null) updates.category = category;
  if (description != null) updates.description = description;
  if (dosage_notes != null) updates.dosage_notes = dosage_notes;
  if (base_price != null) updates.base_price = Number(base_price);
  if (unit != null) updates.unit = unit;
  if (min_order_qty != null) updates.min_order_qty = min_order_qty;
  if (max_order_qty != null) updates.max_order_qty = max_order_qty;
  if (is_active != null) updates.is_active = is_active;
  if (image_url != null) updates.image_url = image_url;
  if (disease_tags != null) updates.disease_tags = disease_tags;
  if (states_available != null) updates.states_available = states_available;

  const { data, error } = await adminSupabase
    .from('products')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Product not found.' }, { status: 404 });

  return NextResponse.json({ product: data });
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const { error } = await adminSupabase.from('products').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
