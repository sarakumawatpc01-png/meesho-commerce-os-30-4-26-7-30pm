/**
 * Admin Orders API
 * Fulfillment queue, order management, SLA alerts
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/client';
import { requireAdmin, requireEmployee, requireSiteAccess } from '../middleware/auth';
import { createError } from '../middleware/error-handler';
import { sendDispatchAlert } from '../services/notifications/whatsapp';
import { processRefund } from '../services/payments/refunds';
import { auditLog } from '../services/audit';
import dayjs from 'dayjs';

const router = Router();
router.use(requireAdmin);

// GET /admin/api/orders — list orders with filters
router.get('/', requireSiteAccess, async (req: Request, res: Response) => {
  const { siteId, status, page, limit, paymentMethod, dateFrom, dateTo } = z.object({
    siteId:        z.string().uuid().optional(),
    status:        z.string().optional(),
    page:          z.coerce.number().default(1),
    limit:         z.coerce.number().default(25),
    paymentMethod: z.string().optional(),
    dateFrom:      z.string().optional(),
    dateTo:        z.string().optional(),
  }).parse(req.query);

  // Determine which sites to query
  const sitesToQuery = await resolveSites(req, siteId);
  const allOrders = [];

  for (const site of sitesToQuery) {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
    if (paymentMethod) { conditions.push(`payment_method = $${idx++}`); params.push(paymentMethod); }
    if (dateFrom) { conditions.push(`created_at >= $${idx++}`); params.push(dateFrom); }
    if (dateTo) { conditions.push(`created_at <= $${idx++}`); params.push(dateTo + ' 23:59:59'); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const orders = await query(
      `SELECT o.*, c.name as customer_name, c.phone as customer_phone
       FROM ${site.schema}.orders o
       LEFT JOIN engine.customers c ON c.id = o.customer_id
       ${where}
       ORDER BY o.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, (page - 1) * limit]
    );
    allOrders.push(...orders.map(o => ({ ...o, siteName: site.name, siteSlug: site.slug })));
  }

  // Sort all orders by created_at desc
  allOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  res.json({ orders: allOrders.slice(0, limit), page, limit });
});

// GET /admin/api/orders/fulfillment-queue — pending orders sorted oldest first
router.get('/fulfillment-queue', requireEmployee, async (req: Request, res: Response) => {
  const sitesToQuery = await resolveSites(req);
  const queue = [];

  for (const site of sitesToQuery) {
    const orders = await query(
      `SELECT o.id, o.order_number, o.items, o.shipping_address, o.total, o.payment_method,
              o.created_at, o.cod_risk_score, o.cod_risk_flags,
              c.name as customer_name, c.phone as customer_phone
       FROM ${site.schema}.orders o
       LEFT JOIN engine.customers c ON c.id = o.customer_id
       WHERE o.status = 'pending_fulfillment'
         AND (o.payment_method = 'cod' OR o.payment_status = 'paid')
       ORDER BY o.created_at ASC`
    );

    // Add SLA status
    const now = dayjs();
    queue.push(...orders.map(o => {
      const hoursSince = now.diff(dayjs(o.created_at), 'hour');
      let sla: 'normal' | 'warning' | 'critical' | 'overdue' = 'normal';
      if (hoursSince >= 8) sla = 'overdue';
      else if (hoursSince >= 4) sla = 'critical';
      else if (hoursSince >= 2) sla = 'warning';
      return { ...o, siteName: site.name, siteSlug: site.slug, hoursSince, sla };
    }));
  }

  queue.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  res.json(queue);
});

// POST /admin/api/orders/:orderId/fulfill — mark as placed on Meesho
router.post('/:orderId/fulfill', requireEmployee, async (req: Request, res: Response) => {
  const { meeshoOrderId, meeshoTrackingId, meeshoAccountId, siteSlug } = z.object({
    meeshoOrderId:   z.string(),
    meeshoTrackingId: z.string(),
    meeshoAccountId: z.string().uuid().optional(),
    siteSlug:        z.string(),
  }).parse(req.body);

  const site = await queryOne<any>(`SELECT * FROM engine.sites WHERE slug = $1`, [siteSlug]);
  if (!site) throw createError(404, 'Site not found');
  const s = site.schema_name;

  const order = await queryOne(`SELECT * FROM ${s}.orders WHERE id = $1`, [req.params.orderId]);
  if (!order) throw createError(404, 'Order not found');

  // Calculate estimated delivery
  const estimatedDelivery = dayjs().add(5, 'day').format('DD MMM YYYY');
  const trackingUrl = `https://meesho.com/track?id=${meeshoTrackingId}`;

  await query(
    `UPDATE ${s}.orders SET
       status = 'dispatched', meesho_order_id = $1, meesho_tracking_id = $2,
       meesho_account_id = $3, tracking_url = $4, estimated_delivery_date = $5,
       dispatched_at = NOW(), fulfilled_at = NOW(), updated_at = NOW()
     WHERE id = $6`,
    [meeshoOrderId, meeshoTrackingId, meeshoAccountId || null, trackingUrl, estimatedDelivery, order.id]
  );

  // Update Meesho account order count
  if (meeshoAccountId) {
    await query(
      `UPDATE engine.meesho_accounts SET order_count_today = order_count_today + 1, total_orders = total_orders + 1, last_used_at = NOW() WHERE id = $1`,
      [meeshoAccountId]
    ).catch(() => {});
  }

  // Send dispatch WhatsApp
  const customer = await queryOne(`SELECT * FROM engine.customers WHERE id = $1`, [order.customer_id]);
  sendDispatchAlert({ ...order, meesho_tracking_id: meeshoTrackingId, tracking_url: trackingUrl, estimated_delivery_date: estimatedDelivery }, customer, site).catch(() => {});

  auditLog({ actorId: req.user!.sub, actorType: 'admin', action: 'order.fulfilled', siteId: site.id, resourceId: order.id, details: { meeshoOrderId, meeshoTrackingId } });

  res.json({ message: 'Order marked as dispatched. Customer notified via WhatsApp.' });
});

// POST /admin/api/orders/:orderId/refund — issue refund
router.post('/:orderId/refund', requireSiteAccess, async (req: Request, res: Response) => {
  const { siteSlug } = z.object({ siteSlug: z.string() }).parse(req.body);
  const site = await queryOne<any>(`SELECT * FROM engine.sites WHERE slug = $1`, [siteSlug]);
  if (!site) throw createError(404, 'Site not found');

  await processRefund(req.params.orderId, site.id, site.schema_name);

  auditLog({ actorId: req.user!.sub, actorType: 'admin', action: 'order.refund_initiated', siteId: site.id, resourceId: req.params.orderId });
  res.json({ message: 'Refund initiated' });
});

// Helper: resolve sites list based on admin role
async function resolveSites(req: Request, siteId?: string) {
  if (req.user!.role === 'super_admin') {
    if (siteId) {
      const site = await queryOne<any>(`SELECT id, slug, name, schema_name FROM engine.sites WHERE id = $1`, [siteId]);
      return site ? [{ id: site.id, slug: site.slug, name: site.name, schema: site.schema_name }] : [];
    }
    const sites = await query(`SELECT id, slug, name, schema_name FROM engine.sites WHERE status = 'active'`);
    return sites.map((s: any) => ({ id: s.id, slug: s.slug, name: s.name, schema: s.schema_name }));
  } else {
    const site = await queryOne<any>(`SELECT id, slug, name, schema_name FROM engine.sites WHERE id = $1`, [req.user!.siteId]);
    return site ? [{ id: site.id, slug: site.slug, name: site.name, schema: site.schema_name }] : [];
  }
}

export default router;
