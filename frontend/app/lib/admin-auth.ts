/**
 * app/lib/admin-auth.ts
 *
 * Admin JWT helpers using the `jose` library.
 * Signs and verifies admin session tokens stored in httpOnly cookies.
 * SERVER-SIDE ONLY — do not import in client components.
 */

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'wafri_admin_session';
const JWT_EXPIRY = '8h';

function getSecret(): Uint8Array {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('ADMIN_JWT_SECRET must be set and at least 32 characters');
  }
  return new TextEncoder().encode(secret);
}

export interface AdminPayload {
  adminId: string;
  email: string;
  name: string;
  role: string;
}

export async function signAdminToken(payload: AdminPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRY)
    .sign(getSecret());
}

export async function verifyAdminToken(token: string): Promise<AdminPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as AdminPayload;
  } catch {
    return null;
  }
}

export async function getAdminSession(): Promise<AdminPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyAdminToken(token);
}

export function setAdminCookie(response: NextResponse, token: string): void {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 8, // 8 hours
    path: '/',
  });
}

export function clearAdminCookie(response: NextResponse): void {
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
}

/** Middleware helper: verify admin JWT from request cookie. */
export async function requireAdmin(req: NextRequest): Promise<AdminPayload | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyAdminToken(token);
}
