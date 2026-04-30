import { Router } from 'express';
import { query, queryOne } from '../db/client';
import { optionalAuth } from '../middleware/auth';

const router = Router();

// GET /api/wishlist — get wishlist items
router.get('/', optionalAuth, async (req: any, res) => {
  const s = req.siteSchema;
  if (!s) return res.json({ items: [] });

  if (!req.customer) return res.json({ items: [] });

  const items = await query(
    `SELECT w.product_id, p.title, p.images, p.base_price, p.mrp, p.slug, p.status
     FROM ${s}.wishlists w
     JOIN ${s}.products p ON p.id = w.product_id
     WHERE w.customer_id = $1 AND p.status = 'active'
     ORDER BY w.created_at DESC`,
    [req.customer.id]
  ).catch(() => [] as any[]);

  res.json({ items });
});

// POST /api/wishlist/:productId — add to wishlist
router.post('/:productId', optionalAuth, async (req: any, res) => {
  const s = req.siteSchema;
  if (!s || !req.customer) return res.status(401).json({ error: 'Login required' });

  await query(
    `INSERT INTO ${s}.wishlists (customer_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [req.customer.id, req.params.productId]
  ).catch(() => {});
  res.json({ success: true });
});

// DELETE /api/wishlist/:productId — remove from wishlist
router.delete('/:productId', optionalAuth, async (req: any, res) => {
  const s = req.siteSchema;
  if (!s || !req.customer) return res.status(401).json({ error: 'Login required' });

  await query(
    `DELETE FROM ${s}.wishlists WHERE customer_id = $1 AND product_id = $2`,
    [req.customer.id, req.params.productId]
  ).catch(() => {});
  res.json({ success: true });
});

export default router;
