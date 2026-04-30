import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { queryOne } from '../db/client';
import { requireAdmin } from '../middleware/auth';
import { createError } from '../middleware/error-handler';
import { runAssistant } from '../services/ai/assistant';

const router = Router();
router.use(requireAdmin);

// POST /admin/api/assistant/chat
router.post('/chat', async (req: Request, res: Response) => {
  const { message, history, siteSlug } = z.object({
    message:  z.string().min(1).max(2000),
    history:  z.array(z.object({ role: z.enum(['user','assistant']), content: z.string() })).default([]),
    siteSlug: z.string().optional(),
  }).parse(req.body);

  let siteId: string | undefined;
  let siteSchema: string | undefined;
  let siteName: string | undefined;

  if (siteSlug) {
    const site = await queryOne<any>(`SELECT id, schema_name, name FROM engine.sites WHERE slug = $1`, [siteSlug]);
    if (site) {
      siteId = site.id;
      siteSchema = site.schema_name;
      siteName = site.name;
    }
  } else if (req.user?.role === 'site_admin' && req.user.siteId) {
    const site = await queryOne<any>(`SELECT id, schema_name, name FROM engine.sites WHERE id = $1`, [req.user.siteId]);
    if (site) {
      siteId = site.id;
      siteSchema = site.schema_name;
      siteName = site.name;
    }
  }

  const result = await runAssistant(message, history, {
    adminId:    req.user!.sub,
    adminRole:  req.user!.role!,
    siteId,
    siteSchema,
    siteName,
  });

  res.json(result);
});

export default router;
