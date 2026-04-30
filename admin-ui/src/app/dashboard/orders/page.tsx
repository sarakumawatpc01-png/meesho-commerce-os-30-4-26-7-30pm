'use client';
import { useEffect, useState } from 'react';
import { ordersApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { Clock, CheckCircle, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';

type SLALevel = 'normal' | 'warning' | 'critical' | 'overdue';

interface QueueOrder {
  id: string;
  orderNumber: string;
  siteName: string;
  items: any[];
  total: number;
  paymentMethod: string;
  shippingAddress: any;
  customerPhone: string;
  createdAt: string;
  slaLevel: SLALevel;
  hoursOld: number;
  meeshoUrl?: string;
}

const SLA_CONFIG: Record<SLALevel, { label: string; color: string; icon: React.ElementType }> = {
  normal:   { label: 'On Track',  color: 'badge-green',  icon: CheckCircle },
  warning:  { label: 'Warning',   color: 'badge-yellow', icon: Clock },
  critical: { label: 'Critical',  color: 'badge-red',    icon: AlertTriangle },
  overdue:  { label: 'OVERDUE',   color: 'badge-red',    icon: XCircle },
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<QueueOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [fulfilling, setFulfilling] = useState<string | null>(null);

  async function loadQueue() {
    setLoading(true);
    try {
      const { data } = await ordersApi.fulfillmentQueue();
      setOrders(data.orders || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadQueue(); }, []);

  async function handleFulfill(order: QueueOrder) {
    setFulfilling(order.id);
    try {
      await ordersApi.fulfill(order.id, '');
      toast.success(`Order ${order.orderNumber} marked as dispatched`);
      setOrders(prev => prev.filter(o => o.id !== order.id));
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to fulfill order');
    } finally {
      setFulfilling(null);
    }
  }

  const overdueCount = orders.filter(o => o.slaLevel === 'overdue').length;
  const criticalCount = orders.filter(o => o.slaLevel === 'critical').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Fulfillment Queue</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {orders.length} orders pending
            {overdueCount > 0 && <span className="text-red-500 font-medium"> · {overdueCount} overdue</span>}
            {criticalCount > 0 && <span className="text-orange-500 font-medium"> · {criticalCount} critical</span>}
          </p>
        </div>
        <button onClick={loadQueue} className="btn-secondary flex items-center gap-2">
          <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* SLA Legend */}
      <div className="flex flex-wrap gap-3">
        {(Object.entries(SLA_CONFIG) as [SLALevel, typeof SLA_CONFIG.normal][]).map(([key, cfg]) => (
          <div key={key} className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium', cfg.color)}>
            <cfg.icon className="w-3.5 h-3.5" />
            {cfg.label}: {orders.filter(o => o.slaLevel === key).length}
          </div>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="card p-12 text-center">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
          <p className="text-lg font-semibold text-slate-700 dark:text-slate-300">All caught up!</p>
          <p className="text-slate-400 text-sm">No orders pending fulfillment</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => {
            const sla = SLA_CONFIG[order.slaLevel];
            const SlaIcon = sla.icon;
            return (
              <div
                key={order.id}
                className={clsx(
                  'card p-5 border-l-4 transition-all',
                  order.slaLevel === 'overdue' && 'border-l-red-500',
                  order.slaLevel === 'critical' && 'border-l-orange-400',
                  order.slaLevel === 'warning' && 'border-l-yellow-400',
                  order.slaLevel === 'normal' && 'border-l-green-400',
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-2 mb-2">
                      <span className="font-bold text-slate-900 dark:text-white">{order.orderNumber}</span>
                      <span className="badge-gray">{order.siteName}</span>
                      <span className={clsx('badge flex items-center gap-1', sla.color)}>
                        <SlaIcon className="w-3 h-3" />
                        {sla.label} · {order.hoursOld}h ago
                      </span>
                      <span className={clsx('badge', order.paymentMethod === 'cod' ? 'badge-yellow' : 'badge-blue')}>
                        {order.paymentMethod?.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400 space-y-0.5">
                      <p>
                        <span className="font-medium">Items:</span>{' '}
                        {order.items?.map((it: any) => `${it.title} × ${it.quantity}`).join(', ')}
                      </p>
                      <p>
                        <span className="font-medium">Ship to:</span>{' '}
                        {order.shippingAddress?.address1}, {order.shippingAddress?.city}, {order.shippingAddress?.state} — {order.shippingAddress?.pincode}
                      </p>
                      <p>
                        <span className="font-medium">Phone:</span> {order.customerPhone}
                        {' '}·{' '}
                        <span className="font-medium">Total:</span> ₹{(order.total / 100).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 flex-shrink-0">
                    {order.meeshoUrl && (
                      <a
                        href={order.meeshoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary text-center text-xs"
                      >
                        Open Meesho →
                      </a>
                    )}
                    <button
                      onClick={() => handleFulfill(order)}
                      disabled={fulfilling === order.id}
                      className="btn-primary text-center"
                    >
                      {fulfilling === order.id ? 'Processing…' : '✓ Mark Dispatched'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
