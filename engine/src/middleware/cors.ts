import cors from 'cors';
import { Request } from 'express';
import { queryOne } from '../db/client';

// Cache of valid site domains (refreshed every 5 min)
let siteDomainsCache: Set<string> = new Set();
let cacheUpdatedAt = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function getValidDomains(): Promise<Set<string>> {
  if (Date.now() - cacheUpdatedAt > CACHE_TTL) {
    try {
      const rows = await queryOne<{ domains: string[] }>(
        `SELECT array_agg(domain) AS domains FROM engine.sites WHERE status = 'active'`
      );
      if (rows?.domains) {
        siteDomainsCache = new Set(rows.domains.flatMap(d => [d, `www.${d}`, `admin.${d}`, `api.${d}`]));
      }
      cacheUpdatedAt = Date.now();
    } catch {
      // On error, keep existing cache
    }
  }
  return siteDomainsCache;
}

export const corsMiddleware = cors({
  origin: async (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow server-to-server (no origin)
    if (!origin) return callback(null, true);

    // Extract hostname from origin
    try {
      const url = new URL(origin);
      const hostname = url.hostname;

      // Always allow localhost in development
      if (process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }

      // Check configured CORS_ORIGINS
      const extraOrigins = (process.env.CORS_ORIGINS || '').split(',').map(o => o.trim());
      if (extraOrigins.includes(origin)) return callback(null, true);

      // Check dynamically registered site domains
      const validDomains = await getValidDomains();
      if (validDomains.has(hostname)) return callback(null, true);

      callback(new Error(`CORS: origin ${origin} not allowed`));
    } catch {
      callback(new Error('CORS: invalid origin'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Site-Token', 'X-Requested-With'],
  maxAge: 86400,
});
