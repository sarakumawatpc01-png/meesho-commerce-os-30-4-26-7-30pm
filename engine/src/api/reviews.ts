import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne, cacheGet, cacheSet } from '../db/client';
import { requireCustomer, optionalAuth } from '../middleware/auth';
import { apiLimiter } from '../middleware/rate-limit';
import { createError } from '../middleware/error-handler';

const router = Router();

// GET /api/reviews/:productId
router.get('/:productId', apiLimiter, async (req: Request, res: Response) => {
  if (!req.site) throw createError(404, 'Site not found');
  const s = req.siteSchema!;

  const { page, limit } = z.object({
    page:  z.coerce.number().default(1),
    limit: z.coerce.number().min(1).max(50).default(10),
  }).parse(req.query);

  const cacheKey = `reviews:${s}:${req.params.productId}:${page}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  const offset = (page - 1) * limit;
  const [reviews, summary] = await Promise.all([
    query(
      `SELECT * FROM ${s}.reviews WHERE product_id = $1 ORDER BY reviewed_at DESC LIMIT $2 OFFSET $3`,
      [req.params.productId, limit, offset]
    ),
    queryOne(
      `SELECT rating, review_count, rating_breakdown FROM ${s}.products WHERE id = $1`,
      [req.params.productId]
    ),
  ]);

  const result = { reviews, summary, page, limit };
  await cacheSet(cacheKey, result, 300);
  res.json(result);
});

// POST /api/reviews — submit a review
router.post('/', requireCustomer, async (req: Request, res: Response) => {
  if (!req.site) throw createError(404, 'Site not found');
  const s = req.siteSchema!;

  const { productId, rating, text } = z.object({
    productId: z.string().uuid(),
    rating:    z.number().int().min(1).max(5),
    text:      z.string().max(1000).optional(),
  }).parse(req.body);

  // Check if customer bought this product
  const hasPurchased = await queryOne(
    `SELECT id FROM ${s}.orders WHERE customer_id = $1 AND status = 'delivered'
     AND items @> $2::jsonb`,
    [req.user!.sub, JSON.stringify([{ productId }])]
  );

  await query(
    `INSERT INTO ${s}.reviews (product_id, author_name, rating, review_text, verified_buyer, source)
     VALUES ($1, 'Verified Buyer', $2, $3, $4, 'site')`,
    [productId, rating, text || null, !!hasPurchased]
  );

  // Update product aggregate rating
  await query(
    `UPDATE ${s}.products SET
       rating = (SELECT ROUND(AVG(rating)::numeric, 1) FROM ${s}.reviews WHERE product_id = $1),
       review_count = (SELECT COUNT(*) FROM ${s}.reviews WHERE product_id = $1)
     WHERE id = $1`,
    [productId]
  );

  res.json({ message: 'Thank you for your review!' });
});

export default router;
