import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { NWB_LOGO_SVG } from '../utils/logo'
import { isRestStation } from '../utils/stations'

import { todayStr } from '../utils/dates'

const hhmmFromTs = v => v ? new Date(v).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''
const s5 = v => v ? String(v).slice(0, 5) : ''
const toMin = hm => { const [h, m] = (hm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0) }

function Clock({ accent, muted }) {
  const [c, setC] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setC(new Date()), 1000); return () => clearInterval(t) }, [])
  return (
    <div style={{ fontFamily: 'monospace' }}>
      <div style={{ fontSize: 40, fontWeight: 700, color: accent, lineHeight: 1 }}>{c.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
      <div style={{ fontSize: 13, color: muted, marginTop: 4 }}>{c.toLocaleDateString('en-GB')}</div>
    </div>
  )
}

const THEMES = {
  navy:  { name: 'كحلي/ذهبي',  bg: 'radial-gradient(circle at 50% -20%, #14315c 0%, #0b1b34 60%)', accent: '#d9b25f', arr: '#3ddc97', dep: '#5aa6ff', text: '#e8eef7', muted: '#8ea3c4' },
  teal:  { name: 'تركوازي',    bg: 'radial-gradient(circle at 50% -20%, #0d3b3a 0%, #07211f 60%)', accent: '#e6c66b', arr: '#56e0b0', dep: '#4fc3d9', text: '#eafaf6', muted: '#8fb8b2' },
  black: { name: 'أسود/كهرماني', bg: '#0a0a0c',                                                    accent: '#f0a92b', arr: '#37d67a', dep: '#5aa6ff', text: '#f2f2f4', muted: '#9a9aa2' },
  royal: { name: 'بنفسجي',     bg: 'radial-gradient(circle at 50% -20%, #2a2156 0%, #140f2e 60%)', accent: '#e0b3ff', arr: '#5fe0c0', dep: '#8aa0ff', text: '#efeaff', muted: '#a99fc4' },
}

const nmOf = (s, isAr) => (isAr ? s?.name_ar : s?.name_en) || '—'

// إزالة التكرار: نفس الرحلة بنفس الاتجاه والوقت (تُسجّل في كل محطة تمر بها)
const dedupeEvents = list => {
  const seen = new Set()
  return list.filter(e => {
    const k = `${e.type}|${e.trip?.trip_number || ''}|${e.time}|${e.trip?.from_station?.name_en || ''}|${e.trip?.to_station?.name_en || ''}`
    if (seen.has(k)) return false
    seen.add(k); return true
  })
}

// صف الحركة — مكوّن مستقل ومُحفّظ (memo) حتى لا يُعاد إنشاؤه عند كل رسم (يمنع الاهتزاز)
const Row = memo(function Row({ e, accent, th, isAr }) {
  const upcoming = e.status === 'upcoming'
  const arr = e.type === 'arrival'
  return (
    <div className="lb-row" style={{ display: 'flex', alignItems: 'center', gap: 14, height: 80, boxSizing: 'border-box', padding: '0 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', opacity: upcoming ? 0.72 : 1 }}>
      <div style={{ minWidth: 70, textAlign: 'center', fontFamily: 'monospace', fontSize: 28, fontWeight: 800, color: th.accent, letterSpacing: 1 }}>{e.time}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: th.text, lineHeight: 1.18, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {nmOf(e.trip?.from_station, isAr)} <span style={{ color: accent, fontWeight: 700, margin: '0 4px' }}>→</span> {nmOf(e.trip?.to_station, isAr)}
        </div>
        <div style={{ fontSize: 13, color: th.muted, marginTop: 3, fontFamily: 'monospace' }}>
          {isAr ? 'رحلة' : 'Trip'} {e.trip?.trip_number || '—'}{e.bus && <span style={{ marginInlineStart: 10 }}>🚌 {e.bus}</span>}
        </div>
      </div>
      <div style={{ textAlign: 'center', minWidth: 96 }}>
        {upcoming
          ? <span style={{ fontSize: 12, fontWeight: 700, color: th.muted, border: `1px solid ${th.muted}55`, borderRadius: 12, padding: '4px 12px', whiteSpace: 'nowrap' }}>{isAr ? 'مجدولة' : 'Scheduled'}</span>
          : <span style={{ fontSize: 13, fontWeight: 800, color: accent, background: `${accent}1f`, borderRadius: 12, padding: '4px 12px', whiteSpace: 'nowrap' }}>{arr ? (isAr ? '✓ تم الوصول' : '✓ Arrived') : (isAr ? '✓ تمت المغادرة' : '✓ Departed')}</span>}
      </div>
    </div>
  )
})

