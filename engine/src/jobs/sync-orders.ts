/**
 * Order Status Sync — runs every 2 hours
 * Polls Meesho tracking for dispatched orders
 */

import axios from 'axios';
import { query } from '../db/client';
import { sendDispatchAlert, sendDeliveryConfirmation } from '../services/notifications/whatsapp';
import { getAllActiveSites } from './scheduler';
import { logger } from '../utils/logger';

export async function syncOrderStatuses(): Promise<void> {
  const sites = await getAllActiveSites();

  for (const site of sites) {
    const s = site.schema_name;

    const orders = await query(
      `SELECT o.*, c.phone as customer_phone, c.name as customer_name
       FROM ${s}.orders o
       LEFT JOIN engine.customers c ON c.id = o.customer_id
       WHERE o.status IN ('placed_on_meesho', 'dispatched', 'out_for_delivery')
         AND o.meesho_tracking_id IS NOT NULL
       LIMIT 100`
    );

    for (const order of orders) {
      try {
        const trackingStatus = await fetchMeeshoTracking(order.meesho_tracking_id);

        if (!trackingStatus) continue;

        const oldStatus = order.status;
        let newStatus = order.status;

        if (trackingStatus.includes('out_for_delivery') || trackingStatus.includes('out for delivery')) {
          newStatus = 'out_for_delivery';
        } else if (trackingStatus.includes('delivered')) {
          newStatus = 'delivered';
        }

        if (newStatus !== oldStatus) {
          await query(
            `UPDATE ${s}.orders SET status = $1, updated_at = NOW()
             ${newStatus === 'delivered' ? ', delivered_at = NOW()' : ''}
             WHERE id = $2`,
            [newStatus, order.id]
          );

          logger.info(`[order-sync] Order ${order.order_number} status: ${oldStatus} → ${newStatus}`);

          // Notify customer
          const customer = { phone: order.customer_phone, name: order.customer_name };
          const siteRecord = await require('../db/client').queryOne(`SELECT * FROM engine.sites WHERE id = $1`, [site.id]);

          if (newStatus === 'delivered') {
            sendDeliveryConfirmation(order, customer, siteRecord).catch(() => {});
            // Mark for review request (7 days later)
            await query(`UPDATE ${s}.orders SET review_requested = false WHERE id = $1`, [order.id]);
          }
        }
      } catch (err: any) {
        logger.error(`[order-sync] Failed for order ${order.id}`, { error: err.message });
      }

      await new Promise(r => setTimeout(r, 500));
    }
  }
}

async function fetchMeeshoTracking(trackingId: string): Promise<string | null> {
  try {
    // This is a simplified implementation
    // In production, you'd scrape Meesho's tracking page or use their API
    const response = await axios.get(
      `https://meesho.com/track?id=${trackingId}`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 Chrome/90.0' },
        timeout: 10000,
      }
    );
    const html = response.data.toLowerCase();
    if (html.includes('delivered')) return 'delivered';
    if (html.includes('out for delivery') || html.includes('out_for_delivery')) return 'out_for_delivery';
    if (html.includes('dispatched') || html.includes('shipped')) return 'dispatched';
    return null;
  } catch {
    return null;
  }
}
