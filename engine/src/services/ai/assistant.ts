/**
 * AI Assistant Service
 * Powers the chat assistant embedded in Super Admin + Site Admin panels
 * Enforces whitelist of allowed actions and data masking
 */

import { ai, ChatMessage } from './openrouter';
import { validateAiAction, maskSecretsForAI } from '../../middleware/security';
import { query, queryOne } from '../../db/client';
import { auditLog } from '../audit';
import { logger } from '../../utils/logger';

export interface AssistantContext {
  adminId: string;
  adminRole: string;
  siteId?: string;
  siteSchema?: string;
  siteName?: string;
}

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

// System prompt for the AI assistant
const SYSTEM_PROMPT = `You are a smart, proactive e-commerce assistant for Meesho Commerce OS — a multi-site kurti dropshipping platform powered by Meesho + Razorpay.

You have access to site data and can execute a WHITELIST of approved actions. You are helpful, concise, and business-focused.

## What you CAN do:
- View revenue stats, orders, product performance
- Run SEO audits and apply meta tag fixes
- Generate and deploy landing pages
- Create/manage coupon codes and flash sales
- Optimise product titles, descriptions, meta tags
- Generate Hindi and English blog posts
- Generate Google Ads and Meta Ads copy
- Update tracking tags (GTM, Pixel, Hotjar)
- Analyse heatmap data and suggest redesigns
- Trigger WhatsApp broadcast campaigns
- Generate weekly/monthly reports
- Bulk update product prices
- Import products from Meesho HTML

## What you CANNOT do:
- Access, show, or modify secret API keys (they appear as [HIDDEN])
- Modify engine source code or database schema
- Create or delete admin accounts
- Access other sites' data (unless you are Super Admin)
- Disable security features or 2FA
- Bulk export customer PII
- Access server SSH or system files

## For irreversible actions (delete, publish, broadcast), ALWAYS confirm with the user before executing.

Respond in the same language the user writes in. Be direct and useful.`;

export async function runAssistant(
  userMessage: string,
  history: AssistantMessage[],
  context: AssistantContext
): Promise<{ reply: string; actions?: any[] }> {
  // Build context string
  let contextStr = `\n\n## Current Context\n`;
  contextStr += `Role: ${context.adminRole}\n`;
  if (context.siteName) contextStr += `Current site: ${context.siteName}\n`;

  // Fetch relevant data based on the message intent
  const relevantData = await fetchRelevantData(userMessage, context);
  if (relevantData) {
    contextStr += `\n## Live Data\n${JSON.stringify(maskSecretsForAI(relevantData), null, 2)}\n`;
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT + contextStr },
    ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user', content: userMessage },
  ];

  const { content, inputTokens, outputTokens } = await ai.assistant(messages);

  // Log AI action
  await query(
    `INSERT INTO engine.ai_task_log (site_id, task_type, model, status, input_tokens, output_tokens, result_summary)
     VALUES ($1, 'assistant_chat', 'assistant', 'completed', $2, $3, $4)`,
    [context.siteId || null, inputTokens, outputTokens, content.substring(0, 200)]
  ).catch(() => {});

  auditLog({
    actorType: 'ai_assistant',
    actorName: 'AI Assistant',
    siteId: context.siteId,
    action: 'assistant.chat',
    details: { messagePreview: userMessage.substring(0, 100) },
  });

  return { reply: content };
}

async function fetchRelevantData(message: string, context: AssistantContext): Promise<any> {
  const msg = message.toLowerCase();
  const s = context.siteSchema;

  try {
    // Revenue / orders query
    if (msg.includes('revenue') || msg.includes('orders') || msg.includes('sales')) {
      if (context.adminRole === 'super_admin') {
        const sites = await query(`SELECT slug, name, schema_name FROM engine.sites WHERE status = 'active'`);
        const siteStats = [];
        for (const site of sites) {
          const stats = await queryOne(
            `SELECT COUNT(*) as order_count, COALESCE(SUM(total), 0) as revenue
             FROM ${site.schema_name}.orders
             WHERE payment_status = 'paid' AND created_at >= NOW() - INTERVAL '7 days'`
          );
          siteStats.push({ site: site.name, ...stats });
        }
        return { weekly_site_stats: siteStats };
      } else if (s) {
        return await queryOne(
          `SELECT COUNT(*) as orders_today, COALESCE(SUM(total),0) as revenue_today,
                  COUNT(*) FILTER (WHERE status = 'pending_fulfillment') as pending_fulfillment
           FROM ${s}.orders WHERE created_at >= CURRENT_DATE`
        );
      }
    }

    // Products query
    if (msg.includes('product') || msg.includes('inventory')) {
      if (s) {
        return await query(`SELECT title, selling_price, views, cart_adds, purchases FROM ${s}.products WHERE status = 'active' ORDER BY purchases DESC LIMIT 10`);
      }
    }

    // SEO query
    if (msg.includes('seo') || msg.includes('meta') || msg.includes('audit')) {
      if (s) {
        const missingMeta = await queryOne<{ count: string }>(
          `SELECT COUNT(*) as count FROM ${s}.products WHERE (meta_title IS NULL OR meta_description IS NULL) AND status = 'active'`
        );
        return { products_missing_meta: missingMeta?.count };
      }
    }
  } catch (err) {
    logger.error('Assistant data fetch error', { error: err });
  }

  return null;
}