export default function LiveBoard() {
  const navigate = useNavigate()
  const { i18n } = useTranslation()
  const { isGeneralAdmin, profile } = useAuth()
  const isAr = i18n.language === 'ar'
  const nm = s => (isAr ? s?.name_ar : s?.name_en) || '—'

  // المحطة المعروضة: الأدمن يختار أو "الكل"؛ غيره محصور بمحطته
  const [stations, setStations] = useState([])
  const [boardStation, setBoardStation] = useState(() =>
    localStorage.getItem('nwbus_board_station') || 'all')
  useEffect(() => {
    if (!isGeneralAdmin && profile?.station_id) setBoardStation(profile.station_id)
  }, [isGeneralAdmin, profile?.station_id])
  useEffect(() => {
    if (!isGeneralAdmin) return
    supabase.from('stations').select('id,name_ar,name_en').eq('is_active', true).order('name_ar')
      .then(({ data }) => setStations((data || []).filter(s => !isRestStation(s))))
  }, [isGeneralAdmin])

  const [mode, setMode] = useState(() => localStorage.getItem('nwbus_board_mode') || 'actual')
  const [theme, setTheme] = useState(() => localStorage.getItem('nwbus_board_theme') || 'navy')
  const [layout, setLayout] = useState(() => localStorage.getItem('nwbus_board_layout') || 'columns')
  const [bg, setBg] = useState(() => localStorage.getItem('nwbus_board_bg') || '')
  const [events, setEvents] = useState([])
  const [showHint, setShowHint] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [rotateSec, setRotateSec] = useState(() => Number(localStorage.getItem('nwbus_board_rotate')) || 15)
  const [tick, setTick] = useState(0)   // عدّاد لقطات الوضع التلقائي

  // في الوضع التلقائي فقط: العناوين ثابتة، والرحلات تتبدّل كلقطة كل (rotateSec) ثانية
  useEffect(() => {
    if (layout !== 'auto') return
    const id = setInterval(() => setTick(t => t + 1), Math.max(5, rotateSec) * 1000)
    return () => clearInterval(id)
  }, [layout, rotateSec])
  const isAuto = layout === 'auto'
  const view = layout === 'feed' ? 'feed' : 'columns'   // التلقائي يستخدم بنية العمودين
  const COL_PER = 6   // عدد الرحلات في كل لقطة (للوضع التلقائي)

  const th = THEMES[theme] || THEMES.navy
  const sigRef = useRef('')
  const setEventsIfChanged = list => {
    const sig = list.map(e => e.id + e.time + e.status).join('|')
    if (sig === sigRef.current) return   // لا تحديث إن لم تتغيّر البيانات (يمنع الوميض)
    sigRef.current = sig
    setEvents(list)
  }
  const save = (setter, key) => v => { setter(v); localStorage.setItem(key, v) }
  const setModePref = save(setMode, 'nwbus_board_mode')
  const setThemePref = save(setTheme, 'nwbus_board_theme')
  const setLayoutPref = save(setLayout, 'nwbus_board_layout')
  const setBgPref = save(setBg, 'nwbus_board_bg')
  const setRotatePref = save(setRotateSec, 'nwbus_board_rotate')
  const setStationPref = save(setBoardStation, 'nwbus_board_station')
  const scoped = boardStation && boardStation !== 'all'

  const loadActual = useCallback(async () => {
    let q = supabase.from('trip_records')
      .select(`id, updated_at, actual_departure, actual_arrival, bus_number,
        station:station_id(name_ar,name_en),
        trip:trip_schedule_id(trip_number, from_station:from_station_id(name_ar,name_en), to_station:to_station_id(name_ar,name_en))`)
      .eq('record_date', todayStr())
    if (scoped) q = q.eq('station_id', boardStation)
    const { data } = await q.order('updated_at', { ascending: false }).limit(60)
    const list = []
    ;(data ?? []).forEach(r => {
      // في شاشة المحطة: الوصول "... → المحطة" والمغادرة "المحطة → ..." (مثل صفحة الترحيل)
      const arrTrip = scoped ? { ...r.trip, to_station: r.station } : r.trip
      const depTrip = scoped ? { ...r.trip, from_station: r.station } : r.trip
      if (r.actual_arrival) list.push({ id: r.id + '-a', type: 'arrival', time: hhmmFromTs(r.actual_arrival), sort: r.actual_arrival, station: r.station, trip: arrTrip, bus: r.bus_number, status: 'done' })
      if (r.actual_departure) list.push({ id: r.id + '-d', type: 'departure', time: hhmmFromTs(r.actual_departure), sort: r.actual_departure, station: r.station, trip: depTrip, bus: r.bus_number, status: 'done' })
    })
    list.sort((a, b) => (b.sort ?? '').localeCompare(a.sort ?? ''))
    setEventsIfChanged(dedupeEvents(list).slice(0, 40))
  }, [scoped, boardStation])

  const loadScheduled = useCallback(async () => {
    const today = todayStr()
    const now = new Date().getHours() * 60 + new Date().getMinutes()
    const legs = []

    if (scoped) {
      // محطة محدّدة: رحلاتها المضافة فقط، ووقت المحطة نفسها
      const [{ data: rows }, { data: stops }] = await Promise.all([
        supabase.from('station_trips')
          .select(`departure_time, arrival_time, dep_enabled, arr_enabled,
            station:station_id(name_ar,name_en),
            trip:trip_schedule_id(id, trip_number, scheduled_departure, scheduled_arrival, is_active, is_rf, rf_date, from_station_id, to_station_id, from_station:from_station_id(name_ar,name_en), to_station:to_station_id(name_ar,name_en))`)
          .eq('station_id', boardStation),
        supabase.from('trip_schedule_stops').select('trip_schedule_id, station_id, arrival_time, departure_time').eq('station_id', boardStation),
      ])
      const stopMap = {}
      ;(stops ?? []).forEach(s => { stopMap[s.trip_schedule_id] = s })
      ;(rows ?? []).forEach(r => {
        const t = r.trip; if (!t || t.is_active === false) return
        if (t.is_rf && t.rf_date !== today) return
        const stop = stopMap[t.id]
        const isDest = t.to_station_id === boardStation, isOrigin = t.from_station_id === boardStation
        const arrTm = s5(r.arrival_time || stop?.arrival_time || (isDest ? t.scheduled_arrival : null))
        const depTm = s5(r.departure_time || stop?.departure_time || (isOrigin ? t.scheduled_departure : null))
        // الوصول "... → المحطة" والمغادرة "المحطة → ..." لتوضّح حركة كل محطة
        if (r.arr_enabled !== false && arrTm) legs.push({ id: t.trip_number + '-a', type: 'arrival', time: arrTm, trip: { ...t, to_station: r.station } })
        if (r.dep_enabled !== false && depTm) legs.push({ id: t.trip_number + '-d', type: 'departure', time: depTm, trip: { ...t, from_station: r.station } })
      })
    } else {
      // الكل: مغادرة من المنشأ (scheduled_departure) + وصول للوجهة (scheduled_arrival)
      const { data } = await supabase.from('trip_schedule')
        .select(`trip_number, scheduled_departure, scheduled_arrival, is_active, is_rf, rf_date,
          from_station:from_station_id(name_ar,name_en), to_station:to_station_id(name_ar,name_en)`)
        .eq('is_active', true).limit(4000)
      ;(data ?? []).forEach(t => {
        if (t.is_rf && t.rf_date !== today) return
        const dep = s5(t.scheduled_departure), arr = s5(t.scheduled_arrival)
        if (dep) legs.push({ id: t.trip_number + '-d', type: 'departure', time: dep, trip: t })
        if (arr) legs.push({ id: t.trip_number + '-a', type: 'arrival', time: arr, trip: t })
      })
    }

    const win = legs.filter(l => { const m = toMin(l.time); return m >= now - 60 && m <= now + 720 })   // حتى 12 ساعة قادمة
      .map(l => ({ ...l, status: toMin(l.time) <= now ? 'done' : 'upcoming' }))
      .sort((a, b) => toMin(a.time) - toMin(b.time))
    setEventsIfChanged(dedupeEvents(win).slice(0, 40))
  }, [scoped, boardStation])

  useEffect(() => {
    const run = () => (mode === 'scheduled' ? loadScheduled() : loadActual())
    run()
    const t = setInterval(run, 10000)   // مؤقّت احتياطي
    // تحديث مباشر (Realtime): أي إدخال/تعديل يظهر فوراً على الشاشة
    const ch = supabase.channel('board-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_records' }, run)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'station_trips' }, run)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_schedule' }, run)
      .subscribe()
    return () => { clearInterval(t); supabase.removeChannel(ch) }
  }, [mode, loadActual, loadScheduled])

  const hintTimer = useRef(null)
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') navigate('/') }
    const onMove = () => { setShowHint(true); clearTimeout(hintTimer.current); hintTimer.current = setTimeout(() => setShowHint(false), 4000) }
    window.addEventListener('keydown', onKey); window.addEventListener('mousemove', onMove); onMove()
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousemove', onMove); clearTimeout(hintTimer.current) }
  }, [navigate])

  const containerBg = bg
    ? { backgroundImage: `linear-gradient(rgba(8,16,34,0.62), rgba(8,16,34,0.7)), url(${bg})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: th.bg }
  // المتتالي مرتّب بالوقت (وصول/مغادرة مع بعض)
  const feedSorted = [...events].sort((a, b) => toMin(a.time) - toMin(b.time))
  const stationLabel = scoped
    ? (nm(stations.find(s => s.id === boardStation)) !== '—' ? nm(stations.find(s => s.id === boardStation)) : nm(profile?.station))
    : (isAr ? 'كل المحطات' : 'All Stations')

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} style={{ position: 'fixed', inset: 0, color: th.text, fontFamily: 'Tajawal, sans-serif', overflow: 'hidden', ...containerBg }}>
      <style>{`
        @keyframes slidein { from { opacity:0; transform: translateY(-10px) } to { opacity:1; transform:none } }
        @keyframes glow { 0%,100%{opacity:.9} 50%{opacity:.4} }
        @keyframes scrollup { from { transform: translateY(0) } to { transform: translateY(-50%) } }
        .lb-row { animation: slidein .45s ease both }
        .lb-ar { animation: glow 1.8s ease-in-out infinite }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '22px 48px', borderBottom: `2px solid ${th.accent}88` }}>
        <div style={{ width: 160 }} dangerouslySetInnerHTML={{ __html: NWB_LOGO_SVG.replace('width="180" height="90"', 'width="160" height="68"') }} />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: 1 }}>{isAr ? 'حركة الرحلات المباشرة' : 'Live Trip Movements'}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: th.accent, marginTop: 2 }}>📍 {stationLabel}</div>
          <div style={{ fontSize: 12, color: th.muted, letterSpacing: 3 }}>NORTH WEST BUS</div>
        </div>
        <div style={{ textAlign: isAr ? 'left' : 'right' }}>
          <Clock accent={th.accent} muted={th.muted} />
        </div>
      </div>

      {/* Admin controls */}
      {isGeneralAdmin && (
        <div style={{ position: 'absolute', top: 100, insetInlineStart: 48, display: 'flex', gap: 6, opacity: showHint ? 1 : 0, transition: 'opacity .4s', zIndex: 6 }}>
          {[['actual', isAr ? 'فعلي' : 'Actual'], ['scheduled', isAr ? 'مجدول' : 'Scheduled']].map(([v, l]) => (
            <button key={v} onClick={() => setModePref(v)} style={{ padding: '6px 16px', borderRadius: 8, border: `1px solid ${th.accent}66`, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: mode === v ? th.accent : 'transparent', color: mode === v ? '#0b1b34' : th.text }}>{l}</button>
          ))}
          <button onClick={() => setSettingsOpen(true)} style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${th.accent}66`, fontSize: 13, cursor: 'pointer', background: 'transparent', color: th.text }}>⚙️ {isAr ? 'إعدادات' : 'Settings'}</button>
        </div>
      )}

      {/* Content */}
      {view === 'columns' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, padding: '18px 40px', height: 'calc(100% - 130px)', boxSizing: 'border-box' }}>
          {[{ type: 'departure', label: isAr ? 'المغادرة' : 'Departures', accent: th.dep, icon: '↑' }, { type: 'arrival', label: isAr ? 'الوصول' : 'Arrivals', accent: th.arr, icon: '↓' }].map(col => {
            const items = events.filter(e => e.type === col.type)
            // التلقائي: لقطة ثابتة تتبدّل؛ العمودين: تمرير مستمر
            const pages = Math.max(1, Math.ceil(items.length / COL_PER))
            const p = ((tick % pages) + pages) % pages
            const shown = isAuto ? items.slice(p * COL_PER, p * COL_PER + COL_PER) : items
            const flow = !isAuto && items.length > 7
            return (
              <div key={col.type} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: 'rgba(255,255,255,0.025)', borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', background: 'rgba(255,255,255,0.04)', borderBottom: `2px solid ${col.accent}` }}>
                  <span className="lb-ar" style={{ fontSize: 24, color: col.accent }}>{col.icon}</span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: col.accent }}>{col.label}</span>
                  <span style={{ marginInlineStart: 'auto', fontSize: 13, color: th.muted }}>{items.length}{isAuto && pages > 1 ? ` · ${p + 1}/${pages}` : ''}</span>
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={flow ? { animation: `scrollup ${items.length * 3.5}s linear infinite` } : {}}>
                    {[...shown, ...(flow ? items : [])].map((e, i) => <Row key={e.id + '_' + i} e={e} accent={col.accent} th={th} isAr={isAr} />)}
                  </div>
                  {items.length === 0 && <div style={{ textAlign: 'center', color: th.muted, fontSize: 18, padding: '50px 0' }}>—</div>}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ padding: '18px 40px', height: 'calc(100% - 130px)', overflow: 'hidden', boxSizing: 'border-box' }}>
          <div style={{ background: 'rgba(255,255,255,0.025)', borderRadius: 16, overflow: 'hidden', height: '100%' }}>
            <div style={feedSorted.length > 9 ? { animation: `scrollup ${feedSorted.length * 3.5}s linear infinite` } : {}}>
              {[...feedSorted, ...(feedSorted.length > 9 ? feedSorted : [])].map((e, i) => <Row key={e.id + '_' + i} e={e} accent={e.type === 'arrival' ? th.arr : th.dep} th={th} isAr={isAr} />)}
              {feedSorted.length === 0 && <div style={{ textAlign: 'center', color: th.muted, fontSize: 20, padding: '80px 0' }}>{isAr ? 'لا حركة حالياً' : 'No movements'}</div>}
            </div>
          </div>
        </div>
      )}

      {/* Settings panel */}
      {settingsOpen && (
        <div onClick={() => setSettingsOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#0e1f3d', border: `1px solid ${th.accent}55`, borderRadius: 16, padding: 24, width: 420, maxWidth: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontSize: 18, fontWeight: 800 }}>⚙️ {isAr ? 'إعدادات الشاشة' : 'Board Settings'}</span>
              <button onClick={() => setSettingsOpen(false)} style={{ background: 'none', border: 'none', color: th.muted, fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>

            {isGeneralAdmin && (
              <>
                <div style={{ fontSize: 13, color: th.muted, marginBottom: 6 }}>{isAr ? 'المحطة المعروضة' : 'Displayed station'}</div>
                <select value={boardStation} onChange={e => setStationPref(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)', color: th.text, fontSize: 13, marginBottom: 18 }}>
                  <option value="all" style={{ color: '#000' }}>{isAr ? 'كل المحطات (شامل)' : 'All stations'}</option>
                  {stations.map(s => <option key={s.id} value={s.id} style={{ color: '#000' }}>{nm(s)}</option>)}
                </select>
              </>
            )}

            <div style={{ fontSize: 13, color: th.muted, marginBottom: 6 }}>{isAr ? 'القالب واللون' : 'Theme'}</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
              {Object.entries(THEMES).map(([k, v]) => (
                <button key={k} onClick={() => setThemePref(k)} style={{ padding: '8px 12px', borderRadius: 10, cursor: 'pointer', border: theme === k ? `2px solid ${v.accent}` : '1px solid rgba(255,255,255,0.2)', background: v.bg.includes('gradient') ? v.bg : v.bg, color: v.text, fontSize: 12, fontWeight: 700 }}>
                  <span style={{ color: v.accent }}>●</span> {v.name}
                </button>
              ))}
            </div>

            <div style={{ fontSize: 13, color: th.muted, marginBottom: 6 }}>{isAr ? 'طريقة العرض' : 'Layout'}</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
              {[['columns', isAr ? 'عمودان منفصلان' : 'Two columns'], ['feed', isAr ? 'متتالي (قائمة واحدة)' : 'Continuous feed'], ['auto', isAr ? '🔄 تنقّل تلقائي (كل 15ث)' : '🔄 Auto (every 15s)']].map(([v, l]) => (
                <button key={v} onClick={() => setLayoutPref(v)} style={{ flex: '1 1 45%', padding: '10px', borderRadius: 10, cursor: 'pointer', border: layout === v ? `2px solid ${th.accent}` : '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: th.text, fontSize: 13, fontWeight: 700 }}>{l}</button>
              ))}
            </div>

            {layout === 'auto' && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 13, color: th.muted, marginBottom: 6 }}>{isAr ? 'مدة كل لقطة (ثانية)' : 'Seconds per view'}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {[10, 15, 20, 30, 60].map(s => (
                    <button key={s} onClick={() => setRotatePref(s)} style={{ padding: '8px 14px', borderRadius: 10, cursor: 'pointer', border: rotateSec === s ? `2px solid ${th.accent}` : '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: th.text, fontSize: 13, fontWeight: 700 }}>{s}{isAr ? 'ث' : 's'}</button>
                  ))}
                  <input type="number" min="3" value={rotateSec}
                    onChange={e => setRotatePref(Math.max(3, Number(e.target.value) || 3))}
                    style={{ width: 70, padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: th.text, fontSize: 13, textAlign: 'center' }} />
                </div>
              </div>
            )}

            <div style={{ fontSize: 13, color: th.muted, marginBottom: 6 }}>{isAr ? 'صورة خلفية' : 'Background image'}</div>
            <input type="file" accept="image/*" onChange={e => {
              const f = e.target.files?.[0]; if (!f) return
              const rd = new FileReader()
              rd.onload = () => { try { setBgPref(rd.result) } catch { alert(isAr ? 'الصورة كبيرة، اختر أصغر' : 'Image too large') } }
              rd.readAsDataURL(f)
            }} style={{ fontSize: 12, color: th.text, marginBottom: 8 }} />
            <input value={bg.startsWith('data:') ? '' : bg} onChange={e => setBgPref(e.target.value)} placeholder={isAr ? 'أو ألصق رابط صورة https://...' : 'or paste URL https://...'}
              dir="ltr" style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: th.text, fontSize: 13, boxSizing: 'border-box' }} />
            {bg && <button onClick={() => setBgPref('')} style={{ marginTop: 8, fontSize: 12, color: '#ff8a8a', background: 'none', border: 'none', cursor: 'pointer' }}>{isAr ? 'إزالة الخلفية' : 'Remove background'}</button>}
          </div>
        </div>
      )}

      {/* Exit */}
      <div style={{ position: 'absolute', bottom: 16, width: '100%', textAlign: 'center', opacity: showHint ? 1 : 0, transition: 'opacity .5s' }}>
        <button onClick={() => navigate('/')} style={{ background: 'rgba(255,255,255,0.08)', color: th.muted, border: '1px solid rgba(255,255,255,0.15)', borderRadius: 20, padding: '7px 20px', fontSize: 13, cursor: 'pointer' }}>
          {isAr ? '✕ خروج (أو زر Esc)' : '✕ Exit (or Esc)'}
        </button>
      </div>
    </div>
  )
}
