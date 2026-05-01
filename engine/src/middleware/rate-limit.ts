import rateLimit from 'express-rate-limit';
import { getRedis } from '../db/client';

// Standard API limiter
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,     // 1 minute
  max: 100,
  message: { error: 'Too many requests, please try again shortly.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth/OTP limiter (strict)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 5,
  message: { error: 'Too many authentication attempts. Try again in 15 minutes.' },
  skipSuccessfulRequests: true,
});

// Checkout limiter
export const checkoutLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many checkout attempts.' },
});

// Admin login limiter
export const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many admin login attempts. Locked for 15 minutes.' },
  skipSuccessfulRequests: true,
});

// Superadmin profile updates (email/password)
export const adminProfileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many profile update attempts. Please try again later.' },
});

// Search limiter
export const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many search requests.' },
});
