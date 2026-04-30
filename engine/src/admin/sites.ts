import { Router, Request, Response } from 'express';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { query, queryOne, cacheDelPattern } from '../db/client';
import { requireSuperAdmin, requireAdmin, requireSiteAccess } from '../middleware/auth';
import { createError } from '../middleware/error-handler';
import { auditLog } from '../services/audit';

const router = Router();
const SITES_DIR = process.env.SITES_DIR || '/app/sites';

// GET /admin/api/sites — list all sites (super admin) or own site (site admin)
router.get('/', requireAdmin, async (req: Request, res: Response) => {
  if (req.user!.role === 'super_admin') {
    const sites = await query(
      `SELECT s.*,
         (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = s.schema_name) as table_count
       FROM engine.sites s ORDER BY s.created_at ASC`
    );
    return res.json(sites);
  }

  const site = await queryOne(`SELECT * FROM engine.sites WHERE id = $1`, [req.user!.siteId]);
  res.json(site ? [site] : []);
});

// POST /admin/api/sites — create new site (super admin only)
router.post('/', requireSuperAdmin, async (req: Request, res: Response) => {
  const { name, domain, razorpayKeyId } = z.object({
    name:          z.string().min(2).max(50),
    domain:        z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i),
    razorpayKeyId: z.string().optional(),
  }).parse(req.body);

  // Check domain uniqueness
  const existing = await queryOne(`SELECT id FROM engine.sites WHERE domain = $1`, [domain]);
  if (existing) throw createError(409, 'Domain already registered');

  const slug = domain.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]/g, '');
  const schemaName = slug.replace(/[^a-z0-9_]/g, '_');

  // Create site record
  const [site] = await query(
    `INSERT INTO engine.sites (slug, name, domain, schema_name, razorpay_key_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [slug, name, domain, schemaName, razorpayKeyId || null]
  );

  // Create the PostgreSQL schema for this site
  await query(`SELECT engine.create_site_schema($1)`, [schemaName]);

  auditLog({ actorId: req.user!.sub, actorType: 'admin', action: 'site.created', siteId: site.id, details: { name, domain } });

  res.status(201).json({ site, message: `Site ${name} created. Schema ${schemaName} initialized.` });
});

// POST /admin/api/sites/:siteSlug/deploy — upload and deploy frontend
router.post('/:siteSlug/deploy', requireSiteAccess, async (req: Request, res: Response) => {
  const site = await queryOne<any>(`SELECT * FROM engine.sites WHERE slug = $1`, [req.params.siteSlug]);
  if (!site) throw createError(404, 'Site not found');

  // In production, this would use multipart form data
  // Here we accept base64-encoded ZIP
  const { zipBase64 } = z.object({ zipBase64: z.string() }).parse(req.body);

  const zipBuffer = Buffer.from(zipBase64, 'base64');
  const zip = new AdmZip(zipBuffer);

  const siteDir = path.join(SITES_DIR, site.slug);
  fs.mkdirSync(siteDir, { recursive: true });

  // Find index.html in zip
  const indexEntry = zip.getEntries().find(e => e.entryName.endsWith('index.html'));
  if (!indexEntry) throw createError(400, 'ZIP must contain index.html');

  // Inject engine placeholders into the HTML
  let html = indexEntry.getData().toString('utf8');
  html = injectEngineConfig(html, site);

  // Store with version
  const version = (site.current_frontend_version || 0) + 1;
  const versionDir = path.join(SITES_DIR, site.slug, `v${version}`);
  fs.mkdirSync(versionDir, { recursive: true });

  // Extract all files to version dir
  zip.extractAllTo(versionDir, true);
  fs.writeFileSync(path.join(versionDir, 'index.html'), html);

  // Make this version active by symlinking
  const activeLink = path.join(SITES_DIR, site.slug, 'active');
  if (fs.existsSync(activeLink)) fs.unlinkSync(activeLink);
  fs.symlinkSync(versionDir, activeLink);

  // Also write index.html to site root for nginx
  fs.writeFileSync(path.join(siteDir, 'index.html'), html);

  // Update DB
  await query(
    `INSERT INTO engine.frontend_deployments (site_id, version, deployed_by, file_path, is_active)
     VALUES ($1, $2, $3, $4, true)`,
    [site.id, version, req.user!.sub, versionDir]
  );
  await query(
    `UPDATE engine.frontend_deployments SET is_active = false WHERE site_id = $1 AND version < $2`,
    [site.id, version]
  );
  await query(
    `UPDATE engine.sites SET current_frontend_version = $1, updated_at = NOW() WHERE id = $2`,
    [version, site.id]
  );

  // Clear cache
  await cacheDelPattern(`site:domain:${site.domain}`);

  auditLog({ actorId: req.user!.sub, actorType: 'admin', action: 'site.frontend_deployed', siteId: site.id, details: { version } });

  res.json({ message: `Frontend deployed as version ${version}`, version });
});

function injectEngineConfig(html: string, site: any): string {
  const config = `
<!-- ENGINE INJECT: SITE_CONFIG -->
<script>
window.SITE_CONFIG = {
  siteName: ${JSON.stringify(site.name)},
  apiBase: ${JSON.stringify(`https://${site.domain}/api`)},
  razorpayKey: ${JSON.stringify(site.razorpay_key_id || '')},
  whatsappNumber: ${JSON.stringify(process.env.WHATSAPP_NUMBER || '')},
  gtmId: ${JSON.stringify(site.gtm_id || '')},
  metaPixelId: ${JSON.stringify(site.meta_pixel_id || '')},
  hotjarId: ${JSON.stringify(site.hotjar_id || '')},
  currencySymbol: '₹',
  countryCode: 'IN',
  codEnabled: ${site.cod_enabled},
  prepaidDiscount: ${JSON.stringify({
    enabled: site.prepaid_discount_enabled,
    type: site.prepaid_discount_type,
    value: site.prepaid_discount_value,
    text: site.prepaid_discount_text,
  })},
};
</script>
<!-- ENGINE INJECT: GTM -->
${site.gtm_id ? `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${site.gtm_id}');</script>` : ''}
<!-- ENGINE INJECT: META_PIXEL -->
${site.meta_pixel_id ? `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${site.meta_pixel_id}');fbq('track','PageView');</script>` : ''}
<!-- ENGINE INJECT: HOTJAR -->
${site.hotjar_id ? `<script>(function(h,o,t,j,a,r){h.hj=h.hj||function(){(h.hj.q=h.hj.q||[]).push(arguments)};h._hjSettings={hjid:${site.hotjar_id},hjsv:6};a=o.getElementsByTagName('head')[0];r=o.createElement('script');r.async=1;r.src=t+h._hjSettings.hjid+j+h._hjSettings.hjsv;a.appendChild(r);})(window,document,'https://static.hotjar.com/c/hotjar-','.js?sv=');</script>` : ''}
`;

  return html.replace('</head>', config + '</head>');
}

export default router;
