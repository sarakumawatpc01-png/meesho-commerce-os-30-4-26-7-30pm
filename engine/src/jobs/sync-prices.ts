/**
 * Meesho Price & Stock Sync Job — runs every 6 hours
 * Checks Meesho pages for price/stock changes
 */

import axios from 'axios';
import { query, queryOne } from '../db/client';
import { parseMeeshoHtml } from '../services/meesho/parser';
import { getAllActiveSites } from './scheduler';
import { calculateSellingPrice } from '../services/pricing';
import { logger } from '../utils/logger';
import pLimit from 'p-limit';

const limit = pLimit(3); // max 3 concurrent requests

export async function syncMeeshoPrices(): Promise<void> {
  const sites = await getAllActiveSites();

  for (const site of sites) {
    const s = site.schema_name;
    const siteRecord = await queryOne<any>(`SELECT * FROM engine.sites WHERE id = $1`, [site.id]);
    if (!siteRecord) continue;

    // Get products with meesho URLs that haven't been synced in 6+ hours
    const products = await query(
      `SELECT id, meesho_url, selling_price, sizes
       FROM ${s}.products
       WHERE meesho_url IS NOT NULL
         AND (last_synced_at IS NULL OR last_synced_at < NOW() - INTERVAL '6 hours')
         AND status = 'active'
       LIMIT 50`
    );

    logger.info(`[price-sync] Syncing ${products.length} products for ${site.name}`);

    const tasks = products.map(product => limit(async () => {
      try {
        const response = await axios.get(product.meesho_url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 Chrome/90.0.4430.91 Mobile Safari/537.36',
          },
          timeout: 15000,
        });

        const parsed = await parseMeeshoHtml(response.data, product.meesho_url);
        const newSellingPrice = calculateSellingPrice(parsed.basePrice, siteRecord);

        // Check if price or stock changed significantly
        const priceChanged = Math.abs(newSellingPrice - product.selling_price) > 10;
        const stockChanged = JSON.stringify(parsed.sizes) !== JSON.stringify(product.sizes);

        if (priceChanged || stockChanged) {
          await query(
            `UPDATE ${s}.products SET
               selling_price = $1, sizes = $2, last_synced_at = NOW(), updated_at = NOW()
             WHERE id = $3`,
            [newSellingPrice, JSON.stringify(parsed.sizes), product.id]
          );

          if (priceChanged) {
            logger.info(`[price-sync] Price changed for product ${product.id}: ${product.selling_price} → ${newSellingPrice}`);
          }
        } else {
          await query(`UPDATE ${s}.products SET last_synced_at = NOW() WHERE id = $1`, [product.id]);
        }

        // Random delay to avoid detection
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
      } catch (err: any) {
        logger.error(`[price-sync] Failed for product ${product.id}`, { error: err.message });
      }
    }));

    await Promise.all(tasks);
  }
}
