'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { authApi } from '@/lib/api';
import { setStoredUser } from '@/lib/auth';

type Step = 'credentials' | 'totp' | 'email_otp';

/* ─── Isolated OTP input: 6 individual digit boxes ─────────── */
function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  function handleKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (!value[i] && i > 0) {
        inputs.current[i - 1]?.focus();
        onChange(value.slice(0, i - 1));
      } else {
        onChange(value.slice(0, i) + value.slice(i + 1));
      }
    } else if (e.key === 'ArrowLeft' && i > 0) {
      inputs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowRight' && i < 5) {
      inputs.current[i + 1]?.focus();
    }
  }

  function handleChange(i: number, e: React.ChangeEvent<HTMLInputElement>) {
    const digit = e.target.value.replace(/\D/g, '').slice(-1);
    if (!digit) return;
    const next = value.split('');
    next[i] = digit;
    const joined = next.join('').slice(0, 6);
    onChange(joined);
    if (i < 5) inputs.current[i + 1]?.focus();
  }

  function handlePaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted) { onChange(pasted); inputs.current[Math.min(pasted.length, 5)]?.focus(); }
    e.preventDefault();
  }

  useEffect(() => { inputs.current[0]?.focus(); }, []);

  return (
    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', margin: '8px 0 4px' }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={el => { inputs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] || ''}
          onChange={e => handleChange(i, e)}
          onKeyDown={e => handleKey(i, e)}
          onPaste={handlePaste}
          style={{
            width: '44px', height: '52px',
            background: value[i] ? 'rgba(124,58,237,0.12)' : 'rgba(255,255,255,0.05)',
            border: `1.5px solid ${value[i] ? 'rgba(124,58,237,0.6)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: '10px',
            color: '#fff',
            fontSize: '20px',
            fontWeight: 700,
            textAlign: 'center',
            outline: 'none',
            transition: 'all 0.15s',
            caretColor: 'transparent',
          }}
          onFocus={e => { e.target.style.borderColor = 'rgba(124,58,237,0.8)'; e.target.style.boxShadow = '0 0 0 3px rgba(124,58,237,0.15)'; }}
          onBlur={e => { e.target.style.borderColor = value[i] ? 'rgba(124,58,237,0.6)' : 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none'; }}
        />
      ))}
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('credentials');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [creds, setCreds] = useState({ email: '', password: '' });
  const [code, setCode] = useState('');

  function triggerError(msg: string) {
    setError(msg);
    setShake(true);
    setTimeout(() => setShake(false), 600);
  }

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await authApi.login(creds.email, creds.password);
      storeAndRedirect(data);
    } catch (err: any) {
      const msg: string = err.response?.data?.error || err.message || 'Login failed';
      if (msg.toLowerCase().includes('totp')) { setStep('totp'); setError(''); }
      else triggerError(msg);
    } finally { setLoading(false); }
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length < 6) return;
    setError('');
    setLoading(true);
    try {
      const totpCode = step === 'totp' ? code : undefined;
      const emailOtp = step === 'email_otp' ? code : undefined;
      const { data } = await authApi.login(creds.email, creds.password, totpCode, emailOtp);
      storeAndRedirect(data);
    } catch (err: any) {
      triggerError(err.response?.data?.error || err.message || 'Invalid code');
      setCode('');
    } finally { setLoading(false); }
  }

  async function requestEmailOtp() {
    setError(''); setLoading(true);
    try { await authApi.login(creds.email, creds.password); }
    catch {}
    finally { setLoading(false); }
  }

  function storeAndRedirect(data: any) {
    if (data.step === 'email_otp') { setStep('email_otp'); return; }
    if (!data.accessToken) return;
    Cookies.set('admin_token', data.accessToken, { expires: 0.33 });
    if (data.refreshToken) Cookies.set('admin_refresh', data.refreshToken, { expires: 30 });
    setStoredUser(data.user || data.admin);
    router.push('/dashboard');
  }

  function goBack() { setStep('credentials'); setError(''); setCode(''); }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html,body{height:100%;font-family:'Inter',-apple-system,sans-serif}

        .lr{
          min-height:100vh;
          display:flex;align-items:center;justify-content:center;
          padding:24px;
          background:#0d0d14;
          position:relative;overflow:hidden;
        }

        /* Ambient blobs */
        .lr-blob{position:absolute;border-radius:50%;filter:blur(80px);pointer-events:none}
        .lr-blob1{width:520px;height:520px;background:rgba(109,40,217,0.18);top:-160px;right:-80px}
        .lr-blob2{width:360px;height:360px;background:rgba(219,39,119,0.12);bottom:-100px;left:-60px}
        .lr-blob3{width:240px;height:240px;background:rgba(6,182,212,0.08);top:50%;left:50%;transform:translate(-50%,-50%)}

        /* Subtle dot grid */
        .lr::before{
          content:'';position:absolute;inset:0;
          background-image:radial-gradient(rgba(255,255,255,0.04) 1px,transparent 1px);
          background-size:28px 28px;
          pointer-events:none;
        }

        .lr-wrap{width:100%;max-width:400px;position:relative;z-index:1}

        /* Brand */
        .lr-brand{text-align:center;margin-bottom:28px}
        .lr-logo{
          width:60px;height:60px;border-radius:18px;
          background:linear-gradient(145deg,#7c3aed,#db2777);
          display:inline-flex;align-items:center;justify-content:center;
          margin-bottom:14px;
          box-shadow:0 0 0 1px rgba(255,255,255,0.08),0 8px 32px rgba(124,58,237,0.45);
        }
        .lr-title{font-size:21px;font-weight:700;color:#fff;letter-spacing:-0.4px;line-height:1.2}
        .lr-subtitle{font-size:12.5px;color:rgba(255,255,255,0.38);margin-top:4px;letter-spacing:0.2px}

        /* Card */
        .lr-card{
          background:rgba(255,255,255,0.035);
          border:1px solid rgba(255,255,255,0.07);
          border-radius:22px;
          padding:32px 28px 28px;
          backdrop-filter:blur(32px);-webkit-backdrop-filter:blur(32px);
          box-shadow:0 24px 80px rgba(0,0,0,0.45),inset 0 1px 0 rgba(255,255,255,0.06);
        }
        .lr-card.shake{animation:shake 0.5s cubic-bezier(.36,.07,.19,.97)}
        @keyframes shake{
          10%,90%{transform:translateX(-2px)}
          20%,80%{transform:translateX(3px)}
          30%,50%,70%{transform:translateX(-4px)}
          40%,60%{transform:translateX(4px)}
        }

        /* Progress */
        .lr-progress{display:flex;gap:6px;margin-bottom:24px}
        .lr-seg{flex:1;height:2px;border-radius:99px;background:rgba(255,255,255,0.08);transition:background 0.4s}
        .lr-seg.on{background:linear-gradient(90deg,#7c3aed,#db2777)}

        /* Headings */
        .lr-head{font-size:16px;font-weight:600;color:#fff;margin-bottom:2px}
        .lr-desc{font-size:12.5px;color:rgba(255,255,255,0.4);margin-bottom:20px;line-height:1.55}
        .lr-desc strong{color:rgba(255,255,255,0.65);font-weight:500}

        /* Error */
        .lr-err{
          display:flex;align-items:center;gap:8px;
          background:rgba(239,68,68,0.09);
          border:1px solid rgba(239,68,68,0.22);
          border-radius:10px;padding:9px 13px;
          margin-bottom:16px;
          color:#fca5a5;font-size:12.5px;line-height:1.45;
          animation:fadeIn 0.2s ease;
        }
        @keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}

        /* Fields */
        .lr-field{margin-bottom:14px}
        .lr-label{
          display:block;font-size:11px;font-weight:500;
          color:rgba(255,255,255,0.5);margin-bottom:5px;
          letter-spacing:0.6px;text-transform:uppercase;
        }
        .lr-input-wrap{position:relative}
        .lr-input{
          width:100%;padding:10px 14px;
          background:rgba(255,255,255,0.05);
          border:1px solid rgba(255,255,255,0.09);
          border-radius:10px;color:#fff;font-size:14px;font-family:inherit;
          outline:none;transition:border-color 0.2s,background 0.2s,box-shadow 0.2s;
          -webkit-autofill:none;
        }
        .lr-input::placeholder{color:rgba(255,255,255,0.2)}
        .lr-input:focus{
          border-color:rgba(124,58,237,0.55);
          background:rgba(124,58,237,0.06);
          box-shadow:0 0 0 3px rgba(124,58,237,0.1);
        }
        .lr-input.pr{padding-right:42px}

        /* Eye toggle */
        .lr-eye{
          position:absolute;right:12px;top:50%;transform:translateY(-50%);
          background:none;border:none;cursor:pointer;
          color:rgba(255,255,255,0.3);display:flex;align-items:center;
          transition:color 0.2s;padding:2px;
        }
        .lr-eye:hover{color:rgba(255,255,255,0.65)}

        /* Buttons */
        .lr-btn{
          width:100%;padding:11px 16px;margin-top:6px;
          background:linear-gradient(135deg,#7c3aed 0%,#a855f7 50%,#db2777 100%);
          background-size:200% auto;
          color:#fff;font-size:13.5px;font-weight:600;font-family:inherit;
          border:none;border-radius:10px;cursor:pointer;
          transition:background-position 0.5s,transform 0.15s,box-shadow 0.2s,opacity 0.2s;
          box-shadow:0 4px 20px rgba(124,58,237,0.3);
          display:flex;align-items:center;justify-content:center;gap:8px;
        }
        .lr-btn:hover:not(:disabled){background-position:right center;transform:translateY(-1px);box-shadow:0 8px 28px rgba(124,58,237,0.4)}
        .lr-btn:active:not(:disabled){transform:translateY(0)}
        .lr-btn:disabled{opacity:0.45;cursor:not-allowed}

        .lr-btn-ghost{
          width:100%;padding:10px;margin-top:8px;
          background:rgba(255,255,255,0.03);
          border:1px solid rgba(255,255,255,0.07);
          border-radius:10px;color:rgba(255,255,255,0.4);
          font-size:12.5px;font-weight:500;font-family:inherit;
          cursor:pointer;transition:background 0.2s,color 0.2s;
        }
        .lr-btn-ghost:hover{background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.7)}
        .lr-btn-ghost:disabled{opacity:0.4;cursor:not-allowed}

        /* Divider between ghost buttons */
        .lr-btn-row{display:flex;gap:8px;margin-top:8px}
        .lr-btn-row .lr-btn-ghost{margin-top:0;flex:1}

        /* Spinner */
        .spin{
          width:14px;height:14px;
          border:2px solid rgba(255,255,255,0.25);
          border-top-color:#fff;border-radius:50%;
          animation:rot 0.65s linear infinite;flex-shrink:0;
        }
        @keyframes rot{to{transform:rotate(360deg)}}

        /* Footer */
        .lr-footer{
          display:flex;align-items:center;justify-content:center;gap:10px;
          margin-top:20px;
        }
        .lr-badge{
          display:flex;align-items:center;gap:4px;
          font-size:10.5px;color:rgba(255,255,255,0.2);
          letter-spacing:0.3px;
        }
        .lr-dot{width:3px;height:3px;border-radius:50%;background:rgba(255,255,255,0.15)}

        /* Step icon circle */
        .lr-step-icon{
          width:44px;height:44px;border-radius:50%;
          background:rgba(124,58,237,0.12);
          border:1px solid rgba(124,58,237,0.2);
          display:flex;align-items:center;justify-content:center;
          margin:0 auto 14px;
        }
      `}</style>

      <div className="lr">
        <div className="lr-blob lr-blob1"/>
        <div className="lr-blob lr-blob2"/>
        <div className="lr-blob lr-blob3"/>

        <div className="lr-wrap">
          {/* Brand */}
          <div className="lr-brand">
            <div className="lr-logo">
              <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
                <text x="3" y="23" fontFamily="Arial,sans-serif" fontWeight="900" fontSize="21" fill="white">M</text>
                <path d="M22 4L18 13L21 13L17 26L27 12L22 12Z" fill="#fbbf24"/>
              </svg>
            </div>
            <div className="lr-title">Meesho Commerce OS</div>
            <div className="lr-subtitle">Superadmin · Secure Login</div>
          </div>

          {/* Card */}
          <div className={`lr-card${shake ? ' shake' : ''}`}>
            {/* Progress bar */}
            <div className="lr-progress">
              <div className="lr-seg on"/>
              <div className={`lr-seg${step !== 'credentials' ? ' on' : ''}`}/>
            </div>

            {/* ── Step 1: Credentials ── */}
            {step === 'credentials' && (
              <>
                <div className="lr-head">Welcome back</div>
                <div className="lr-desc">Sign in to your admin account</div>

                {error && (
                  <div className="lr-err">
                    <svg width="13" height="13" fill="currentColor" viewBox="0 0 20 20" style={{flexShrink:0}}>
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                    </svg>
                    {error}
                  </div>
                )}

                <form onSubmit={handleCredentials} noValidate>
                  <div className="lr-field">
                    <label className="lr-label" htmlFor="sa-email">Email address</label>
                    <input
                      id="sa-email" type="email" className="lr-input"
                      placeholder="admin@agencyfic.com"
                      value={creds.email} autoComplete="username"
                      onChange={e => setCreds(c => ({ ...c, email: e.target.value }))}
                      required autoFocus
                    />
                  </div>
                  <div className="lr-field">
                    <label className="lr-label" htmlFor="sa-pass">Password</label>
                    <div className="lr-input-wrap">
                      <input
                        id="sa-pass" type={showPass ? 'text' : 'password'} className="lr-input pr"
                        placeholder="••••••••"
                        value={creds.password} autoComplete="current-password"
                        onChange={e => setCreds(c => ({ ...c, password: e.target.value }))}
                        required
                      />
                      <button type="button" className="lr-eye" aria-label={showPass ? 'Hide password' : 'Show password'}
                        onClick={() => setShowPass(v => !v)}>
                        {showPass
                          ? <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                          : <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        }
                      </button>
                    </div>
                  </div>
                  <button type="submit" className="lr-btn" disabled={loading}>
                    {loading ? <><span className="spin"/><span>Signing in…</span></> : <span>Continue →</span>}
                  </button>
                </form>
              </>
            )}

            {/* ── Step 2: TOTP ── */}
            {step === 'totp' && (
              <>
                <div className="lr-step-icon">
                  <svg width="20" height="20" fill="none" stroke="#a78bfa" strokeWidth="2" viewBox="0 0 24 24">
                    <rect x="5" y="11" width="14" height="10" rx="2" ry="2"/>
                    <path d="M12 8V5a3 3 0 016 0v6"/>
                  </svg>
                </div>
                <div className="lr-head" style={{textAlign:'center'}}>Two-factor authentication</div>
                <div className="lr-desc" style={{textAlign:'center'}}>Enter the 6-digit code from your authenticator app</div>

                {error && (
                  <div className="lr-err">
                    <svg width="13" height="13" fill="currentColor" viewBox="0 0 20 20" style={{flexShrink:0}}>
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                    </svg>
                    {error}
                  </div>
                )}

                <form onSubmit={handleCodeSubmit}>
                  <OtpInput value={code} onChange={setCode}/>
                  <button type="submit" className="lr-btn" disabled={loading || code.length < 6}
                    style={{marginTop:'18px'}}>
                    {loading ? <><span className="spin"/><span>Verifying…</span></> : <span>Verify Code →</span>}
                  </button>
                  <button type="button" className="lr-btn-ghost" onClick={goBack}>← Back to login</button>
                </form>
              </>
            )}

            {/* ── Step 2: Email OTP ── */}
            {step === 'email_otp' && (
              <>
                <div className="lr-step-icon">
                  <svg width="20" height="20" fill="none" stroke="#a78bfa" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                </div>
                <div className="lr-head" style={{textAlign:'center'}}>Check your email</div>
                <div className="lr-desc" style={{textAlign:'center'}}>
                  We sent a one-time code to<br/>
                  <strong>{creds.email}</strong>
                </div>

                {error && (
                  <div className="lr-err">
                    <svg width="13" height="13" fill="currentColor" viewBox="0 0 20 20" style={{flexShrink:0}}>
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                    </svg>
                    {error}
                  </div>
                )}

                <form onSubmit={handleCodeSubmit}>
                  <OtpInput value={code} onChange={setCode}/>
                  <button type="submit" className="lr-btn" disabled={loading || code.length < 6}
                    style={{marginTop:'18px'}}>
                    {loading ? <><span className="spin"/><span>Verifying…</span></> : <span>Verify Code →</span>}
                  </button>
                  <div className="lr-btn-row">
                    <button type="button" className="lr-btn-ghost" disabled={loading} onClick={requestEmailOtp}>Resend code</button>
                    <button type="button" className="lr-btn-ghost" onClick={goBack}>← Back</button>
                  </div>
                </form>
              </>
            )}
          </div>

          {/* Footer trust badges */}
          <div className="lr-footer">
            <div className="lr-badge">
              <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              AES-256
            </div>
            <div className="lr-dot"/>
            <div className="lr-badge">
              <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
              JWT + TOTP
            </div>
            <div className="lr-dot"/>
            <div className="lr-badge">v2.0</div>
          </div>
        </div>
      </div>
    </>
  );
}
