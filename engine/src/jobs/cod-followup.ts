import { query, queryOne } from '../db/client';
import { sendWhatsAppMessage } from '../services/notifications/whatsapp';
import { getAllActiveSites } from './scheduler';
import { logger } from '../utils/logger';

export async function runCodFollowUp(): Promise<void> {
  const sites = await getAllActiveSites();

  for (const site of sites) {
    const s = site.schema_name;
    const siteRecord = await queryOne<any>(`SELECT * FROM engine.sites WHERE id = $1`, [site.id]);
    if (!siteRecord) continue;

    // COD orders unconfirmed for 48+ hours
    const staleOrders = await query(
      `SELECT o.id, o.order_number, o.total, o.shipping_address, o.created_at, c.phone
       FROM ${s}.orders o
       LEFT JOIN engine.customers c ON c.id = o.customer_id
       WHERE o.payment_method = 'cod'
         AND o.status = 'pending_fulfillment'
         AND o.created_at < NOW() - INTERVAL '48 hours'
         AND o.created_at > NOW() - INTERVAL '72 hours'
       LIMIT 20`
    );

    for (const order of staleOrders) {
      const phone = order.phone || order.shipping_address?.phone;
      if (!phone) continue;

      try {
        const prefix = siteRecord.whatsapp_prefix || `[${siteRecord.name}]`;
        const msg = `${prefix} Hi! Your order ${order.order_number} for ₹${order.total} is ready to ship.\n\nPlease confirm your delivery address:\n${order.shipping_address?.address1}, ${order.shipping_address?.city}\n\nReply *CONFIRM* to proceed or *CANCEL* to cancel.`;

        await sendWhatsAppMessage(`91${phone}`, msg);
        logger.info(`[cod-followup] Sent follow-up for order ${order.order_number}`);
      } catch (err: any) {
        logger.error('[cod-followup] Failed', { orderId: order.id, error: err.message });
      }
    }
  }
}
