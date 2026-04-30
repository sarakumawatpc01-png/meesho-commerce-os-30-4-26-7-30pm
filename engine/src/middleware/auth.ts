import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { queryOne } from '../db/client';

const JWT_SECRET = process.env.ENGINE_SECRET || 'dev-secret-change-in-production';

export interface JwtPayload {
  sub: string;
  type: 'customer' | 'admin';
  role?: string;
  siteId?: string;
  iat: number;
  exp: number;
}

// ── Express type augmentation ──────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      // customer shortcut — set by requireCustomer / optionalAuth
      customer?: { id: string; [key: string]: any };
      // admin shortcut — set by requireAdmin
      admin?: { id: string; role: string; siteId?: string; email?: string; [key: string]: any };
    }
  }
}

export function generateTokens(payload: Omit<JwtPayload, 'iat' | 'exp'>) {
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
  const refreshToken = jwt.sign({ sub: payload.sub, type: payload.type, role: payload.role, siteId: payload.siteId }, JWT_SECRET, { expiresIn: '30d' });
  return { accessToken, refreshToken };
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

// ── Require authenticated customer ─────────────────────────────
export function requireCustomer(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const payload = verifyToken(token);
    if (payload.type !== 'customer') return res.status(403).json({ error: 'Forbidden' });
    req.user = payload;
    req.customer = { id: payload.sub };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── Optional auth — attaches user/customer if token present ───
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (token) {
    try {
      const payload = verifyToken(token);
      req.user = payload;
      if (payload.type === 'customer') {
        req.customer = { id: payload.sub };
      }
    } catch {
      // ignore invalid token — continue as guest
    }
  }
  next();
}

// ── Require admin (any role) ───────────────────────────────────
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Admin authentication required' });

  try {
    const payload = verifyToken(token);
    if (payload.type !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    req.user = payload;
    req.admin = { id: payload.sub, role: payload.role || '', siteId: payload.siteId };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── Require super admin ────────────────────────────────────────
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  requireAdmin(req, res, () => {
    if (req.admin?.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }
    next();
  });
}

// ── Require employee or above ──────────────────────────────────
export function requireEmployee(req: Request, res: Response, next: NextFunction) {
  requireAdmin(req, res, () => {
    if (!['super_admin', 'site_admin', 'employee'].includes(req.admin?.role || '')) {
      return res.status(403).json({ error: 'Employee access required' });
    }
    next();
  });
}

// ── Site access guard ──────────────────────────────────────────
export function requireSiteAccess(req: Request, res: Response, next: NextFunction) {
  requireAdmin(req, res, () => {
    const { role, siteId } = req.admin!;
    if (role === 'super_admin') return next();

    const targetSiteId = req.params.siteId || (req.body as any)?.siteId || req.site?.id;
    if (siteId && targetSiteId && siteId !== targetSiteId) {
      return res.status(403).json({ error: 'Access denied to this site' });
    }
    next();
  });
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return (req as any).cookies?.token || null;
}
