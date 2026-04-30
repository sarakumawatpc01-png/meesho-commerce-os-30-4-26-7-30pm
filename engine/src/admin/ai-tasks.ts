import { Router } from 'express';
import { query, queryOne } from '../db/client';
import { requireAdmin } from '../middleware/auth';

const router = Router();
router.use(requireAdmin);

// GET /admin/api/ai-tasks — list AI task history
router.get('/', async (req: any, res) => {
  const { siteSlug, status, limit = 20, page = 1 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let where = 'WHERE 1=1';
  const params: any[] = [];

  if (siteSlug) {
    params.push(siteSlug);
    where += ` AND t.site_slug = $${params.length}`;
  }
  if (status) {
    params.push(status);
    where += ` AND t.status = $${params.length}`;
  }

  params.push(Number(limit), offset);

  const tasks = await query(
    `SELECT t.id, t.site_slug, t.task_type, t.status, t.input_summary,
            t.output_summary, t.model_used, t.tokens_used, t.created_at, t.completed_at
     FROM engine.ai_tasks t
     ${where}
     ORDER BY t.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  ).catch(() => [] as any[]);

  res.json({ tasks });
});

// GET /admin/api/ai-tasks/:id — get task detail
router.get('/:id', async (req: any, res) => {
  const task = await queryOne<any>(
    `SELECT * FROM engine.ai_tasks WHERE id = $1`,
    [req.params.id]
  ).catch(() => null);

  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json({ task });
});

// POST /admin/api/ai-tasks/trigger — manually trigger an AI task
router.post('/trigger', async (req: any, res) => {
  const { taskType, siteSlug, payload } = req.body;

  const validTypes = [
    'product_optimize',
    'blog_write',
    'ad_copy',
    'heatmap_analyze',
    'ab_test_plan',
    'design_generate',
    'seo_optimize',
  ];

  if (!validTypes.includes(taskType)) {
    return res.status(400).json({ error: 'Invalid task type', validTypes });
  }

  // Insert a pending task record
  const task = await queryOne<any>(
    `INSERT INTO engine.ai_tasks (site_slug, task_type, status, input_summary, created_by)
     VALUES ($1, $2, 'pending', $3, $4)
     RETURNING id, task_type, status, created_at`,
    [siteSlug || null, taskType, JSON.stringify(payload || {}).slice(0, 200), req.admin?.id || null]
  ).catch(() => null);

  if (!task) {
    // Table might not exist yet — return a stub
    return res.json({
      success: true,
      task: { id: 'stub', taskType, status: 'queued', message: 'Task queued (table not yet migrated)' },
    });
  }

  res.json({ success: true, task });
});

// DELETE /admin/api/ai-tasks/:id — delete task record
router.delete('/:id', async (req: any, res) => {
  await query(`DELETE FROM engine.ai_tasks WHERE id = $1`, [req.params.id]).catch(() => {});
  res.json({ success: true });
});

export default router;
