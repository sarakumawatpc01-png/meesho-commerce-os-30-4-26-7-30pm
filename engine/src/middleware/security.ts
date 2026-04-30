import { Request, Response, NextFunction } from 'express';

// Whitelist of actions the AI assistant is allowed to perform
export const AI_ACTION_WHITELIST = new Set([
  'products.list', 'products.get', 'products.update_meta', 'products.bulk_update_meta',
  'orders.list', 'orders.get', 'orders.stats',
  'analytics.get', 'analytics.report',
  'seo.audit', 'seo.fix_meta', 'seo.update_sitemap', 'seo.update_robots',
  'marketing.create_coupon', 'marketing.create_flash_sale',
  'marketing.list_coupons', 'marketing.disable_coupon',
  'tracking.update_gtm', 'tracking.update_pixel', 'tracking.update_hotjar',
  'content.generate_blog', 'content.publish_blog', 'content.list_blogs',
  'content.generate_landing_page', 'content.deploy_landing_page',
  'whatsapp.send_broadcast',
  'ads.get_performance', 'ads.generate_copy',
  'heatmap.get_insights', 'heatmap.list_suggestions',
  'reports.generate',
  'sites.list', 'sites.get',
]);

// Block secret keys from ever being included in AI context
const SECRET_FIELD_PATTERNS = [
  /secret/i, /password/i, /private_key/i, /api_key/i, /access_token/i, /webhook_token/i,
];

export function maskSecretsForAI(obj: any): any {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(maskSecretsForAI);

  return Object.fromEntries(
    Object.entries(obj).map(([key, val]) => {
      const isSecret = SECRET_FIELD_PATTERNS.some(p => p.test(key));
      if (isSecret) return [key, '[HIDDEN]'];
      return [key, maskSecretsForAI(val)];
    })
  );
}

export function validateAiAction(action: string): boolean {
  return AI_ACTION_WHITELIST.has(action);
}

export const securityMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Remove server info from headers
  res.removeHeader('X-Powered-By');

  // Block path traversal
  if (req.path.includes('..') || req.path.includes('%2e%2e')) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  // Block common attack patterns in query strings
  const qs = JSON.stringify(req.query);
  if (/<script|javascript:|data:/i.test(qs)) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  next();
};

// Error handler
export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const status = err.status || err.statusCode || 500;
  const message = status < 500 ? err.message : 'Internal server error';

  if (status >= 500) {
    require('../utils/logger').logger.error('Unhandled error', {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });
  }

  res.status(status).json({ error: message });
}
