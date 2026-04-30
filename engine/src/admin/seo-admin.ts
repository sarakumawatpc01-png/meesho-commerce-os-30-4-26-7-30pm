import { Router } from 'express';
import { z } from 'zod';
import { queryOne, getPool } from '../db/client';
import { requireAdmin } from '../middleware/auth';
import { createError } from '../middleware/error-handler';
import { logger } from '../utils/logger';

const router = Router();
router.use(requireAdmin);

async function getSite(siteSlug: string) {
  return queryOne<any>(`SELECT id, slug, name, domain FROM engine.sites WHERE slug = $1 AND status = 'active'`, [siteSlug]);
}

// seo_pages schema:
// id, page_type, reference_id, url_path, meta_title, meta_description,
// canonical_url, schema_markup (JSONB), robots, seo_score, last_audited_at, issues (JSONB)

// blog_posts schema:
// id, slug, title, content, excerpt, featured_image, author, language, tags TEXT[],
// status, schema_markup, meta_title, (various), published_at, created_at, updated_at

// ══════════════════════════════════════════════════════════════════
// POST /admin/api/seo/:siteSlug/audit — run SEO audit on site pages
// ══════════════════════════════════════════════════════════════════
router.post('/:siteSlug/audit', async (req: any, res) => {
  const { siteSlug } = req.params;
  const site = await getSite(siteSlug);
  if (!site) throw createError(404, 'Site not found');

  const pages = await getPool().query(
    `SELECT id, page_type, url_path, meta_title, meta_description, canonical_url
     FROM ${siteSlug}.seo_pages`
  ).then(r => r.rows).catch(() => []);

  const issues: any[] = [];
  let score = 100;

  for (const page of pages) {
    const pageIssues: string[] = [];
    if (!page.meta_title || page.meta_title.length < 30)  { pageIssues.push('Title too short (min 30 chars)'); score -= 2; }
    if (page.meta_title && page.meta_title.length > 60)   { pageIssues.push('Title too long (max 60 chars)'); score -= 1; }
    if (!page.meta_description)                            { pageIssues.push('Missing meta description'); score -= 3; }
    if (page.meta_description && page.meta_description.length > 160) { pageIssues.push('Meta description too long (max 160 chars)'); score -= 1; }
    if (!page.canonical_url)                               { pageIssues.push('Missing canonical URL'); score -= 1; }
    if (pageIssues.length > 0) {
      issues.push({ page: page.url_path || page.page_type, issues: pageIssues });
    }
  }

  // Update seo_score and issues in the DB for each page
  for (const issue of issues) {
    await getPool().query(
      `UPDATE ${siteSlug}.seo_pages
       SET issues = $1, last_audited_at = NOW()
       WHERE url_path = $2`,
      [JSON.stringify(issue.issues), issue.page]
    ).catch(() => {});
  }

  res.json({
    seo_score: Math.max(0, score),
    pages_audited: pages.length,
    issues,
    summary: issues.length === 0
      ? 'No SEO issues found!'
      : `Found ${issues.length} page(s) with SEO issues`,
  });
});

// ══════════════════════════════════════════════════════════════════
// GET /admin/api/seo/:siteSlug/pages
// ══════════════════════════════════════════════════════════════════
router.get('/:siteSlug/pages', async (req: any, res) => {
  const { siteSlug } = req.params;
  const site = await getSite(siteSlug);
  if (!site) throw createError(404, 'Site not found');

  const pages = await getPool().query(
    `SELECT id, page_type, url_path, meta_title, meta_description, canonical_url,
            robots, seo_score, last_audited_at, issues
     FROM ${siteSlug}.seo_pages ORDER BY page_type, url_path LIMIT 200`
  ).then(r => r.rows).catch(() => []);

  res.json({ pages });
});

// PATCH /admin/api/seo/:siteSlug/pages/:id — update SEO page
router.patch('/:siteSlug/pages/:id', async (req: any, res) => {
  const { siteSlug, id } = req.params;
  const site = await getSite(siteSlug);
  if (!site) throw createError(404, 'Site not found');

  const body = z.object({
    meta_title:       z.string().max(100).optional(),
    meta_description: z.string().max(300).optional(),
    canonical_url:    z.string().url().optional().nullable(),
    robots:           z.string().optional(),
    schema_markup:    z.any().optional(),
  }).parse(req.body);

  const updated = await getPool().query(
    `UPDATE ${siteSlug}.seo_pages
     SET meta_title       = COALESCE($1, meta_title),
         meta_description = COALESCE($2, meta_description),
         canonical_url    = COALESCE($3, canonical_url),
         robots           = COALESCE($4, robots),
         schema_markup    = COALESCE($5, schema_markup)
     WHERE id = $6 RETURNING *`,
    [body.meta_title ?? null, body.meta_description ?? null, body.canonical_url ?? null,
     body.robots ?? null, body.schema_markup ? JSON.stringify(body.schema_markup) : null, id]
  ).then(r => r.rows[0]).catch(() => null);

  if (!updated) throw createError(404, 'Page not found');
  res.json({ page: updated });
});

