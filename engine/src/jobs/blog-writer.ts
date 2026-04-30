import { query } from '../db/client';
import { ai } from '../services/ai/openrouter';
import { getAllActiveSites } from './scheduler';
import { logger } from '../utils/logger';
import slugify from 'slugify';

export async function runHindiAndEnglishBlogWriter(): Promise<void> {
  const sites = await getAllActiveSites();

  for (const site of sites) {
    const s = site.schema_name;

    // Generate 1 English + 1 Hindi blog post per site
    await generateBlogPost(site, s, 'en');
    await new Promise(r => setTimeout(r, 5000));
    await generateBlogPost(site, s, 'hi');
  }
}

async function generateBlogPost(site: any, schema: string, lang: 'en' | 'hi'): Promise<void> {
  try {
    const topics = lang === 'hi'
      ? ['कुर्ती ऑनलाइन खरीदें', 'सूती कुर्ती', 'अनारकली कुर्ती', 'दिवाली कुर्ती', 'ट्रेंडी कुर्ती']
      : ['How to style a kurti', 'Best kurtis for office wear', 'Cotton kurti buying guide', 'Anarkali kurti trends', 'Kurti sizes guide'];

    const topic = topics[Math.floor(Math.random() * topics.length)];

    const systemPrompt = lang === 'hi'
      ? `आप ${site.name} के लिए एक SEO ब्लॉग लेखक हैं। Hindi में लिखें।`
      : `You are an SEO blog writer for ${site.name}, an Indian ethnic kurti fashion store.`;

    const userPrompt = lang === 'hi'
      ? `"${topic}" विषय पर एक SEO-optimized Hindi blog post लिखें। JSON में return करें: {"title": "...", "content": "500+ words HTML", "excerpt": "150 chars", "tags": ["tag1","tag2"], "metaTitle": "...", "metaDescription": "..."}`
      : `Write an SEO-optimized blog post about "${topic}" for ${site.name}. Return JSON: {"title": "...", "content": "500+ words HTML", "excerpt": "150 chars", "tags": ["tag1","tag2"], "metaTitle": "...", "metaDescription": "..."}`;

    const { content } = lang === 'hi'
      ? await ai.hindi([{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }])
      : await ai.blog([{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }]);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { logger.error('[blog-writer] No JSON in response'); return; }

    const post = JSON.parse(jsonMatch[0]);
    const slug = slugify(post.title || topic, { lower: true, strict: true, locale: lang });

    await query(
      `INSERT INTO ${schema}.blog_posts (slug, title, content, excerpt, language, tags, status, meta_title, meta_description, ai_generated, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7, $8, true, NOW())
       ON CONFLICT (slug) DO NOTHING`,
      [slug, post.title, post.content, post.excerpt, lang, JSON.stringify(post.tags || []), post.metaTitle, post.metaDescription]
    );

    logger.info(`[blog-writer] Generated ${lang.toUpperCase()} blog: "${post.title}" for ${site.name} (status: draft, pending review)`);
  } catch (err: any) {
    logger.error(`[blog-writer] Failed for ${site.name} ${lang}`, { error: err.message });
  }
}
