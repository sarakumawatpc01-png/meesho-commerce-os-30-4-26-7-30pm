import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import nodemailer from 'nodemailer';
import { query, queryOne } from '../db/client';
import { generateTokens, requireAdmin } from '../middleware/auth';
import { adminLoginLimiter, apiLimiter } from '../middleware/rate-limit';
import { createError } from '../middleware/error-handler';
import { encrypt, decrypt } from '../utils/crypto';
import { auditLog } from '../services/audit';
import { logger } from '../utils/logger';

const router = Router();

const SUPERADMIN_DOMAIN = process.env.SUPERADMIN_DOMAIN || 'meesho.agencyfic.com';

type AdminPasswordRow = { id: string; password: string };

function normalizeBcryptHash(hash: string): string {
  if (hash.startsWith('$2y$') || hash.startsWith('$2x$')) {
    return `$2b$${hash.slice(4)}`;
  }
  return hash;
}

async function verifyPassword(password: string, passwordHash?: string | null): Promise<boolean> {
  if (!passwordHash) return false;
  try {
    return await bcrypt.compare(password, normalizeBcryptHash(passwordHash));
  } catch (err) {
    logger.warn('Failed bcrypt compare for admin password.', err);
    return false;
  }
}

// ── Send email OTP ────────────────────────────────────────────
async function sendEmailOtp(email: string, otp: string): Promise<void> {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    logger.warn('SMTP not configured — skipping email OTP send');
    return;
  }
  const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: `"Meesho Commerce OS" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Your Admin Login OTP',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px">
        <h2 style="color:#7c3aed">Admin Login OTP</h2>
        <p>Your one-time password:</p>
        <div style="font-size:40px;font-weight:900;letter-spacing:10px;color:#1e293b;
                    background:#f1f5f9;border-radius:12px;padding:20px 28px;display:inline-block">
          ${otp}
        </div>
        <p style="margin-top:16px;color:#64748b;font-size:13px">Expires in 10 minutes. Never share this code.</p>
      </div>`,
  });
}

// ═══════════════════════════════════════════════════════════════
// POST /admin/api/auth/login — SUPERADMIN login
// ═══════════════════════════════════════════════════════════════
router.post('/login', adminLoginLimiter, async (req: Request, res: Response) => {
  const { email, password, totpCode, emailOtp } = z.object({
    email:    z.string().email(),
    password: z.string().min(1),
    totpCode: z.string().optional(),
    emailOtp: z.string().optional(),
  }).parse(req.body);

  const normalizedEmail = email.trim().toLowerCase();
  const admin = await queryOne<any>(
    `SELECT * FROM engine.admin_users WHERE email = $1 AND is_active = true`,
    [normalizedEmail]
  );
  if (!admin) throw createError(401, 'Invalid email or password');

  if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
    throw createError(429, 'Account temporarily locked. Try again later.');
  }

  const passwordValid = await verifyPassword(password, admin.password);
  if (!passwordValid) {
    const attempts = (admin.login_attempts || 0) + 1;
    const lockUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
    await query(
      `UPDATE engine.admin_users SET login_attempts = $1, locked_until = $2 WHERE id = $3`,
      [attempts, lockUntil, admin.id]
    );
    throw createError(401, 'Invalid email or password');
  }

  // TOTP check
  if (admin.totp_enabled && admin.totp_secret) {
    if (!totpCode) throw createError(401, 'TOTP code required');
    const secret = decrypt(Buffer.from(admin.totp_secret, 'hex'));
    if (!authenticator.verify({ token: totpCode, secret })) {
      throw createError(401, 'Invalid TOTP code');
    }
  }

  // Email OTP check
  if (admin.email_otp_enabled) {
    if (!emailOtp) {
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      const otpHash = await bcrypt.hash(otp, 10);
      const expires = new Date(Date.now() + 10 * 60 * 1000);
      await query(
        `UPDATE engine.admin_users SET email_otp_token = $1, email_otp_expires = $2 WHERE id = $3`,
        [otpHash, expires, admin.id]
      );
      try { await sendEmailOtp(admin.email, otp); } catch (err) {
        logger.error('Email OTP send failed', err);
        throw createError(500, 'Failed to send OTP email. Check SMTP settings.');
      }
      return res.status(202).json({ step: 'email_otp', message: 'OTP sent to your email.' });
    }
    if (!admin.email_otp_token || !admin.email_otp_expires) {
      throw createError(400, 'No pending OTP. Submit password again to resend.');
    }
    if (new Date(admin.email_otp_expires) < new Date()) {
      throw createError(401, 'OTP expired. Please log in again.');
    }
    if (!(await bcrypt.compare(emailOtp, admin.email_otp_token))) {
      throw createError(401, 'Invalid OTP');
    }
    await query(
      `UPDATE engine.admin_users SET email_otp_token = NULL, email_otp_expires = NULL WHERE id = $1`,
      [admin.id]
    );
  }

  await query(
    `UPDATE engine.admin_users SET login_attempts = 0, locked_until = NULL, last_login = NOW() WHERE id = $1`,
    [admin.id]
  );

  const tokens = generateTokens({ sub: admin.id, type: 'admin', role: admin.role, siteId: admin.site_id || undefined });

  auditLog({ actorId: admin.id, actorType: 'admin', action: 'admin.login', siteId: admin.site_id, ipAddress: req.ip });

  res.json({
    admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role, siteId: admin.site_id },
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
});

