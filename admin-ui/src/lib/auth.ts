import Cookies from 'js-cookie';
import { authApi } from './api';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'site_admin' | 'employee';
  siteSlug?: string;
}

export function getStoredUser(): AdminUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('admin_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: AdminUser) {
  localStorage.setItem('admin_user', JSON.stringify(user));
}

export function clearAuth() {
  Cookies.remove('admin_token');
  Cookies.remove('admin_refresh');
  localStorage.removeItem('admin_user');
}

export async function logout() {
  try { await authApi.logout(); } catch {}
  clearAuth();
  window.location.href = '/login';
}

export function isAuthenticated(): boolean {
  return !!Cookies.get('admin_token');
}
