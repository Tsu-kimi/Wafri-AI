'use client';

import { createContext, useContext } from 'react';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export const AdminCtx = createContext<{
  admin: AdminUser | null;
  logout: () => Promise<void>;
} | null>(null);

export function useAdmin() {
  const ctx = useContext(AdminCtx);
  if (!ctx) throw new Error('useAdmin must be used inside AdminLayout');
  return ctx;
}