// ═══════════════════════════════════════════════════════════════
// POST /admin/api/auth/site-login — SITE ADMIN login
// ═══════════════════════════════════════════════════════════════
router.post('/site-login', adminLoginLimiter, async (req: any, res: Response) => {
  const { email, password } = z.object({
    email:    z.string().email(),
    password: z.string().min(1),
  }).parse(req.body);

  const siteSlug = req.headers['x-admin-site'] as string | undefined;
  const host = ((req.headers['x-forwarded-host'] || req.headers.host) as string || '').split(':')[0];

  let site: any = null;
  if (siteSlug) {
    site = await queryOne<any>(`SELECT * FROM engine.sites WHERE slug = $1 AND status = 'active'`, [siteSlug]);
  }
  if (!site && host) {
    site = await queryOne<any>(`SELECT * FROM engine.sites WHERE domain = $1 AND status = 'active'`, [host]);
  }
  if (!site) throw createError(400, 'Site not found');

  if (!site.site_admin_email || !site.site_admin_password_hash) {
    throw createError(500, 'Site admin credentials not configured. Contact superadmin.');
  }
  if (site.site_admin_email.toLowerCase() !== email.toLowerCase()) {
    throw createError(401, 'Invalid email or password');
  }
  if (!(await verifyPassword(password, site.site_admin_password_hash))) {
    throw createError(401, 'Invalid email or password');
  }

  const tokens = generateTokens({ sub: site.id, type: 'admin', role: 'site_admin', siteId: site.id });

  auditLog({ actorType: 'admin', action: 'site_admin.login', siteId: site.id, ipAddress: req.ip });

  res.json({
    admin: { id: site.id, name: site.name, email: site.site_admin_email, role: 'site_admin', siteId: site.id },
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
});

// ═══════════════════════════════════════════════════════════════
// POST /admin/api/auth/refresh
// ═══════════════════════════════════════════════════════════════
router.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body);
  try {
    const jwt = require('jsonwebtoken');
    const payload = jwt.verify(refreshToken, process.env.ENGINE_SECRET || 'dev-secret-change-in-production');
    if (!payload || payload.type !== 'admin') throw new Error('Invalid token type');
    const tokens = generateTokens({ sub: payload.sub, type: 'admin', role: payload.role, siteId: payload.siteId });
    res.json({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
  } catch {
    throw createError(401, 'Invalid or expired refresh token');
  }
});

// ── Authenticated routes below ────────────────────────────────

// GET /admin/api/auth/me
router.get('/me', requireAdmin, async (req: any, res: Response) => {
  const admin = await queryOne<any>(
    `SELECT id, name, email, role, site_id, totp_enabled, email_otp_enabled, last_login, created_at
     FROM engine.admin_users WHERE id = $1`,
    [req.admin.id]
  ).catch(() => null);
  if (!admin) return res.status(404).json({ error: 'Admin not found' });
  res.json({ admin });
});

// PATCH /admin/api/auth/me — update own email/password
router.patch('/me', apiLimiter, requireAdmin, async (req: any, res: Response) => {
  if (req.admin.role !== 'super_admin') throw createError(403, 'Superadmin only');

  const { name, email, currentPassword, newPassword } = z.object({
    name:            z.string().min(2).optional(),
    email:           z.string().email().optional(),
    currentPassword: z.string().optional(),
    newPassword:     z.string().min(8).optional(),
  }).parse(req.body);

  let passwordHash: string | undefined;
  if (newPassword) {
    if (!currentPassword) throw createError(400, 'Current password required');
    const row = await queryOne<AdminPasswordRow>(`SELECT id, password FROM engine.admin_users WHERE id = $1`, [req.admin.id]);
    if (!row || !(await verifyPassword(currentPassword, row.password))) {
      throw createError(401, 'Current password is incorrect');
    }
    passwordHash = await bcrypt.hash(newPassword, 12);
  }

  await query(
    `UPDATE engine.admin_users
     SET name = COALESCE($1, name), email = COALESCE($2, email),
         password = COALESCE($3, password), updated_at = NOW()
     WHERE id = $4`,
    [name || null, email?.toLowerCase() || null, passwordHash || null, req.admin.id]
  );
  res.json({ message: 'Profile updated.' });
});

// PATCH /admin/api/auth/email-otp — toggle Email OTP
router.patch('/email-otp', requireAdmin, async (req: any, res: Response) => {
  if (req.admin.role !== 'super_admin') throw createError(403, 'Superadmin only');
  const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
  await query(`UPDATE engine.admin_users SET email_otp_enabled = $1 WHERE id = $2`, [enabled, req.admin.id]);
  res.json({ message: `Email OTP ${enabled ? 'enabled' : 'disabled'}.`, enabled });
});

// POST /admin/api/auth/setup-totp
router.post('/setup-totp', requireAdmin, async (req: any, res: Response) => {
  if (req.admin.role !== 'super_admin') throw createError(403, 'Superadmin only');
  const secret = authenticator.generateSecret();
  const otpAuthUrl = authenticator.keyuri(req.admin.id, 'Meesho Commerce OS', secret);
  const encryptedSecret = encrypt(secret).toString('hex');
  await query(`UPDATE engine.admin_users SET totp_secret = $1 WHERE id = $2`, [encryptedSecret, req.admin.id]);
  res.json({ secret, otpAuthUrl });
});

// POST /admin/api/auth/verify-totp
router.post('/verify-totp', requireAdmin, async (req: any, res: Response) => {
  const { code } = z.object({ code: z.string().length(6) }).parse(req.body);
  const row = await queryOne<any>(`SELECT totp_secret FROM engine.admin_users WHERE id = $1`, [req.admin.id]);
  if (!row?.totp_secret) throw createError(400, 'TOTP not set up');
  const secret = decrypt(Buffer.from(row.totp_secret, 'hex'));
  if (!authenticator.verify({ token: code, secret })) throw createError(400, 'Invalid code');
  await query(`UPDATE engine.admin_users SET totp_enabled = true WHERE id = $1`, [req.admin.id]);
  res.json({ message: 'TOTP enabled.' });
});

// PATCH /admin/api/auth/site-credentials/:siteSlug — update site admin login
router.patch('/site-credentials/:siteSlug', requireAdmin, async (req: any, res: Response) => {
  if (req.admin.role !== 'super_admin') throw createError(403, 'Superadmin only');

  const { email, password } = z.object({
    email:    z.string().email().optional(),
    password: z.string().min(8).optional(),
  }).parse(req.body);

  if (!email && !password) throw createError(400, 'Provide email or password');

  let passwordHash: string | undefined;
  if (password) passwordHash = await bcrypt.hash(password, 12);

  const site = await queryOne<any>(
    `UPDATE engine.sites
     SET site_admin_email = COALESCE($1, site_admin_email),
         site_admin_password_hash = COALESCE($2, site_admin_password_hash),
         updated_at = NOW()
     WHERE slug = $3
     RETURNING slug, name, site_admin_email`,
    [email?.toLowerCase() || null, passwordHash || null, req.params.siteSlug]
  );
  if (!site) return res.status(404).json({ error: 'Site not found' });

  auditLog({
    actorId: req.admin.id, actorType: 'admin', action: 'site.admin_credentials_updated',
    details: { siteSlug: req.params.siteSlug },
  });
  res.json({ message: 'Credentials updated.', site });
});

// POST /admin/api/auth/create-admin
router.post('/create-admin', requireAdmin, async (req: any, res: Response) => {
  if (req.admin.role !== 'super_admin') throw createError(403, 'Superadmin only');

  const { email, name, password, role, siteId } = z.object({
    email:    z.string().email(),
    name:     z.string().min(2),
    password: z.string().min(8),
    role:     z.enum(['site_admin', 'employee']),
    siteId:   z.string().uuid().optional(),
  }).parse(req.body);

  if (role === 'site_admin' && !siteId) throw createError(400, 'site_id required for site_admin');

  const passwordHash = await bcrypt.hash(password, 12);
  const newAdmin = await queryOne<any>(
    `INSERT INTO engine.admin_users (email, name, password, role, site_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, email, name, role`,
    [email.toLowerCase(), name, passwordHash, role, siteId || null]
  );
  auditLog({ actorId: req.admin.id, actorType: 'admin', action: 'admin.created', details: { email, role } });
  res.status(201).json({ admin: newAdmin });
});

export default router;
