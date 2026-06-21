import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import NWBusLogo from '../components/shared/NWBusLogo'

export default function LoginPage() {
  const { t, i18n } = useTranslation()
  const { signIn, profile } = useAuth()
  const navigate = useNavigate()
  const isAr = i18n.language === 'ar'

  const [username,  setUsername]  = useState('')
  const [password,  setPassword]  = useState('')
  const [showPass,  setShowPass]  = useState(false)
  const [error,     setError]     = useState('')
  const [loading,   setLoading]   = useState(false)

  if (profile) { navigate('/'); return null }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(username.trim(), password)
      navigate('/')
    } catch {
      setError(isAr
        ? 'اسم المستخدم أو كلمة المرور غير صحيحة'
        : 'Invalid username or password')
    } finally {
      setLoading(false)
    }
  }

  function toggleLang() {
    const next = isAr ? 'en' : 'ar'
    i18n.changeLanguage(next)
    document.documentElement.lang = next
    document.documentElement.dir  = next === 'ar' ? 'rtl' : 'ltr'
  }

  return (
    <div className="min-h-screen flex" dir={isAr ? 'rtl' : 'ltr'}>

      {/* ── Left Panel (Brand) ──────────────────────────────── */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] shrink-0 p-10 relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #0F2444 0%, #1B3A6B 60%, #1e4d90 100%)' }}>

        {/* Decorative circles */}
        <div style={{ position:'absolute', top:-80, left:-80, width:300, height:300,
          borderRadius:'50%', background:'rgba(232,160,32,0.07)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', bottom:-120, right:-80, width:360, height:360,
          borderRadius:'50%', background:'rgba(255,255,255,0.04)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)',
          width:500, height:500, borderRadius:'50%', background:'rgba(255,255,255,0.02)', pointerEvents:'none' }} />

        {/* Logo */}
        <div className="relative z-10">
          <NWBusLogo width={180} className="brightness-0 invert" />
        </div>

        {/* Center text */}
        <div className="relative z-10">
          <h2 className="text-4xl font-extrabold text-white leading-snug mb-4">
            {isAr
              ? <>نظام إدارة<br /><span style={{ color: '#E8A020' }}>المحطات</span></>
              : <>Station<br /><span style={{ color: '#E8A020' }}>Management</span><br />System</>
            }
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {isAr
              ? 'منصة متكاملة لإدارة رحلات النقل، المبيعات، والموجودات عبر محطات نورث وست باص.'
              : 'A complete platform for managing transportation trips, sales, and lost items across NWBus stations.'
            }
          </p>
        </div>

        {/* Bottom stats */}
        <div className="relative z-10 grid grid-cols-3 gap-3">
          {[
            { num: '+148', label: isAr ? 'رحلة يومية' : 'Daily Trips' },
            { num: '+18',  label: isAr ? 'محطة رئيسية' : 'Stations' },
            { num: '24/7', label: isAr ? 'تشغيل مستمر' : 'Operations' },
          ].map(s => (
            <div key={s.num} className="text-center p-3 rounded-xl"
              style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)' }}>
              <div className="text-xl font-extrabold" style={{ color: '#E8A020' }}>{s.num}</div>
              <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right Panel (Login Form) ────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10"
        style={{ background: '#F0F4FA' }}>

        {/* Mobile logo */}
        <div className="lg:hidden mb-8">
          <NWBusLogo width={150} />
        </div>

        {/* Form card */}
        <div className="w-full max-w-sm">
          <div className="card p-8">
            <div className="mb-7">
              <h1 className="text-2xl font-extrabold mb-1" style={{ color: '#0F2444' }}>
                {isAr ? 'تسجيل الدخول' : 'Sign In'}
              </h1>
              <p className="text-sm text-gray-400">
                {isAr ? 'أدخل بيانات حسابك للمتابعة' : 'Enter your credentials to continue'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Username */}
              <div>
                <label className="block text-xs font-bold mb-1.5" style={{ color: '#374151' }}>
                  {isAr ? 'اسم المستخدم' : 'Username'}
                </label>
                <div className="relative">
                  <div className={`absolute inset-y-0 ${isAr ? 'right-3' : 'left-3'} flex items-center pointer-events-none`}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round">
                      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"/>
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    required
                    autoFocus
                    autoComplete="username"
                    placeholder={isAr ? 'أدخل اسم المستخدم' : 'Enter username'}
                    className="w-full border rounded-xl py-3 text-sm transition-all"
                    style={{
                      paddingRight: isAr ? '40px' : '14px',
                      paddingLeft:  isAr ? '14px' : '40px',
                      borderColor: '#E2E8F0',
                      background: '#FAFCFF',
                    }}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-bold mb-1.5" style={{ color: '#374151' }}>
                  {isAr ? 'كلمة المرور' : 'Password'}
                </label>
                <div className="relative">
                  <div className={`absolute inset-y-0 ${isAr ? 'right-3' : 'left-3'} flex items-center pointer-events-none`}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round">
                      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                    </svg>
                  </div>
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="w-full border rounded-xl py-3 text-sm transition-all"
                    style={{
                      paddingRight: isAr ? '40px' : '44px',
                      paddingLeft:  isAr ? '44px' : '40px',
                      borderColor: '#E2E8F0',
                      background: '#FAFCFF',
                    }}
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    className={`absolute inset-y-0 ${isAr ? 'left-3' : 'right-3'} flex items-center text-gray-400 hover:text-gray-600 transition-colors`}>
                    {showPass
                      ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
                  style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                  </svg>
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-60"
                style={{
                  background: loading ? '#94a3b8' : 'linear-gradient(135deg, #1B3A6B, #2a5298)',
                  boxShadow: loading ? 'none' : '0 6px 20px rgba(27,58,107,0.35)',
                }}>
                {loading
                  ? <span className="flex items-center justify-center gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" className="animate-spin">
                        <path d="M21 12a9 9 0 11-6.219-8.56"/>
                      </svg>
                      {isAr ? 'جارٍ الدخول...' : 'Signing in...'}
                    </span>
                  : (isAr ? 'تسجيل الدخول' : 'Sign In')
                }
              </button>
            </form>
          </div>

          {/* Language + copyright */}
          <div className="mt-6 flex items-center justify-between px-1">
            <button onClick={toggleLang}
              className="text-xs font-medium flex items-center gap-1.5 transition-colors hover:underline"
              style={{ color: '#64748b' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20"/>
              </svg>
              {isAr ? 'English' : 'عربي'}
            </button>
            <p className="text-xs" style={{ color: '#94a3b8' }}>
              © 2025 NWBus · nwbus.sa
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
