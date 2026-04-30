import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne, cacheGet, cacheSet } from '../db/client';
import { searchLimiter } from '../middleware/rate-limit';
import { createError } from '../middleware/error-handler';

const router = Router();

// GET /api/search?q=cotton+kurti
router.get('/', searchLimiter, async (req: Request, res: Response) => {
  if (!req.site) throw createError(404, 'Site not found');
  const s = req.siteSchema!;

  const { q, page, limit } = z.object({
    q:     z.string().min(1).max(100),
    page:  z.coerce.number().default(1),
    limit: z.coerce.number().min(1).max(48).default(24),
  }).parse(req.query);

  const offset = (page - 1) * limit;
  const searchTerm = `%${q.toLowerCase()}%`;

  const cacheKey = `search:${s}:${q}:${page}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  const products = await query(
    `SELECT id, slug, title, selling_price, mrp, discount_percent, images, rating, badges, category
     FROM ${s}.products
     WHERE status = 'active'
       AND (LOWER(title) LIKE $1 OR LOWER(description) LIKE $1 OR LOWER(category) LIKE $1)
     ORDER BY
       CASE WHEN LOWER(title) LIKE $1 THEN 0 ELSE 1 END,
       purchases DESC
     LIMIT $2 OFFSET $3`,
    [searchTerm, limit, offset]
  );

  const result = { query: q, products, page, limit };
  await cacheSet(cacheKey, result, 60);
  res.json(result);
});

export default router;
