/**
 * Admin Products API
 * Import from Meesho HTML, CRUD, bulk operations
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne, cacheDelPattern } from '../db/client';
import { requireAdmin, requireSiteAccess } from '../middleware/auth';
import { createError } from '../middleware/error-handler';
import { parseMeeshoHtml } from '../services/meesho/parser';
import { parseDeliveryOffset } from '../services/meesho/delivery';
import { calculateSellingPrice } from '../services/pricing';
import { auditLog } from '../services/audit';
import slugify from 'slugify';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
router.use(requireAdmin);

// POST /admin/api/products/import — import product from Meesho HTML
router.post('/import', requireSiteAccess, async (req: Request, res: Response) => {
  const { siteSlug, html, meeshoUrl, publish } = z.object({
    siteSlug:  z.string(),
    html:      z.string().min(100),
    meeshoUrl: z.string().url(),
    publish:   z.boolean().default(false),
  }).parse(req.body);

  const site = await queryOne<any>(`SELECT * FROM engine.sites WHERE slug = $1`, [siteSlug]);
  if (!site) throw createError(404, 'Site not found');
  const s = site.schema_name;

  // Parse the Meesho HTML
  const parsed = await parseMeeshoHtml(html, meeshoUrl);

  // Generate slug
  const baseSlug = slugify(parsed.title, { lower: true, strict: true });
  let slug = baseSlug;
  let suffix = 1;
  while (await queryOne(`SELECT id FROM ${s}.products WHERE slug = $1`, [slug])) {
    slug = `${baseSlug}-${++suffix}`;
  }

  // Calculate prices
  const sellingPrice = calculateSellingPrice(parsed.basePrice, site);
  const discountPercent = parsed.mrp > parsed.basePrice
    ? Math.round(((parsed.mrp - sellingPrice) / parsed.mrp) * 100)
    : 0;

  // Calculate delivery offset
  const deliveryOffset = parseDeliveryOffset(parsed.deliveryText || '');

  // Insert product
  const [product] = await query(
    `INSERT INTO ${s}.products (
       site_id, slug, meesho_url, title, description, description_html,
       images, base_price, selling_price, mrp, discount_percent, sizes,
       category, rating, review_count, rating_breakdown,
       delivery_offset_days_min, delivery_offset_days_max,
       status, meesho_product_id, last_synced_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW())
     RETURNING *`,
    [
      site.id, slug, meeshoUrl, parsed.title, parsed.description, parsed.descriptionHtml,
      JSON.stringify(parsed.images), parsed.basePrice, sellingPrice, parsed.mrp, discountPercent,
      JSON.stringify(parsed.sizes), parsed.category, parsed.rating, parsed.reviewCount,
      JSON.stringify(parsed.ratingBreakdown), deliveryOffset.min, deliveryOffset.max,
      publish ? 'active' : 'draft',
      meeshoUrl.split('/').pop()?.split('?')[0] || null,
    ]
  );

  // Import reviews
  if (parsed.reviews.length > 0) {
    for (const review of parsed.reviews.slice(0, 50)) {
      await query(
        `INSERT INTO ${s}.reviews (product_id, author_name, rating, review_text, review_images, size_purchased, verified_buyer, reviewed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT DO NOTHING`,
        [product.id, review.authorName, review.rating, review.reviewText,
          JSON.stringify(review.reviewImages), review.sizePurchased || null, review.verifiedBuyer,
          review.reviewedAt ? new Date(review.reviewedAt) : null]
      ).catch(() => {});
    }
  }

  // Clear product cache
  await cacheDelPattern(`products:${s}:*`);

  auditLog({ actorId: req.user!.sub, actorType: 'admin', action: 'product.imported', siteId: site.id, resourceId: product.id, details: { title: parsed.title, reviewsImported: parsed.reviews.length } });

  res.json({ product, reviewsImported: parsed.reviews.length, message: `Product imported successfully${publish ? ' and published' : ' as draft'}` });
});

// GET /admin/api/products — list with performance metrics
router.get('/', requireSiteAccess, async (req: Request, res: Response) => {
  const { siteSlug, status, page, limit } = z.object({
    siteSlug: z.string(),
    status:   z.enum(['active','draft','archived']).optional(),
    page:     z.coerce.number().default(1),
    limit:    z.coerce.number().default(25),
  }).parse(req.query);

  const site = await queryOne<any>(`SELECT * FROM engine.sites WHERE slug = $1`, [siteSlug]);
  if (!site) throw createError(404, 'Site not found');
  const s = site.schema_name;

  const where = status ? `WHERE status = '${status}'` : '';
  const products = await query(
    `SELECT id, slug, title, selling_price, mrp, status, rating, review_count, views, cart_adds, purchases, images, sizes, created_at
     FROM ${s}.products ${where}
     ORDER BY purchases DESC
     LIMIT $1 OFFSET $2`,
    [limit, (page - 1) * limit]
  );

  const [countResult] = await query(`SELECT COUNT(*) as count FROM ${s}.products ${where}`);
  res.json({ products, total: parseInt(countResult?.count || '0'), page, limit });
});

// PATCH /admin/api/products/:productId — update product
router.patch('/:productId', requireSiteAccess, async (req: Request, res: Response) => {
  const { siteSlug, ...updates } = z.object({
    siteSlug:        z.string(),
    title:           z.string().optional(),
    description:     z.string().optional(),
    selling_price:   z.number().optional(),
    status:          z.enum(['active','draft','archived']).optional(),
    meta_title:      z.string().optional(),
    meta_description: z.string().optional(),
    badges:          z.array(z.string()).optional(),
    is_featured:     z.boolean().optional(),
    is_trending:     z.boolean().optional(),
  }).parse(req.body);

  const site = await queryOne<any>(`SELECT * FROM engine.sites WHERE slug = $1`, [siteSlug]);
  if (!site) throw createError(404, 'Site not found');
  const s = site.schema_name;

  // Build update SET clause dynamically
  const setClauses: string[] = ['updated_at = NOW()'];
  const params: any[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      setClauses.push(`${key} = $${idx++}`);
      params.push(Array.isArray(value) ? JSON.stringify(value) : value);
    }
  }

  params.push(req.params.productId);
  await query(`UPDATE ${s}.products SET ${setClauses.join(', ')} WHERE id = $${idx}`, params);
  await cacheDelPattern(`product:${s}:*`);

  auditLog({ actorId: req.user!.sub, actorType: 'admin', action: 'product.updated', siteId: site.id, resourceId: req.params.productId });
  res.json({ message: 'Product updated' });
});

// DELETE /admin/api/products/:productId
router.delete('/:productId', requireSiteAccess, async (req: Request, res: Response) => {
  const { siteSlug } = z.object({ siteSlug: z.string() }).parse(req.query);
  const site = await queryOne<any>(`SELECT * FROM engine.sites WHERE slug = $1`, [siteSlug]);
  if (!site) throw createError(404, 'Site not found');

  await query(`UPDATE ${site.schema_name}.products SET status = 'archived' WHERE id = $1`, [req.params.productId]);
  auditLog({ actorId: req.user!.sub, actorType: 'admin', action: 'product.archived', siteId: site.id, resourceId: req.params.productId });
  res.json({ message: 'Product archived' });
});

export default router;
