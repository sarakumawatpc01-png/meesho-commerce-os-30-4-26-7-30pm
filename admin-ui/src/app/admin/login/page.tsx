'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function SiteAdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/admin/api/auth/site-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');

      localStorage.setItem('site_admin_token', data.accessToken);
      if (data.refreshToken) localStorage.setItem('site_admin_refresh', data.refreshToken);
      localStorage.setItem('site_admin_info', JSON.stringify(data.admin));
      router.push('/admin/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
        .sa-root {
          min-height: 100vh;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          position: relative;
          overflow: hidden;
        }
        .sa-root::before {
          content: '';
          position: absolute;
          width: 500px; height: 500px;
          background: radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%);
          top: -100px; left: 50%;
          transform: translateX(-50%);
          border-radius: 50%;
        }
        .sa-root::after {
          content: '';
          position: absolute;
          width: 300px; height: 300px;
          background: radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%);
          bottom: -50px; right: 0;
          border-radius: 50%;
        }
        .sa-wrap {
          width: 100%; max-width: 400px;
          position: relative; z-index: 1;
        }
        .sa-brand {
          text-align: center;
          margin-bottom: 28px;
        }
        .sa-icon {
          width: 56px; height: 56px;
          background: linear-gradient(135deg, #6366f1, #06b6d4);
          border-radius: 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 14px;
          box-shadow: 0 8px 24px rgba(99,102,241,0.4);
        }
        .sa-title {
          font-size: 20px;
          font-weight: 700;
          color: #fff;
          letter-spacing: -0.3px;
        }
        .sa-sub {
          font-size: 13px;
          color: rgba(255,255,255,0.4);
          margin-top: 4px;
        }
        .sa-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 20px;
          padding: 32px 28px;
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          box-shadow: 0 20px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05);
        }
        .sa-heading {
          font-size: 16px;
          font-weight: 600;
          color: #fff;
          margin-bottom: 2px;
        }
        .sa-hint {
          font-size: 12px;
          color: rgba(255,255,255,0.4);
          margin-bottom: 22px;
        }
        .sa-field { margin-bottom: 14px; }
        .sa-field label {
          display: block;
          font-size: 11px;
          font-weight: 500;
          color: rgba(255,255,255,0.5);
          margin-bottom: 5px;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }
        .sa-input-wrap { position: relative; }
        .sa-input {
          width: 100%;
          padding: 10px 13px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 9px;
          color: #fff;
          font-size: 14px;
          font-family: inherit;
          outline: none;
          transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
        }
        .sa-input::placeholder { color: rgba(255,255,255,0.2); }
        .sa-input:focus {
          border-color: rgba(99,102,241,0.55);
          background: rgba(99,102,241,0.05);
          box-shadow: 0 0 0 3px rgba(99,102,241,0.1);
        }
        .sa-input.pe { padding-right: 40px; }
        .sa-eye {
          position: absolute;
          right: 11px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          color: rgba(255,255,255,0.3);
          display: flex;
          align-items: center;
          transition: color 0.2s;
        }
        .sa-eye:hover { color: rgba(255,255,255,0.65); }
        .sa-error {
          display: flex;
          align-items: center;
          gap: 7px;
          background: rgba(239,68,68,0.08);
          border: 1px solid rgba(239,68,68,0.2);
          border-radius: 9px;
          padding: 9px 13px;
          margin-bottom: 14px;
          color: #fca5a5;
          font-size: 13px;
        }
        .sa-btn {
          width: 100%;
          padding: 11px;
          background: linear-gradient(135deg, #6366f1, #06b6d4);
          background-size: 200% auto;
          color: #fff;
          font-size: 14px;
          font-weight: 600;
          font-family: inherit;
          border: none;
          border-radius: 9px;
          cursor: pointer;
          transition: background-position 0.4s, transform 0.15s, box-shadow 0.2s, opacity 0.2s;
          box-shadow: 0 4px 16px rgba(99,102,241,0.3);
          margin-top: 4px;
        }
        .sa-btn:hover:not(:disabled) {
          background-position: right center;
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(99,102,241,0.4);
        }
        .sa-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .sa-footer {
          margin-top: 20px;
          text-align: center;
          font-size: 12px;
          color: rgba(255,255,255,0.25);
        }
        .sa-footer a {
          color: rgba(99,102,241,0.7);
          text-decoration: none;
          transition: color 0.2s;
        }
        .sa-footer a:hover { color: rgba(99,102,241,1); }
        .spinner {
          display: inline-block;
          width: 13px; height: 13px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          vertical-align: middle;
          margin-right: 6px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div className="sa-root">
        <div className="sa-wrap">
          <div className="sa-brand">
            <div className="sa-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
            </div>
            <div className="sa-title">Store Admin</div>
            <div className="sa-sub">Sign in to manage your store</div>
          </div>

          <div className="sa-card">
            <div className="sa-heading">Welcome back</div>
            <div className="sa-hint">Enter your credentials to continue</div>

            {error && (
              <div className="sa-error">
                <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10A8 8 0 11 2 10a8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                </svg>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="sa-field">
                <label>Email address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@yourstore.com"
                  className="sa-input"
                  autoFocus
                />
              </div>

              <div className="sa-field">
                <label>Password</label>
                <div className="sa-input-wrap">
                  <input
                    type={showPass ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="sa-input pe"
                  />
                  <button type="button" className="sa-eye" onClick={() => setShowPass(v => !v)}>
                    {showPass
                      ? <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
              </div>

              <button type="submit" className="sa-btn" disabled={loading}>
                {loading ? <><span className="spinner"/>Signing in…</> : 'Sign In →'}
              </button>
            </form>

            <div className="sa-footer">
              Superadmin?{' '}
              <a href={`https://${process.env.NEXT_PUBLIC_SUPERADMIN_DOMAIN || 'meesho.agencyfic.com'}`}>
                Go to main panel ↗
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
