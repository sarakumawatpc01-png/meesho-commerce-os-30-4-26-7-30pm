'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import Sidebar from '@/components/Sidebar';
import { sitesApi } from '@/lib/api';
import { getStoredUser } from '@/lib/auth';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [sites, setSites] = useState<{ slug: string; name: string }[]>([]);
  const [siteSlug, setSiteSlug] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }
    const user = getStoredUser();
    // Load sites
    sitesApi.list().then(({ data }) => {
      const siteList = (data.sites || []).map((s: any) => ({ slug: s.slug, name: s.name }));
      setSites(siteList);
      // Default to user's assigned site or first site
      if (user?.siteSlug) {
        setSiteSlug(user.siteSlug);
      } else if (siteList.length > 0 && user?.role !== 'super_admin') {
        setSiteSlug(siteList[0].slug);
      }
      setReady(true);
    }).catch(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Loading Commerce OS…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar siteSlug={siteSlug} onSiteChange={setSiteSlug} sites={sites} />
      <main className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-900">
        {/* Pass siteSlug to children via context would be ideal; for simplicity use URL params */}
        <div className="max-w-7xl mx-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
