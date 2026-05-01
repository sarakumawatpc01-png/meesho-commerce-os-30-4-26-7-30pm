'use client';
import { useEffect, useState } from 'react';
import Cookies from 'js-cookie';
import { settingsApi, sitesApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Save, Eye, EyeOff, Plus } from 'lucide-react';

const TABS = ['General', 'Payments', 'WhatsApp', 'SEO & Analytics', 'Meesho Accounts', 'API Keys', 'Security', 'Superadmin'];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('General');
  const [sites, setSites] = useState<any[]>([]);
  const [siteSlug, setSiteSlug] = useState('');
  const [settings, setSettings] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  useEffect(() => {
    sitesApi.list().then(({ data }) => {
      const list = data.sites || [];
      setSites(list);
      if (list.length > 0) {
        setSiteSlug(list[0].slug);
      }
    });
  }, []);

  useEffect(() => {
    if (!siteSlug) return;
    settingsApi.getSite(siteSlug).then(({ data }) => setSettings(data.settings || {}));
  }, [siteSlug]);

  async function handleSave() {
    setSaving(true);
    try {
      await settingsApi.updateSite(siteSlug, settings);
      toast.success('Settings saved!');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  function updateField(key: string, value: any) {
    setSettings((prev: any) => ({ ...prev, [key]: value }));
  }

  const secretField = (label: string, key: string, placeholder = '••••••••') => (
    <div key={key}>
      <label className="label">{label}</label>
      <div className="relative">
        <input
          type={showSecrets[key] ? 'text' : 'password'}
          className="input pr-10"
          placeholder={placeholder}
          value={settings[key] || ''}
          onChange={e => updateField(key, e.target.value)}
        />
        <button
          type="button"
          onClick={() => setShowSecrets(s => ({ ...s, [key]: !s[key] }))}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          {showSecrets[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );

  const textField = (label: string, key: string, placeholder = '', type = 'text') => (
    <div key={key}>
      <label className="label">{label}</label>
      <input
        type={type}
        className="input"
        placeholder={placeholder}
        value={settings[key] || ''}
        onChange={e => updateField(key, e.target.value)}
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>
        <div className="flex items-center gap-3">
          <select value={siteSlug} onChange={e => setSiteSlug(e.target.value)} className="input w-48">
            {sites.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
          </select>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-700">
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="card p-6 space-y-5">
        {activeTab === 'General' && (
          <>
            <h2 className="text-base font-semibold">Site Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {textField('Site Name', 'name', 'BlackKurti.com')}
              {textField('Domain', 'domain', 'blackkurti.com')}
              {textField('Tagline', 'tagline', 'Premium Kurtis for Every Occasion')}
              {textField('Support Email', 'supportEmail', 'support@blackkurti.com', 'email')}
              {textField('Support Phone', 'supportPhone', '+91 9876543210')}
              {textField('WhatsApp Number', 'whatsappNumber', '919876543210')}
            </div>
            <hr className="border-slate-200 dark:border-slate-700" />
            <h2 className="text-base font-semibold">Shipping</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {textField('Free Delivery Above (₹)', 'freeDeliveryThreshold', '499', 'number')}
              {textField('Shipping Charge (₹)', 'shippingCharge', '49', 'number')}
              {textField('Prepaid Discount (₹)', 'prepaidDiscount', '30', 'number')}
              {textField('COD Charge (₹)', 'codCharge', '30', 'number')}
            </div>
          </>
        )}

        {activeTab === 'Payments' && (
          <>
            <h2 className="text-base font-semibold">Razorpay Configuration</h2>
            <div className="space-y-4">
              {textField('Razorpay Key ID', 'razorpayKeyId', 'rzp_live_...')}
              {secretField('Razorpay Key Secret', 'razorpayKeySecret')}
              {textField('Razorpay Webhook Secret', 'razorpayWebhookSecret', 'whsec_...')}
            </div>
          </>
        )}

        {activeTab === 'WhatsApp' && (
          <>
            <h2 className="text-base font-semibold">WhatsApp Business API</h2>
            <div className="space-y-4">
              {textField('WhatsApp Phone Number ID', 'whatsappPhoneId', '1234567890')}
              {secretField('WhatsApp Access Token', 'whatsappToken')}
              {textField('Message Prefix', 'whatsappPrefix', '[BlackKurti.com]')}
            </div>
          </>
        )}

        {activeTab === 'SEO & Analytics' && (
          <>
            <h2 className="text-base font-semibold">Analytics & Tracking</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {textField('Google Tag Manager ID', 'gtmId', 'GTM-XXXXXXX')}
              {textField('Meta Pixel ID', 'fbPixelId', '1234567890')}
              {textField('Hotjar Site ID', 'hotjarId', '1234567')}
              {textField('Google Analytics ID', 'gaId', 'G-XXXXXXXXXX')}
            </div>
            <hr className="border-slate-200 dark:border-slate-700" />
            <h2 className="text-base font-semibold">Meta CAPI (Server-side Events)</h2>
            <div className="space-y-4">
              {secretField('Meta Access Token', 'metaAccessToken')}
              {textField('Meta Pixel ID (CAPI)', 'metaPixelId', '1234567890')}
            </div>
          </>
        )}

        {activeTab === 'Meesho Accounts' && (
          <MeeshoAccountsTab />
        )}

        {activeTab === 'API Keys' && (
          <ApiKeysTab />
        )}

        {activeTab === 'Security' && (
          <SecurityTab />
        )}

        {activeTab === 'Superadmin' && (
          <SuperadminTab sites={sites} />
        )}
      </div>
    </div>
  );
}

function MeeshoAccountsTab() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ phone: '', password: '', name: '' });

  useEffect(() => {
    settingsApi.meeshoAccounts().then(({ data }) => setAccounts(data.accounts || []));
  }, []);

  async function handleAdd() {
    setAdding(true);
    try {
      await settingsApi.addMeeshoAccount(form);
      toast.success('Meesho account added');
      const { data } = await settingsApi.meeshoAccounts();
      setAccounts(data.accounts || []);
      setForm({ phone: '', password: '', name: '' });
    } catch {
      toast.error('Failed to add account');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold">Meesho Reseller Accounts</h2>
      <p className="text-sm text-slate-500">Add multiple Meesho accounts for order rotation. Orders are placed in round-robin.</p>
      <div className="space-y-2">
        {accounts.map((acc, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50">
            <span className="text-xs font-bold text-slate-400">#{i + 1}</span>
            <div>
              <p className="text-sm font-medium">{acc.name || acc.phone}</p>
              <p className="text-xs text-slate-400">{acc.phone} · {acc.orderCount || 0} orders</p>
            </div>
            <span className={`ml-auto badge ${acc.isActive ? 'badge-green' : 'badge-gray'}`}>
              {acc.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
        ))}
      </div>
      <div className="card p-4 space-y-3">
        <h3 className="text-sm font-semibold">Add New Account</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input className="input" placeholder="Label (e.g. Account 3)" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <input className="input" placeholder="Phone number" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          <input type="password" className="input" placeholder="Password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
        </div>
        <button onClick={handleAdd} disabled={adding} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          {adding ? 'Adding…' : 'Add Account'}
        </button>
      </div>
    </div>
  );
}

// ─── Security Tab: TOTP + Email OTP + Change Password ───────────────────────
function SecurityTab() {
  const [emailOtpEnabled, setEmailOtpEnabled] = useState(false);
  const [totpUrl, setTotpUrl] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Load current security settings
    fetch('/admin/api/auth/me', {
      headers: { Authorization: `Bearer ${Cookies.get('admin_token')}` },
    }).then(r => r.json()).then(d => {
      if (d.admin) setEmailOtpEnabled(d.admin.email_otp_enabled || false);
    }).catch(() => {});
  }, []);

  async function toggleEmailOtp() {
    const next = !emailOtpEnabled;
    setLoading(true);
    try {
      const res = await fetch('/admin/api/auth/email-otp', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Cookies.get('admin_token')}`,
        },
        body: JSON.stringify({ enabled: next }),
      });
      if (res.ok) {
        setEmailOtpEnabled(next);
        toast.success(`Email OTP ${next ? 'enabled' : 'disabled'}`);
      }
    } catch { toast.error('Failed to update setting'); }
    finally { setLoading(false); }
  }

  async function setupTotp() {
    const res = await fetch('/admin/api/auth/setup-totp', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Cookies.get('admin_token')}` },
    });
    const data = await res.json();
    setTotpUrl(data.otpAuthUrl || '');
    toast.success('Scan the QR in your authenticator app, then enter the code below');
  }

  async function verifyTotp() {
    const res = await fetch('/admin/api/auth/verify-totp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Cookies.get('admin_token')}`,
      },
      body: JSON.stringify({ code: totpCode }),
    });
    if (res.ok) { toast.success('TOTP 2FA enabled!'); setTotpUrl(''); setTotpCode(''); }
    else toast.error('Invalid code');
  }

  async function changePassword() {
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      toast.error('Passwords do not match'); return;
    }
    setLoading(true);
    try {
      const res = await fetch('/admin/api/auth/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Cookies.get('admin_token')}`,
        },
        body: JSON.stringify({
          currentPassword: pwForm.currentPassword,
          newPassword: pwForm.newPassword,
        }),
      });
      if (res.ok) { toast.success('Password updated!'); setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' }); }
      else { const d = await res.json(); toast.error(d.error || 'Failed'); }
    } finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      {/* Email OTP */}
      <div>
        <h2 className="text-base font-semibold mb-1">Email OTP (Second Factor)</h2>
        <p className="text-sm text-slate-500 mb-3">
          When enabled, you&apos;ll receive a one-time password on your email address after entering your password.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleEmailOtp}
            disabled={loading}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              emailOtpEnabled ? 'bg-brand-500' : 'bg-slate-300 dark:bg-slate-600'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              emailOtpEnabled ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {emailOtpEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      </div>

      <hr className="border-slate-200 dark:border-slate-700" />

      {/* TOTP */}
      <div>
        <h2 className="text-base font-semibold mb-1">Authenticator App (TOTP)</h2>
        <p className="text-sm text-slate-500 mb-3">
          Use Google Authenticator, Authy, or any TOTP app for the strongest protection.
        </p>
        {!totpUrl ? (
          <button onClick={setupTotp} className="btn-secondary">Setup / Reset TOTP</button>
        ) : (
          <div className="space-y-3 max-w-sm">
            <p className="text-xs text-slate-500 break-all bg-slate-50 dark:bg-slate-800 p-2 rounded">{totpUrl}</p>
            <p className="text-sm">Enter the 6-digit code from your app to activate:</p>
            <div className="flex gap-2">
              <input
                type="text" maxLength={6} placeholder="000000"
                className="input w-32 text-center text-lg tracking-widest"
                value={totpCode} onChange={e => setTotpCode(e.target.value)}
              />
              <button onClick={verifyTotp} className="btn-primary">Verify & Enable</button>
            </div>
          </div>
        )}
      </div>

      <hr className="border-slate-200 dark:border-slate-700" />

      {/* Change Password */}
      <div>
        <h2 className="text-base font-semibold mb-3">Change Password</h2>
        <div className="space-y-3 max-w-sm">
          <div>
            <label className="label">Current Password</label>
            <input type="password" className="input" value={pwForm.currentPassword}
              onChange={e => setPwForm(p => ({ ...p, currentPassword: e.target.value }))} />
          </div>
          <div>
            <label className="label">New Password</label>
            <input type="password" className="input" value={pwForm.newPassword}
              onChange={e => setPwForm(p => ({ ...p, newPassword: e.target.value }))} />
          </div>
          <div>
            <label className="label">Confirm New Password</label>
            <input type="password" className="input" value={pwForm.confirmPassword}
              onChange={e => setPwForm(p => ({ ...p, confirmPassword: e.target.value }))} />
          </div>
          <button onClick={changePassword} disabled={loading} className="btn-primary">
            {loading ? 'Updating…' : 'Update Password'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Superadmin Tab: update own email + site admin credentials ────────────────
function SuperadminTab({ sites }: { sites: any[] }) {
  const [emailForm, setEmailForm] = useState({ email: '' });
  const [siteCredForm, setSiteCredForm] = useState<Record<string, { email: string; password: string }>>({});
  const [savingSite, setSavingSite] = useState<string | null>(null);
  const [savingEmail, setSavingEmail] = useState(false);

  async function updateOwnEmail() {
    if (!emailForm.email) { toast.error('Enter a new email'); return; }
    setSavingEmail(true);
    try {
      const res = await fetch('/admin/api/auth/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Cookies.get('admin_token')}`,
        },
        body: JSON.stringify({ email: emailForm.email }),
      });
      if (res.ok) { toast.success('Email updated! Please log in again.'); }
      else { const d = await res.json(); toast.error(d.error || 'Failed'); }
    } finally { setSavingEmail(false); }
  }

  async function updateSiteCreds(slug: string) {
    const form = siteCredForm[slug];
    if (!form?.email && !form?.password) { toast.error('Enter email or password to update'); return; }
    setSavingSite(slug);
    try {
      const res = await fetch(`/admin/api/auth/site-credentials/${slug}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Cookies.get('admin_token')}`,
        },
        body: JSON.stringify({ email: form.email || undefined, password: form.password || undefined }),
      });
      if (res.ok) { toast.success(`${slug} admin credentials updated`); }
      else { const d = await res.json(); toast.error(d.error || 'Failed'); }
    } finally { setSavingSite(null); }
  }

  return (
    <div className="space-y-6">
      {/* Update own email */}
      <div>
        <h2 className="text-base font-semibold mb-1">Superadmin Login Email</h2>
        <p className="text-sm text-slate-500 mb-3">
          Current: <strong>admin@agencyfic.com</strong>. Enter a new email to update.
        </p>
        <div className="flex gap-2 max-w-sm">
          <input
            type="email"
            className="input flex-1"
            placeholder="new@agencyfic.com"
            value={emailForm.email}
            onChange={e => setEmailForm({ email: e.target.value })}
          />
          <button onClick={updateOwnEmail} disabled={savingEmail} className="btn-primary px-4">
            {savingEmail ? '…' : 'Update'}
          </button>
        </div>
      </div>

      <hr className="border-slate-200 dark:border-slate-700" />

      {/* Site admin credentials */}
      <div>
        <h2 className="text-base font-semibold mb-1">Site Admin Credentials</h2>
        <p className="text-sm text-slate-500 mb-4">
          Set the login email and password for each store&apos;s <code className="text-xs">/admin</code> panel.
          Default password is <code className="text-xs">Admin@123</code> — update each store after install.
        </p>
        <div className="space-y-4">
          {sites.map(site => {
            const form = siteCredForm[site.slug] || { email: '', password: '' };
            return (
              <div key={site.slug} className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{site.name}</span>
                  <span className="text-xs text-slate-400">{site.domain}/admin</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs">Admin Email</label>
                    <input
                      type="email"
                      className="input"
                      placeholder={`admin@${site.domain}`}
                      value={form.email}
                      onChange={e => setSiteCredForm(f => ({
                        ...f,
                        [site.slug]: { ...form, email: e.target.value },
                      }))}
                    />
                  </div>
                  <div>
                    <label className="label text-xs">New Password</label>
                    <input
                      type="password"
                      className="input"
                      placeholder="Min 8 characters"
                      value={form.password}
                      onChange={e => setSiteCredForm(f => ({
                        ...f,
                        [site.slug]: { ...form, password: e.target.value },
                      }))}
                    />
                  </div>
                </div>
                <button
                  onClick={() => updateSiteCreds(site.slug)}
                  disabled={savingSite === site.slug}
                  className="btn-secondary text-sm"
                >
                  {savingSite === site.slug ? 'Saving…' : 'Update Credentials'}
                </button>
              </div>
            );
          })}
          {sites.length === 0 && (
            <p className="text-sm text-slate-400">No sites found. Add sites from the Sites page first.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ApiKeysTab() {
  const SERVICES = [
    { key: 'openrouter', label: 'OpenRouter API Key', hint: 'sk-or-v1-...' },
    { key: 'dataforseo', label: 'DataForSEO API Key', hint: 'For keyword tracking' },
    { key: 'resend', label: 'Resend API Key', hint: 're_...' },
    { key: 'cloudflare_r2', label: 'Cloudflare R2 Secret', hint: 'For image storage' },
    { key: 'sentry_dsn', label: 'Sentry DSN', hint: 'For error tracking' },
  ];
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [show, setShow] = useState<Record<string, boolean>>({});

  async function handleSave(service: string) {
    setSaving(service);
    try {
      await settingsApi.updateApiKey(service, values[service] || '');
      toast.success('API key updated (stored encrypted)');
    } catch {
      toast.error('Failed to update key');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">API Keys</h2>
      <p className="text-sm text-slate-500">All keys are encrypted with AES-256 before storage. They are never exposed to the AI assistant.</p>
      {SERVICES.map(({ key, label, hint }) => (
        <div key={key}>
          <label className="label">{label}</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={show[key] ? 'text' : 'password'}
                className="input pr-10"
                placeholder={hint}
                value={values[key] || ''}
                onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))}
              />
              <button
                type="button"
                onClick={() => setShow(s => ({ ...s, [key]: !s[key] }))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {show[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button
              onClick={() => handleSave(key)}
              disabled={saving === key}
              className="btn-primary px-4"
            >
              {saving === key ? '…' : 'Save'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
