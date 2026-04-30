import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, getPool } from '../db/client';
import { requireAdmin } from '../middleware/auth';
import { createError } from '../middleware/error-handler';
import { logger } from '../utils/logger';

const router = Router();
router.use(requireAdmin);

// ══════════════════════════════════════════════════════════════════
// GET /admin/api/whatsapp/logs
// Columns: id, site_id, customer_id, phone, template, message_id,
//          status, error, sent_at
// ══════════════════════════════════════════════════════════════════
router.get('/logs', async (req: any, res) => {
  const { siteSlug, phone, status, limit = '50', offset = '0' } = req.query;

  let where = 'WHERE 1=1';
  const params: any[] = [];

  if (siteSlug) {
    // Resolve slug → site_id
    const site = await queryOne<any>(
      `SELECT id FROM engine.sites WHERE slug = $1`, [siteSlug]
    ).catch(() => null);
    if (site) { params.push(site.id); where += ` AND wl.site_id = $${params.length}`; }
  }
  if (phone)  { params.push(`%${phone}%`); where += ` AND wl.phone LIKE $${params.length}`; }
  if (status) { params.push(status);       where += ` AND wl.status = $${params.length}`; }

  const logs = await query(
    `SELECT wl.id, wl.phone, wl.template, wl.message_id, wl.status,
            wl.error, wl.sent_at, s.slug AS site_slug
     FROM engine.whatsapp_log wl
     LEFT JOIN engine.sites s ON s.id = wl.site_id
     ${where}
     ORDER BY wl.sent_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, parseInt(limit as string, 10), parseInt(offset as string, 10)]
  ).catch(() => []);

  const total = await queryOne<any>(
    `SELECT COUNT(*) AS count FROM engine.whatsapp_log wl ${where}`, params
  ).catch(() => ({ count: 0 }));

  res.json({ logs, total: parseInt(total?.count || '0', 10) });
});

// ══════════════════════════════════════════════════════════════════
// GET /admin/api/whatsapp/:siteSlug/templates
// Per-site table columns: id, name, body, variables TEXT[], is_active, updated_at
// ══════════════════════════════════════════════════════════════════
router.get('/:siteSlug/templates', async (req: any, res) => {
  const { siteSlug } = req.params;

  const site = await queryOne<any>(
    `SELECT id FROM engine.sites WHERE slug = $1 AND status = 'active'`, [siteSlug]
  );
  if (!site) throw createError(404, 'Site not found');

  const templates = await getPool().query(
    `SELECT * FROM ${siteSlug}.whatsapp_templates ORDER BY name`
  ).then(r => r.rows).catch(() => []);

  res.json({ templates });
});

// POST /admin/api/whatsapp/:siteSlug/templates — upsert template
router.post('/:siteSlug/templates', async (req: any, res) => {
  const { siteSlug } = req.params;
  const body = z.object({
    name:      z.string().min(1),           // unique name in per-site table
    body:      z.string().min(1),
    variables: z.array(z.string()).default([]),
    is_active: z.boolean().default(true),
  }).parse(req.body);

  const site = await queryOne<any>(
    `SELECT id FROM engine.sites WHERE slug = $1 AND status = 'active'`, [siteSlug]
  );
  if (!site) throw createError(404, 'Site not found');

  const tpl = await getPool().query(
    `INSERT INTO ${siteSlug}.whatsapp_templates (name, body, variables, is_active)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (name) DO UPDATE
       SET body       = EXCLUDED.body,
           variables  = EXCLUDED.variables,
           is_active  = EXCLUDED.is_active,
           updated_at = NOW()
     RETURNING *`,
    [body.name, body.body, body.variables, body.is_active]
  ).then(r => r.rows[0]).catch(() => null);

  if (!tpl) throw createError(500, 'Failed to save template');
  res.json({ template: tpl });
});

// ══════════════════════════════════════════════════════════════════
// POST /admin/api/whatsapp/send-test
// ══════════════════════════════════════════════════════════════════
router.post('/send-test', async (req: any, res) => {
  const { phone, templateType } = z.object({
    phone:        z.string().min(10),
    templateType: z.string().min(1),
  }).parse(req.body);

  const wabaToken   = process.env.WABA_TOKEN;
  const wabaPhoneId = process.env.WABA_PHONE_ID;

  if (!wabaToken || !wabaPhoneId) {
    await query(
      `INSERT INTO engine.whatsapp_log (phone, template, status, error)
       VALUES ($1, $2, 'failed', 'WABA credentials not configured')`,
      [phone, templateType]
    ).catch(() => {});
    return res.status(503).json({
      error: 'WhatsApp Business API not configured. Set WABA_TOKEN and WABA_PHONE_ID in .env'
    });
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${wabaPhoneId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${wabaToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone.replace(/\D/g, ''),
          type: 'template',
          template: { name: templateType, language: { code: 'en_US' } },
        }),
      }
    );

    const result: any = await response.json();
    const messageId: string | null = result?.messages?.[0]?.id ?? null;

    await query(
      `INSERT INTO engine.whatsapp_log (phone, template, message_id, status, error)
       VALUES ($1, $2, $3, $4, $5)`,
      [phone, templateType, messageId,
       response.ok ? 'sent' : 'failed',
       response.ok ? null : (result?.error?.message ?? 'API error')]
    ).catch(() => {});

    if (!response.ok) {
      return res.status(400).json({ error: result?.error?.message || 'WhatsApp API error', detail: result });
    }

    res.json({ success: true, messageId });
  } catch (err: any) {
    logger.error('WhatsApp send-test error', err);
    throw createError(500, 'Failed to send test message');
  }
});

export default router;
