import { redirect } from 'next/navigation';
// /admin → redirect to login or dashboard based on token
export default function AdminRoot() {
  redirect('/admin/login');
}
