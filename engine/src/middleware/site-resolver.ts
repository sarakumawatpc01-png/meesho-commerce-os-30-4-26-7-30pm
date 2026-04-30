import { Request, Response, NextFunction } from 'express';
import { queryOne, cacheGet, cacheSet } from '../db/client';
import { Site } from '../types';

declare global {
  namespace Express {
    interface Request {
      site?: Site;
      siteSchema?: string;
    }
  }
}

/**
 * Resolves the current site from the request's Host header.
 * Attaches site object and schema name to req.site and req.siteSchema.
 * Admin routes don't require a site (site can be null).
 */
export async function siteResolver(req: Request, res: Response, next: NextFunction) {
  // Admin routes handled separately
  if (req.path.startsWith('/admin/api') || req.path === '/health') {
    return next();
  }

  const domain = (req.headers['x-site-domain'] as string)
    || req.headers.host
    || '';

  const cleanDomain = domain.replace(/^www\./i, '').replace(/:\d+$/, '');

  // Skip API subdomain prefix
  const lookupDomain = cleanDomain.replace(/^api\./, '');

  if (!lookupDomain) return next();

  const cacheKey = `site:domain:${lookupDomain}`;
  let site = await cacheGet<Site>(cacheKey);

  if (!site) {
    site = await queryOne<Site>(
      `SELECT id, slug, name, domain, schema_name, status,
              razorpay_key_id, prepaid_discount_enabled, prepaid_discount_type,
              prepaid_discount_value, prepaid_discount_min_order, prepaid_discount_text,
              prepaid_discount_stacks_with_coupon, markup_type, markup_value,
              rounding_rule, cod_enabled, gtm_id, meta_pixel_id, hotjar_id, ga4_id,
              whatsapp_prefix, currency, country_code
       FROM engine.sites
       WHERE domain = $1 AND status != 'inactive'`,
      [lookupDomain]
    );

    if (site) {
      await cacheSet(cacheKey, site, 300); // 5 min cache
    }
  }

  if (site) {
    req.site = site;
    req.siteSchema = site.schema_name;
  }

  next();
}
