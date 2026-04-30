import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/client';
import { requireCustomer, optionalAuth } from '../middleware/auth';
import { apiLimiter } from '../middleware/rate-limit';
import { createError } from '../middleware/error-handler';

const router = Router();

// GET /api/orders/track/:orderId — order tracking (public by order ID)
router.get('/track/:orderId', apiLimiter, optionalAuth, async (req: Request, res: Response) => {
  if (!req.site) throw createError(404, 'Site not found');
  const s = req.siteSchema!;

  const order = await queryOne(
    `SELECT id, order_number, status, items, shipping_address, total, payment_method,
            meesho_tracking_id, tracking_url, estimated_delivery_date,
            created_at, dispatched_at, delivered_at
     FROM ${s}.orders
     WHERE (id = $1 OR order_number = $1)`,
    [req.params.orderId]
  );

  if (!order) throw createError(404, 'Order not found');

  // Build timeline
  const timeline = [
    { step: 'placed', label: 'Order Placed', done: true, date: order.created_at },
    { step: 'confirmed', label: 'Confirmed', done: ['pending_fulfillment','placed_on_meesho','dispatched','out_for_delivery','delivered'].includes(order.status) },
    { step: 'dispatched', label: 'Dispatched', done: ['dispatched','out_for_delivery','delivered'].includes(order.status), date: order.dispatched_at },
    { step: 'out_for_delivery', label: 'Out for Delivery', done: ['out_for_delivery','delivered'].includes(order.status) },
    { step: 'delivered', label: 'Delivered', done: order.status === 'delivered', date: order.delivered_at },
  ];

  res.json({ ...order, timeline });
});

// GET /api/account/orders — logged-in customer orders
router.get('/account', requireCustomer, async (req: Request, res: Response) => {
  if (!req.site) throw createError(404, 'Site not found');
  const s = req.siteSchema!;

  const { page, status } = z.object({
    page: z.coerce.number().default(1),
    status: z.string().optional(),
  }).parse(req.query);

  const limit = 10;
  const offset = (page - 1) * limit;

  let whereSQL = `WHERE customer_id = $1`;
  const params: any[] = [req.user!.sub];
  if (status) { whereSQL += ` AND status = $${params.length + 1}`; params.push(status); }

  const orders = await query(
    `SELECT id, order_number, status, items, total, payment_method, payment_status,
            created_at, estimated_delivery_date, meesho_tracking_id
     FROM ${s}.orders ${whereSQL}
     ORDER BY created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  res.json(orders);
});

// POST /api/orders/:orderId/return — initiate return
router.post('/:orderId/return', requireCustomer, async (req: Request, res: Response) => {
  if (!req.site) throw createError(404, 'Site not found');
  const s = req.siteSchema!;

  const order = await queryOne(
    `SELECT * FROM ${s}.orders WHERE id = $1 AND customer_id = $2 AND status = 'delivered'`,
    [req.params.orderId, req.user!.sub]
  );
  if (!order) throw createError(404, 'Order not found or not eligible for return');

  await query(
    `UPDATE ${s}.orders SET status = 'return_requested', updated_at = NOW() WHERE id = $1`,
    [order.id]
  );

  res.json({ message: 'Return request submitted. Our team will contact you shortly.' });
});

// GET /api/orders/:orderId/invoice — generate invoice PDF
router.get('/:orderId/invoice', requireCustomer, async (req: Request, res: Response) => {
  if (!req.site) throw createError(404, 'Site not found');
  const s = req.siteSchema!;

  const order = await queryOne(
    `SELECT * FROM ${s}.orders WHERE id = $1 AND customer_id = $2`,
    [req.params.orderId, req.user!.sub]
  );
  if (!order) throw createError(404, 'Order not found');

  const { generateInvoicePDF } = await import('../services/orders/invoice');
  const pdfBuffer = await generateInvoicePDF(order, req.site);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.order_number}.pdf"`);
  res.send(pdfBuffer);
});

export default router;
