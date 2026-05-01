'use client';
import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { productsApi, sitesApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Search, Plus, RefreshCw, Sparkles, ExternalLink } from 'lucide-react';
import { clsx } from 'clsx';

interface Product {
  id: string;
  title: string;
  images: string[];
  basePrice: number;
  mrp: number;
  status: string;
  rating: number;
  reviewCount: number;
  meeshoUrl: string;
  slug: string;
  sizes: any[];
}

export default function ProductsPage() {
  const [siteSlug, setSiteSlug] = useState('');
  const [sites, setSites] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [optimizing, setOptimizing] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    sitesApi.list().then(({ data }) => {
      const list = data.sites || [];
      setSites(list);
      if (list.length > 0) setSiteSlug(list[0].slug);
    });
  }, []);

  const loadProducts = useCallback(async () => {
    if (!siteSlug) return;
    setLoading(true);
    try {
      const { data } = await productsApi.list(siteSlug, { search, limit: 50 });
      setProducts(data.products || []);
    } finally {
      setLoading(false);
    }
  }, [siteSlug, search]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  async function handleImport() {
    if (!importUrl || !siteSlug) return;
    setImporting(true);
    try {
      const { data } = await productsApi.import(siteSlug, importUrl);
      toast.success(`Imported: ${data.product?.title}`);
      setImportUrl('');
      setShowImport(false);
      loadProducts();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  async function handleAiOptimize(product: Product) {
    setOptimizing(product.id);
    try {
      await productsApi.aiOptimize(siteSlug, product.id);
      toast.success('AI optimization complete — product updated!');
      loadProducts();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'AI optimization failed');
    } finally {
      setOptimizing(null);
    }
  }

  async function handleStatusToggle(product: Product) {
    const newStatus = product.status === 'active' ? 'inactive' : 'active';
    try {
      await productsApi.update(siteSlug, product.id, { status: newStatus });
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, status: newStatus } : p));
      toast.success(`Product ${newStatus}`);
    } catch {
      toast.error('Failed to update status');
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Products</h1>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Site Selector */}
          <select
            value={siteSlug}
            onChange={e => setSiteSlug(e.target.value)}
            className="input w-48"
          >
            {sites.map(s => (
              <option key={s.slug} value={s.slug}>{s.name}</option>
            ))}
          </select>
          <button onClick={() => setShowImport(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Import from Meesho
          </button>
        </div>
      </div>

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-lg shadow-2xl">
            <h2 className="text-lg font-semibold mb-4">Import Product from Meesho</h2>
            <div className="space-y-4">
              <div>
                <label className="label">Meesho Product URL</label>
                <input
                  type="url"
                  className="input"
                  placeholder="https://meesho.com/..."
                  value={importUrl}
                  onChange={e => setImportUrl(e.target.value)}
                  autoFocus
                />
                <p className="text-xs text-slate-400 mt-1">
                  Paste the full product URL from Meesho. All images, sizes, reviews will be imported.
                </p>
              </div>
              <div className="flex gap-3">
                <button onClick={handleImport} disabled={importing || !importUrl} className="btn-primary flex-1">
                  {importing ? 'Importing…' : 'Import Product'}
                </button>
                <button onClick={() => setShowImport(false)} className="btn-secondary">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search products…"
          className="input pl-10"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Products Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-64 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-slate-400">No products found. Import your first product from Meesho!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {products.map(product => (
            <div key={product.id} className="card overflow-hidden group">
              {/* Image */}
              <div className="relative aspect-[3/4] bg-slate-100 dark:bg-slate-700">
                {product.images?.[0] ? (
                  <Image
                    src={product.images[0]}
                    alt={product.title}
                    fill
                    sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl">👗</div>
                )}
                {/* Status Badge */}
                <div className="absolute top-2 right-2">
                  <span className={clsx('badge', product.status === 'active' ? 'badge-green' : 'badge-gray')}>
                    {product.status}
                  </span>
                </div>
              </div>

              {/* Info */}
              <div className="p-4 space-y-3">
                <div>
                  <p className="font-medium text-slate-900 dark:text-white text-sm line-clamp-2">{product.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-bold text-slate-900 dark:text-white">₹{(product.basePrice / 100).toFixed(0)}</span>
                    {product.mrp > product.basePrice && (
                      <span className="text-slate-400 line-through text-xs">₹{(product.mrp / 100).toFixed(0)}</span>
                    )}
                    {product.rating && (
                      <span className="text-xs text-yellow-600 font-medium">⭐ {product.rating} ({product.reviewCount})</span>
                    )}
                  </div>
                </div>

                {/* Sizes */}
                {product.sizes?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {product.sizes.map((s: any) => (
                      <span
                        key={s.name}
                        className={clsx(
                          'text-xs px-2 py-0.5 rounded border font-medium',
                          s.available
                            ? 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300'
                            : 'border-slate-100 text-slate-300 dark:border-slate-700 dark:text-slate-600 line-through'
                        )}
                      >
                        {s.name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAiOptimize(product)}
                    disabled={optimizing === product.id}
                    className="btn-secondary flex-1 flex items-center justify-center gap-1 text-xs py-1.5"
                  >
                    <Sparkles className="w-3 h-3" />
                    {optimizing === product.id ? 'Optimizing…' : 'AI Optimize'}
                  </button>
                  <button
                    onClick={() => handleStatusToggle(product)}
                    className={clsx('text-xs px-3 py-1.5 rounded-lg font-medium transition-colors', product.status === 'active' ? 'btn-danger' : 'btn-secondary')}
                  >
                    {product.status === 'active' ? 'Deactivate' : 'Activate'}
                  </button>
                  {product.meeshoUrl && (
                    <a
                      href={product.meeshoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
