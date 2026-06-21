import { useState, useEffect, useRef } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import NWBusLogo from '../shared/NWBusLogo'

// ── SVG Icon Components ──────────────────────────────────────────────
const Icon = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {Array.isArray(d) ? d.map((path, i) => <path key={i} d={path} />) : <path d={d} />}
  </svg>
)

const ICONS = {
  home:      'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  bus:       ['M8 6v6','M15 6v6','M2 12h19.6','M18 18h2l1-3H3l1 3h2','M7 18a2 2 0 100 4 2 2 0 000-4z','M17 18a2 2 0 100 4 2 2 0 000-4z','M2 6h20v12H2z'],
  bag:       ['M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z','M3 6h18'],
  sales:     ['M12 2v20','M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6'],
  report:    ['M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z','M14 2v6h6','M16 13H8','M16 17H8','M10 9H8'],
  users:     ['M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2','M23 21v-2a4 4 0 00-3-3.87','M9 3a4 4 0 010 8','M16 3.13a4 4 0 010 7.75'],
  station:   ['M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z','M12 7a3 3 0 100 6 3 3 0 000-6z'],
  logout:    ['M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4','M16 17l5-5-5-5','M21 12H9'],
  globe:     ['M12 2a10 10 0 100 20A10 10 0 0012 2z','M2 12h20','M12 2a15.3 15.3 0 010 20','M12 2a15.3 15.3 0 000 20'],
}

// ── Nav Items ─────────────────────────────────────────────────────────
const NAV = [
  { to: '/',               labelKey: 'nav_home',           iconKey: 'home',    roles: null,                                              module: null },
  { to: '/transportation', labelKey: 'nav_transportation',  iconKey: 'bus',     roles: null,                                              module: 'transportation' },
  { to: '/lost-found',     labelKey: 'nav_lost_found',      iconKey: 'bag',     roles: null,                                              module: 'lost_found' },
  { to: '/sales',          labelKey: 'nav_sales',           iconKey: 'sales',   roles: null,                                              module: 'sales' },
  { to: '/reports',        labelKey: 'nav_reports',         iconKey: 'report',  roles: ['general_admin','station_admin','accountant'],     module: 'reports' },
  { to: '/users',          labelKey: 'nav_users',           iconKey: 'users',   roles: ['general_admin','station_admin'],                  module: null },
  { to: '/stations',       labelKey: 'nav_stations',        iconKey: 'station', roles: ['general_admin'],                                 module: null },
]

// ── User Avatar ───────────────────────────────────────────────────────
function UserAvatar({ name, size = 36 }) {
  const initials = (name || 'U').split(' ').map(w => w[0]).slice(0, 2).join('')
  return (
    <div style={{ width: size, height: size }}
      className="rounded-full bg-gradient-to-br from-nwbus-secondary to-amber-400 flex items-center justify-center shrink-0 shadow-md">
      <span className="text-white font-bold" style={{ fontSize: size * 0.38 }}>{initials}</span>
    </div>
  )
}

// ── Role Labels ───────────────────────────────────────────────────────
const ROLE_LABELS = {
  general_admin:    { ar: 'أدمن عام',       en: 'General Admin' },
  station_admin:    { ar: 'مشرف المحطة',    en: 'Supervisor' },
  accountant:       { ar: 'محاسب',           en: 'Accountant' },
  station_employee: { ar: 'موظف',            en: 'Employee' },
}

