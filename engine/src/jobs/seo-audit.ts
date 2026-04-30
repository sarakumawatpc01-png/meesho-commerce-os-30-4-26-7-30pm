import { query, queryOne } from '../db/client';
import { ai } from '../services/ai/openrouter';
import { getAllActiveSites } from './scheduler';
import { logger } from '../utils/logger';

export async function runSeoAudit(): Promise<void> {
  const sites = await getAllActiveSites();

  for (const site of sites) {
    const s = site.schema_name;

    // Count SEO issues
    const issues = await queryOne<any>(
      `SELECT
         COUNT(*) FILTER (WHERE meta_title IS NULL) as missing_meta_title,
         COUNT(*) FILTER (WHERE meta_description IS NULL) as missing_meta_desc,
         COUNT(*) FILTER (WHERE CHAR_LENGTH(meta_title) > 60) as long_meta_title,
         COUNT(*) FILTER (WHERE CHAR_LENGTH(meta_description) > 160) as long_meta_desc,
         COUNT(*) FILTER (WHERE rating IS NULL OR review_count = 0) as no_reviews
       FROM ${s}.products WHERE status = 'active'`
    );

    // Get sitemap submission status
    const blogCount = await queryOne<{ count: string }>(`SELECT COUNT(*) FROM ${s}.blog_posts WHERE status = 'published'`);

    const summary = `
Site: ${site.name} (${site.domain})
Products missing meta title: ${issues?.missing_meta_title || 0}
Products missing meta description: ${issues?.missing_meta_desc || 0}
Products with long meta title (>60 chars): ${issues?.long_meta_title || 0}
Products with long meta description (>160 chars): ${issues?.long_meta_desc || 0}
Products with no reviews: ${issues?.no_reviews || 0}
Published blog posts: ${blogCount?.count || 0}
`;

    // Auto-fix: regenerate meta for products missing it
    if ((issues?.missing_meta_title || 0) > 0 || (issues?.missing_meta_desc || 0) > 0) {
      const productsToFix = await query(
        `SELECT id, title, description, category FROM ${s}.products
         WHERE (meta_title IS NULL OR meta_description IS NULL) AND status = 'active'
         LIMIT 20`
      );

      for (const product of productsToFix) {
        try {
          const { content } = await ai.seo([
            { role: 'system', content: 'Generate concise SEO meta tags for an Indian ethnic kurti product page. Return JSON only.' },
            {
              role: 'user',
              content: `Product: ${product.title}\nCategory: ${product.category || 'Kurti'}\nGenerate: {"metaTitle": "...", "metaDescription": "..."}\nRules: title 50-60 chars, description 150-160 chars, include CTA, brand "${site.name}" at end of title.`
            }
          ]);

          const match = content.match(/\{[\s\S]*\}/);
          if (match) {
            const { metaTitle, metaDescription } = JSON.parse(match[0]);
            await query(
              `UPDATE ${s}.products SET meta_title = $1, meta_description = $2 WHERE id = $3`,
              [metaTitle, metaDescription, product.id]
            );
          }
          await new Promise(r => setTimeout(r, 500));
        } catch (err) {
          logger.error('[seo-audit] Meta fix failed', { productId: product.id });
        }
      }
    }

    logger.info(`[seo-audit] ${site.name}: ${summary.trim()}`);
  }
}
