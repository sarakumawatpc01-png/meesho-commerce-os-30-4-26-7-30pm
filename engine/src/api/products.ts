import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne, cacheGet, cacheSet } from '../db/client';
import { optionalAuth } from '../middleware/auth';
import { apiLimiter } from '../middleware/rate-limit';
import { createError } from '../middleware/error-handler';
import { calculateSellingPrice } from '../services/pricing';
import { calculateDeliveryDate } from '../services/meesho/delivery';

const router = Router();

// GET /api/products — list products with filters + pagination
router.get('/', apiLimiter, optionalAuth, async (req: Request, res: Response) => {
  if (!req.site) throw createError(404, 'Site not found');

  const schema = z.object({
    page:       z.coerce.number().min(1).default(1),
    limit:      z.coerce.number().min(1).max(48).default(24),
    category:   z.string().optional(),
    sort:       z.enum(['featured','newest','price_asc','price_desc','top_rated','trending']).default('featured'),
    size:       z.string().optional(),
    minPrice:   z.coerce.number().optional(),
    maxPrice:   z.coerce.number().optional(),
    rating:     z.coerce.number().min(1).max(5).optional(),
    collection: z.string().optional(),
  });

  const params = schema.parse(req.query);
  const s = req.siteSchema!;
  const offset = (params.page - 1) * params.limit;

  const cacheKey = `products:${s}:${JSON.stringify(params)}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  const whereClauses: string[] = [`p.status = 'active'`];
  const queryParams: any[] = [];
  let paramIdx = 1;

  if (params.category) {
    whereClauses.push(`p.category = $${paramIdx++}`);
    queryParams.push(params.category);
  }
  if (params.minPrice !== undefined) {
    whereClauses.push(`p.selling_price >= $${paramIdx++}`);
    queryParams.push(params.minPrice);
  }
  if (params.maxPrice !== undefined) {
    whereClauses.push(`p.selling_price <= $${paramIdx++}`);
    queryParams.push(params.maxPrice);
  }
  if (params.rating !== undefined) {
    whereClauses.push(`p.rating >= $${paramIdx++}`);
    queryParams.push(params.rating);
  }
  if (params.size) {
    whereClauses.push(`EXISTS (SELECT 1 FROM jsonb_array_elements(p.sizes) sz WHERE sz->>'name' = $${paramIdx++} AND (sz->>'available')::boolean = true)`);
    queryParams.push(params.size);
  }

  const sortMap: Record<string, string> = {
    featured:   'p.is_featured DESC, p.purchases DESC',
    newest:     'p.created_at DESC',
    price_asc:  'p.selling_price ASC',
    price_desc: 'p.selling_price DESC',
    top_rated:  'p.rating DESC NULLS LAST',
    trending:   'p.is_trending DESC, p.views DESC',
  };

  const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const [products, countResult] = await Promise.all([
    query(
      `SELECT p.id, p.slug, p.title, p.selling_price, p.mrp, p.discount_percent,
              p.images, p.sizes, p.rating, p.review_count, p.badges, p.category,
              p.is_featured, p.is_trending
       FROM ${s}.products p
       ${whereSQL}
       ORDER BY ${sortMap[params.sort]}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...queryParams, params.limit, offset]
    ),
    queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM ${s}.products p ${whereSQL}`,
      queryParams
    )
  ]);

  const result = {
    products,
    pagination: {
      page: params.page,
      limit: params.limit,
      total: parseInt(countResult?.count || '0'),
      pages: Math.ceil(parseInt(countResult?.count || '0') / params.limit),
    }
  };

  await cacheSet(cacheKey, result, 120);
  res.json(result);
});

// GET /api/products/:slug — single product with full details
router.get('/:slug', apiLimiter, optionalAuth, async (req: Request, res: Response) => {
  if (!req.site) throw createError(404, 'Site not found');

  const s = req.siteSchema!;
  const cacheKey = `product:${s}:${req.params.slug}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  const product = await queryOne(
    `SELECT * FROM ${s}.products WHERE slug = $1 AND status = 'active'`,
    [req.params.slug]
  );

  if (!product) throw createError(404, 'Product not found');

  // Get reviews (first 10)
  const reviews = await query(
    `SELECT * FROM ${s}.reviews WHERE product_id = $1 ORDER BY reviewed_at DESC LIMIT 10`,
    [product.id]
  );

  // Get related products (same category, limit 4)
  const related = await query(
    `SELECT id, slug, title, selling_price, mrp, images, rating, discount_percent
     FROM ${s}.products
     WHERE category = $1 AND id != $2 AND status = 'active'
     ORDER BY purchases DESC LIMIT 4`,
    [product.category, product.id]
  );

  // Calculate delivery date
  const deliveryRange = calculateDeliveryDate(
    product.delivery_offset_days_min,
    product.delivery_offset_days_max
  );

  // Track view (fire and forget)
  query(
    `UPDATE ${s}.products SET views = views + 1 WHERE id = $1`,
    [product.id]
  ).catch(() => {});

  const result = { ...product, reviews, related, deliveryRange };
  await cacheSet(cacheKey, result, 300);
  res.json(result);
});

// GET /api/products/categories — list categories with counts
router.get('/meta/categories', apiLimiter, async (req: Request, res: Response) => {
  if (!req.site) throw createError(404, 'Site not found');
  const s = req.siteSchema!;

  const cacheKey = `categories:${s}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  const categories = await query(
    `SELECT category, COUNT(*) as count
     FROM ${s}.products
     WHERE status = 'active' AND category IS NOT NULL
     GROUP BY category
     ORDER BY count DESC`,
  );

  await cacheSet(cacheKey, categories, 600);
  res.json(categories);
});

export default router;