export default function AppLayout() {
  const { t, i18n } = useTranslation()
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const isAr = i18n.language === 'ar'

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const mods = profile?.allowed_modules // null = all modules allowed
  const visibleNav = NAV.filter(n => {
    if (n.roles && !n.roles.includes(profile?.role)) return false
    if (n.module && mods && !mods.includes(n.module)) return false
    return true
  })

  function toggleLang() {
    const next = isAr ? 'en' : 'ar'
    i18n.changeLanguage(next)
    localStorage.setItem('nwbus_lang', next)
    document.documentElement.lang = next
    document.documentElement.dir  = next === 'ar' ? 'rtl' : 'ltr'
  }

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  // وضع السكون: بعد 3 دقائق بلا نشاط → شاشة العرض الحيّة
  const idleTimer = useRef(null)
  useEffect(() => {
    const reset = () => {
      clearTimeout(idleTimer.current)
      idleTimer.current = setTimeout(() => navigate('/board'), 3 * 60 * 1000)
    }
    const evts = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll']
    evts.forEach(e => window.addEventListener(e, reset, { passive: true }))
    reset()
    return () => { clearTimeout(idleTimer.current); evts.forEach(e => window.removeEventListener(e, reset)) }
  }, [navigate])

  const roleLabel = ROLE_LABELS[profile?.role]?.[isAr ? 'ar' : 'en'] ?? profile?.role

  return (
    <div className="flex min-h-screen" style={{ background: '#F0F4FA' }} dir={isAr ? 'rtl' : 'ltr'}>

      {/* ── Mobile Overlay ────────────────────────────────────── */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ───────────────────────────────────────────── */}
      <aside className={`fixed md:relative inset-y-0 ${isAr ? 'right-0' : 'left-0'} z-50 w-60 shrink-0 flex flex-col no-print
        transition-transform duration-300 md:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : (isAr ? 'translate-x-full md:translate-x-0' : '-translate-x-full md:translate-x-0')}`}
        style={{
          background: 'linear-gradient(180deg, #0F2444 0%, #1B3A6B 60%, #1e4080 100%)',
          boxShadow: '4px 0 24px rgba(15,36,68,0.18)',
        }}>

        {/* Logo */}
        <div className="px-4 py-4 flex items-center justify-center relative"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <button className="md:hidden absolute top-4 p-1 text-white/40 hover:text-white"
            style={{ [isAr ? 'left' : 'right']: '12px' }}
            onClick={() => setSidebarOpen(false)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <NWBusLogo width={148} className="brightness-0 invert" />
        </div>

        {/* User Card */}
        <div className="mx-3 my-3 p-3 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-3">
            <UserAvatar name={profile?.full_name_ar} />
            <div className="min-w-0 flex-1">
              <p className="text-white font-semibold text-sm truncate leading-tight">
                {profile?.full_name_ar}
              </p>
              <p className="text-xs mt-0.5 truncate"
                style={{ color: 'rgba(232,160,32,0.85)', fontWeight: 600 }}>
                {roleLabel}
              </p>
              {profile?.station && (
                <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {isAr ? profile.station.name_ar : profile.station.name_en}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Divider label */}
        <div className="px-5 mb-1">
          <span className="text-xs font-bold uppercase tracking-widest"
            style={{ color: 'rgba(255,255,255,0.25)' }}>
            {isAr ? 'القائمة' : 'Menu'}
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {visibleNav.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `sidebar-nav-item ${isActive ? 'active' : ''}`
              }
            >
              <Icon d={ICONS[item.iconKey]} size={17} />
              <span>{t(item.labelKey)}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom */}
        <div className="px-3 py-4 space-y-1"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button onClick={() => navigate('/board')}
            className="sidebar-nav-item w-full"
            style={{ color: 'rgba(198,161,74,0.9)' }}>
            <Icon d={ICONS.bus} size={16} />
            <span className="text-xs">{isAr ? '📺 شاشة العرض' : 'Live Board'}</span>
          </button>
          <button onClick={toggleLang}
            className="sidebar-nav-item w-full"
            style={{ color: 'rgba(255,255,255,0.5)' }}>
            <Icon d={ICONS.globe} size={16} />
            <span className="text-xs">{isAr ? 'English' : 'عربي'}</span>
          </button>
          <button onClick={handleLogout}
            className="sidebar-nav-item w-full"
            style={{ color: 'rgba(239,68,68,0.7)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <Icon d={ICONS.logout} size={16} />
            <span className="text-xs">{t('logout')}</span>
          </button>
        </div>
      </aside>

      {/* ── Main Area ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 md:ms-0">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 no-print"
          style={{ background: 'linear-gradient(90deg, #0F2444, #1B3A6B)', boxShadow: '0 2px 12px rgba(15,36,68,0.2)' }}>
          <button onClick={() => setSidebarOpen(true)}
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.1)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <NWBusLogo width={90} className="brightness-0 invert" />
          <UserAvatar name={profile?.full_name_ar} size={32} />
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
