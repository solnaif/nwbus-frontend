import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { todayStr as localToday } from '../utils/dates'

// ── Helpers ────────────────────────────────────────────────────────────
const fmt  = n => Number(n ?? 0).toLocaleString('ar-SA', { minimumFractionDigits: 0 })
const fmtC = n => Number(n ?? 0).toLocaleString('ar-SA', { minimumFractionDigits: 2 })

function ProgressRing({ pct, color, size = 64 }) {
  const r = (size / 2) - 6
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="5" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color}
        strokeWidth="5" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1)' }} />
    </svg>
  )
}

function StatCard({ iconSvg, label, value, sub, gradient, shadow, to }) {
  const navigate = useNavigate()
  return (
    <button onClick={() => navigate(to)}
      className="stat-card text-start w-full"
      style={{ background: gradient, boxShadow: shadow, color: '#fff' }}>
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.18)' }}>
          {iconSvg}
        </div>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke="rgba(255,255,255,0.45)" strokeWidth="2.5" strokeLinecap="round">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </div>
      <div className="text-2xl font-extrabold tracking-tight mb-0.5">{value}</div>
      <div className="text-sm" style={{ color: 'rgba(255,255,255,0.72)' }}>{label}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>{sub}</div>}
    </button>
  )
}

function LinearProgress({ label, value, total, color = '#1B3A6B' }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="mb-4 last:mb-0">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-sm text-gray-600">{label}</span>
        <span className="text-xs font-bold" style={{ color }}>
          {value} / {total} <span className="opacity-60">({pct}%)</span>
        </span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

function InfoCard({ title, children, className = '' }) {
  return (
    <div className={`card p-5 ${className}`}>
      <h3 className="text-sm font-bold mb-4" style={{ color: '#1B3A6B' }}>{title}</h3>
      {children}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="skeleton h-36 rounded-2xl" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-40 rounded-2xl" />)}
      </div>
    </div>
  )
}

// ── SVG Icons ──────────────────────────────────────────────────────────
const BusIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
    <rect x="2" y="6" width="20" height="12" rx="2"/>
    <path d="M8 6V4M16 6V4M2 12h20M7 18a2 2 0 100 4 2 2 0 000-4zM17 18a2 2 0 100 4 2 2 0 000-4z"/>
  </svg>
)
const CheckIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)
const UsersIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
  </svg>
)
const BagIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
    <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0"/>
  </svg>
)

const ROLE_AR = {
  general_admin:    'مدير عام',
  station_admin:    'مدير محطة',
  accountant:       'محاسب',
  station_employee: 'موظف محطة',
}