// ══════════════════════════════════════════════════════════════════
// GET /admin/api/seo/:siteSlug/keywords
// ══════════════════════════════════════════════════════════════════
router.get('/:siteSlug/keywords', async (req: any, res) => {
  const { siteSlug } = req.params;
  const site = await getSite(siteSlug);
  if (!site) throw createError(404, 'Site not found');

  const products = await getPool().query(
    `SELECT name, category, tags FROM ${siteSlug}.products WHERE is_active = true LIMIT 50`
  ).then(r => r.rows).catch(() => []);

  const keywords = products.flatMap((p: any) => {
    const kws: string[] = [p.name];
    if (Array.isArray(p.tags)) kws.push(...p.tags);
    else if (p.tags) try { kws.push(...JSON.parse(p.tags)); } catch {}
    if (p.category) kws.push(p.category);
    return kws;
  }).filter(Boolean).slice(0, 100);

  res.json({ keywords: [...new Set(keywords)].map(kw => ({ keyword: kw, source: 'product' })) });
});

// ══════════════════════════════════════════════════════════════════
// GET /admin/api/seo/:siteSlug/blog
// ══════════════════════════════════════════════════════════════════
router.get('/:siteSlug/blog', async (req: any, res) => {
  const { siteSlug } = req.params;
  const site = await getSite(siteSlug);
  if (!site) throw createError(404, 'Site not found');

  const posts = await getPool().query(
    `SELECT id, title, slug, excerpt, status, language, published_at, created_at
     FROM ${siteSlug}.blog_posts ORDER BY created_at DESC LIMIT 50`
  ).then(r => r.rows).catch(() => []);

  res.json({ posts });
});

// POST /admin/api/seo/:siteSlug/blog/generate — generate a blog post draft
router.post('/:siteSlug/blog/generate', async (req: any, res) => {
  const { siteSlug } = req.params;
  const { topic, lang = 'en' } = z.object({
    topic: z.string().min(5),
    lang:  z.enum(['en', 'hi']).default('en'),
  }).parse(req.body);

  const site = await getSite(siteSlug);
  if (!site) throw createError(404, 'Site not found');

  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const title = lang === 'hi'
    ? `${topic} — पूरी जानकारी और खरीदारी गाइड`
    : `${topic} — Complete Buying Guide`;

  const excerpt = lang === 'hi'
    ? `${topic} के बारे में विस्तृत जानकारी, बेहतरीन टिप्स और खरीदारी की सलाह।`
    : `Everything you need to know about ${topic} — tips, features, and buying advice.`;

  const content = lang === 'hi'
    ? `## ${topic} क्या है?\n\n${topic} एक लोकप्रिय उत्पाद है।\n\n## कैसे चुनें?\n\n1. गुणवत्ता\n2. कीमत\n3. ब्रांड\n\n## निष्कर्ष\n\nहमें उम्मीद है यह गाइड मददगार रही।`
    : `## What is ${topic}?\n\n${topic} is a popular product choice for many customers.\n\n## How to Choose the Best ${topic}\n\n1. **Quality** — Look for good materials and build.\n2. **Price** — Compare options before buying.\n3. **Reviews** — Check customer feedback.\n\n## Conclusion\n\nWe hope this guide helps you find the perfect ${topic}.`;

  try {
    const post = await getPool().query(
      `INSERT INTO ${siteSlug}.blog_posts (title, slug, content, excerpt, language, status)
       VALUES ($1, $2, $3, $4, $5, 'draft')
       ON CONFLICT (slug) DO UPDATE
         SET title = EXCLUDED.title, updated_at = NOW()
       RETURNING id, title, slug, status`,
      [title, slug, content, excerpt, lang]
    ).then(r => r.rows[0]).catch(() => null);

    res.json({ post: post ?? { title, slug, excerpt, content, status: 'draft', language: lang }, saved: !!post });
  } catch (err: any) {
    logger.warn('Blog generate DB error:', err.message);
    res.json({ post: { title, slug, excerpt, content, status: 'draft', language: lang }, saved: false });
  }
});

export default router;
