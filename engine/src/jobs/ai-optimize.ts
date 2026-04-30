import { query } from '../db/client';
import { bulkOptimizeProducts } from '../services/ai/optimizer';
import { getAllActiveSites } from './scheduler';
import { logger } from '../utils/logger';

export async function runAiProductOptimizer(): Promise<void> {
  const sites = await getAllActiveSites();

  for (const site of sites) {
    logger.info(`[ai-optimizer] Starting for ${site.name}`);
    try {
      const result = await bulkOptimizeProducts(site.id, site.schema_name, site.name);
      logger.info(`[ai-optimizer] ${site.name}: ${result.optimized} optimized, ${result.errors} errors`);
    } catch (err: any) {
      logger.error(`[ai-optimizer] Failed for ${site.name}`, { error: err.message });
    }
  }
}
