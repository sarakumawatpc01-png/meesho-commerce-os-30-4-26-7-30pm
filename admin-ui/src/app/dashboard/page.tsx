'use client';
import { useEffect, useState } from 'react';
import { dashboardApi } from '@/lib/api';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { TrendingUp, ShoppingCart, Users, Package, Clock, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';

interface Stats {
  totalRevenue: number;
  revenueChange: number;
  totalOrders: number;
  ordersChange: number;
  newCustomers: number;
  customersChange: number;
  pendingFulfillment: number;
  overdueOrders: number;
  avgOrderValue: number;
  topSite: string;
}

interface ChartPoint { date: string; revenue: number; orders: number; }

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      dashboardApi.stats(),
      dashboardApi.revenueChart(undefined, 14),
      dashboardApi.topProducts(),
    ]).then(([s, c, p]) => {
      setStats(s.data);
      setChart(c.data.chart || []);
      setTopProducts(p.data.products || []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="animate-pulse space-y-4">{[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-slate-200 dark:bg-slate-700 rounded-xl" />)}</div>;

  const statCards = [
    { label: 'Total Revenue', value: `₹${((stats?.totalRevenue || 0) / 100).toLocaleString('en-IN')}`, change: stats?.revenueChange || 0, icon: TrendingUp, color: 'text-green-600 bg-green-100' },
    { label: 'Total Orders', value: (stats?.totalOrders || 0).toLocaleString(), change: stats?.ordersChange || 0, icon: ShoppingCart, color: 'text-blue-600 bg-blue-100' },
    { label: 'New Customers', value: (stats?.newCustomers || 0).toLocaleString(), change: stats?.customersChange || 0, icon: Users, color: 'text-purple-600 bg-purple-100' },
    { label: 'Avg Order Value', value: `₹${((stats?.avgOrderValue || 0) / 100).toFixed(0)}`, icon: Package, color: 'text-orange-600 bg-orange-100' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">Welcome back — here&apos;s what&apos;s happening across your stores</p>
        </div>
        <div className="flex gap-2">
          {(stats?.overdueOrders || 0) > 0 && (
            <a href="/dashboard/orders" className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors">
              <AlertCircle className="w-4 h-4" />
              {stats?.overdueOrders} Overdue Orders
            </a>
          )}
          {(stats?.pendingFulfillment || 0) > 0 && (
            <a href="/dashboard/orders" className="flex items-center gap-2 px-4 py-2 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-lg text-sm font-medium hover:bg-yellow-100 transition-colors">
              <Clock className="w-4 h-4" />
              {stats?.pendingFulfillment} Pending Fulfillment
            </a>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map(card => {
          const Icon = card.icon;
          const positive = (card.change || 0) >= 0;
          return (
            <div key={card.label} className="stat-card">
              <div className={clsx('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0', card.color)}>
                <Icon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{card.value}</p>
                <p className="text-sm text-slate-500">{card.label}</p>
                {card.change !== undefined && (
                  <p className={clsx('text-xs font-medium mt-0.5', positive ? 'text-green-600' : 'text-red-500')}>
                    {positive ? '↑' : '↓'} {Math.abs(card.change)}% vs last week
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Revenue Chart */}
      <div className="card p-5">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">Revenue & Orders (14 days)</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chart}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v/100).toFixed(0)}`} />
              <Tooltip formatter={(v: any) => [`₹${(v/100).toFixed(2)}`, 'Revenue']} />
              <Area type="monotone" dataKey="revenue" stroke="#ec4899" fill="url(#rev)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Products */}
        <div className="card p-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">Top Products This Week</h2>
          <div className="space-y-3">
            {topProducts.slice(0, 5).map((p, i) => (
              <div key={p.id} className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-400 w-5">#{i + 1}</span>
                <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 overflow-hidden flex-shrink-0">
                  {p.image && <img src={p.image} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{p.title}</p>
                  <p className="text-xs text-slate-400">{p.orders} orders · ₹{(p.revenue / 100).toLocaleString('en-IN')}</p>
                </div>
              </div>
            ))}
            {topProducts.length === 0 && <p className="text-slate-400 text-sm">No data yet</p>}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card p-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Import Product', href: '/dashboard/products?import=1', emoji: '📦' },
              { label: 'Fulfillment Queue', href: '/dashboard/orders?tab=queue', emoji: '🚚' },
              { label: 'Run SEO Audit', href: '/dashboard/seo', emoji: '🔍' },
              { label: 'Generate Blog', href: '/dashboard/seo?tab=blog', emoji: '✍️' },
              { label: 'AI Assistant', href: '/dashboard/ai', emoji: '🤖' },
              { label: 'Create Coupon', href: '/dashboard/marketing?tab=coupons', emoji: '🎟️' },
            ].map(action => (
              <a
                key={action.label}
                href={action.href}
                className="flex items-center gap-2 p-3 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                <span>{action.emoji}</span>
                {action.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
