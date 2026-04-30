'use client';
import { useEffect, useState } from 'react';
import { sitesApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Plus, Globe, Upload } from 'lucide-react';

export default function SitesPage() {
  const [sites, setSites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '', slug: '', domain: '', tagline: '', primaryColor: '#db2777'
  });

  useEffect(() => {
    sitesApi.list().then(({ data }) => setSites(data.sites || [])).finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    setCreating(true);
    try {
      await sitesApi.create(form);
      toast.success(`Site ${form.name} created!`);
      const { data } = await sitesApi.list();
      setSites(data.sites || []);
      setShowCreate(false);
      setForm({ name: '', slug: '', domain: '', tagline: '', primaryColor: '#db2777' });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create site');
    } finally {
      setCreating(false);
    }
  }

  async function handleDeploy(siteSlug: string) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev: any) => {
        const base64 = ev.target.result.split(',')[1];
        try {
          await sitesApi.deploy(siteSlug, base64);
          toast.success('Frontend deployed successfully!');
        } catch (err: any) {
          toast.error(err.response?.data?.error || 'Deploy failed');
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Sites</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Site
        </button>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-lg shadow-2xl space-y-4">
            <h2 className="text-lg font-semibold">Create New Site</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Site Name', 'name', 'BlackKurti.com'],
                ['Slug', 'slug', 'blackkurti'],
                ['Domain', 'domain', 'blackkurti.com'],
                ['Tagline', 'tagline', 'Premium Kurtis'],
              ].map(([label, key, placeholder]) => (
                <div key={key}>
                  <label className="label">{label}</label>
                  <input
                    className="input"
                    placeholder={placeholder}
                    value={(form as any)[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  />
                </div>
              ))}
              <div>
                <label className="label">Primary Color</label>
                <div className="flex gap-2">
                  <input type="color" value={form.primaryColor}
                    onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))}
                    className="w-10 h-10 rounded cursor-pointer border border-slate-300" />
                  <input className="input flex-1" value={form.primaryColor}
                    onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={handleCreate} disabled={creating} className="btn-primary flex-1">
                {creating ? 'Creating…' : 'Create Site'}
              </button>
              <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Sites List */}
      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />)}</div>
      ) : sites.length === 0 ? (
        <div className="card p-12 text-center">
          <Globe className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No sites yet. Create your first store!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sites.map((site: any) => (
            <div key={site.id} className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: site.primaryColor || '#db2777' }} />
                    <h3 className="font-semibold text-slate-900 dark:text-white">{site.name}</h3>
                    <span className={`badge ${site.isActive ? 'badge-green' : 'badge-gray'}`}>
                      {site.isActive ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mt-0.5">{site.domain}</p>
                  <p className="text-xs text-slate-400">{site.tagline}</p>
                </div>
                <a href={`https://${site.domain}`} target="_blank" rel="noopener noreferrer"
                  className="text-slate-400 hover:text-brand-500 transition-colors">
                  <Globe className="w-4 h-4" />
                </a>
              </div>
              <div className="flex gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
                <button
                  onClick={() => handleDeploy(site.slug)}
                  className="btn-secondary flex items-center gap-1 text-xs py-1.5"
                >
                  <Upload className="w-3 h-3" /> Deploy Frontend
                </button>
                <a href={`/dashboard/settings?site=${site.slug}`} className="btn-secondary text-xs py-1.5">
                  Settings →
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
