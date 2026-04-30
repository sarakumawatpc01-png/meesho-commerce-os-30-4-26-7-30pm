'use client';
import { useEffect, useState } from 'react';
import { customersApi } from '@/lib/api';
import { Search } from 'lucide-react';
import { clsx } from 'clsx';

const RFM_COLOR: Record<string, string> = {
  Champions: 'badge-green',
  Loyal: 'badge-blue',
  Potential: 'badge-purple',
  'At-Risk': 'badge-yellow',
  Lost: 'badge-red',
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    customersApi.list({ search, page, limit: 25 })
      .then(({ data }) => setCustomers(data.customers || []))
      .finally(() => setLoading(false));
  }, [search, page]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Customers</h1>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search by name, phone, or email…"
          className="input pl-10"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Phone</th>
              <th>Total Orders</th>
              <th>Total Spent</th>
              <th>RFM Segment</th>
              <th>Wallet Balance</th>
              <th>Last Order</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-8 text-slate-400">Loading…</td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-slate-400">No customers found</td></tr>
            ) : customers.map((c: any) => (
              <tr key={c.id}>
                <td>
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">{c.name}</p>
                    <p className="text-xs text-slate-400">{c.email || '—'}</p>
                  </div>
                </td>
                <td className="font-mono text-sm">{c.phone}</td>
                <td className="text-center">{c.totalOrders || 0}</td>
                <td>₹{((c.totalSpent || 0) / 100).toLocaleString('en-IN')}</td>
                <td>
                  {c.rfmSegment ? (
                    <span className={clsx('badge', RFM_COLOR[c.rfmSegment] || 'badge-gray')}>
                      {c.rfmSegment}
                    </span>
                  ) : '—'}
                </td>
                <td>₹{((c.walletBalance || 0) / 100).toFixed(2)}</td>
                <td className="text-xs text-slate-400">
                  {c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString('en-IN') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{customers.length} customers shown</p>
        <div className="flex gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary">← Prev</button>
          <span className="btn-secondary cursor-default">Page {page}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={customers.length < 25} className="btn-secondary">Next →</button>
        </div>
      </div>
    </div>
  );
}
