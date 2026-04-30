/**
 * AI Product Content Optimizer
 * Generates optimized titles, descriptions, and meta tags for all products
 */

import { ai } from './openrouter';
import { query } from '../../db/client';
import { logger } from '../../utils/logger';
import { SEO_SKILLS } from '../ai-skills/seo/technical-seo';

export async function optimizeProductContent(
  product: any,
  siteName: string,
  siteSchema: string
): Promise<{ title: string; description: string; metaTitle: string; metaDescription: string }> {
  const { content } = await ai.product([
    {
      role: 'system',
      content: `You are an expert Indian ethnic fashion copywriter and SEO specialist. You write for Indian women aged 22-45 shopping for kurtis online. Your writing is engaging, accurate, and SEO-optimized.

Rules:
- Never mention Meesho, Amazon, Flipkart, Myntra, or any marketplace
- Never include prices in descriptions
- Focus on: fabric, occasion, fit, style, care instructions
- Meta title: 50-60 chars, include main keyword + brand name at end
- Meta description: 150-160 chars, include CTA, no prices
- Product description: 100-150 words, engaging, feature-focused`,
    },
    {
      role: 'user',
      content: `Optimize content for this product on ${siteName}:

Product: ${product.title}
Category: ${product.category || 'Kurti'}
Current description: ${(product.description || '').substring(0, 300)}
Rating: ${product.rating || 'N/A'} (${product.review_count || 0} reviews)

Respond in JSON format:
{
  "title": "optimized product title (60-80 chars)",
  "description": "optimized description (100-150 words, no prices, no marketplace mentions)",
  "metaTitle": "SEO meta title (50-60 chars)",
  "metaDescription": "SEO meta description (150-160 chars with CTA)"
}`,
    },
  ]);

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed;
    }
  } catch (err) {
    logger.error('Failed to parse AI product optimization response', { error: err });
  }

  // Fallback
  return {
    title: product.title,
    description: product.description || '',
    metaTitle: `${product.title} | ${siteName}`,
    metaDescription: `Buy ${product.title} online. Free shipping. Easy returns. COD available.`,
  };
}

export async function bulkOptimizeProducts(siteId: string, siteSchema: string, siteName: string): Promise<{ optimized: number; errors: number }> {
  const products = await query(
    `SELECT id, title, description, category, rating, review_count
     FROM ${siteSchema}.products
     WHERE status = 'active' AND (meta_title IS NULL OR meta_description IS NULL)
     ORDER BY purchases DESC
     LIMIT 50`
  );

  let optimized = 0;
  let errors = 0;

  for (const product of products) {
    try {
      const optimized_content = await optimizeProductContent(product, siteName, siteSchema);

      await query(
        `UPDATE ${siteSchema}.products SET
           title = $1, description = $2, meta_title = $3, meta_description = $4, updated_at = NOW()
         WHERE id = $5`,
        [optimized_content.title, optimized_content.description, optimized_content.metaTitle, optimized_content.metaDescription, product.id]
      );
      optimized++;

      // Rate limit: 1 product per second
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      logger.error('Product optimization failed', { productId: product.id, error: err });
      errors++;
    }
  }

  return { optimized, errors };
}

export async function generateAdCopy(product: any, siteName: string): Promise<string[]> {
  const { content } = await ai.adCopy([
    {
      role: 'system',
      content: 'You are an expert Indian digital marketing copywriter. Write compelling ad copy for Google Ads and Meta Ads targeting Indian women interested in ethnic fashion.',
    },
    {
      role: 'user',
      content: `Write 3 ad copy variations for this product:

Product: ${product.title}
Price: ₹${product.selling_price}
Category: ${product.category}
Rating: ${product.rating}/5 (${product.review_count} reviews)
Store: ${siteName}

Each variation should be under 90 characters (Google Ads limit). Include: power word, price, CTA.
Output as JSON array: ["copy1", "copy2", "copy3"]`,
    },
  ]);

  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch {}

  return [`Shop ${product.title} at ₹${product.selling_price}. Free Shipping. COD Available.`];
}
