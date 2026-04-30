import { Router } from 'express';
import { query, queryOne } from '../db/client';
import { requireAdmin } from '../middleware/auth';

const router = Router();
router.use(requireAdmin);

// GET /admin/api/customers — list all customers across sites or per site
router.get('/', async (req: any, res) => {
  const { search, page = 1, limit = 25, siteSlug } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let siteFilter = '';
  const params: any[] = [Number(limit), offset];

  if (search) {
    params.push(`%${search}%`);
    siteFilter = `WHERE (c.phone ILIKE $${params.length} OR c.name ILIKE $${params.length} OR c.email ILIKE $${params.length})`;
  }

  const customers = await query(
    `SELECT c.id, c.name, c.phone, c.email, c.created_at,
            COALESCE(SUM(CASE WHEN wt.type='credit' THEN wt.amount ELSE -wt.amount END),0) AS wallet_balance
     FROM engine.customers c
     LEFT JOIN engine.wallet_transactions wt ON wt.customer_id = c.id
     ${siteFilter}
     GROUP BY c.id, c.name, c.phone, c.email, c.created_at
     ORDER BY c.created_at DESC
     LIMIT $1 OFFSET $2`,
    params
  ).catch(() => [] as any[]);

  res.json({ customers });
});

// GET /admin/api/customers/rfm — RFM segments
router.get('/rfm', async (req: any, res) => {
  const { siteSlug } = req.query;

  // Find schema for site
  let schema = 'engine';
  if (siteSlug) {
    const site = await queryOne<any>(`SELECT schema_name FROM engine.sites WHERE slug = $1`, [siteSlug]).catch(() => null);
    if (site) schema = site.schema_name;
  }

  // Simple RFM bucketing
  const segments = {
    Champions: 0,
    Loyal: 0,
    Potential: 0,
    'At-Risk': 0,
    Lost: 0,
  };

  try {
    const rows = await query(
      `SELECT
         COUNT(CASE WHEN last_order_days <= 30 AND order_count >= 5 THEN 1 END) AS champions,
         COUNT(CASE WHEN last_order_days <= 60 AND order_count >= 2 THEN 1 END) AS loyal,
         COUNT(CASE WHEN last_order_days <= 90 AND order_count = 1 THEN 1 END) AS potential,
         COUNT(CASE WHEN last_order_days BETWEEN 30 AND 60 AND order_count < 2 THEN 1 END) AS at_risk,
         COUNT(CASE WHEN last_order_days > 60 THEN 1 END) AS lost
       FROM (
         SELECT customer_id,
                EXTRACT(DAY FROM NOW() - MAX(created_at)) AS last_order_days,
                COUNT(*) AS order_count
         FROM ${schema === 'engine' ? 'engine' : schema}.orders
         GROUP BY customer_id
       ) rfm`
    );
    if (rows[0]) {
      segments.Champions = parseInt(rows[0].champions);
      segments.Loyal = parseInt(rows[0].loyal);
      segments.Potential = parseInt(rows[0].potential);
      segments['At-Risk'] = parseInt(rows[0].at_risk);
      segments.Lost = parseInt(rows[0].lost);
    }
  } catch {}

  res.json({ segments });
});

// GET /admin/api/customers/:id/wallet
router.get('/:id/wallet', async (req: any, res) => {
  const txns = await query(
    `SELECT * FROM engine.wallet_transactions WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.params.id]
  ).catch(() => [] as any[]);
  const balanceRow = await queryOne<{ balance: string }>(
    `SELECT COALESCE(SUM(CASE WHEN type='credit' THEN amount ELSE -amount END),0) AS balance
     FROM engine.wallet_transactions WHERE customer_id = $1`,
    [req.params.id]
  ).catch(() => null);
  res.json({ transactions: txns, balance: parseInt(balanceRow?.balance || '0') });
});

// POST /admin/api/customers/:id/wallet/adjust
router.post('/:id/wallet/adjust', async (req: any, res) => {
  const { amount, note } = req.body;
  const type = amount >= 0 ? 'credit' : 'debit';
  await query(
    `INSERT INTO engine.wallet_transactions (customer_id, type, amount, note, created_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [req.params.id, type, Math.abs(amount), note || 'Admin adjustment', req.admin.id]
  ).catch(() => {});
  res.json({ success: true });
});

export default router;
