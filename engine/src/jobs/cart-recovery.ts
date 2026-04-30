import { query, queryOne } from '../db/client';
import { sendCartRecovery } from '../services/notifications/whatsapp';
import { getAllActiveSites } from './scheduler';
import { logger } from '../utils/logger';

export async function runCartRecovery(): Promise<void> {
  const sites = await getAllActiveSites();

  for (const site of sites) {
    const s = site.schema_name;
    const siteRecord = await queryOne<any>(`SELECT * FROM engine.sites WHERE id = $1`, [site.id]);
    if (!siteRecord) continue;

    // Find carts abandoned 1 hour ago (not already recovered or recovery sent)
    const abandonedCarts = await query(
      `SELECT c.*, cu.phone, cu.name
       FROM ${s}.carts c
       LEFT JOIN engine.customers cu ON cu.id = c.customer_id
       LEFT JOIN ${s}.abandoned_carts ac ON ac.cart_id = c.id
       WHERE c.updated_at < NOW() - INTERVAL '1 hour'
         AND c.updated_at > NOW() - INTERVAL '24 hours'
         AND jsonb_array_length(c.items) > 0
         AND (ac.id IS NULL OR ac.recovery_sent = false)
         AND cu.phone IS NOT NULL
       LIMIT 50`
    );

    for (const cart of abandonedCarts) {
      try {
        if (!cart.phone) continue;

        // Get first product details
        const firstItem = cart.items?.[0];
        if (!firstItem) continue;

        const product = await queryOne(
          `SELECT id, title, selling_price, slug FROM ${s}.products WHERE id = $1`,
          [firstItem.productId]
        );
        if (!product) continue;

        const cartUrl = `https://${site.domain}/cart`;
        await sendCartRecovery(cart.phone, product, cartUrl, siteRecord);

        // Log
        await query(
          `INSERT INTO ${s}.abandoned_carts (cart_id, customer_id, phone, recovery_sent, recovery_sent_at)
           VALUES ($1, $2, $3, true, NOW())
           ON CONFLICT (cart_id) DO UPDATE SET recovery_sent = true, recovery_sent_at = NOW()`,
          [cart.id, cart.customer_id || null, cart.phone]
        ).catch(() => {});

        await new Promise(r => setTimeout(r, 1000));
      } catch (err: any) {
        logger.error('[cart-recovery] Failed', { cartId: cart.id, error: err.message });
      }
    }

    logger.info(`[cart-recovery] Sent ${abandonedCarts.length} recovery messages for ${site.name}`);
  }
}
