import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, getPool } from '../db/client';
import { requireAdmin } from '../middleware/auth';
import { createError } from '../middleware/error-handler';
import { auditLog } from '../services/audit';

const router = Router();
router.use(requireAdmin);

// ── Helper: look up site id by slug ──────────────────────────────
async function getSite(siteSlug: string) {
  return queryOne<any>(`SELECT id, slug, name FROM engine.sites WHERE slug = $1 AND status = 'active'`, [siteSlug]);
}

// ══════════════════════════════════════════════════════════════════
// COUPONS  — stored in per-site schema
// ══════════════════════════════════════════════════════════════════

// GET /admin/api/marketing/:siteSlug/coupons
router.get('/:siteSlug/coupons', async (req: any, res) => {
  const { siteSlug } = req.params;
  const site = await getSite(siteSlug);
  if (!site) throw createError(404, 'Site not found');

  const coupons = await getPool().query(
    `SELECT * FROM ${siteSlug}.coupons ORDER BY created_at DESC LIMIT 100`
  ).then(r => r.rows).catch(() => []);

  res.json({ coupons });
});

// POST /admin/api/marketing/:siteSlug/coupons
router.post('/:siteSlug/coupons', async (req: any, res) => {
  const { siteSlug } = req.params;
  const site = await getSite(siteSlug);
  if (!site) throw createError(404, 'Site not found');

  const body = z.object({
    code:            z.string().min(3).max(20).transform(v => v.toUpperCase()),
    discount_type:   z.enum(['percent', 'flat']),
    discount_value:  z.number().positive(),
    min_order_value: z.number().min(0).default(0),
    max_discount:    z.number().positive().optional().nullable(),
    usage_limit:     z.number().int().positive().optional().nullable(),
    valid_until:     z.string().datetime().optional().nullable(),
    is_active:       z.boolean().default(true),
  }).parse(req.body);

  // Check duplicate
  const existing = await getPool().query(
    `SELECT id FROM ${siteSlug}.coupons WHERE code = $1`, [body.code]
  ).then(r => r.rows[0]).catch(() => null);
  if (existing) throw createError(409, 'Coupon code already exists');

  const coupon = await getPool().query(
    `INSERT INTO ${siteSlug}.coupons
      (code, discount_type, discount_value, min_order_value, max_discount, usage_limit, valid_until, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [body.code, body.discount_type, body.discount_value, body.min_order_value,
     body.max_discount ?? null, body.usage_limit ?? null, body.valid_until ?? null, body.is_active]
  ).then(r => r.rows[0]).catch(() => null);

  if (!coupon) throw createError(500, 'Failed to create coupon');

  auditLog({ actorId: req.admin.id, actorType: 'admin', action: 'coupon.created',
    siteId: site.id, details: { code: body.code } });

  res.status(201).json({ coupon });
});

// PATCH /admin/api/marketing/:siteSlug/coupons/:id
router.patch('/:siteSlug/coupons/:id', async (req: any, res) => {
  const { siteSlug, id } = req.params;
  const site = await getSite(siteSlug);
  if (!site) throw createError(404, 'Site not found');

  const { is_active, usage_limit, valid_until } = req.body;

  const coupon = await getPool().query(
    `UPDATE ${siteSlug}.coupons
     SET is_active   = COALESCE($1, is_active),
         usage_limit = COALESCE($2, usage_limit),
         valid_until = COALESCE($3, valid_until)
     WHERE id = $4 RETURNING *`,
    [is_active ?? null, usage_limit ?? null, valid_until ?? null, id]
  ).then(r => r.rows[0]).catch(() => null);

  if (!coupon) throw createError(404, 'Coupon not found');
  res.json({ coupon });
});

// DELETE /admin/api/marketing/:siteSlug/coupons/:id
router.delete('/:siteSlug/coupons/:id', async (req: any, res) => {
  const { siteSlug, id } = req.params;
  await getPool().query(`DELETE FROM ${siteSlug}.coupons WHERE id = $1`, [id]).catch(() => {});
  res.json({ success: true });
});

// ══════════════════════════════════════════════════════════════════
// AD COPIES — stored in engine.ad_copies, accessed per site
// ══════════════════════════════════════════════════════════════════

// GET /admin/api/marketing/:siteSlug/ads
router.get('/:siteSlug/ads', async (req: any, res) => {
  const { siteSlug } = req.params;
  const { platform, status } = req.query;

  let where = `WHERE site_slug = $1`;
  const params: any[] = [siteSlug];

  if (platform) { params.push(platform); where += ` AND platform = $${params.length}`; }
  if (status)   { params.push(status);   where += ` AND status = $${params.length}`; }

  const ads = await query(
    `SELECT id, site_slug, platform, headline, body, cta, product_id,
            status, performance_score, impressions, clicks, conversions, created_at
     FROM engine.ad_copies ${where} ORDER BY created_at DESC LIMIT 50`,
    params
  ).catch(() => []);

  res.json({ ads });
});

// POST /admin/api/marketing/:siteSlug/ads/generate — AI-powered ad copy generation
router.post('/:siteSlug/ads/generate', async (req: any, res) => {
  const { siteSlug } = req.params;
  const { productId } = req.body;
  if (!productId) throw createError(400, 'productId required');

  const site = await getSite(siteSlug);
  if (!site) throw createError(404, 'Site not found');

  // Fetch product details from site schema
  const product = await getPool().query(
    `SELECT name, description, price FROM ${siteSlug}.products WHERE id = $1 LIMIT 1`, [productId]
  ).then(r => r.rows[0]).catch(() => null);

  const productName = product?.name || 'Product';

  // Generate simple ad copies without external AI (can be enhanced with OpenAI later)
  const platforms = ['meta', 'google', 'whatsapp'] as const;
  const generated: any[] = [];

  for (const platform of platforms) {
    const headline = platform === 'google'
      ? `Shop ${productName} — Best Price`
      : `✨ ${productName} — Sale Now On!`;
    const body = `Get ${productName} at the best price. Free delivery on orders above ₹499. ${
      platform === 'whatsapp' ? 'Reply YES to order now!' : 'Limited stock — shop now.'
    }`;
    const cta = platform === 'google' ? 'Shop Now' : platform === 'meta' ? 'Order Today' : 'Order Now';

    const ad = await queryOne<any>(
      `INSERT INTO engine.ad_copies
        (site_slug, platform, headline, body, cta, product_id, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,'draft',$7)
       RETURNING id, platform, headline, status`,
      [siteSlug, platform, headline, body, cta, productId, req.admin.id]
    ).catch(() => null);

    if (ad) generated.push(ad);
  }

  res.json({ generated, count: generated.length });
});

export default router;
