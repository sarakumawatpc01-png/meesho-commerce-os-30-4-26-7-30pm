import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { query, queryOne, withTransaction } from '../db/client';
import { generateTokens, requireCustomer } from '../middleware/auth';
import { authLimiter } from '../middleware/rate-limit';
import { createError } from '../middleware/error-handler';
import { sendOtp, verifyOtp } from '../services/users/otp';
import { googleOAuthCallback } from '../services/users/google-oauth';
import { auditLog } from '../services/audit';

const router = Router();

// POST /api/auth/send-otp
router.post('/send-otp', authLimiter, async (req: Request, res: Response) => {
  if (!req.site) throw createError(404, 'Site not found');

  const { phone } = z.object({ phone: z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian phone number') }).parse(req.body);

  await sendOtp(phone, req.site);
  res.json({ message: 'OTP sent to your WhatsApp number', expires_in: 300 });
});

// POST /api/auth/verify-otp
router.post('/verify-otp', authLimiter, async (req: Request, res: Response) => {
  if (!req.site) throw createError(404, 'Site not found');

  const { phone, otp } = z.object({
    phone: z.string().regex(/^[6-9]\d{9}$/),
    otp: z.string().length(6),
  }).parse(req.body);

  const valid = await verifyOtp(phone, otp);
  if (!valid) throw createError(401, 'Invalid or expired OTP');

  // Find or create customer
  let customer = await queryOne<any>(
    `SELECT id, name, phone, email FROM engine.customers WHERE phone = $1`,
    [phone]
  );

  if (!customer) {
    const [newCustomer] = await query(
      `INSERT INTO engine.customers (phone) VALUES ($1) RETURNING id, name, phone, email`,
      [phone]
    );
    customer = newCustomer;
  }

  const tokens = generateTokens({ sub: customer.id, type: 'customer' });

  auditLog({ actorType: 'system', action: 'customer.login', siteId: req.site.id, details: { phone: phone.slice(-4) } });

  res.json({
    customer: { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email },
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
});

// GET /api/auth/google — redirect to Google OAuth
router.get('/google', async (req: Request, res: Response) => {
  if (!req.site) throw createError(404, 'Site not found');
  const callbackUrl = `https://${req.site.domain}/api/auth/google/callback`;
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&scope=openid%20email%20profile&state=${req.site.id}`;
  res.redirect(authUrl);
});

// GET /api/auth/google/callback
router.get('/google/callback', async (req: Request, res: Response) => {
  if (!req.site) throw createError(404, 'Site not found');
  const { code } = req.query as { code: string };

  const customer = await googleOAuthCallback(code, req.site);
  const tokens = generateTokens({ sub: customer.id, type: 'customer' });

  // Redirect back to site with token
  const redirectUrl = `https://${req.site.domain}/account?token=${tokens.accessToken}`;
  res.redirect(redirectUrl);
});

// POST /api/auth/refresh — refresh access token
router.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body);

  try {
    const jwt = require('jsonwebtoken');
    const payload = jwt.verify(refreshToken, process.env.ENGINE_SECRET);
    const tokens = generateTokens({ sub: payload.sub, type: 'customer' });
    res.json({ accessToken: tokens.accessToken });
  } catch {
    throw createError(401, 'Invalid refresh token');
  }
});

// POST /api/auth/logout
router.post('/logout', requireCustomer, async (req: Request, res: Response) => {
  // Invalidate refresh token (optional: store in Redis blacklist)
  res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me — current user profile
router.get('/me', requireCustomer, async (req: Request, res: Response) => {
  const customer = await queryOne(
    `SELECT id, phone, name, email, wallet_balance, created_at FROM engine.customers WHERE id = $1`,
    [req.user!.sub]
  );
  if (!customer) throw createError(404, 'Customer not found');
  res.json(customer);
});

export default router;
