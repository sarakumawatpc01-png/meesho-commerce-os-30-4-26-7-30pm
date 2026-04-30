import { Router, Request, Response } from 'express';
import { query } from '../db/client';

const router = Router();

// GET /api/shopping-feed/:siteSlug — Google Shopping XML feed
router.get('/:siteSlug', async (req: Request, res: Response) => {
  if (!req.site) return res.status(404).send('Site not found');
  const s = req.siteSchema!;
  const base = `https://${req.site.domain}`;

  const products = await query(
    `SELECT id, slug, title, description, selling_price, mrp, images, sizes, category, rating, review_count
     FROM ${s}.products WHERE status = 'active' LIMIT 1000`
  );

  const items = products.map(p => {
    const firstImage = p.images?.[0]?.url || '';
    const availableSizes = (p.sizes || []).filter((s: any) => s.available).map((s: any) => s.name).join(', ');
    const gtin = `IN-${p.id.replace(/-/g, '').substring(0, 12)}`;

    return `    <item>
      <g:id>${p.id}</g:id>
      <g:title>${escapeXml(p.title)}</g:title>
      <g:description>${escapeXml((p.description || '').substring(0, 500))}</g:description>
      <g:link>${base}/product/${p.slug}</g:link>
      <g:image_link>${firstImage}</g:image_link>
      <g:availability>in stock</g:availability>
      <g:price>${p.selling_price.toFixed(2)} INR</g:price>
      ${p.mrp ? `<g:sale_price>${p.selling_price.toFixed(2)} INR</g:sale_price>` : ''}
      <g:brand>${req.site!.name}</g:brand>
      <g:condition>new</g:condition>
      <g:google_product_category>Apparel &amp; Accessories &gt; Clothing &gt; Tops &gt; Shirts &amp; Tops</g:google_product_category>
      <g:product_type>${p.category || 'Kurti'}</g:product_type>
      <g:custom_label_0>${availableSizes}</g:custom_label_0>
      ${p.rating ? `<g:rating>${p.rating}</g:rating>` : ''}
    </item>`;
  }).join('\n');

  res.setHeader('Content-Type', 'application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${escapeXml(req.site.name)} - Google Shopping Feed</title>
    <link>${base}</link>
    <description>Product feed for ${escapeXml(req.site.name)}</description>
${items}
  </channel>
</rss>`);
});

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export default router;
