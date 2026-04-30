'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Stats {
  todayOrders: number;
  todayRevenue: number;
  pendingFulfillment: number;
  totalProducts: number;
}

export default function SiteAdminDashboard() {
  const router = useRouter();
  const [admin, setAdmin] = useState<any>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('site_admin_token');
    const info = localStorage.getItem('site_admin_info');
    if (!token || !info) { router.replace('/admin/login'); return; }
    setAdmin(JSON.parse(info));

    async function load() {
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const [statsRes, ordersRes] = await Promise.all([
          fetch('/admin/api/analytics/quick-stats', { headers }),
          fetch('/admin/api/orders?limit=10&status=pending_fulfillment', { headers }),
        ]);
        if (statsRes.ok) setStats(await statsRes.json());
        if (ordersRes.ok) { const d = await ordersRes.json(); setOrders(d.orders || []); }
      } catch {}
      setLoading(false);
    }
    load();
  }, [router]);

  function logout() {
    localStorage.removeItem('site_admin_token');
    localStorage.removeItem('site_admin_refresh');
    localStorage.removeItem('site_admin_info');
    router.replace('/admin/login');
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const statusColor: Record<string, string> = {
    pending_fulfillment: 'bg-amber-100 text-amber-800',
    placed_on_meesho:    'bg-blue-100 text-blue-800',
    dispatched:          'bg-indigo-100 text-indigo-800',
    delivered:           'bg-green-100 text-green-800',
    cancelled:           'bg-red-100 text-red-800',
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm leading-none">{admin?.name}</p>
            <p className="text-xs text-gray-500">Store Admin</p>
          </div>
        </div>
        <nav className="hidden md:flex items-center gap-1 text-sm">
          {[
            { label: 'Dashboard', href: '/admin/dashboard' },
            { label: 'Orders',    href: '/admin/orders' },
            { label: 'Products',  href: '/admin/products' },
            { label: 'Customers', href: '/admin/customers' },
            { label: 'Settings',  href: '/admin/settings' },
          ].map(link => (
            <a key={link.href} href={link.href}
               className="px-3 py-1.5 rounded-lg hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors">
              {link.label}
            </a>
          ))}
        </nav>
        <button onClick={logout}
          className="text-sm text-gray-500 hover:text-red-600 transition-colors">
          Sign out
        </button>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Today's Orders",      value: stats?.todayOrders ?? '—',           color: 'text-violet-600' },
            { label: "Today's Revenue",     value: stats?.todayRevenue ? `₹${stats.todayRevenue.toLocaleString()}` : '—', color: 'text-green-600' },
            { label: 'Pending Fulfillment', value: stats?.pendingFulfillment ?? '—',     color: 'text-amber-600' },
            { label: 'Total Products',      value: stats?.totalProducts ?? '—',          color: 'text-blue-600' },
          ].map(card => (
            <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{card.label}</p>
              <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* Pending Orders */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Pending Fulfillment</h2>
            <a href="/admin/orders" className="text-sm text-violet-600 hover:underline">View all</a>
          </div>
          {orders.length === 0 ? (
            <div className="px-6 py-12 text-center text-gray-500">
              <p className="text-3xl mb-2">🎉</p>
              <p>All orders fulfilled!</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {orders.map((order: any) => (
                <div key={order.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                  <div>
                    <p className="font-medium text-sm text-gray-900">{order.order_number}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(order.created_at).toLocaleDateString('en-IN')} · ₹{order.total?.toLocaleString()}
                    </p>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusColor[order.status] || 'bg-gray-100 text-gray-700'}`}>
                    {order.status.replace(/_/g, ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
