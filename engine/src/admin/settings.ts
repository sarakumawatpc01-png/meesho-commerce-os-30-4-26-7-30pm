import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/client';
import { requireAdmin, requireSuperAdmin, requireSiteAccess } from '../middleware/auth';
import { createError } from '../middleware/error-handler';
import { encrypt, maskKey } from '../utils/crypto';
import { auditLog } from '../services/audit';

const router = Router();
router.use(requireAdmin);

// GET /admin/api/settings — get site settings (masked)
router.get('/', requireSiteAccess, async (req: Request, res: Response) => {
  const { siteSlug } = z.object({ siteSlug: z.string() }).parse(req.query);
  const site = await queryOne<any>(`SELECT * FROM engine.sites WHERE slug = $1`, [siteSlug]);
  if (!site) throw createError(404, 'Site not found');

  // Get API key hints (last 4 chars only — never full values)
  const keys = await query(
    `SELECT key_name, key_hint FROM engine.api_keys WHERE site_id = $1 OR site_id IS NULL`,
    [site.id]
  );

  const keyMap: Record<string, string> = {};
  keys.forEach((k: any) => { keyMap[k.key_name] = k.key_hint ? `****${k.key_hint}` : '(not set)'; });

  // Return site settings with masked keys
  res.json({
    general: {
      name: site.name, domain: site.domain, tagline: site.tagline,
      logo_url: site.logo_url, favicon_url: site.favicon_url,
      status: site.status, currency: site.currency,
    },
    pricing: {
      markup_type: site.markup_type, markup_value: site.markup_value,
      rounding_rule: site.rounding_rule,
    },
    payment: {
      razorpay_key_id: site.razorpay_key_id || '(not set)',
      razorpay_secret: site.razorpay_key_id ? '****' + (site.razorpay_key_id.slice(-4)) : '(not set)',
      cod_enabled: site.cod_enabled,
    },
    prepaid_discount: {
      enabled: site.prepaid_discount_enabled,
      type: site.prepaid_discount_type,
      value: site.prepaid_discount_value,
      min_order: site.prepaid_discount_min_order,
      text: site.prepaid_discount_text,
      stacks_with_coupon: site.prepaid_discount_stacks_with_coupon,
    },
    tracking: {
      gtm_id: site.gtm_id, meta_pixel_id: site.meta_pixel_id,
      hotjar_id: site.hotjar_id, ga4_id: site.ga4_id,
    },
    api_keys: keyMap,
  });
});

// PATCH /admin/api/settings/general
router.patch('/general', requireSiteAccess, async (req: Request, res: Response) => {
  const { siteSlug, ...updates } = z.object({
    siteSlug: z.string(),
    name: z.string().min(1).optional(),
    tagline: z.string().optional(),
    status: z.enum(['active','maintenance','inactive']).optional(),
  }).parse(req.body);

  const site = await queryOne<any>(`SELECT id FROM engine.sites WHERE slug = $1`, [siteSlug]);
  if (!site) throw createError(404, 'Site not found');

  const setClauses = Object.entries(updates).filter(([, v]) => v !== undefined).map(([k], i) => `${k} = $${i + 2}`);
  const values = Object.values(updates).filter(v => v !== undefined);

  if (setClauses.length > 0) {
    await query(`UPDATE engine.sites SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $1`, [site.id, ...values]);
  }

  auditLog({ actorId: req.user!.sub, actorType: 'admin', action: 'settings.general.updated', siteId: site.id });
  res.json({ message: 'Settings updated' });
});

// PATCH /admin/api/settings/api-key — save encrypted API key
router.patch('/api-key', requireSiteAccess, async (req: Request, res: Response) => {
  const { siteSlug, keyName, keyValue } = z.object({
    siteSlug: z.string(),
    keyName:  z.string(),
    keyValue: z.string().min(1),
  }).parse(req.body);

  const site = await queryOne<any>(`SELECT id FROM engine.sites WHERE slug = $1`, [siteSlug]);
  if (!site) throw createError(404, 'Site not found');

  const encryptedValue = encrypt(keyValue);
  const hint = keyValue.slice(-4);

  await query(
    `INSERT INTO engine.api_keys (site_id, key_name, key_value, key_hint, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (site_id, key_name) DO UPDATE SET key_value = $3, key_hint = $4, updated_at = NOW()`,
    [site.id, keyName, encryptedValue, hint]
  );

  // Special handling for Razorpay Key ID (not a secret — store in sites table)
  if (keyName === 'razorpay_key_id') {
    await query(`UPDATE engine.sites SET razorpay_key_id = $1 WHERE id = $2`, [keyValue, site.id]);
  }

  auditLog({ actorId: req.user!.sub, actorType: 'admin', action: `settings.api_key.${keyName}.updated`, siteId: site.id });
  res.json({ message: 'API key saved securely', hint: `****${hint}` });
});

// PATCH /admin/api/settings/tracking — update tracking IDs
router.patch('/tracking', requireSiteAccess, async (req: Request, res: Response) => {
  const { siteSlug, gtmId, metaPixelId, hotjarId, ga4Id } = z.object({
    siteSlug:    z.string(),
    gtmId:       z.string().optional(),
    metaPixelId: z.string().optional(),
    hotjarId:    z.string().optional(),
    ga4Id:       z.string().optional(),
  }).parse(req.body);

  const site = await queryOne<any>(`SELECT id FROM engine.sites WHERE slug = $1`, [siteSlug]);
  if (!site) throw createError(404, 'Site not found');

  await query(
    `UPDATE engine.sites SET
       gtm_id = COALESCE($1, gtm_id),
       meta_pixel_id = COALESCE($2, meta_pixel_id),
       hotjar_id = COALESCE($3, hotjar_id),
       ga4_id = COALESCE($4, ga4_id),
       updated_at = NOW()
     WHERE id = $5`,
    [gtmId || null, metaPixelId || null, hotjarId || null, ga4Id || null, site.id]
  );

  auditLog({ actorId: req.user!.sub, actorType: 'admin', action: 'settings.tracking.updated', siteId: site.id, details: { gtmId, metaPixelId } });
  res.json({ message: 'Tracking IDs updated. They will be injected into the frontend automatically.' });
});

// GET /admin/api/settings/meesho-accounts — list Meesho accounts
router.get('/meesho-accounts', requireSuperAdmin, async (_req: Request, res: Response) => {
  const accounts = await query(`SELECT id, label, phone, order_count_today, total_orders, is_active, last_used_at FROM engine.meesho_accounts`);
  res.json(accounts);
});

export default router;
