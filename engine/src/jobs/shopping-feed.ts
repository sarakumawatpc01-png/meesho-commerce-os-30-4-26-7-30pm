import { getAllActiveSites } from './scheduler';
import { logger } from '../utils/logger';

export async function refreshShoppingFeed(): Promise<void> {
  const sites = await getAllActiveSites();
  // Shopping feed is generated on-demand via /api/shopping-feed/:siteSlug
  // This job pings Google to refresh their cache
  for (const site of sites) {
    logger.info(`[shopping-feed] Feed URL: https://${site.domain}/shopping-feed.xml for ${site.name}`);
    // In production: submit ping to Google Merchant Center API
  }
}
