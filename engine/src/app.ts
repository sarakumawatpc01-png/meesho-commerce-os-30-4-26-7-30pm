import 'express-async-errors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

function findEnvPath(): string | null {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '.env.example'),
    path.resolve(process.cwd(), '..', '.env'),
    path.resolve(process.cwd(), '..', '.env.example'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const envPath = findEnvPath();

if (envPath) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import * as Sentry from '@sentry/node';
import { logger } from './utils/logger';
import { getPool, getRedis } from './db/client';

// Middleware
import { corsMiddleware } from './middleware/cors';
import { siteResolver } from './middleware/site-resolver';
import { errorHandler } from './middleware/error-handler';
import { securityMiddleware } from './middleware/security';

// Public API routes
import productsRouter from './api/products';
import ordersRouter from './api/orders';
import customersRouter from './api/customers';
import cartRouter from './api/cart';
import checkoutRouter from './api/checkout';
import reviewsRouter from './api/reviews';
import searchRouter from './api/search';
import trackingRouter from './api/tracking';
import authRouter from './api/auth';
import wishlistRouter from './api/wishlist';
import newsletterRouter from './api/newsletter';
import sitemapRouter from './api/sitemap';
import shoppingFeedRouter from './api/shopping-feed';

// Admin routes
import adminSitesRouter from './admin/sites';
import adminProductsRouter from './admin/products-admin';
import adminOrdersRouter from './admin/orders-admin';
import adminCustomersRouter from './admin/customers-admin';
import adminAnalyticsRouter from './admin/analytics';
import adminAiTasksRouter from './admin/ai-tasks';
import adminHeatmapsRouter from './admin/heatmaps';
import adminAdsRouter from './admin/ads';
import adminSettingsRouter from './admin/settings';
import adminAssistantRouter from './admin/assistant';
import adminAuthRouter from './admin/auth';
import adminMarketingRouter from './admin/marketing';
import adminWhatsappRouter from './admin/whatsapp-admin';
import adminSeoRouter from './admin/seo-admin';
import adminMeeshoAccountsRouter from './admin/meesho-accounts';
import adminApiKeysRouter from './admin/api-keys';
import { ensureSuperAdminFromEnv } from './services/admin-seed';

// Scheduled jobs
import { startScheduler } from './jobs/scheduler';

// Sentry
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
}

const app = express();

// ── Security & base middleware ────────────────────────────────
app.use(Sentry.Handlers.requestHandler());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(corsMiddleware);
app.use(securityMiddleware);

// Body parsing
// Note: webhooks need the raw body for signature verification.
app.use('/webhooks', (req, _res, next) => {
  let data = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => {
    data += chunk;
  });
  req.on('end', () => {
    (req as any).rawBody = data;
    next();
  });
});
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Logging
app.use(morgan('combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
  skip: (req) => req.path === '/health',
}));

// ── Site resolver ──────────────────────────────────────────────
app.use(siteResolver);

// ── Health check ──────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    await getPool().query('SELECT 1');
    const redis = await getRedis();
    await redis.ping();
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (err: any) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

// ── Public API routes (frontend sites call these) ─────────────
const apiRouter = express.Router();
apiRouter.use('/products', productsRouter);
apiRouter.use('/orders', ordersRouter);
apiRouter.use('/customers', customersRouter);
apiRouter.use('/cart', cartRouter);
apiRouter.use('/checkout', checkoutRouter);
apiRouter.use('/reviews', reviewsRouter);
apiRouter.use('/search', searchRouter);
apiRouter.use('/tracking', trackingRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/wishlist', wishlistRouter);
apiRouter.use('/newsletter', newsletterRouter);
apiRouter.use('/sitemap', sitemapRouter);
apiRouter.use('/shopping-feed', shoppingFeedRouter);
app.use('/api', apiRouter);

// Razorpay webhooks (before auth middleware)
app.use('/webhooks', require('./api/webhooks').default);

// ── Admin API routes ───────────────────────────────────────────
const adminRouter = express.Router();
adminRouter.use('/auth', adminAuthRouter);
adminRouter.use('/sites', adminSitesRouter);
adminRouter.use('/products', adminProductsRouter);
adminRouter.use('/orders', adminOrdersRouter);
adminRouter.use('/customers', adminCustomersRouter);
adminRouter.use('/analytics', adminAnalyticsRouter);
adminRouter.use('/ai-tasks', adminAiTasksRouter);
adminRouter.use('/heatmaps', adminHeatmapsRouter);
adminRouter.use('/ads', adminAdsRouter);
adminRouter.use('/settings', adminSettingsRouter);
adminRouter.use('/assistant', adminAssistantRouter);
adminRouter.use('/marketing', adminMarketingRouter);
adminRouter.use('/whatsapp', adminWhatsappRouter);
adminRouter.use('/seo', adminSeoRouter);
adminRouter.use('/meesho-accounts', adminMeeshoAccountsRouter);
adminRouter.use('/api-keys', adminApiKeysRouter);
app.use('/admin/api', adminRouter);

// ── Error handling ─────────────────────────────────────────────
app.use(Sentry.Handlers.errorHandler());
app.use(errorHandler);

// ── Start ──────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3001');

async function start() {
  try {
    // Test DB connection
    await getPool().query('SELECT 1');
    logger.info('PostgreSQL connected');

    // Test Redis
    const redis = await getRedis();
    await redis.ping();
    logger.info('Redis connected');

    // Ensure super admin bootstrap from env values
    await ensureSuperAdminFromEnv();

    // Start background jobs
    await startScheduler();
    logger.info('Scheduler started');

    app.listen(PORT, () => {
      logger.info(`Meesho Engine running on port ${PORT}`);
    });
  } catch (err) {
    logger.error('Failed to start engine', { error: err });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down gracefully');
  await getPool().end();
  const redis = await getRedis();
  await redis.quit();
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason });
});

start();

export default app;
