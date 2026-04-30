'use client';
import { useEffect, useState } from 'react';
import { dashboardApi, customersApi, sitesApi } from '@/lib/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';

const RFM_COLORS: Record<string, string> = {
  Champions: '#10b981',
  Loyal: '#3b82f6',
  Potential: '#8b5cf6',
  'At-Risk': '#f59e0b',
  Lost: '#ef4444',
};

export default function AnalyticsPage() {
  const [sites, setSites] = useState<any[]>([]);
  const [siteSlug, setSiteSlug] = useState('');
  const [chart, setChart] = useState<any[]>([]);
  const [rfm, setRfm] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    sitesApi.list().then(({ data }) => {
      setSites(data.sites || []);
    });
  }, []);

  useEffect(() => {
    const slug = siteSlug || undefined;
    dashboardApi.stats(slug).then(({ data }) => setStats(data));
    dashboardApi.revenueChart(slug, days).then(({ data }) => setChart(data.chart || []));
    customersApi.rfmSegments(slug).then(({ data }) => {
      const segments = data.segments || {};
      setRfm(Object.entries(segments).map(([name, count]) => ({ name, count })));
    }).catch(() => {});
  }, [siteSlug, days]);

  const totalCustomers = rfm.reduce((s, r) => s + (r.count as number), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Analytics</h1>
        <div className="flex gap-3">
          <select value={siteSlug} onChange={e => setSiteSlug(e.target.value)} className="input w-48">
            <option value="">All Sites</option>
            {sites.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
          </select>
          <select value={days} onChange={e => setDays(+e.target.value)} className="input w-36">
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>

      {/* Summary Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Revenue', value: `₹${((stats.totalRevenue || 0) / 100).toLocaleString('en-IN')}` },
            { label: 'Orders', value: stats.totalOrders?.toLocaleString() || '0' },
            { label: 'Conversion Rate', value: `${stats.conversionRate || 0}%` },
            { label: 'Avg Order Value', value: `₹${((stats.avgOrderValue || 0) / 100).toFixed(0)}` },
          ].map(s => (
            <div key={s.label} className="card p-4 text-center">
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{s.value}</p>
              <p className="text-xs text-slate-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Revenue + Orders Bar Chart */}
      <div className="card p-5">
        <h2 className="text-base font-semibold mb-4">Revenue Over Time</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v / 100).toFixed(0)}`} />
              <Tooltip formatter={(v: any) => [`₹${(v / 100).toFixed(2)}`, 'Revenue']} />
              <Bar dataKey="revenue" fill="#ec4899" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* RFM Segments */}
      {rfm.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-5">
            <h2 className="text-base font-semibold mb-4">Customer RFM Segments</h2>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={rfm} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {rfm.map((entry, i) => (
                      <Cell key={i} fill={RFM_COLORS[entry.name] || '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any, name: any) => [v, name]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card p-5">
            <h2 className="text-base font-semibold mb-4">Segment Actions</h2>
            <div className="space-y-3">
              {rfm.map(segment => (
                <div key={segment.name} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: RFM_COLORS[segment.name] || '#94a3b8' }} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{segment.name}</span>
                      <span className="text-sm text-slate-500">{segment.count} customers ({totalCustomers > 0 ? Math.round(segment.count / totalCustomers * 100) : 0}%)</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {segment.name === 'At-Risk' && '→ Auto reengagement WhatsApp sent'}
                      {segment.name === 'Champions' && '→ Reward with exclusive early access'}
                      {segment.name === 'Lost' && '→ Win-back 15% coupon recommended'}
                      {segment.name === 'Loyal' && '→ Upsell higher-value products'}
                      {segment.name === 'Potential' && '→ Nurture with blog content'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
