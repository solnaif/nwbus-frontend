import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { NWB_LOGO_SVG } from '../utils/logo'
import DatePicker from '../components/shared/DatePicker'
import SearchSelect from '../components/shared/SearchSelect'
import { toLocalDateStr } from '../utils/dates'
import { isRestStation } from '../utils/stations'

const fmt  = n => Number(n ?? 0).toLocaleString('ar-SA', { minimumFractionDigits: 2 })
const fmtN = n => Number(n ?? 0).toLocaleString('ar-SA')

export default function ReportsPage() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { isGeneralAdmin, isAccountant, isStationAdmin, profile } = useAuth()

  const [dateFrom, setDateFrom] = useState(toLocalDateStr(new Date(Date.now() - 7 * 86400000)))
  const [dateTo,   setDateTo]   = useState(toLocalDateStr())
  const [loading,  setLoading]  = useState(false)
  const [data,     setData]     = useState(null)
  const [reportType, setReportType] = useState('all')   // all | transport | missed | facilities | sales | lost
  const [stations, setStations]     = useState([])
  const [station,  setStation]      = useState('all')   // 'all' أو id محطة

  const seesAll = isGeneralAdmin   // الأدمن فقط؛ المحاسب محصور بمحطته

  // جلب المحطات: الكل للأدمن/المحاسب، والمعيّنة للمشرف
  useEffect(() => {
    if (seesAll) {
      supabase.from('stations').select('id, name_ar, name_en').eq('is_active', true).order('name_ar')
        .then(({ data }) => setStations((data ?? []).filter(s => !isRestStation(s))))
    } else if ((isStationAdmin || isAccountant) && profile?.id) {
      supabase.from('user_stations').select('station:station_id(id, name_ar, name_en)').eq('user_id', profile.id)
        .then(({ data }) => {
          let sts = (data ?? []).map(r => r.station).filter(Boolean).filter(s => !isRestStation(s))
          if (!sts.length && profile?.station) sts = [profile.station]
          setStations(sts)
        })
    } else if (profile?.station) {
      setStations([profile.station])
    }
  }, [seesAll, isStationAdmin, isAccountant, profile?.id])

  const myStationIds = stations.map(s => s.id)

  const runReport = useCallback(async () => {
    setLoading(true)
    // تطبيق نطاق المحطة: محطة محددة، أو كل محطات المشرف، أو الكل للأدمن
    const scope = q => {
      if (station !== 'all') return q.eq('station_id', station)
      if (!seesAll && myStationIds.length) return q.in('station_id', myStationIds)
      return q
    }
    const [tripsRes, salesRes, lostRes] = await Promise.all([
      scope(supabase.from('trip_records').select(`
        id, record_date, station_id, departure_accuracy, operational_status,
        passenger_count, missed_count, missed_tickets, is_cancelled, is_extra_trip,
        bus_number, screen_works, wheelchair_works, toilet_works,
        actual_departure, actual_arrival,
        station:station_id(name_ar, name_en),
        trip:trip_schedule_id(trip_number, from_station_id, to_station_id, scheduled_departure, scheduled_arrival, from_station:from_station_id(name_ar,name_en), to_station:to_station_id(name_ar,name_en))
      `).gte('record_date', dateFrom).lte('record_date', dateTo)),

      scope(supabase.from('sales_records').select(`
        id, sale_date, shift, total_actual, total_expected,
        surplus_deficit, is_confirmed, station:station_id(name_ar, name_en)
      `).gte('sale_date', dateFrom).lte('sale_date', dateTo)),

      scope(supabase.from('lost_found_items').select(`
        id, status, found_date, item_type
      `).gte('found_date', dateFrom).lte('found_date', dateTo)),
    ])

    const trips = tripsRes.data ?? []
    const sales = salesRes.data ?? []
    const lost  = lostRes.data  ?? []

    // قائمة المتخلفين (مسطّحة) من كل الرحلات في النطاق
    const missed = []
    trips.forEach(t => {
      (t.missed_tickets ?? []).forEach(m => {
        missed.push({
          date:    t.record_date,
          station: m.station || t.station?.name_ar || t.station?.name_en || '—',
          trip:    t.trip?.trip_number || '—',
          ticket:  m.ticket ?? m,
        })
      })
    })
    missed.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

    // الحالة التشغيلية (لا تعمل فقط) — مع رقم الحافلة
    const facilities = []
    trips.forEach(t => {
      const st = t.station?.name_ar || t.station?.name_en || '—'
      const checks = [
        ['📺 الشاشة', t.screen_works],
        ['♿ ويل تشير', t.wheelchair_works],
        ['🚻 دورات المياه', t.toilet_works],
      ]
      checks.forEach(([name, ok]) => {
        if (ok === false) facilities.push({
          date: t.record_date, station: st, bus: t.bus_number || '—',
          facility: name, trip: t.trip?.trip_number || '—',
        })
      })
    })
    facilities.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

    // حركة الوصول/المغادرة + الإجماليات
    const movements = []
    let depCount = 0, arrCount = 0, missedTotal = 0, paxTotal = 0
    const fmtT = v => v ? new Date(v).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—'
    const nm = s => s?.name_ar || s?.name_en || '—'
    const accOf = (sch, act) => {
      if (!sch || !act || act === '—') return { key: 'none', label: '—', color: '#9ca3af' }
      const [sh, sm] = sch.split(':').map(Number), [ah, am] = act.split(':').map(Number)
      const d = (ah * 60 + am) - (sh * 60 + sm)
      if (d < -2) return { key: 'early', label: isAr ? 'مبكر' : 'Early', color: '#2563eb' }
      if (d <= 5) return { key: 'ontime', label: isAr ? 'في الوقت' : 'On Time', color: '#16a34a' }
      if (d <= 15) return { key: 'noton', label: isAr ? 'غير منتظم' : 'Not On Time', color: '#ca8a04' }
      return { key: 'delayed', label: isAr ? 'متأخر' : 'Delayed', color: '#dc2626' }
    }
    trips.forEach(t => {
      const st = nm(t.station)
      const isArr = t.trip?.to_station_id === t.station_id
      if (isArr) arrCount++; else depCount++
      missedTotal += (t.missed_count || 0)
      paxTotal += (t.passenger_count || 0)
      const sched = (isArr ? t.trip?.scheduled_arrival : t.trip?.scheduled_departure)
      const schedHHMM = sched ? String(sched).slice(0, 5) : ''
      const actHHMM = fmtT(isArr ? t.actual_arrival : t.actual_departure)
      movements.push({
        date: t.record_date, station: st, trip: t.trip?.trip_number || '—',
        type: isArr ? 'arrival' : 'departure',
        from: isArr ? nm(t.trip?.from_station) : st,
        to:   isArr ? st : nm(t.trip?.to_station),
        sched: schedHHMM || '—',
        actual: actHHMM,
        acc: accOf(schedHHMM, actHHMM),
        missed: t.missed_count || 0,
      })
    })
    movements.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

    setData({
      missed,
      facilities,
      movements,
      moveTotals: { dep: depCount, arr: arrCount, missed: missedTotal, pax: paxTotal },
      trips: {
        total:     trips.length,
        onTime:    trips.filter(t => t.departure_accuracy === 'On Time').length,
        delayed:   trips.filter(t => t.departure_accuracy === 'Delayed').length,
        cancelled: trips.filter(t => t.is_cancelled).length,
        extra:     trips.filter(t => t.is_extra_trip).length,
        totalPax:  trips.reduce((s, t) => s + (t.passenger_count ?? 0), 0),
        totalMissed: trips.reduce((s, t) => s + (t.missed_count ?? 0), 0),
        normal:    trips.filter(t => t.operational_status === 'Normal').length,
      },
      sales: {
        totalRevenue:  sales.reduce((s, r) => s + Number(r.total_actual ?? 0), 0),
        totalExpected: sales.reduce((s, r) => s + Number(r.total_expected ?? 0), 0),
        totalSurplus:  sales.reduce((s, r) => s + Number(r.surplus_deficit ?? 0), 0),
        confirmed:     sales.filter(r => r.is_confirmed).length,
        total:         sales.length,
      },
      lost: {
        total:     lost.length,
        unclaimed: lost.filter(l => l.status === 'unclaimed').length,
        claimed:   lost.filter(l => l.status === 'claimed').length,
        disposed:  lost.filter(l => l.status === 'disposed').length,
      },
    })
    setLoading(false)
  }, [dateFrom, dateTo, station, seesAll, stations])

  // تشغيل تلقائي عند تغيّر التاريخ/المحطة
  useEffect(() => { runReport() }, [runReport])

  const onTimeRate = data ? Math.round((data.trips.onTime / (data.trips.total || 1)) * 100) : 0
  const normalRate = data ? Math.round((data.trips.normal / (data.trips.total || 1)) * 100) : 0
  const show = type => reportType === 'all' || reportType === type

  const stationLabel = station === 'all'
    ? (seesAll ? (isAr ? 'جميع المحطات' : 'All stations') : (isAr ? 'محطاتي' : 'My stations'))
    : (() => { const s = stations.find(x => x.id === station); return s ? (isAr ? s.name_ar : s.name_en) : '—' })()

  const tableHtml = (headers, rows) => `
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px">
      <thead><tr style="background:#1B3A6B;color:#fff">
        ${headers.map(h => `<th style="padding:8px;text-align:right">${h}</th>`).join('')}
      </tr></thead>
      <tbody>${rows.map((r, i) => `<tr style="background:${i % 2 ? '#f8fafc' : '#fff'}">
        ${r.map(c => `<td style="padding:7px 8px;border-bottom:1px solid #eee">${c}</td>`).join('')}
      </tr>`).join('')}</tbody>
    </table>`

  const kpiStrip = items => `<div style="display:flex;flex-wrap:wrap;gap:10px;margin:10px 0">${items.map(it => `<div style="flex:1;min-width:110px;border:1px solid #eef1f6;border-right:3px solid ${it.color};border-radius:7px;padding:10px 12px"><div style="font-size:20px;font-weight:700;color:${it.color}">${it.val}</div><div style="font-size:10px;color:#5a6a8a;margin-top:2px">${it.label}</div></div>`).join('')}</div>`

  function reportBody(type) {
    if (type === 'movements') {
      const T = data.moveTotals
      const deps = data.movements.filter(m => m.type === 'departure')
      const arrs = data.movements.filter(m => m.type === 'arrival')
      const acc = { ontime: 0, early: 0, noton: 0, delayed: 0 }
      data.movements.forEach(m => { if (acc[m.acc.key] !== undefined) acc[m.acc.key]++ })
      const totalMoves = data.movements.length || 1
      const onTimeRate = Math.round((acc.ontime / totalMoves) * 100)
      const mx = Math.max(acc.ontime, acc.early, acc.noton, acc.delayed, 1)
      const bh = v => Math.round((v / mx) * 60)
      const bar = (x, v, c, label) => `<rect x="${x}" y="${92 - bh(v)}" width="36" height="${bh(v)}" rx="3" fill="${c}"/><text x="${x + 18}" y="${86 - bh(v)}" fill="${c}" font-weight="bold" font-size="9" text-anchor="middle">${v}</text><text x="${x + 18}" y="104" fill="#5a6a8a" font-size="9" text-anchor="middle">${label}</text>`
      const C = 289, depDash = Math.round((T.dep / ((T.dep + T.arr) || 1)) * C)

      const kpi = (val, label, color) => `<div style="flex:1;border:1px solid #eef1f6;border-right:3px solid ${color};border-radius:7px;padding:8px 11px"><div style="font-size:19px;font-weight:700;color:${color}">${val}</div><div style="font-size:10px;color:#5a6a8a">${label}</div></div>`

      const charts = `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:11px;color:#5a6a8a;border-bottom:1px solid #eef1f6;margin-bottom:8px">
          <span>الفترة المختارة</span><span>نسبة الالتزام: <b style="color:#16a34a;font-size:13px">${onTimeRate}%</b></span>
        </div>
        <div style="display:flex;gap:10px;margin-bottom:10px">
          ${kpi(T.dep, 'المغادرة', '#0f2444')}${kpi(T.arr, 'الوصول', '#0f766e')}${kpi(T.pax, 'المسافرون', '#4338ca')}${kpi(T.missed, 'المتخلفون', '#c0392b')}
        </div>
        <div style="display:flex;gap:12px;margin-bottom:12px">
          <div style="flex:1.5;border:1px solid #eef1f6;border-radius:8px;padding:10px">
            <div style="font-size:10px;color:#8a96ad;margin-bottom:4px">التزام المواعيد</div>
            <svg viewBox="0 0 250 110" style="width:100%;height:auto" font-family="sans-serif">
              <line x1="4" y1="92" x2="246" y2="92" stroke="#e9edf3"/>
              ${bar(22, acc.ontime, '#16a34a', 'في الوقت')}${bar(82, acc.early, '#2563eb', 'مبكر')}${bar(142, acc.noton, '#ca8a04', 'غير منتظم')}${bar(202, acc.delayed, '#dc2626', 'متأخر')}
            </svg>
          </div>
          <div style="flex:1;border:1px solid #eef1f6;border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:10px;color:#8a96ad;margin-bottom:4px">مغادرة / وصول</div>
            <svg viewBox="0 0 120 120" style="width:90px;height:90px">
              <circle cx="60" cy="60" r="46" fill="none" stroke="#0f766e" stroke-width="22"/>
              <circle cx="60" cy="60" r="46" fill="none" stroke="#0f2444" stroke-width="22" stroke-dasharray="${depDash} ${C}" transform="rotate(-90 60 60)"/>
              <text x="60" y="58" text-anchor="middle" font-size="15" font-weight="bold" fill="#16203a">${T.dep + T.arr}</text>
              <text x="60" y="72" text-anchor="middle" font-size="8" fill="#8a96ad">إجمالي</text>
            </svg>
            <div style="font-size:9px;margin-top:2px"><span style="color:#0f2444">● مغادرة ${T.dep}</span> <span style="color:#0f766e">● وصول ${T.arr}</span></div>
          </div>
        </div>`

      const moveTable = (list, headColor) => `
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:6px">
          <thead><tr style="background:${headColor};color:#fff">
            <th style="padding:6px 8px">#</th>
            <th style="padding:6px 8px;text-align:right">${isAr ? 'التاريخ' : 'Date'}</th>
            <th style="padding:6px 8px;text-align:right">${isAr ? 'محطة المغادرة' : 'From'}</th>
            <th style="padding:6px 8px;text-align:right">${isAr ? 'محطة الوصول' : 'To'}</th>
            <th style="padding:6px 8px">${isAr ? 'رقم الرحلة' : 'Trip'}</th>
            <th style="padding:6px 8px">${isAr ? 'المجدول' : 'Sched.'}</th>
            <th style="padding:6px 8px">${isAr ? 'الفعلي' : 'Actual'}</th>
            <th style="padding:6px 8px">${isAr ? 'الحالة' : 'Status'}</th>
            <th style="padding:6px 8px">${isAr ? 'المتخلفون' : 'Missed'}</th>
          </tr></thead>
          <tbody>${list.map((m, i) => `<tr style="background:${i % 2 ? '#f8fafc' : '#fff'}">
            <td style="padding:5px 8px;text-align:center;border-bottom:1px solid #eee">${i + 1}</td>
            <td style="padding:5px 8px;border-bottom:1px solid #eee">${m.date}</td>
            <td style="padding:5px 8px;border-bottom:1px solid #eee">${m.from}</td>
            <td style="padding:5px 8px;border-bottom:1px solid #eee">${m.to}</td>
            <td style="padding:5px 8px;text-align:center;font-family:monospace;border-bottom:1px solid #eee">${m.trip}</td>
            <td style="padding:5px 8px;text-align:center;font-family:monospace;border-bottom:1px solid #eee">${m.sched}</td>
            <td style="padding:5px 8px;text-align:center;font-family:monospace;border-bottom:1px solid #eee">${m.actual}</td>
            <td style="padding:5px 8px;text-align:center;border-bottom:1px solid #eee;color:${m.acc.color};font-weight:600">${m.acc.label}</td>
            <td style="padding:5px 8px;text-align:center;font-family:monospace;color:#dc2626;border-bottom:1px solid #eee">${m.missed || ''}</td>
          </tr>`).join('')}</tbody>
        </table>`
      const countBox = (label, n, color) => `<span style="display:inline-block;border:2px solid ${color};border-radius:8px;padding:6px 16px;margin:6px 0 0 6px"><span style="color:#444;font-size:11px">${label}: </span><b style="color:${color};font-size:16px">${n}</b></span>`
      const legend = `<div style="display:flex;gap:14px;margin-top:10px;font-size:10px">
        <span style="color:#16a34a">● ${isAr ? 'في الوقت' : 'On Time'}</span>
        <span style="color:#2563eb">● ${isAr ? 'مبكر' : 'Early'}</span>
        <span style="color:#ca8a04">● ${isAr ? 'غير منتظم' : 'Not On Time'}</span>
        <span style="color:#dc2626">● ${isAr ? 'متأخر' : 'Delayed'}</span>
      </div>`
      return `
        ${charts}
        <div style="background:#0f2444;color:#fff;padding:6px 12px;border-radius:6px;font-weight:700;margin-top:6px">🔵 ${isAr ? 'رحلات المغادرة' : 'Departures'} (${T.dep})</div>
        ${deps.length ? moveTable(deps, '#0f2444') : '<div style="font-size:11px;color:#999;padding:8px">—</div>'}
        <div style="background:#0f766e;color:#fff;padding:6px 12px;border-radius:6px;font-weight:700;margin-top:14px">🟢 ${isAr ? 'رحلات الوصول' : 'Arrivals'} (${T.arr})</div>
        ${arrs.length ? moveTable(arrs, '#0f766e') : '<div style="font-size:11px;color:#999;padding:8px">—</div>'}
        <div style="margin-top:8px">
          ${countBox(isAr ? 'إجمالي المسافرين' : 'Passengers', T.pax, '#4338ca')}
          ${countBox(isAr ? 'إجمالي المتخلفين' : 'Missed', T.missed, '#dc2626')}
        </div>
        ${legend}`
    }
    if (type === 'missed')
      return tableHtml([isAr ? 'التاريخ' : 'Date', isAr ? 'المحطة' : 'Station', isAr ? 'رقم الرحلة' : 'Trip', isAr ? 'رقم التذكرة' : 'Ticket'],
        data.missed.map(m => [m.date, m.station, m.trip, m.ticket]))
    if (type === 'facilities')
      return tableHtml([isAr ? 'التاريخ' : 'Date', isAr ? 'المحطة' : 'Station', isAr ? 'رقم الحافلة' : 'Bus', isAr ? 'التجهيز المعطّل' : 'Faulty', isAr ? 'رقم الرحلة' : 'Trip'],
        data.facilities.map(f => [f.date, f.station, f.bus, f.facility, f.trip]))
    if (type === 'transport')
      return kpiStrip([
        { val: data.trips.total, label: isAr ? 'إجمالي الرحلات' : 'Total Trips', color: '#0f2444' },
        { val: onTimeRate + '%', label: isAr ? 'نسبة الانتظام' : 'On-Time %', color: '#16a34a' },
        { val: data.trips.delayed, label: isAr ? 'متأخرة' : 'Delayed', color: '#dc2626' },
        { val: data.trips.extra, label: isAr ? 'إضافية' : 'Extra', color: '#7c3aed' },
        { val: data.trips.totalPax, label: isAr ? 'إجمالي الركاب' : 'Passengers', color: '#4338ca' },
        { val: data.trips.totalMissed, label: isAr ? 'الغائبون' : 'Missed', color: '#c0392b' },
      ])
    if (type === 'sales')
      return kpiStrip([
        { val: fmt(data.sales.totalRevenue), label: isAr ? 'الإيرادات (ر.س)' : 'Revenue', color: '#16a34a' },
        { val: fmt(data.sales.totalExpected), label: isAr ? 'المتوقع (ر.س)' : 'Expected', color: '#0f2444' },
        { val: fmt(data.sales.totalSurplus), label: isAr ? 'الفرق (ر.س)' : 'Diff', color: data.sales.totalSurplus >= 0 ? '#16a34a' : '#c0392b' },
        { val: `${data.sales.confirmed}/${data.sales.total}`, label: isAr ? 'مؤكدة' : 'Confirmed', color: '#ca8a04' },
      ])
    if (type === 'lost')
      return kpiStrip([
        { val: data.lost.total, label: isAr ? 'إجمالي الأغراض' : 'Total', color: '#0f2444' },
        { val: data.lost.unclaimed, label: isAr ? 'غير مستلمة' : 'Unclaimed', color: '#ca8a04' },
        { val: data.lost.claimed, label: isAr ? 'مستلمة' : 'Claimed', color: '#16a34a' },
      ])
    return ''
  }

  const REPORT_LABEL = {
    all: isAr ? 'تقرير شامل' : 'Full Report',
    movements: isAr ? 'تقرير الوصول والمغادرة' : 'Arrivals & Departures',
    transport: isAr ? 'ملخص الترحيل' : 'Transportation',
    missed: isAr ? 'المتخلفون عن الرحلات' : 'Missed Passengers', facilities: isAr ? 'الحالة التشغيلية' : 'Faulty Facilities',
    sales: isAr ? 'ملخص المبيعات' : 'Sales', lost: isAr ? 'الموجودات' : 'Lost & Found',
  }

  function printReport() {
    const types = reportType === 'all' ? ['movements', 'transport', 'missed', 'facilities', 'sales', 'lost'] : [reportType]
    const sections = types.map(tp =>
      `<h2 style="font-size:14px;color:#1B3A6B;margin:16px 0 0">${REPORT_LABEL[tp]}</h2>${reportBody(tp)}`).join('')
    const html = `
      <div style="font-family:Tajawal,Arial,sans-serif;direction:rtl;padding:0;color:#1a2233">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1B3A6B;padding-bottom:12px;margin-bottom:10px">
          <div>${NWB_LOGO_SVG.replace('width="180" height="90"', 'width="150" height="75"')}</div>
          <div style="text-align:left">
            <div style="font-size:16px;font-weight:700;color:#1B3A6B">${REPORT_LABEL[reportType]}</div>
            <div style="font-size:11px;color:#666;margin-top:2px">الفترة: ${dateFrom} → ${dateTo}</div>
            <div style="font-size:11px;color:#666">المحطة: ${stationLabel}</div>
          </div>
        </div>
        ${sections}
        <div style="margin-top:24px;padding-top:8px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;text-align:center">
          طُبع بواسطة: ${profile?.full_name_ar ?? '—'} · ${new Date().toLocaleString('en-GB')} · Station
        </div>
      </div>`

    const style = document.createElement('style')
    style.textContent = `
      @page { size: A4; margin: 12mm; }
      @media print {
        body > *:not(#__print){display:none!important}
        #__print{display:block!important;position:static!important;top:auto!important;width:100%!important}
        #__print *{box-sizing:border-box; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important}
      }`
    document.head.appendChild(style)
    const div = document.createElement('div')
    div.id = '__print'
    div.style.cssText = 'position:fixed;top:-99999px;left:0;width:100%'
    div.innerHTML = html
    document.body.appendChild(div)
    try { window.print() } finally { document.body.removeChild(div); document.head.removeChild(style) }
  }

  function exportMissed() {
    const head = [isAr ? 'التاريخ' : 'Date', isAr ? 'المحطة' : 'Station', isAr ? 'رقم الرحلة' : 'Trip', isAr ? 'رقم التذكرة' : 'Ticket']
    const rows = [head, ...data.missed.map(m => [m.date, m.station, m.trip, m.ticket])]
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `missed_${dateFrom}_${dateTo}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 md:p-6" dir={isAr ? 'rtl' : 'ltr'}>
      <h1 className="text-xl font-bold text-nwbus-primary mb-5">
        📊 {isAr ? 'التقارير' : 'Reports'}
      </h1>

      {/* Report type + date range */}
      <div className="bg-white rounded-2xl shadow p-4 mb-5 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">{isAr ? 'نوع التقرير' : 'Report Type'}</label>
          <select value={reportType} onChange={e => setReportType(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none bg-white">
            <option value="all">{isAr ? 'الكل' : 'All'}</option>
            <option value="movements">{isAr ? 'الوصول والمغادرة' : 'Arrivals & Departures'}</option>
            <option value="transport">{isAr ? 'ملخص الترحيل' : 'Transportation'}</option>
            <option value="missed">{isAr ? 'المتخلفون عن الرحلات' : 'Missed Passengers'}</option>
            <option value="facilities">{isAr ? 'الحالة التشغيلية' : 'Faulty Facilities'}</option>
            <option value="sales">{isAr ? 'ملخص المبيعات' : 'Sales'}</option>
            <option value="lost">{isAr ? 'الموجودات' : 'Lost & Found'}</option>
          </select>
        </div>
        {/* Station selector */}
        {stations.length > 0 && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">{isAr ? 'المحطة' : 'Station'}</label>
            <SearchSelect isAr={isAr} value={station} onChange={setStation}
              className="border rounded-lg px-3 py-2 text-sm bg-white min-w-[170px]"
              options={[
                { value: 'all', label: seesAll ? (isAr ? 'جميع المحطات' : 'All stations') : (isAr ? 'كل محطاتي' : 'My stations') },
                ...stations.map(s => ({ value: s.id, label: isAr ? s.name_ar : s.name_en })),
              ]} />
          </div>
        )}
        <div>
          <label className="block text-xs text-gray-500 mb-1">{isAr ? 'من' : 'From'}</label>
          <DatePicker inline value={dateFrom} onChange={setDateFrom} isAr={isAr}
            className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none bg-white" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">{isAr ? 'إلى' : 'To'}</label>
          <DatePicker inline value={dateTo} onChange={setDateTo} isAr={isAr}
            className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none bg-white" />
        </div>
        {data && (
          <button onClick={printReport}
            className="bg-nwbus-primary text-white px-5 py-2 rounded-lg text-sm font-semibold hover:opacity-90">
            🖨 {isAr ? 'طباعة التقرير' : 'Print Report'}
          </button>
        )}
        {loading && <span className="text-sm text-gray-400 pb-2">⏳ {isAr ? 'جارٍ التحميل…' : 'Loading…'}</span>}
      </div>

      {data && (
        <div className="space-y-6">

          {/* Transportation summary */}
          {show('transport') && (
          <section>
            <h2 className="text-sm font-bold text-gray-600 mb-3 flex items-center gap-2">
              🚌 {isAr ? 'ملخص الترحيل' : 'Transportation Summary'}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: isAr ? 'إجمالي الرحلات' : 'Total Trips', val: fmtN(data.trips.total), color: 'bg-blue-50 text-blue-700' },
                { label: isAr ? 'نسبة الانتظام' : 'On-Time Rate', val: `${onTimeRate}%`, color: 'bg-green-50 text-green-700' },
                { label: isAr ? 'نسبة الطبيعي' : 'Normal Rate', val: `${normalRate}%`, color: 'bg-emerald-50 text-emerald-700' },
                { label: isAr ? 'ملغاة' : 'Cancelled', val: fmtN(data.trips.cancelled), color: 'bg-red-50 text-red-700' },
                { label: isAr ? 'إضافية' : 'Extra Trips', val: fmtN(data.trips.extra), color: 'bg-purple-50 text-purple-700' },
                { label: isAr ? 'متأخرة' : 'Delayed', val: fmtN(data.trips.delayed), color: 'bg-orange-50 text-orange-700' },
                { label: isAr ? 'إجمالي الركاب' : 'Total Passengers', val: fmtN(data.trips.totalPax), color: 'bg-indigo-50 text-indigo-700' },
                { label: isAr ? 'الغائبون' : 'Missed', val: fmtN(data.trips.totalMissed), color: 'bg-gray-50 text-gray-700' },
              ].map(s => (
                <div key={s.label} className={`rounded-xl p-4 ${s.color}`}>
                  <div className="text-xl font-bold">{s.val}</div>
                  <div className="text-xs mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </section>
          )}

          {/* Arrivals & Departures */}
          {show('movements') && (
          <section>
            <h2 className="text-sm font-bold text-gray-600 mb-3 flex items-center gap-2">
              🔄 {isAr ? 'تقرير الوصول والمغادرة' : 'Arrivals & Departures'}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <div className="rounded-xl p-4 bg-blue-50 text-nwbus-primary text-center">
                <div className="text-2xl font-bold">{data.moveTotals.dep}</div>
                <div className="text-xs mt-0.5">{isAr ? 'إجمالي المغادرة' : 'Departures'}</div>
              </div>
              <div className="rounded-xl p-4 bg-teal-50 text-teal-700 text-center">
                <div className="text-2xl font-bold">{data.moveTotals.arr}</div>
                <div className="text-xs mt-0.5">{isAr ? 'إجمالي الوصول' : 'Arrivals'}</div>
              </div>
              <div className="rounded-xl p-4 bg-indigo-50 text-indigo-700 text-center">
                <div className="text-2xl font-bold">{fmtN(data.moveTotals.pax)}</div>
                <div className="text-xs mt-0.5">{isAr ? 'إجمالي المسافرين' : 'Passengers'}</div>
              </div>
              <div className="rounded-xl p-4 bg-red-50 text-red-700 text-center">
                <div className="text-2xl font-bold">{data.moveTotals.missed}</div>
                <div className="text-xs mt-0.5">{isAr ? 'إجمالي المتخلفين' : 'Missed'}</div>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow overflow-hidden">
              {data.movements.length === 0 ? (
                <p className="text-center text-gray-400 py-8 text-sm">{isAr ? 'لا توجد حركة في هذه الفترة' : 'No movements in this period'}</p>
              ) : (
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-nwbus-primary text-white sticky top-0">
                      <tr>
                        <th className="px-3 py-2.5 text-right font-semibold">{isAr ? 'التاريخ' : 'Date'}</th>
                        <th className="px-3 py-2.5 text-right font-semibold">{isAr ? 'المحطة' : 'Station'}</th>
                        <th className="px-3 py-2.5 text-center font-semibold">{isAr ? 'الرحلة' : 'Trip'}</th>
                        <th className="px-3 py-2.5 text-center font-semibold">{isAr ? 'النوع' : 'Type'}</th>
                        <th className="px-3 py-2.5 text-center font-semibold">{isAr ? 'المجدول' : 'Sched.'}</th>
                        <th className="px-3 py-2.5 text-center font-semibold">{isAr ? 'الفعلي' : 'Actual'}</th>
                        <th className="px-3 py-2.5 text-center font-semibold">{isAr ? 'المتخلفون' : 'Missed'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.movements.map((m, i) => (
                        <tr key={i} className={i % 2 ? 'bg-gray-50' : 'bg-white'}>
                          <td className="px-3 py-2 text-gray-500">{m.date}</td>
                          <td className="px-3 py-2 text-gray-700">{m.station}</td>
                          <td className="px-3 py-2 text-center font-mono text-nwbus-primary">{m.trip}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`text-[11px] rounded-full px-2 py-0.5 font-semibold ${m.type === 'arrival' ? 'bg-teal-100 text-teal-700' : 'bg-blue-100 text-nwbus-primary'}`}>
                              {m.type === 'arrival' ? (isAr ? 'وصول' : 'Arr') : (isAr ? 'مغادرة' : 'Dep')}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center font-mono text-gray-500">{m.sched}</td>
                          <td className="px-3 py-2 text-center font-mono text-gray-800">{m.actual}</td>
                          <td className="px-3 py-2 text-center font-mono text-red-600">{m.missed || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
          )}

          {/* Missed passengers table */}
          {show('missed') && (
          <section>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-sm font-bold text-gray-600 flex items-center gap-2">
                🎫 {isAr ? 'المتخلفون عن الرحلات' : 'Missed Passengers'}
                <span className="text-xs font-normal text-gray-400">({data.missed.length})</span>
              </h2>
              {data.missed.length > 0 && (
                <button onClick={exportMissed}
                  className="text-xs bg-green-600 text-white rounded-lg px-3 py-1.5 font-semibold hover:opacity-90">
                  ⬇ {isAr ? 'تصدير Excel' : 'Export Excel'}
                </button>
              )}
            </div>
            <div className="bg-white rounded-2xl shadow overflow-hidden">
              {data.missed.length === 0 ? (
                <p className="text-center text-gray-400 py-8 text-sm">{isAr ? 'لا يوجد متخلفون في هذه الفترة' : 'No missed passengers in this period'}</p>
              ) : (
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-nwbus-primary text-white sticky top-0">
                      <tr>
                        <th className="px-4 py-2.5 text-right font-semibold">{isAr ? 'التاريخ' : 'Date'}</th>
                        <th className="px-4 py-2.5 text-right font-semibold">{isAr ? 'المحطة' : 'Station'}</th>
                        <th className="px-4 py-2.5 text-center font-semibold">{isAr ? 'رقم الرحلة' : 'Trip'}</th>
                        <th className="px-4 py-2.5 text-center font-semibold">{isAr ? 'رقم التذكرة' : 'Ticket #'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.missed.map((m, i) => (
                        <tr key={i} className={i % 2 ? 'bg-gray-50' : 'bg-white'}>
                          <td className="px-4 py-2 text-gray-500">{m.date}</td>
                          <td className="px-4 py-2 text-gray-700">{m.station}</td>
                          <td className="px-4 py-2 text-center font-mono text-nwbus-primary">{m.trip}</td>
                          <td className="px-4 py-2 text-center font-mono text-red-600 font-semibold">{m.ticket}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          )}

          {/* Faulty facilities table */}
          {show('facilities') && (
          <section>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h2 className="text-sm font-bold text-gray-600 flex items-center gap-2">
                🛠️ {isAr ? 'الحالة التشغيلية' : 'Faulty Facilities'}
                <span className="text-xs font-normal text-gray-400">({data.facilities.length})</span>
              </h2>
            </div>
            <div className="bg-white rounded-2xl shadow overflow-hidden">
              {data.facilities.length === 0 ? (
                <p className="text-center text-gray-400 py-8 text-sm">{isAr ? 'جميع التجهيزات تعمل في هذه الفترة ✓' : 'All facilities working ✓'}</p>
              ) : (
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-nwbus-primary text-white sticky top-0">
                      <tr>
                        <th className="px-4 py-2.5 text-right font-semibold">{isAr ? 'التاريخ' : 'Date'}</th>
                        <th className="px-4 py-2.5 text-right font-semibold">{isAr ? 'المحطة' : 'Station'}</th>
                        <th className="px-4 py-2.5 text-center font-semibold">{isAr ? 'رقم الحافلة' : 'Bus #'}</th>
                        <th className="px-4 py-2.5 text-right font-semibold">{isAr ? 'التجهيز المعطّل' : 'Faulty'}</th>
                        <th className="px-4 py-2.5 text-center font-semibold">{isAr ? 'رقم الرحلة' : 'Trip'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.facilities.map((f, i) => (
                        <tr key={i} className={i % 2 ? 'bg-gray-50' : 'bg-white'}>
                          <td className="px-4 py-2 text-gray-500">{f.date}</td>
                          <td className="px-4 py-2 text-gray-700">{f.station}</td>
                          <td className="px-4 py-2 text-center font-mono text-nwbus-primary font-bold">{f.bus}</td>
                          <td className="px-4 py-2 text-red-600 font-medium">{f.facility}</td>
                          <td className="px-4 py-2 text-center font-mono text-gray-500">{f.trip}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
          )}

          {/* Sales summary */}
          {show('sales') && (
          <section>
            <h2 className="text-sm font-bold text-gray-600 mb-3 flex items-center gap-2">
              💰 {isAr ? 'ملخص المبيعات' : 'Sales Summary'}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: isAr ? 'إجمالي الإيرادات' : 'Total Revenue', val: fmt(data.sales.totalRevenue) + ' ر.س', color: 'bg-green-50 text-green-700' },
                { label: isAr ? 'الإجمالي المتوقع' : 'Expected', val: fmt(data.sales.totalExpected) + ' ر.س', color: 'bg-blue-50 text-blue-700' },
                { label: isAr ? 'الفرق الكلي' : 'Total Diff',
                  val: (data.sales.totalSurplus >= 0 ? '+' : '') + fmt(data.sales.totalSurplus) + ' ر.س',
                  color: data.sales.totalSurplus >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700' },
                { label: isAr ? 'مؤكدة' : 'Confirmed', val: `${data.sales.confirmed}/${data.sales.total}`, color: 'bg-yellow-50 text-yellow-700' },
              ].map(s => (
                <div key={s.label} className={`rounded-xl p-4 ${s.color}`}>
                  <div className="text-sm font-bold">{s.val}</div>
                  <div className="text-xs mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </section>

          )}

          {/* Lost & Found summary */}
          {show('lost') && (
          <section>
            <h2 className="text-sm font-bold text-gray-600 mb-3 flex items-center gap-2">
              🧳 {isAr ? 'ملخص الموجودات' : 'Lost & Found Summary'}
            </h2>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: isAr ? 'إجمالي الأغراض' : 'Total Items', val: fmtN(data.lost.total), color: 'bg-gray-50 text-gray-700' },
                { label: isAr ? 'غير مستلمة' : 'Unclaimed', val: fmtN(data.lost.unclaimed), color: 'bg-yellow-50 text-yellow-700' },
                { label: isAr ? 'مستلمة' : 'Claimed', val: fmtN(data.lost.claimed), color: 'bg-green-50 text-green-700' },
              ].map(s => (
                <div key={s.label} className={`rounded-xl p-4 ${s.color}`}>
                  <div className="text-xl font-bold">{s.val}</div>
                  <div className="text-xs mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </section>
          )}

        </div>
      )}
    </div>
  )
}
