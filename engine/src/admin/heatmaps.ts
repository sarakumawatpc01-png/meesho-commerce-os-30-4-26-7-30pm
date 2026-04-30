import { Router } from 'express';
import { query, queryOne } from '../db/client';
import { requireAdmin } from '../middleware/auth';

const router = Router();
router.use(requireAdmin);

// POST /admin/api/heatmaps/track — store a click/scroll event (called from storefront JS)
// No auth required — this is a public pixel endpoint mounted separately in app.ts
// The route here is admin-protected for reading insights

// GET /admin/api/heatmaps — list heatmap sessions for a site
router.get('/', async (req: any, res) => {
  const { siteSlug, page: pageSlug, limit = 50 } = req.query;

  let schema = 'engine';
  if (siteSlug) {
    const site = await queryOne<any>(
      `SELECT schema_name FROM engine.sites WHERE slug = $1`,
      [siteSlug]
    ).catch(() => null);
    if (site) schema = site.schema_name;
  }

  const rows = await query(
    `SELECT page_path, event_type, x_pct, y_pct, scroll_depth, session_id, created_at
     FROM ${schema}.heatmap_events
     ${pageSlug ? `WHERE page_path = $2` : ''}
     ORDER BY created_at DESC
     LIMIT $1`,
    pageSlug ? [Number(limit), pageSlug] : [Number(limit)]
  ).catch(() => [] as any[]);

  // Aggregate click clusters
  const clicks = rows.filter((r: any) => r.event_type === 'click');
  const scrollDepths = rows
    .filter((r: any) => r.event_type === 'scroll' && r.scroll_depth != null)
    .map((r: any) => Number(r.scroll_depth));

  const avgScrollDepth =
    scrollDepths.length > 0
      ? Math.round(scrollDepths.reduce((a: number, b: number) => a + b, 0) / scrollDepths.length)
      : 0;

  res.json({
    totalEvents: rows.length,
    clickCount: clicks.length,
    avgScrollDepth,
    events: rows,
  });
});

// GET /admin/api/heatmaps/pages — top pages by event volume
router.get('/pages', async (req: any, res) => {
  const { siteSlug } = req.query;

  let schema = 'engine';
  if (siteSlug) {
    const site = await queryOne<any>(
      `SELECT schema_name FROM engine.sites WHERE slug = $1`,
      [siteSlug]
    ).catch(() => null);
    if (site) schema = site.schema_name;
  }

  const pages = await query(
    `SELECT page_path, COUNT(*) AS event_count,
            COUNT(DISTINCT session_id) AS sessions
     FROM ${schema}.heatmap_events
     GROUP BY page_path
     ORDER BY event_count DESC
     LIMIT 20`
  ).catch(() => [] as any[]);

  res.json({ pages });
});

// DELETE /admin/api/heatmaps — clear heatmap data for a site/page
router.delete('/', async (req: any, res) => {
  const { siteSlug, pageSlug } = req.query;

  let schema = 'engine';
  if (siteSlug) {
    const site = await queryOne<any>(
      `SELECT schema_name FROM engine.sites WHERE slug = $1`,
      [siteSlug]
    ).catch(() => null);
    if (site) schema = site.schema_name;
  }

  if (pageSlug) {
    await query(`DELETE FROM ${schema}.heatmap_events WHERE page_path = $1`, [pageSlug]).catch(() => {});
  } else {
    await query(`DELETE FROM ${schema}.heatmap_events`).catch(() => {});
  }

  res.json({ success: true });
});

export default router;
