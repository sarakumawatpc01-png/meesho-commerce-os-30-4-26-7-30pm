import { Router } from 'express';
import { query, queryOne } from '../db/client';
import { requireAdmin } from '../middleware/auth';

const router = Router();
router.use(requireAdmin);

// GET /admin/api/ads — list ad copies for a site
router.get('/', async (req: any, res) => {
  const { siteSlug, platform, status } = req.query;

  let where = 'WHERE 1=1';
  const params: any[] = [];

  if (siteSlug) {
    params.push(siteSlug);
    where += ` AND site_slug = $${params.length}`;
  }
  if (platform) {
    params.push(platform);
    where += ` AND platform = $${params.length}`;
  }
  if (status) {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }

  const ads = await query(
    `SELECT id, site_slug, platform, headline, body, cta, product_id,
            status, performance_score, impressions, clicks, conversions, created_at
     FROM engine.ad_copies
     ${where}
     ORDER BY created_at DESC
     LIMIT 50`,
    params
  ).catch(() => [] as any[]);

  res.json({ ads });
});

// GET /admin/api/ads/:id — get ad detail
router.get('/:id', async (req: any, res) => {
  const ad = await queryOne<any>(
    `SELECT * FROM engine.ad_copies WHERE id = $1`,
    [req.params.id]
  ).catch(() => null);

  if (!ad) return res.status(404).json({ error: 'Ad not found' });
  res.json({ ad });
});

// POST /admin/api/ads — create / save an ad copy
router.post('/', async (req: any, res) => {
  const { siteSlug, platform, headline, body, cta, productId, status = 'draft' } = req.body;

  if (!headline || !body) {
    return res.status(400).json({ error: 'headline and body are required' });
  }

  const ad = await queryOne<any>(
    `INSERT INTO engine.ad_copies
       (site_slug, platform, headline, body, cta, product_id, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, headline, status, created_at`,
    [siteSlug || null, platform || 'meta', headline, body, cta || null, productId || null, status, req.admin?.id || null]
  ).catch(() => null);

  if (!ad) {
    return res.status(500).json({ error: 'Could not save ad — table may not exist yet' });
  }

  res.json({ success: true, ad });
});

// PATCH /admin/api/ads/:id — update an ad copy
router.patch('/:id', async (req: any, res) => {
  const { headline, body, cta, status, platform } = req.body;

  const ad = await queryOne<any>(
    `UPDATE engine.ad_copies
     SET headline    = COALESCE($1, headline),
         body        = COALESCE($2, body),
         cta         = COALESCE($3, cta),
         status      = COALESCE($4, status),
         platform    = COALESCE($5, platform),
         updated_at  = NOW()
     WHERE id = $6
     RETURNING id, headline, status, updated_at`,
    [headline || null, body || null, cta || null, status || null, platform || null, req.params.id]
  ).catch(() => null);

  if (!ad) return res.status(404).json({ error: 'Ad not found' });
  res.json({ success: true, ad });
});

// DELETE /admin/api/ads/:id — delete an ad copy
router.delete('/:id', async (req: any, res) => {
  await query(`DELETE FROM engine.ad_copies WHERE id = $1`, [req.params.id]).catch(() => {});
  res.json({ success: true });
});

// POST /admin/api/ads/:id/performance — update impression/click/conversion counters
router.post('/:id/performance', async (req: any, res) => {
  const { impressions = 0, clicks = 0, conversions = 0 } = req.body;

  await query(
    `UPDATE engine.ad_copies
     SET impressions  = COALESCE(impressions, 0) + $1,
         clicks       = COALESCE(clicks, 0) + $2,
         conversions  = COALESCE(conversions, 0) + $3,
         performance_score = CASE
           WHEN (COALESCE(impressions, 0) + $1) > 0
           THEN ROUND(((COALESCE(conversions, 0) + $3)::numeric / (COALESCE(impressions, 0) + $1)) * 100, 2)
           ELSE 0
         END,
         updated_at = NOW()
     WHERE id = $4`,
    [impressions, clicks, conversions, req.params.id]
  ).catch(() => {});

  res.json({ success: true });
});

export default router;
