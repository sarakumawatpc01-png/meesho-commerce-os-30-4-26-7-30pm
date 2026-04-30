import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/client';
import { requireAdmin, requireSuperAdmin } from '../middleware/auth';
import { createError } from '../middleware/error-handler';
import { encrypt } from '../utils/crypto';
import { auditLog } from '../services/audit';

const router = Router();
router.use(requireAdmin);

// GET /admin/api/meesho-accounts — list all Meesho supplier accounts
router.get('/', async (req: any, res) => {
  // Never expose the encrypted password field
  const accounts = await query(
    `SELECT id, label, phone, is_active, order_count_today, total_orders,
            last_used_at, created_at
     FROM engine.meesho_accounts
     ORDER BY is_active DESC, total_orders DESC`
  ).catch(() => []);

  res.json({ accounts });
});

// GET /admin/api/meesho-accounts/:id
router.get('/:id', async (req: any, res) => {
  const account = await queryOne<any>(
    `SELECT id, label, phone, is_active, order_count_today, total_orders,
            last_used_at, created_at
     FROM engine.meesho_accounts WHERE id = $1`,
    [req.params.id]
  );
  if (!account) throw createError(404, 'Account not found');
  res.json({ account });
});

// POST /admin/api/meesho-accounts — add new Meesho account
router.post('/', requireSuperAdmin, async (req: any, res) => {
  const body = z.object({
    label:    z.string().min(2),
    phone:    z.string().min(10).regex(/^\d+$/, 'Phone must be digits only'),
    password: z.string().min(4),
  }).parse(req.body);

  // Check duplicate phone
  const existing = await queryOne<any>(
    `SELECT id FROM engine.meesho_accounts WHERE phone = $1`, [body.phone]
  );
  if (existing) throw createError(409, 'Account with this phone already exists');

  const encryptedPassword = encrypt(body.password); // Buffer → BYTEA

  const account = await queryOne<any>(
    `INSERT INTO engine.meesho_accounts (label, phone, password, is_active)
     VALUES ($1, $2, $3, true)
     RETURNING id, label, phone, is_active, order_count_today, total_orders, created_at`,
    [body.label, body.phone, encryptedPassword]
  );

  if (!account) throw createError(500, 'Failed to add account');

  auditLog({ actorId: req.admin.id, actorType: 'admin', action: 'meesho_account.added',
    details: { phone: body.phone, label: body.label } });

  res.status(201).json({ account });
});

// PATCH /admin/api/meesho-accounts/:id — update account
router.patch('/:id', requireSuperAdmin, async (req: any, res) => {
  const body = z.object({
    label:    z.string().min(2).optional(),
    is_active: z.boolean().optional(),
    password: z.string().min(4).optional(),
  }).parse(req.body);

  let encryptedPassword: Buffer | null = null;
  if (body.password) encryptedPassword = encrypt(body.password);

  const account = await queryOne<any>(
    `UPDATE engine.meesho_accounts
     SET label     = COALESCE($1, label),
         is_active = COALESCE($2, is_active),
         password  = COALESCE($3, password)
     WHERE id = $4
     RETURNING id, label, phone, is_active, order_count_today, total_orders`,
    [body.label ?? null, body.is_active ?? null, encryptedPassword, req.params.id]
  );

  if (!account) throw createError(404, 'Account not found');

  auditLog({ actorId: req.admin.id, actorType: 'admin', action: 'meesho_account.updated',
    details: { id: req.params.id } });

  res.json({ account });
});

// DELETE /admin/api/meesho-accounts/:id — deactivate (soft delete)
router.delete('/:id', requireSuperAdmin, async (req: any, res) => {
  const account = await queryOne<any>(
    `UPDATE engine.meesho_accounts SET is_active = false WHERE id = $1
     RETURNING id, label`,
    [req.params.id]
  );
  if (!account) throw createError(404, 'Account not found');

  auditLog({ actorId: req.admin.id, actorType: 'admin', action: 'meesho_account.deactivated',
    details: { id: req.params.id } });

  res.json({ success: true, message: `Account "${account.label}" deactivated` });
});

export default router;
