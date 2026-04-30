/**
 * OpenRouter AI Client
 * Model-agnostic gateway — swap models anytime in Admin → Settings → AI Models
 */

import axios from 'axios';
import { logger } from '../../utils/logger';
import { query } from '../../db/client';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export async function chat(
  messages: ChatMessage[],
  options: OpenRouterOptions = {}
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not configured');

  const model = options.model || process.env.AI_MODEL_ASSISTANT || 'google/gemini-2.0-flash';

  try {
    const response = await axios.post(
      `${OPENROUTER_BASE}/chat/completions`,
      {
        model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2000,
        stream: false,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://meeshoengine.com',
          'X-Title': 'Meesho Commerce OS',
        },
      }
    );

    const choice = response.data.choices?.[0];
    const usage = response.data.usage;

    return {
      content: choice?.message?.content || '',
      inputTokens: usage?.prompt_tokens || 0,
      outputTokens: usage?.completion_tokens || 0,
    };
  } catch (err: any) {
    logger.error('OpenRouter API error', { model, error: err.response?.data || err.message });
    throw new Error(`AI request failed: ${err.message}`);
  }
}

// Convenience wrappers for different task types
export const ai = {
  seo: (messages: ChatMessage[]) =>
    chat(messages, { model: process.env.AI_MODEL_SEO || 'google/gemini-flash-1.5' }),

  product: (messages: ChatMessage[]) =>
    chat(messages, { model: process.env.AI_MODEL_PRODUCT || 'anthropic/claude-3.5-sonnet' }),

  blog: (messages: ChatMessage[]) =>
    chat(messages, { model: process.env.AI_MODEL_BLOG || 'mistralai/mistral-nemo', maxTokens: 4000 }),

  adCopy: (messages: ChatMessage[]) =>
    chat(messages, { model: process.env.AI_MODEL_AD_COPY || 'openai/gpt-4o-mini' }),

  assistant: (messages: ChatMessage[]) =>
    chat(messages, { model: process.env.AI_MODEL_ASSISTANT || 'google/gemini-2.0-flash' }),

  hindi: (messages: ChatMessage[]) =>
    chat(messages, { model: process.env.AI_MODEL_HINDI || 'google/gemini-flash-1.5', maxTokens: 4000 }),
};
