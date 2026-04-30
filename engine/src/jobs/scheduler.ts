/**
 * Master Scheduler — All automated AI + sync jobs
 *
 * Schedule summary:
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Every 1 hour    │ Cart recovery                                         │
 * │ Every 2 hours   │ Order status sync (Meesho tracking)                   │
 * │ Every 6 hours   │ Meesho price/stock sync                               │
 * │ Daily 10 AM     │ Trend scout (trending Meesho products)                │
 * │ Daily 11 PM     │ AI product optimizer + SEO audit                      │
 * │ Daily midnight  │ Google Shopping feed refresh + Meta catalog sync      │
 * │ Daily           │ COD follow-up (48h unconfirmed)                       │
 * │ 3x per week     │ Heatmap analysis + Ad copy refresh                    │
 * │ Weekly Monday   │ PDF report to super admin                             │
 * │ Weekly          │ Hindi blog + English blog generation                  │
 * │ Weekly          │ Sitemap submission + Broken link check + Lighthouse   │
 * │ 7 days post-del │ Review request to customer                            │
 * │ 30 days post-buy│ Re-engagement campaign                                │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import cron from 'node-cron';
import { query } from '../db/client';
import { logger } from '../utils/logger';

// Job imports
import { syncMeeshoPrices } from './sync-prices';
import { syncOrderStatuses } from './sync-orders';
import { runCartRecovery } from './cart-recovery';
import { runAiProductOptimizer } from './ai-optimize';
import { runSeoAudit } from './seo-audit';
import { refreshShoppingFeed } from './shopping-feed';
import { runTrendScout } from './trend-scout';
import { runHeatmapAnalysis } from './heatmap-analyze';
import { refreshAdCopy } from './generate-ads';
import { runHindiAndEnglishBlogWriter } from './blog-writer';
import { sendWeeklyReport } from './reports';
import { runCodFollowUp } from './cod-followup';
import { runReviewRequests } from './review-requests';
import { runReengagement } from './reengagement';

export async function startScheduler(): Promise<void> {
  logger.info('Starting Meesho Commerce OS scheduler...');

  // ── Every hour ──────────────────────────────────────────────
  cron.schedule('0 * * * *', safeRun('cart-recovery', runCartRecovery));
  cron.schedule('30 * * * *', safeRun('cod-followup', runCodFollowUp));

  // ── Every 2 hours ──────────────────────────────────────────
  cron.schedule('0 */2 * * *', safeRun('order-status-sync', syncOrderStatuses));

  // ── Every 6 hours ──────────────────────────────────────────
  cron.schedule('0 */6 * * *', safeRun('price-sync', syncMeeshoPrices));

  // ── Daily 10 AM ────────────────────────────────────────────
  cron.schedule('0 10 * * *', safeRun('trend-scout', runTrendScout));

  // ── Daily 11 PM ────────────────────────────────────────────
  cron.schedule('0 23 * * *', safeRun('ai-product-optimizer', runAiProductOptimizer));
  cron.schedule('0 23 * * *', safeRun('seo-audit', runSeoAudit));

  // ── Daily midnight ─────────────────────────────────────────
  cron.schedule('0 0 * * *', safeRun('shopping-feed', refreshShoppingFeed));

  // ── Mon, Wed, Fri ──────────────────────────────────────────
  cron.schedule('0 14 * * 1,3,5', safeRun('heatmap-analysis', runHeatmapAnalysis));
  cron.schedule('0 15 * * 1,3,5', safeRun('ad-copy-refresh', refreshAdCopy));

  // ── Monday 8 AM ────────────────────────────────────────────
  cron.schedule('0 8 * * 1', safeRun('weekly-report', sendWeeklyReport));

  // ── Tuesday/Saturday ──────────────────────────────────────
  cron.schedule('0 9 * * 2', safeRun('blog-writer', runHindiAndEnglishBlogWriter));

  // ── Every day at 9 PM ──────────────────────────────────────
  cron.schedule('0 21 * * *', safeRun('review-requests', runReviewRequests));
  cron.schedule('0 20 * * *', safeRun('reengagement', runReengagement));

  logger.info('All scheduled jobs registered');
}

/**
 * Wraps a job function in error handling + logging
 */
function safeRun(jobName: string, fn: () => Promise<void>): () => void {
  return async () => {
    const startTime = Date.now();
    logger.info(`[JOB] Starting: ${jobName}`);

    try {
      await fn();
      const duration = Date.now() - startTime;
      logger.info(`[JOB] Completed: ${jobName} in ${duration}ms`);
    } catch (err: any) {
      logger.error(`[JOB] Failed: ${jobName}`, { error: err.message, stack: err.stack });
      // Log to DB
      await query(
        `INSERT INTO engine.ai_task_log (task_type, status, error, started_at, completed_at)
         VALUES ($1, 'failed', $2, $3, NOW())`,
        [jobName, err.message, new Date(startTime)]
      ).catch(() => {});
    }
  };
}

// Helper to get all active sites
export async function getAllActiveSites() {
  return query(`SELECT id, slug, name, domain, schema_name FROM engine.sites WHERE status = 'active'`);
}
