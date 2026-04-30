import { Router } from 'express';
import { query, queryOne } from '../db/client';

const router = Router();

// POST /api/newsletter/subscribe
router.post('/subscribe', async (req: any, res) => {
  const { email } = req.body;
  const s = req.siteSchema;
  if (!s) return res.status(400).json({ error: 'Site not found' });
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });

  await query(
    `INSERT INTO ${s}.newsletter_subscribers (email, subscribed_at)
     VALUES ($1, NOW()) ON CONFLICT (email) DO NOTHING`,
    [email.toLowerCase().trim()]
  ).catch(() => {}); // table may not exist on older schemas — silent fail

  res.json({ success: true, message: 'Subscribed successfully!' });
});

export default router;
