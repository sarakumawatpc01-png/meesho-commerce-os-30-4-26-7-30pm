import { Router, Request, Response } from 'express';
import { query } from '../db/client';

const router = Router();

// GET /api/sitemap/:siteSlug — returns XML sitemap
router.get('/:siteSlug', async (req: Request, res: Response) => {
  if (!req.site) return res.status(404).send('Site not found');
  const s = req.siteSchema!;
  const base = `https://${req.site.domain}`;

  const [products, blogs] = await Promise.all([
    query(`SELECT slug, updated_at FROM ${s}.products WHERE status = 'active'`),
    query(`SELECT slug, updated_at FROM ${s}.blog_posts WHERE status = 'published'`),
  ]);

  const urls: string[] = [
    urlEntry(base + '/', 'daily', '1.0'),
    urlEntry(base + '/category/anarkali', 'weekly', '0.8'),
    urlEntry(base + '/category/cotton', 'weekly', '0.8'),
    urlEntry(base + '/category/printed', 'weekly', '0.8'),
    urlEntry(base + '/blog', 'weekly', '0.7'),
    urlEntry(base + '/about', 'monthly', '0.5'),
    urlEntry(base + '/contact', 'monthly', '0.5'),
    ...products.map(p => urlEntry(`${base}/product/${p.slug}`, 'weekly', '0.9', p.updated_at)),
    ...blogs.map(b => urlEntry(`${base}/blog/${b.slug}`, 'weekly', '0.7', b.updated_at)),
  ];

  res.setHeader('Content-Type', 'application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`);
});

// GET /api/robots/:siteSlug
router.get('/robots/:siteSlug', async (req: Request, res: Response) => {
  if (!req.site) return res.status(404).send('Site not found');
  const base = `https://${req.site.domain}`;
  res.setHeader('Content-Type', 'text/plain');
  res.send(`User-agent: *
Allow: /
Disallow: /cart
Disallow: /checkout
Disallow: /account
Disallow: /admin
Disallow: /api/

Sitemap: ${base}/sitemap.xml`);
});

function urlEntry(loc: string, freq: string, priority: string, lastmod?: Date): string {
  return `  <url>
    <loc>${loc}</loc>
    <changefreq>${freq}</changefreq>
    <priority>${priority}</priority>
    ${lastmod ? `<lastmod>${new Date(lastmod).toISOString().split('T')[0]}</lastmod>` : ''}
  </url>`;
}

export default router;