export default function DashboardPage() {
  const { profile, isEmployee } = useAuth()
  const { i18n } = useTranslation()
  const navigate = useNavigate()
  const isAr = i18n.language === 'ar'

  const todayStr = localToday()
  const [stats,   setStats]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [tripsRes, schedRes, salesRes, lostRes] = await Promise.all([
        supabase.from('trip_records')
          .select('id, departure_accuracy, is_cancelled, is_extra_trip, operational_status, passenger_count')
          .eq('record_date', todayStr),
        supabase.from('trip_schedule').select('id').eq('is_active', true),
        supabase.from('sales_records')
          .select('total_actual, total_expected, is_confirmed')
          .eq('sale_date', todayStr),
        supabase.from('lost_found_items').select('id').eq('status', 'unclaimed'),
      ])
      const trips = tripsRes.data ?? []
      const sched = schedRes.data ?? []
      const sales = salesRes.data ?? []
      const lost  = lostRes.data  ?? []
      setStats({
        trips: {
          scheduled: sched.length,
          entered:   trips.length,
          onTime:    trips.filter(t => t.departure_accuracy === 'On Time').length,
          delayed:   trips.filter(t => t.departure_accuracy === 'Delayed').length,
          cancelled: trips.filter(t => t.is_cancelled).length,
          extra:     trips.filter(t => t.is_extra_trip).length,
          totalPax:  trips.reduce((s, t) => s + (t.passenger_count ?? 0), 0),
        },
        sales: {
          totalRevenue:  sales.reduce((s, r) => s + Number(r.total_actual ?? 0), 0),
          totalExpected: sales.reduce((s, r) => s + Number(r.total_expected ?? 0), 0),
          confirmed: sales.filter(r => r.is_confirmed).length,
          total:     sales.length,
        },
        lostUnclaimed: lost.length,
      })
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <DashboardSkeleton />

  const onTimeRate = stats.trips.entered > 0
    ? Math.round((stats.trips.onTime / stats.trips.entered) * 100) : 0
  const entryRate = stats.trips.scheduled > 0
    ? Math.round((stats.trips.entered / stats.trips.scheduled) * 100) : 0

  const now = new Date()
  const h = now.getHours()
  const greeting = isAr
    ? (h < 12 ? 'صباح الخير' : h < 17 ? 'مساء الخير' : 'مساء النور')
    : (h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening')
  const dateLabel = now.toLocaleDateString(isAr ? 'ar-SA' : 'en-SA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">

      {/* ── Hero Banner ───────────────────────────────────────── */}
      <div className="rounded-2xl p-6 mb-5 relative overflow-hidden fade-in-up"
        style={{
          background: 'linear-gradient(135deg, #0F2444 0%, #1B3A6B 55%, #1e4d90 100%)',
          boxShadow: '0 12px 40px rgba(15,36,68,0.3)',
        }}>

        {/* Decorative circles */}
        <div style={{ position:'absolute', top:-50, right: isAr?'auto':-50, left: isAr?-50:'auto',
          width:200, height:200, borderRadius:'50%', background:'rgba(232,160,32,0.07)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', bottom:-70, right: isAr?-70:'auto', left: isAr?'auto':-70,
          width:250, height:250, borderRadius:'50%', background:'rgba(255,255,255,0.04)', pointerEvents:'none' }} />

        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium mb-1" style={{ color: 'rgba(232,160,32,0.8)' }}>
              {dateLabel}
            </p>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white mb-2">
              {greeting}،{' '}
              <span style={{ color: '#E8A020' }}>
                {profile?.full_name_ar?.split(' ')[0]}
              </span>{' '}
              <span className="text-2xl">👋</span>
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold"
                style={{ background: 'rgba(232,160,32,0.15)', color: '#E8A020', border: '1px solid rgba(232,160,32,0.3)' }}>
                {isAr ? ROLE_AR[profile?.role] : profile?.role}
              </span>
              {profile?.station && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs"
                  style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0zM12 7a3 3 0 100 6 3 3 0 000-6z"/>
                  </svg>
                  {isAr ? profile.station.name_ar : profile.station.name_en}
                </span>
              )}
            </div>
          </div>

          {/* Entry rate ring */}
          <div className="flex flex-col items-center p-4 rounded-2xl"
            style={{ background: 'rgba(255,255,255,0.07)', minWidth: 110, backdropFilter: 'blur(8px)' }}>
            <div className="relative" style={{ width: 64, height: 64 }}>
              <ProgressRing pct={entryRate} color="#E8A020" size={64} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-extrabold text-white">{entryRate}%</span>
              </div>
            </div>
            <p className="text-xs mt-2 text-center" style={{ color: 'rgba(255,255,255,0.5)' }}>
              {isAr ? 'إدخال\nالرحلات' : 'Trip Entry'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Stat Cards ───────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: '#94a3b8' }}>
          {isAr ? 'إحصائيات اليوم' : "Today's Stats"}
        </h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatCard
          to="/transportation"
          iconSvg={<BusIcon />}
          label={isAr ? 'رحلات مُدخلة' : 'Trips Entered'}
          value={`${fmt(stats.trips.entered)} / ${fmt(stats.trips.scheduled)}`}
          sub={isAr ? `من ${stats.trips.scheduled} مجدولة` : `of ${stats.trips.scheduled} scheduled`}
          gradient="linear-gradient(135deg, #1B3A6B 0%, #2a5298 100%)"
          shadow="0 8px 20px rgba(27,58,107,0.3)"
        />
        <StatCard
          to="/transportation"
          iconSvg={<CheckIcon />}
          label={isAr ? 'نسبة الانتظام' : 'On-Time Rate'}
          value={`${onTimeRate}%`}
          sub={`${fmt(stats.trips.onTime)} ${isAr ? 'في الوقت' : 'on time'}`}
          gradient="linear-gradient(135deg, #065f46 0%, #059669 100%)"
          shadow="0 8px 20px rgba(5,150,105,0.3)"
        />
        <StatCard
          to="/transportation"
          iconSvg={<UsersIcon />}
          label={isAr ? 'إجمالي الركاب' : 'Passengers'}
          value={fmt(stats.trips.totalPax)}
          sub={isAr ? 'ركاب اليوم' : "Today's passengers"}
          gradient="linear-gradient(135deg, #5b21b6 0%, #7c3aed 100%)"
          shadow="0 8px 20px rgba(124,58,237,0.3)"
        />
        <StatCard
          to="/lost-found"
          iconSvg={<BagIcon />}
          label={isAr ? 'غير مستلمة' : 'Unclaimed'}
          value={fmt(stats.lostUnclaimed)}
          sub={stats.lostUnclaimed > 0 ? (isAr ? 'يحتاج متابعة' : 'Needs follow-up') : (isAr ? 'لا يوجد متأخر' : 'All clear')}
          gradient={stats.lostUnclaimed > 0
            ? 'linear-gradient(135deg, #b45309 0%, #d97706 100%)'
            : 'linear-gradient(135deg, #374151 0%, #4b5563 100%)'}
          shadow={stats.lostUnclaimed > 0 ? '0 8px 20px rgba(217,119,6,0.3)' : '0 8px 20px rgba(55,65,81,0.2)'}
        />
      </div>

      {/* ── Details Row ───────────────────────────────────────── */}
      <div className="grid sm:grid-cols-3 gap-4 mb-5">

        {/* Trip Progress */}
        <InfoCard title={`📊 ${isAr ? 'تقدم الرحلات' : 'Trip Progress'}`}>
          <LinearProgress
            label={isAr ? 'إدخال الرحلات' : 'Entry Progress'}
            value={stats.trips.entered}
            total={stats.trips.scheduled}
            color="#1B3A6B"
          />
          {stats.trips.entered > 0 && (
            <LinearProgress
              label={isAr ? 'نسبة الانتظام' : 'On-Time Rate'}
              value={stats.trips.onTime}
              total={stats.trips.entered}
              color="#059669"
            />
          )}
          <div className="flex flex-wrap gap-2 mt-4 pt-3" style={{ borderTop: '1px solid #F0F4FA' }}>
            {stats.trips.delayed > 0 && (
              <span className="badge" style={{ background:'#FFF7ED', color:'#C2410C', border:'1px solid #FED7AA' }}>
                ⚠ {stats.trips.delayed} {isAr?'متأخرة':'delayed'}
              </span>
            )}
            {stats.trips.cancelled > 0 && (
              <span className="badge" style={{ background:'#FEF2F2', color:'#B91C1C', border:'1px solid #FECACA' }}>
                ✕ {stats.trips.cancelled} {isAr?'ملغاة':'cancelled'}
              </span>
            )}
            {stats.trips.extra > 0 && (
              <span className="badge" style={{ background:'#F3E8FF', color:'#7C3AED', border:'1px solid #E9D5FF' }}>
                + {stats.trips.extra} {isAr?'إضافية':'extra'}
              </span>
            )}
            {stats.trips.delayed === 0 && stats.trips.cancelled === 0 && stats.trips.extra === 0 && (
              <span className="text-xs text-gray-400">{isAr ? 'لا يوجد استثناءات' : 'No exceptions'}</span>
            )}
          </div>
        </InfoCard>

        {/* الإيرادات — مخفية عن الموظف */}
        {!isEmployee && (
          <InfoCard title={`💰 ${isAr ? 'إيرادات اليوم' : "Today's Revenue"}`}>
            <div className="text-center mb-4 pb-3" style={{ borderBottom: '1px solid #F0F4FA' }}>
              <div className="text-3xl font-extrabold" style={{ color: '#1B3A6B' }}>
                {fmtC(stats.sales.totalRevenue)}
              </div>
              <div className="text-xs mt-0.5 text-gray-400">{isAr ? 'ر.س إجمالي الإيرادات' : 'SAR Total Revenue'}</div>
            </div>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">{isAr ? 'المتوقع' : 'Expected'}</span>
                <span className="font-semibold text-gray-800">{fmtC(stats.sales.totalExpected)} ر.س</span>
              </div>
              {stats.sales.totalExpected > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">{isAr ? 'الفرق' : 'Difference'}</span>
                  <span className={`font-bold ${stats.sales.totalRevenue >= stats.sales.totalExpected ? 'text-green-600' : 'text-red-600'}`}>
                    {stats.sales.totalRevenue >= stats.sales.totalExpected ? '+' : ''}
                    {fmtC(stats.sales.totalRevenue - stats.sales.totalExpected)} ر.س
                  </span>
                </div>
              )}
              <div className="flex justify-between pt-2" style={{ borderTop: '1px solid #F0F4FA' }}>
                <span className="text-gray-500">{isAr ? 'مؤكدة' : 'Confirmed'}</span>
                <span className={`font-bold ${stats.sales.confirmed === stats.sales.total && stats.sales.total > 0 ? 'text-green-600' : 'text-amber-500'}`}>
                  {stats.sales.confirmed} / {stats.sales.total}
                </span>
              </div>
            </div>
            {stats.sales.total === 0 && (
              <p className="text-center text-xs text-gray-300 mt-3">
                {isAr ? 'لم تُدخل إيرادات اليوم بعد' : 'No revenue entered today'}
              </p>
            )}
            <button onClick={() => navigate('/sales')}
              className="w-full mt-4 py-2 rounded-xl text-xs font-bold transition-all"
              style={{ background:'#F0F4FA', color:'#1B3A6B', border:'1px solid #C7D8F5' }}>
              {isAr ? 'عرض الإيرادات →' : 'View Revenue →'}
            </button>
          </InfoCard>
        )}

        {/* Lost & Found */}
        <InfoCard title={`🧳 ${isAr ? 'الموجودات' : 'Lost & Found'}`}>
          <div className="flex flex-col items-center text-center py-2">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-extrabold mb-3"
              style={{
                background: stats.lostUnclaimed > 0 ? 'linear-gradient(135deg,#fef3c7,#fde68a)' : 'linear-gradient(135deg,#d1fae5,#a7f3d0)',
                color: stats.lostUnclaimed > 0 ? '#92400e' : '#065f46',
              }}>
              {stats.lostUnclaimed > 0 ? stats.lostUnclaimed : '✓'}
            </div>
            <p className="font-bold text-gray-800 text-sm mb-1">
              {stats.lostUnclaimed > 0
                ? (isAr ? `${stats.lostUnclaimed} غرض غير مستلم` : `${stats.lostUnclaimed} unclaimed items`)
                : (isAr ? 'جميع الأغراض مستلمة' : 'All items claimed')}
            </p>
            <p className="text-xs text-gray-400 mb-5">
              {stats.lostUnclaimed > 0 ? (isAr ? 'يحتاج متابعة' : 'Needs follow-up') : (isAr ? 'لا يوجد متأخر' : 'Nothing pending')}
            </p>
            <button onClick={() => navigate('/lost-found')}
              className="w-full py-2.5 rounded-xl text-xs font-bold transition-all"
              style={{
                background: stats.lostUnclaimed > 0 ? '#FFFBEB' : '#F0F4FA',
                color: stats.lostUnclaimed > 0 ? '#92400e' : '#64748b',
                border: `1px solid ${stats.lostUnclaimed > 0 ? '#FDE68A' : '#E2E8F0'}`,
              }}>
              {isAr ? 'إدارة الموجودات →' : 'Manage Lost & Found →'}
            </button>
          </div>
        </InfoCard>
      </div>

      {/* ── Quick Actions ─────────────────────────────────────── */}
      <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#94a3b8' }}>
        {isAr ? 'إجراءات سريعة' : 'Quick Actions'}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: isAr ? 'إدخال رحلة' : 'Enter Trip',    to: '/transportation', bg:'#EEF3FB', border:'#C7D8F5', iconColor:'#1B3A6B',
            svg: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1B3A6B" strokeWidth="2" strokeLinecap="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M8 6V4M16 6V4M2 12h20M7 18a2 2 0 100 4 2 2 0 000-4zM17 18a2 2 0 100 4 2 2 0 000-4z"/></svg> },
          { label: isAr ? 'غرض مفقود' : 'Lost Item',      to: '/lost-found',     bg:'#FFFBEB', border:'#FDE68A', iconColor:'#b45309',
            svg: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0"/></svg> },
          { label: isAr ? 'إدخال إيرادات' : 'Revenue Entry', to: '/sales', bg:'#ECFDF5', border:'#A7F3D0', iconColor:'#065f46',
            svg: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#065f46" strokeWidth="2" strokeLinecap="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg> },
          { label: isAr ? 'التقارير' : 'Reports',          to: '/reports',        bg:'#F5F3FF', border:'#DDD6FE', iconColor:'#6d28d9',
            svg: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6d28d9" strokeWidth="2" strokeLinecap="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg> },
        ].map(a => (
          <button key={a.to} onClick={() => navigate(a.to)}
            className="card p-5 flex flex-col items-center gap-3 hover:-translate-y-1 transition-all"
            style={{ background: a.bg, border: `1px solid ${a.border}`, cursor:'pointer' }}>
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-white shadow-sm">
              {a.svg}
            </div>
            <span className="text-xs font-bold" style={{ color: '#1a2a45' }}>{a.label}</span>
          </button>
        ))}
      </div>

    </div>
  )
}
