'use client';
import { useEffect, useRef, useState } from 'react';
import { assistantApi, sitesApi } from '@/lib/api';
import { Send, Bot, User, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function AIPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Hello! I'm your AI business assistant for Meesho Commerce OS. I can help you with:

• **Revenue & Orders** — "Show me today's revenue" or "Which site is performing best?"
• **SEO** — "Run an SEO audit for BlackKurti.com"
• **Products** — "Which products need restocking?" or "Optimize my top product"
• **Marketing** — "Create a coupon for Diwali sale"
• **Reports** — "Give me this week's business summary"

What would you like to know?`,
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sites, setSites] = useState<any[]>([]);
  const [siteSlug, setSiteSlug] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sitesApi.list().then(({ data }) => setSites(data.sites || []));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    if (!input.trim() || sending) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg, timestamp: new Date() }]);
    setSending(true);

    try {
      const { data } = await assistantApi.chat(userMsg, siteSlug || undefined);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response || data.content || 'I could not generate a response.',
        timestamp: new Date(),
      }]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${err.response?.data?.error || 'Failed to get AI response. Please try again.'}`,
        timestamp: new Date(),
      }]);
    } finally {
      setSending(false);
    }
  }

  const suggestions = [
    "Show me today's revenue",
    "Which products need restocking?",
    "Generate a Diwali sale coupon",
    "What are my top selling products?",
    "Run SEO audit and give me quick wins",
    "How many orders are pending fulfillment?",
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Bot className="w-7 h-7 text-brand-500" />
            AI Assistant
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Powered by OpenRouter · Actions are whitelisted for security</p>
        </div>
        {sites.length > 0 && (
          <select
            value={siteSlug}
            onChange={e => setSiteSlug(e.target.value)}
            className="input w-48"
          >
            <option value="">All Sites</option>
            {sites.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
          </select>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto card p-4 space-y-4 mb-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={clsx('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}
          >
            {/* Avatar */}
            <div className={clsx(
              'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
              msg.role === 'assistant' ? 'bg-brand-100 dark:bg-brand-900/30' : 'bg-slate-200 dark:bg-slate-700'
            )}>
              {msg.role === 'assistant'
                ? <Bot className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                : <User className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              }
            </div>

            {/* Bubble */}
            <div className={clsx(
              'max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
              msg.role === 'assistant'
                ? 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                : 'bg-brand-600 text-white'
            )}>
              {/* Basic markdown: bold */}
              <div
                dangerouslySetInnerHTML={{
                  __html: msg.content
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\n/g, '<br/>')
                }}
              />
              <p className={clsx('text-xs mt-1.5', msg.role === 'assistant' ? 'text-slate-400' : 'text-brand-200')}>
                {msg.timestamp.toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-brand-600 animate-pulse" />
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3">
              <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-2 mb-3 flex-shrink-0">
          {suggestions.map(s => (
            <button
              key={s}
              onClick={() => setInput(s)}
              className="text-xs px-3 py-1.5 rounded-full border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-brand-400 hover:text-brand-600 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSend} className="flex gap-3 flex-shrink-0">
        <input
          type="text"
          className="input flex-1"
          placeholder="Ask anything about your business…"
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="btn-primary px-4 flex items-center gap-2"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Send
        </button>
      </form>
    </div>
  );
}
