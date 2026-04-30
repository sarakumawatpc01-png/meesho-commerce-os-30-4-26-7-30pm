import { query } from '../db/client';
import { generateAdCopy } from '../services/ai/optimizer';
import { getAllActiveSites } from './scheduler';
import { logger } from '../utils/logger';

export async function refreshAdCopy(): Promise<void> {
  const sites = await getAllActiveSites();

  for (const site of sites) {
    const s = site.schema_name;
    try {
      // Get top 10 products by purchases
      const products = await query(
        `SELECT id, title, selling_price, category, rating, review_count
         FROM ${s}.products WHERE status = 'active'
         ORDER BY purchases DESC LIMIT 10`
      );

      for (const product of products) {
        const copies = await generateAdCopy(product, site.name);
        logger.info(`[ads] Generated ${copies.length} ad copies for "${product.title}" on ${site.name}`);
        // In production, store these in a dedicated ads table or Meta/Google Ads API
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (err: any) {
      logger.error(`[ads] Failed for ${site.name}`, { error: err.message });
    }
  }
}
