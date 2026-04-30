import axios from 'axios';
import { load } from 'cheerio';
import { query } from '../db/client';
import { sendWhatsAppMessage } from '../services/notifications/whatsapp';
import { getAllActiveSites } from './scheduler';
import { logger } from '../utils/logger';

export async function runTrendScout(): Promise<void> {
  try {
    // Scrape Meesho trending kurtis
    const trendingProducts = await fetchTrendingFromMeesho();

    if (trendingProducts.length === 0) {
      logger.info('[trend-scout] No trending products found');
      return;
    }

    // Notify super admin via WhatsApp
    const superAdminPhone = process.env.WHATSAPP_NUMBER;
    if (superAdminPhone) {
      const productList = trendingProducts.slice(0, 5).map((p, i) =>
        `${i + 1}. ${p.title} — ₹${p.price}`
      ).join('\n');

      const message = `🔥 *Trending Kurtis on Meesho Today*\n\n${productList}\n\nImport them to your stores from Admin → Products → Import`;
      await sendWhatsAppMessage(superAdminPhone, message);
    }

    logger.info(`[trend-scout] Found ${trendingProducts.length} trending products`);
  } catch (err: any) {
    logger.error('[trend-scout] Failed', { error: err.message });
  }
}

async function fetchTrendingFromMeesho(): Promise<{ title: string; price: number; url: string }[]> {
  try {
    const response = await axios.get('https://meesho.com/trending-kurtis', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 Chrome/90.0.4430.91 Mobile Safari/537.36',
      },
      timeout: 15000,
    });

    const $ = load(response.data);
    const products: { title: string; price: number; url: string }[] = [];

    // Parse product cards
    $('[data-testid="product-card"], .product-list-item').each((_, el) => {
      const title = $(el).find('[data-testid="product-title"], .product-title').text().trim();
      const priceText = $(el).find('[data-testid="product-price"], .price').text().replace(/[₹,]/g, '').trim();
      const price = parseFloat(priceText) || 0;
      const url = $(el).find('a').attr('href') || '';

      if (title && price > 0) {
        products.push({ title, price, url: url.startsWith('http') ? url : `https://meesho.com${url}` });
      }
    });

    return products.slice(0, 20);
  } catch {
    return [];
  }
}
