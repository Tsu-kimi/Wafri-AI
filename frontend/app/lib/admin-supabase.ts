/**
 * app/lib/admin-supabase.ts
 *
 * Supabase client for admin panel operations.
 * Uses the service role key — ONLY call from Next.js API routes (server-side).
 * NEVER import this in client components.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}

export const adminSupabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});
