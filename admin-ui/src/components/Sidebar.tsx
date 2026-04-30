'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import {
  LayoutDashboard, ShoppingCart, Package, Users, BarChart2,
  Search, Megaphone, MessageCircle, Settings, Bot, Store,
  ChevronDown, LogOut, Flame
} from 'lucide-react';
import { useState } from 'react';
import { logout, getStoredUser } from '@/lib/auth';

const navItems = [
  { href: '/dashboard',            label: 'Dashboard',   icon: LayoutDashboard },
  { href: '/dashboard/orders',     label: 'Orders',      icon: ShoppingCart,  badge: 'queue' },
  { href: '/dashboard/products',   label: 'Products',    icon: Package },
  { href: '/dashboard/customers',  label: 'Customers',   icon: Users },
  { href: '/dashboard/analytics',  label: 'Analytics',   icon: BarChart2 },
  { href: '/dashboard/seo',        label: 'SEO',         icon: Search },
  { href: '/dashboard/marketing',  label: 'Marketing',   icon: Megaphone },
  { href: '/dashboard/whatsapp',   label: 'WhatsApp',    icon: MessageCircle },
  { href: '/dashboard/ai',         label: 'AI Assistant',icon: Bot },
  { href: '/dashboard/sites',      label: 'Sites',       icon: Store, superAdminOnly: true },
  { href: '/dashboard/settings',   label: 'Settings',    icon: Settings },
];

interface SidebarProps {
  siteSlug: string;
  onSiteChange: (slug: string) => void;
  sites: { slug: string; name: string }[];
}

export default function Sidebar({ siteSlug, onSiteChange, sites }: SidebarProps) {
  const pathname = usePathname();
  const user = getStoredUser();
  const [siteOpen, setSiteOpen] = useState(false);

  const currentSite = sites.find(s => s.slug === siteSlug);

  return (
    <aside className="w-64 min-h-screen bg-slate-900 flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center flex-shrink-0">
            <Flame className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">Commerce OS</p>
            <p className="text-slate-400 text-xs">{user?.role === 'super_admin' ? 'Super Admin' : 'Site Admin'}</p>
          </div>
        </div>
      </div>

      {/* Site Selector */}
      {sites.length > 0 && (
        <div className="px-3 py-3 border-b border-slate-700/50">
          <div className="relative">
            <button
              onClick={() => setSiteOpen(o => !o)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors text-sm"
            >
              <span className="text-slate-200 truncate">{currentSite?.name || 'All Sites'}</span>
              <ChevronDown className={clsx('w-4 h-4 text-slate-400 transition-transform', siteOpen && 'rotate-180')} />
            </button>
            {siteOpen && (
              <div className="absolute top-full mt-1 left-0 right-0 bg-slate-800 rounded-lg border border-slate-700 shadow-xl z-50 overflow-hidden">
                {user?.role === 'super_admin' && (
                  <button
                    className="w-full px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 transition-colors"
                    onClick={() => { onSiteChange(''); setSiteOpen(false); }}
                  >
                    All Sites
                  </button>
                )}
                {sites.map(site => (
                  <button
                    key={site.slug}
                    className={clsx(
                      'w-full px-3 py-2 text-left text-sm hover:bg-slate-700 transition-colors',
                      site.slug === siteSlug ? 'text-brand-400 bg-slate-700' : 'text-slate-300'
                    )}
                    onClick={() => { onSiteChange(site.slug); setSiteOpen(false); }}
                  >
                    {site.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems
          .filter(item => !item.superAdminOnly || user?.role === 'super_admin')
          .map(item => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </Link>
            );
          })}
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t border-slate-700/50">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">{user?.name?.[0]?.toUpperCase() || 'A'}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-slate-200 text-sm font-medium truncate">{user?.name || 'Admin'}</p>
            <p className="text-slate-400 text-xs truncate">{user?.email}</p>
          </div>
          <button onClick={logout} className="text-slate-400 hover:text-red-400 transition-colors" title="Logout">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
