import { Router } from 'express';
import { queryOne } from '../db/client';

const router = Router();

// GET /api/tracking/:orderNumber — public order tracking (no auth needed)
router.get('/:orderNumber', async (req: any, res) => {
  const { orderNumber } = req.params;
  const s = req.siteSchema;
  if (!s) return res.status(400).json({ error: 'Site not found' });

  const order = await queryOne<any>(
    `SELECT o.order_number, o.status, o.tracking_id, o.shipping_carrier,
            o.created_at, o.dispatched_at, o.delivered_at,
            o.shipping_address, o.items
     FROM ${s}.orders o
     WHERE o.order_number = $1`,
    [orderNumber.toUpperCase()]
  );

  if (!order) return res.status(404).json({ error: 'Order not found' });

  // Build timeline
  const timeline = [
    { event: 'Order Placed', time: order.created_at, done: true },
    { event: 'Processing', time: order.created_at, done: ['processing','dispatched','out_for_delivery','delivered'].includes(order.status) },
    { event: 'Dispatched', time: order.dispatched_at, done: ['dispatched','out_for_delivery','delivered'].includes(order.status) },
    { event: 'Out for Delivery', time: null, done: ['out_for_delivery','delivered'].includes(order.status) },
    { event: 'Delivered', time: order.delivered_at, done: order.status === 'delivered' },
  ];

  res.json({
    orderNumber: order.order_number,
    status: order.status,
    trackingId: order.tracking_id,
    carrier: order.shipping_carrier,
    timeline,
    shippingAddress: order.shipping_address,
    items: order.items,
  });
});

export default router;
