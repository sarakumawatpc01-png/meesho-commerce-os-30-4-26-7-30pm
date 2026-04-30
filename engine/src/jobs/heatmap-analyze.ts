import { query } from '../db/client';
import { ai } from '../services/ai/openrouter';
import { getAllActiveSites } from './scheduler';
import { logger } from '../utils/logger';

export async function runHeatmapAnalysis(): Promise<void> {
  const sites = await getAllActiveSites();

  for (const site of sites) {
    const s = site.schema_name;
    try {
      // In production, fetch real Hotjar data via API
      // For now, analyze based on product performance metrics
      const productMetrics = await query(
        `SELECT title, views, cart_adds, purchases,
                CASE WHEN views > 0 THEN ROUND((cart_adds::numeric / views) * 100, 1) END as add_to_cart_rate,
                CASE WHEN cart_adds > 0 THEN ROUND((purchases::numeric / cart_adds) * 100, 1) END as purchase_rate
         FROM ${s}.products WHERE status = 'active' ORDER BY views DESC LIMIT 10`
      );

      if (productMetrics.length === 0) continue;

      const metricsStr = productMetrics.map(p =>
        `${p.title}: ${p.views} views, ${p.add_to_cart_rate || 0}% add-to-cart, ${p.purchase_rate || 0}% purchase rate`
      ).join('\n');

      const { content } = await ai.assistant([
        {
          role: 'system',
          content: 'You are a UX optimization specialist for e-commerce. Analyze product performance metrics and suggest 3 specific, actionable improvements.'
        },
        {
          role: 'user',
          content: `Analyze these product metrics for ${site.name} and give 3 actionable UX improvement suggestions:\n\n${metricsStr}\n\nReturn JSON: [{"insight": "...", "priority": "high|medium|low", "action": "specific html/design change"}]`
        }
      ]);

      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const insights = JSON.parse(jsonMatch[0]);
        for (const insight of insights) {
          await query(
            `INSERT INTO ${s}.heatmap_insights (page, insight, priority) VALUES ($1, $2, $3)`,
            ['product_listing', insight.insight, insight.priority || 'medium']
          ).catch(() => {});
        }
        logger.info(`[heatmap] Generated ${insights.length} insights for ${site.name}`);
      }
    } catch (err: any) {
      logger.error(`[heatmap] Failed for ${site.name}`, { error: err.message });
    }
  }
}
