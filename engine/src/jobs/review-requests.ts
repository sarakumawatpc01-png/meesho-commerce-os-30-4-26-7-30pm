import { query, queryOne } from '../db/client';
import { sendReviewRequest, sendReengagementMessage } from '../services/notifications/whatsapp';
import { getAllActiveSites } from './scheduler';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export async function runReviewRequests(): Promise<void> {
  const sites = await getAllActiveSites();
  for (const site of sites) {
    const s = site.schema_name;
    const siteRecord = await queryOne<any>(`SELECT * FROM engine.sites WHERE id = $1`, [site.id]);
    if (!siteRecord) continue;

    // Orders delivered 7 days ago, review not yet requested
    const orders = await query(
      `SELECT o.id, o.order_number, o.items, c.phone, c.name
       FROM ${s}.orders o
       LEFT JOIN engine.customers c ON c.id = o.customer_id
       WHERE o.status = 'delivered'
         AND o.review_requested = false
         AND o.delivered_at < NOW() - INTERVAL '7 days'
         AND o.delivered_at > NOW() - INTERVAL '10 days'
         AND c.phone IS NOT NULL
       LIMIT 50`
    );

    for (const order of orders) {
      try {
        await sendReviewRequest(order, { phone: order.phone, name: order.name }, siteRecord);
        await query(`UPDATE ${s}.orders SET review_requested = true WHERE id = $1`, [order.id]);
        await new Promise(r => setTimeout(r, 1000));
      } catch (err: any) {
        logger.error('[review-requests] Failed', { orderId: order.id });
      }
    }
    logger.info(`[review-requests] Sent ${orders.length} review requests for ${site.name}`);
  }
}

export async function runReengagement(): Promise<void> {
  const sites = await getAllActiveSites();
  for (const site of sites) {
    const s = site.schema_name;
    const siteRecord = await queryOne<any>(`SELECT * FROM engine.sites WHERE id = $1`, [site.id]);
    if (!siteRecord) continue;

    // Customers who last ordered 30 days ago
    const customers = await query(
      `SELECT DISTINCT c.id, c.phone, c.name
       FROM engine.customers c
       INNER JOIN ${s}.orders o ON o.customer_id = c.id
       WHERE c.phone IS NOT NULL
         AND o.created_at < NOW() - INTERVAL '30 days'
         AND o.created_at > NOW() - INTERVAL '35 days'
         AND NOT EXISTS (
           SELECT 1 FROM ${s}.orders o2 WHERE o2.customer_id = c.id AND o2.created_at > NOW() - INTERVAL '30 days'
         )
       LIMIT 50`
    );

    for (const customer of customers) {
      try {
        // Create a 10% off coupon for this customer
        const code = `COME${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
        await query(
          `INSERT INTO ${s}.coupons (code, discount_type, discount_value, usage_limit, valid_until)
           VALUES ($1, 'percent', 10, 1, NOW() + INTERVAL '48 hours')`,
          [code]
        ).catch(() => {});

        await sendReengagementMessage(customer.phone, code, siteRecord);
        await new Promise(r => setTimeout(r, 1500));
      } catch (err) {
        logger.error('[reengagement] Failed', { customerId: customer.id });
      }
    }
    logger.info(`[reengagement] Sent ${customers.length} reengagement messages for ${site.name}`);
  }
}
