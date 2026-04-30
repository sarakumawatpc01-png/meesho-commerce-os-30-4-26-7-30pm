'use client';
import { useEffect, useState } from 'react';
import { whatsappApi, sitesApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { MessageCircle, CheckCheck, Clock, XCircle } from 'lucide-react';
import { clsx } from 'clsx';

export default function WhatsAppPage() {
  const [sites, setSites] = useState<any[]>([]);
  const [siteSlug, setSiteSlug] = useState('');
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testType, setTestType] = useState('order_confirmation');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    sitesApi.list().then(({ data }) => {
      setSites(data.sites || []);
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    whatsappApi.logs(siteSlug || undefined, { limit: 50 })
      .then(({ data }) => setLogs(data.logs || []))
      .finally(() => setLoading(false));
  }, [siteSlug]);

  async function sendTest() {
    if (!testPhone) { toast.error('Enter a phone number'); return; }
    setSending(true);
    try {
      await whatsappApi.sendTest(testPhone, testType);
      toast.success('Test message sent!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  const statusIcon = (status: string) => {
    if (status === 'sent') return <CheckCheck className="w-4 h-4 text-blue-500" />;
    if (status === 'delivered') return <CheckCheck className="w-4 h-4 text-green-500" />;
    if (status === 'failed') return <XCircle className="w-4 h-4 text-red-500" />;
    return <Clock className="w-4 h-4 text-slate-400" />;
  };

  const MESSAGE_TYPES = [
    'order_confirmation', 'dispatch_alert', 'delivery_confirmation',
    'cart_recovery', 'review_request', 'reengagement', 'cod_followup'
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <MessageCircle className="w-7 h-7 text-green-500" />
          WhatsApp
        </h1>
        <select value={siteSlug} onChange={e => setSiteSlug(e.target.value)} className="input w-48">
          <option value="">All Sites</option>
          {sites.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Sent Today', value: logs.filter(l => new Date(l.createdAt).toDateString() === new Date().toDateString()).length, color: 'text-blue-600' },
          { label: 'Delivered', value: logs.filter(l => l.status === 'delivered').length, color: 'text-green-600' },
          { label: 'Failed', value: logs.filter(l => l.status === 'failed').length, color: 'text-red-600' },
          { label: 'This Month', value: logs.length, color: 'text-purple-600' },
        ].map(s => (
          <div key={s.label} className="card p-4 text-center">
            <p className={clsx('text-2xl font-bold', s.color)}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Send Test */}
      <div className="card p-5">
        <h2 className="text-base font-semibold mb-3">Send Test Message</h2>
        <div className="flex flex-wrap gap-3">
          <input
            type="tel"
            className="input w-48"
            placeholder="91XXXXXXXXXX"
            value={testPhone}
            onChange={e => setTestPhone(e.target.value)}
          />
          <select className="input w-52" value={testType} onChange={e => setTestType(e.target.value)}>
            {MESSAGE_TYPES.map(t => (
              <option key={t} value={t}>{t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
            ))}
          </select>
          <button onClick={sendTest} disabled={sending} className="btn-primary">
            {sending ? 'Sending…' : 'Send Test'}
          </button>
        </div>
      </div>

      {/* Message Log */}
      <div>
        <h2 className="text-base font-semibold mb-3">Message Log</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Phone</th>
                <th>Type</th>
                <th>Site</th>
                <th>Message Preview</th>
                <th>Sent</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8 text-slate-400">Loading…</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-slate-400">No messages yet</td></tr>
              ) : logs.map((log: any) => (
                <tr key={log.id}>
                  <td>{statusIcon(log.status)}</td>
                  <td className="font-mono text-xs">{log.toPhone}</td>
                  <td>
                    <span className="badge badge-blue text-xs">
                      {log.messageType?.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="text-xs text-slate-400">{log.siteName || '—'}</td>
                  <td className="max-w-xs">
                    <p className="text-xs text-slate-500 truncate">{log.messageContent || '—'}</p>
                  </td>
                  <td className="text-xs text-slate-400 whitespace-nowrap">
                    {log.createdAt ? new Date(log.createdAt).toLocaleString('en-IN') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
