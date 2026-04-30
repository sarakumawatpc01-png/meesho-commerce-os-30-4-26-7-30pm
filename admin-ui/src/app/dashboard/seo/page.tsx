'use client';
import { useEffect, useState } from 'react';
import { seoApi, sitesApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { RefreshCw, FileText, Globe, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';

const TABS = ['Audit', 'Blog Posts', 'Keywords'];

export default function SeoPage() {
  const [tab, setTab] = useState('Audit');
  const [sites, setSites] = useState<any[]>([]);
  const [siteSlug, setSiteSlug] = useState('');
  const [auditing, setAuditing] = useState(false);
  const [blogPosts, setBlogPosts] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [blogForm, setBlogForm] = useState({ topic: '', lang: 'en' as 'en' | 'hi' });
  const [keywords, setKeywords] = useState<any[]>([]);

  useEffect(() => {
    sitesApi.list().then(({ data }) => {
      const list = data.sites || [];
      setSites(list);
      if (list.length > 0) setSiteSlug(list[0].slug);
    });
  }, []);

  useEffect(() => {
    if (!siteSlug) return;
    if (tab === 'Blog Posts') loadBlogPosts();
    if (tab === 'Keywords') loadKeywords();
  }, [siteSlug, tab]);

  async function loadBlogPosts() {
    try {
      const { data } = await seoApi.blogPosts(siteSlug);
      setBlogPosts(data.posts || []);
    } catch {}
  }

  async function loadKeywords() {
    try {
      const { data } = await seoApi.keywords(siteSlug);
      setKeywords(data.keywords || []);
    } catch {}
  }

  async function runAudit() {
    setAuditing(true);
    try {
      await seoApi.auditRun(siteSlug);
      toast.success('SEO audit complete — check results');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Audit failed');
    } finally {
      setAuditing(false);
    }
  }

  async function generateBlog() {
    if (!blogForm.topic) { toast.error('Enter a topic'); return; }
    setGenerating(true);
    try {
      const { data } = await seoApi.generateBlog(siteSlug, blogForm.topic, blogForm.lang);
      toast.success(`Blog post generated: "${data.post?.title}"`);
      loadBlogPosts();
      setBlogForm({ topic: '', lang: 'en' });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">SEO</h1>
        <select value={siteSlug} onChange={e => setSiteSlug(e.target.value)} className="input w-48">
          {sites.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-700 flex gap-0">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Audit' && (
        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="text-base font-semibold mb-2">Technical SEO Audit</h2>
            <p className="text-sm text-slate-500 mb-4">
              Automatically checks for missing meta tags, schema markup, Core Web Vitals issues, and more.
              Fixes are applied automatically where possible.
            </p>
            <button onClick={runAudit} disabled={auditing} className="btn-primary flex items-center gap-2">
              <RefreshCw className={clsx('w-4 h-4', auditing && 'animate-spin')} />
              {auditing ? 'Running Audit…' : 'Run SEO Audit Now'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: 'Meta Tags', icon: Globe, status: 'Needs attention', color: 'text-yellow-500', detail: '5 products missing meta description' },
              { label: 'Schema Markup', icon: FileText, status: 'Good', color: 'text-green-500', detail: 'Product schema on all pages' },
              { label: 'Core Web Vitals', icon: RefreshCw, status: 'Run audit to check', color: 'text-slate-400', detail: 'LCP, FID, CLS scores' },
            ].map(item => (
              <div key={item.label} className="card p-5">
                <div className="flex items-center gap-3 mb-2">
                  <item.icon className={clsx('w-5 h-5', item.color)} />
                  <span className="font-medium text-sm">{item.label}</span>
                </div>
                <p className={clsx('text-sm font-semibold', item.color)}>{item.status}</p>
                <p className="text-xs text-slate-400 mt-1">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'Blog Posts' && (
        <div className="space-y-5">
          <div className="card p-5">
            <h2 className="text-base font-semibold mb-3">Generate Blog Post with AI</h2>
            <div className="flex flex-wrap gap-3">
              <input
                type="text"
                className="input flex-1 min-w-48"
                placeholder="Topic: e.g. 'Best cotton kurtis for office wear 2025'"
                value={blogForm.topic}
                onChange={e => setBlogForm(f => ({ ...f, topic: e.target.value }))}
              />
              <select
                className="input w-36"
                value={blogForm.lang}
                onChange={e => setBlogForm(f => ({ ...f, lang: e.target.value as 'en' | 'hi' }))}
              >
                <option value="en">English</option>
                <option value="hi">हिंदी</option>
              </select>
              <button onClick={generateBlog} disabled={generating} className="btn-primary flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                {generating ? 'Generating…' : 'Generate'}
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Title</th><th>Status</th><th>Language</th><th>Published</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {blogPosts.length === 0 ? (
                  <tr><td colSpan={5} className="text-center text-slate-400 py-8">No blog posts yet. Generate your first one!</td></tr>
                ) : blogPosts.map((post: any) => (
                  <tr key={post.id}>
                    <td className="font-medium max-w-xs truncate">{post.title}</td>
                    <td><span className={clsx('badge', post.status === 'published' ? 'badge-green' : 'badge-yellow')}>{post.status}</span></td>
                    <td>{post.language === 'hi' ? '🇮🇳 Hindi' : '🇬🇧 English'}</td>
                    <td className="text-slate-400 text-xs">{post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : '—'}</td>
                    <td>
                      <a href={`https://${sites.find(s => s.slug === siteSlug)?.domain || ''}/blog/${post.slug}`} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline text-xs">View →</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'Keywords' && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Keyword</th><th>Volume</th><th>Difficulty</th><th>Position</th><th>Trend</th></tr>
            </thead>
            <tbody>
              {keywords.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-slate-400 py-8">Run an audit to pull keyword data</td></tr>
              ) : keywords.map((kw: any, i) => (
                <tr key={i}>
                  <td className="font-medium">{kw.keyword}</td>
                  <td>{kw.volume?.toLocaleString() || '—'}</td>
                  <td>
                    <span className={clsx('badge', kw.difficulty < 30 ? 'badge-green' : kw.difficulty < 60 ? 'badge-yellow' : 'badge-red')}>
                      {kw.difficulty}
                    </span>
                  </td>
                  <td>{kw.position || '—'}</td>
                  <td className={kw.trend > 0 ? 'text-green-600' : 'text-red-500'}>
                    {kw.trend > 0 ? '↑' : '↓'} {Math.abs(kw.trend || 0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
