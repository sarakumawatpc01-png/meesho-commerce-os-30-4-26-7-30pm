import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/client';
import { requireAdmin, requireSuperAdmin } from '../middleware/auth';
import { createError } from '../middleware/error-handler';
import { encrypt } from '../utils/crypto';
import { auditLog } from '../services/audit';

const router = Router();
router.use(requireAdmin);

// GET /admin/api/api-keys — list all keys (masked, never exposing values)
router.get('/', async (req: any, res) => {
  const keys = await query(
    `SELECT id, key_name, key_hint, site_id, updated_at
     FROM engine.api_keys
     ORDER BY key_name`
  ).catch(() => []);

  // Also surface which env-level keys are configured (masked)
  const envKeys = [
    { key_name: 'OPENAI_API_KEY',   configured: !!process.env.OPENAI_API_KEY },
    { key_name: 'SENTRY_DSN',       configured: !!process.env.SENTRY_DSN },
    { key_name: 'WABA_TOKEN',       configured: !!process.env.WABA_TOKEN },
    { key_name: 'WABA_PHONE_ID',    configured: !!process.env.WABA_PHONE_ID },
    { key_name: 'SMTP_HOST',        configured: !!process.env.SMTP_HOST },
    { key_name: 'SMTP_USER',        configured: !!process.env.SMTP_USER },
    { key_name: 'SHIPROCKET_EMAIL', configured: !!process.env.SHIPROCKET_EMAIL },
  ];

  res.json({ keys, env_keys: envKeys });
});

// PUT /admin/api/api-keys/:service — set / update a key value in the DB
// Note: environment-level secrets (OpenAI, SMTP, etc.) must be set in .env on the server.
// This endpoint handles DB-stored site-specific keys (e.g. Razorpay per-site).
router.put('/:service', requireSuperAdmin, async (req: any, res) => {
  const { service } = req.params;
  const { value, siteId } = z.object({
    value:  z.string().min(1),
    siteId: z.string().uuid().optional().nullable(),
  }).parse(req.body);

  const encryptedValue = encrypt(value); // Buffer → BYTEA
  const hint = value.slice(-4);

  // UNIQUE(site_id, key_name) — upsert
  const key = await queryOne<any>(
    `INSERT INTO engine.api_keys (key_name, key_value, key_hint, site_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (site_id, key_name)
     DO UPDATE SET key_value  = EXCLUDED.key_value,
                   key_hint   = EXCLUDED.key_hint,
                   updated_at = NOW()
     RETURNING id, key_name, key_hint, site_id, updated_at`,
    [service, encryptedValue, hint, siteId ?? null]
  ).catch(async (err: any) => {
    // Fallback if unique constraint has a slightly different form
    await queryOne<any>(
      `UPDATE engine.api_keys
       SET key_value = $1, key_hint = $2, updated_at = NOW()
       WHERE key_name = $3 AND (site_id = $4 OR ($4::uuid IS NULL AND site_id IS NULL))`,
      [encryptedValue, hint, service, siteId ?? null]
    ).catch(() => {});
    return queryOne<any>(
      `SELECT id, key_name, key_hint, site_id, updated_at
       FROM engine.api_keys
       WHERE key_name = $1 AND (site_id = $2 OR ($2::uuid IS NULL AND site_id IS NULL))`,
      [service, siteId ?? null]
    ).catch(() => null);
  });

  auditLog({ actorId: req.admin.id, actorType: 'admin', action: 'api_key.updated',
    details: { service } });

  res.json({ success: true, key: key ?? { key_name: service, key_hint: hint } });
});

// DELETE /admin/api/api-keys/:service — remove a key
router.delete('/:service', requireSuperAdmin, async (req: any, res) => {
  const { siteId } = req.query;
  await query(
    siteId
      ? `DELETE FROM engine.api_keys WHERE key_name = $1 AND site_id = $2`
      : `DELETE FROM engine.api_keys WHERE key_name = $1 AND site_id IS NULL`,
    siteId ? [req.params.service, siteId] : [req.params.service]
  ).catch(() => {});

  auditLog({ actorId: req.admin.id, actorType: 'admin', action: 'api_key.deleted',
    details: { service: req.params.service } });

  res.json({ success: true });
});

export default router;
