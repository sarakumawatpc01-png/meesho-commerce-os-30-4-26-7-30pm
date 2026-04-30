import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne, cacheGet, cacheSet } from '../db/client';
import { requireAdmin, requireSiteAccess } from '../middleware/auth';
import { createError } from '../middleware/error-handler';
import dayjs from 'dayjs';

const router = Router();
router.use(requireAdmin);

// GET /admin/api/analytics/dashboard
router.get('/dashboard', requireSiteAccess, async (req: Request, res: Response) => {
  const { siteSlug, period } = z.object({
    siteSlug: z.string(),
    period: z.enum(['today','7d','30d']).default('7d'),
  }).parse(req.query);

  const site = await queryOne<any>(`SELECT * FROM engine.sites WHERE slug = $1`, [siteSlug]);
  if (!site) throw createError(404, 'Site not found');
  const s = site.schema_name;

  const cacheKey = `analytics:${s}:dashboard:${period}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return res.json(cached);

  const dateFilter = period === 'today' ? 'CURRENT_DATE'
    : period === '7d' ? "NOW() - INTERVAL '7 days'"
    : "NOW() - INTERVAL '30 days'";

  const [revenue, topProducts, funnel, recentOrders] = await Promise.all([
    // Revenue metrics
    queryOne(
      `SELECT
         COUNT(*) FILTER (WHERE payment_status = 'paid') as paid_orders,
         COALESCE(SUM(total) FILTER (WHERE payment_status = 'paid'), 0) as gross_revenue,
         COUNT(*) FILTER (WHERE status = 'pending_fulfillment') as pending_fulfillment,
         COUNT(*) FILTER (WHERE status = 'pending_fulfillment' AND created_at < NOW() - INTERVAL '4 hours') as sla_breached,
         COALESCE(AVG(total) FILTER (WHERE payment_status = 'paid'), 0) as avg_order_value
       FROM ${s}.orders WHERE created_at >= ${dateFilter}`
    ),
    // Top products
    query(
      `SELECT title, selling_price, purchases, views, cart_adds FROM ${s}.products ORDER BY purchases DESC LIMIT 10`
    ),
    // Funnel
    queryOne(
      `SELECT
         COALESCE(SUM(views), 0) as product_views,
         COALESCE(SUM(cart_adds), 0) as cart_adds,
         COALESCE(SUM(purchases), 0) as purchases
       FROM ${s}.products`
    ),
    // Recent orders
    query(
      `SELECT o.id, o.order_number, o.total, o.status, o.payment_method, o.created_at, c.name
       FROM ${s}.orders o LEFT JOIN engine.customers c ON c.id = o.customer_id
       ORDER BY o.created_at DESC LIMIT 10`
    ),
  ]);

  const result = { revenue, topProducts, funnel, recentOrders };
  await cacheSet(cacheKey, result, 60);
  res.json(result);
});

// GET /admin/api/analytics/super-dashboard — all sites combined
router.get('/super-dashboard', async (req: Request, res: Response) => {
  if (req.user!.role !== 'super_admin') throw createError(403, 'Forbidden');

  const { period } = z.object({ period: z.enum(['today','7d','30d']).default('today') }).parse(req.query);

  const dateFilter = period === 'today' ? 'CURRENT_DATE'
    : period === '7d' ? "NOW() - INTERVAL '7 days'"
    : "NOW() - INTERVAL '30 days'";

  const sites = await query(`SELECT id, slug, name, schema_name FROM engine.sites WHERE status = 'active'`);

  const siteStats = await Promise.all(sites.map(async (site: any) => {
    const stats = await queryOne(
      `SELECT
         COUNT(*) FILTER (WHERE payment_status = 'paid') as orders,
         COALESCE(SUM(total) FILTER (WHERE payment_status = 'paid'), 0) as revenue
       FROM ${site.schema_name}.orders WHERE created_at >= ${dateFilter}`
    );
    return { siteId: site.id, siteName: site.name, siteSlug: site.slug, ...stats };
  }));

  const combined = siteStats.reduce((acc, s) => ({
    totalOrders: acc.totalOrders + parseInt(s.orders || '0'),
    totalRevenue: acc.totalRevenue + parseFloat(s.revenue || '0'),
  }), { totalOrders: 0, totalRevenue: 0 });

  res.json({ sites: siteStats, combined, period });
});

export default router;
