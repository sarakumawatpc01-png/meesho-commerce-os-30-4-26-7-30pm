'use client';
import { useEffect, useState } from 'react';
import { marketingApi, sitesApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Plus, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';

const TABS = ['Coupons', 'Ad Copy'];

export default function MarketingPage() {
  const [tab, setTab] = useState('Coupons');
  const [sites, setSites] = useState<any[]>([]);
  const [siteSlug, setSiteSlug] = useState('');
  const [coupons, setCoupons] = useState<any[]>([]);
  const [adCopy, setAdCopy] = useState<any[]>([]);
  const [showAddCoupon, setShowAddCoupon] = useState(false);
  const [couponForm, setCouponForm] = useState({
    code: '', discountType: 'percent', discountValue: '', usageLimit: '', validDays: '7'
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    sitesApi.list().then(({ data }) => {
      const list = data.sites || [];
      setSites(list);
      if (list.length > 0) setSiteSlug(list[0].slug);
    });
  }, []);

  useEffect(() => {
    if (!siteSlug) return;
    if (tab === 'Coupons') marketingApi.coupons(siteSlug).then(({ data }) => setCoupons(data.coupons || []));
    if (tab === 'Ad Copy') marketingApi.adCopy(siteSlug).then(({ data }) => setAdCopy(data.ads || []));
  }, [siteSlug, tab]);

  async function handleAddCoupon() {
    setSaving(true);
    try {
      await marketingApi.createCoupon(siteSlug, {
        ...couponForm,
        discountValue: parseFloat(couponForm.discountValue),
        usageLimit: couponForm.usageLimit ? parseInt(couponForm.usageLimit) : null,
        validUntil: new Date(Date.now() + parseInt(couponForm.validDays) * 86400000).toISOString(),
      });
      toast.success('Coupon created!');
      setShowAddCoupon(false);
      const { data } = await marketingApi.coupons(siteSlug);
      setCoupons(data.coupons || []);
    } catch { toast.error('Failed to create coupon'); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Marketing</h1>
        <select value={siteSlug} onChange={e => setSiteSlug(e.target.value)} className="input w-48">
          {sites.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
        </select>
      </div>

      <div className="border-b border-slate-200 dark:border-slate-700 flex gap-0">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Coupons' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowAddCoupon(true)} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create Coupon
            </button>
          </div>

          {showAddCoupon && (
            <div className="card p-5 space-y-4">
              <h3 className="font-semibold">New Coupon</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="label">Code</label>
                  <input className="input uppercase" placeholder="DIWALI20" value={couponForm.code}
                    onChange={e => setCouponForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
                </div>
                <div>
                  <label className="label">Discount Type</label>
                  <select className="input" value={couponForm.discountType}
                    onChange={e => setCouponForm(f => ({ ...f, discountType: e.target.value }))}>
                    <option value="percent">Percentage (%)</option>
                    <option value="flat">Flat (₹)</option>
                  </select>
                </div>
                <div>
                  <label className="label">Value</label>
                  <input className="input" type="number" placeholder={couponForm.discountType === 'percent' ? '10' : '50'}
                    value={couponForm.discountValue}
                    onChange={e => setCouponForm(f => ({ ...f, discountValue: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Usage Limit</label>
                  <input className="input" type="number" placeholder="100 (leave blank for unlimited)"
                    value={couponForm.usageLimit}
                    onChange={e => setCouponForm(f => ({ ...f, usageLimit: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Valid For (days)</label>
                  <input className="input" type="number" placeholder="7" value={couponForm.validDays}
                    onChange={e => setCouponForm(f => ({ ...f, validDays: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={handleAddCoupon} disabled={saving} className="btn-primary">
                  {saving ? 'Creating…' : 'Create Coupon'}
                </button>
                <button onClick={() => setShowAddCoupon(false)} className="btn-secondary">Cancel</button>
              </div>
            </div>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Code</th><th>Discount</th><th>Used / Limit</th><th>Expires</th><th>Status</th></tr>
              </thead>
              <tbody>
                {coupons.length === 0 ? (
                  <tr><td colSpan={5} className="text-center text-slate-400 py-8">No coupons yet</td></tr>
                ) : coupons.map((c: any) => {
                  const expired = new Date(c.validUntil) < new Date();
                  const exhausted = c.usageLimit && c.usedCount >= c.usageLimit;
                  return (
                    <tr key={c.id}>
                      <td className="font-mono font-bold text-brand-600">{c.code}</td>
                      <td>{c.discountType === 'percent' ? `${c.discountValue}%` : `₹${c.discountValue}`}</td>
                      <td>{c.usedCount || 0} / {c.usageLimit || '∞'}</td>
                      <td className="text-xs">{new Date(c.validUntil).toLocaleDateString('en-IN')}</td>
                      <td>
                        <span className={clsx('badge', expired || exhausted ? 'badge-gray' : 'badge-green')}>
                          {expired ? 'Expired' : exhausted ? 'Exhausted' : 'Active'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'Ad Copy' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">AI-generated Google Ads and Meta Ads copy for your products. Refreshed every Tuesday.</p>
          {adCopy.length === 0 ? (
            <div className="card p-10 text-center text-slate-400">
              <Sparkles className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              <p>No ad copy generated yet. The AI generates new copy every Tuesday automatically.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {adCopy.map((ad: any, i) => (
                <div key={i} className="card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-semibold text-sm">{ad.productTitle}</span>
                    <span className="badge badge-blue">{ad.platform}</span>
                  </div>
                  <div className="space-y-2">
                    {ad.headlines?.map((h: string, j: number) => (
                      <div key={j} className="flex items-start gap-2">
                        <span className="text-xs text-slate-400 mt-0.5 w-16 flex-shrink-0">H{j + 1}</span>
                        <p className="text-sm">{h}</p>
                      </div>
                    ))}
                    {ad.descriptions?.map((d: string, j: number) => (
                      <div key={j} className="flex items-start gap-2">
                        <span className="text-xs text-slate-400 mt-0.5 w-16 flex-shrink-0">Desc {j + 1}</span>
                        <p className="text-sm text-slate-600 dark:text-slate-400">{d}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
