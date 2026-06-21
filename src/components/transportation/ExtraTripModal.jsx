import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import DatePicker from '../shared/DatePicker'
import { todayStr } from '../../utils/dates'
import { isRestStation } from '../../utils/stations'

/**
 * إنشاء رحلة إضافية (RF) — للمشرف والأدمن فقط.
 * تنسخ رحلة أساسية بنفس التوقيت لتاريخ محدّد، مع كل التوقفات أو المختارة،
 * وتظهر كرحلة مكررة لكل المحطات المعنية، مميّزة بوسم RF.
 */
const tripFields = `
  id, trip_number, trip_name, route, scheduled_departure, scheduled_arrival, bus_type,
  from_station:from_station_id(id, name_en, name_ar),
  to_station:to_station_id(id, name_en, name_ar)
`

export default function ExtraTripModal({ isAr, onClose, onCreated }) {
  const { profile } = useAuth()
  const t = (en, ar) => isAr ? ar : en
  const stName = s => (isAr ? s?.name_ar : s?.name_en) || '—'

  const [step, setStep]       = useState(1)            // 1 = اختيار الرحلة، 2 = الإعداد
  const [trips, setTrips]     = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [error, setError]     = useState('')

  const [base, setBase]       = useState(null)
  const [tripNumber, setTripNumber] = useState('')
  const [rfDate, setRfDate]   = useState(todayStr())
  const [stops, setStops]     = useState([])           // [{station_id, station, arrival_time, departure_time, on}]
  const [saving, setSaving]   = useState(false)

  const loadTrips = useCallback(async () => {
    setLoading(true); setError('')
    const { data, error } = await supabase.from('trip_schedule')
      .select(tripFields).eq('is_active', true).or('is_rf.is.null,is_rf.eq.false')
      .order('scheduled_departure').limit(4000)
    if (error) setError(error.message); else setTrips(data ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { loadTrips() }, [loadTrips])

  async function pickBase(tr) {
    setBase(tr); setTripNumber((tr.trip_number || '') + '-RF-' + rfDate.replaceAll('-', '')); setError('')
    const { data } = await supabase.from('trip_schedule_stops')
      .select('station_id, arrival_time, departure_time, stop_order, status, station:station_id(id, name_ar, name_en)')
      .eq('trip_schedule_id', tr.id).order('stop_order')
    const mid = (data ?? []).filter(s => s.station && !isRestStation(s.station) && s.station_id !== tr.from_station?.id && s.station_id !== tr.to_station?.id)
    const list = []
    if (tr.from_station) list.push({ station_id: tr.from_station.id, station: tr.from_station, departure_time: tr.scheduled_departure, arrival_time: null, endpoint: 'from', on: true })
    mid.forEach(s => list.push({ station_id: s.station_id, station: s.station, arrival_time: s.arrival_time, departure_time: s.departure_time, stop_order: s.stop_order, status: s.status, on: true }))
    if (tr.to_station) list.push({ station_id: tr.to_station.id, station: tr.to_station, arrival_time: tr.scheduled_arrival, departure_time: null, endpoint: 'to', on: true })
    setStops(list)
    setStep(2)
  }

  const toggleStop = id => setStops(prev => prev.map(s => s.station_id === id ? { ...s, on: !s.on } : s))

  async function create() {
    setError('')
    if (!tripNumber.trim()) { setError(t('Enter trip number', 'أدخل رقم الرحلة')); return }
    if (!rfDate) { setError(t('Pick a date', 'اختر التاريخ')); return }
    const chosen = stops.filter(s => s.on)
    if (!chosen.length) { setError(t('Select at least one station', 'اختر محطة واحدة على الأقل')); return }
    setSaving(true)
    let newTripId = null
    try {
      // 1) نسخة رحلة جديدة (RF)
      const { data: newTrip, error: e1 } = await supabase.from('trip_schedule').insert({
        trip_number: tripNumber.trim(),
        trip_name: base.trip_name,
        route: base.route,
        from_station_id: base.from_station?.id ?? null,
        to_station_id: base.to_station?.id ?? null,
        scheduled_departure: base.scheduled_departure,
        scheduled_arrival: base.scheduled_arrival,
        bus_type: base.bus_type,
        is_active: true,
        is_rf: true,
        rf_date: rfDate,
        parent_trip_id: base.id,
      }).select('id').single()
      if (e1) throw e1
      newTripId = newTrip.id

      // 2) نسخ التوقفات المختارة
      const midStops = chosen.filter(s => !s.endpoint)
      if (midStops.length) {
        const { error: e2 } = await supabase.from('trip_schedule_stops').insert(
          midStops.map((s, i) => ({
            trip_schedule_id: newTrip.id, station_id: s.station_id,
            arrival_time: s.arrival_time, departure_time: s.departure_time,
            stop_order: s.stop_order ?? (i + 1), status: s.status ?? null,
          }))
        )
        if (e2) throw e2
      }

      // 3) ظهور الرحلة لكل المحطات المختارة
      const { error: e3 } = await supabase.from('station_trips').insert(
        chosen.map(s => ({
          station_id: s.station_id, trip_schedule_id: newTrip.id,
          departure_station_id: null, dep_enabled: true, arr_enabled: true,
          departure_time: null, arrival_time: null,
          selected_by: profile.id, selected_by_name: profile.full_name_ar,
        }))
      )
      if (e3) throw e3

      onCreated?.()
      onClose()
    } catch (err) {
      // تنظيف: احذف أي صف رحلة أُنشئ قبل الفشل حتى لا تبقى رحلة يتيمة
      if (newTripId) {
        await supabase.from('station_trips').delete().eq('trip_schedule_id', newTripId)
        await supabase.from('trip_schedule_stops').delete().eq('trip_schedule_id', newTripId)
        await supabase.from('trip_schedule').delete().eq('id', newTripId)
      }
      const dup = /duplicate key|unique constraint/i.test(err.message || '')
      setError(dup
        ? t('Trip number already used — change it', 'رقم الرحلة مستخدم مسبقاً — غيّر الرقم')
        : (err.message || t('Failed to create', 'تعذّر الإنشاء')))
    } finally {
      setSaving(false)
    }
  }

  const shown = trips.filter(tr => {
    if (!search) return true
    const q = search.toLowerCase()
    return (tr.trip_number ?? '').toLowerCase().includes(q) ||
           (tr.route ?? '').toLowerCase().includes(q) ||
           (tr.from_station?.name_en ?? '').toLowerCase().includes(q) ||
           (tr.to_station?.name_en ?? '').toLowerCase().includes(q)
  })

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between bg-purple-700 text-white px-5 py-3 rounded-t-2xl">
          <div>
            <h3 className="font-bold">🔁 {t('Add Extra Trip (RF)', 'إضافة رحلة إضافية (RF)')}</h3>
            <p className="text-xs text-white/70 mt-0.5">
              {step === 1 ? t('Choose a base trip to duplicate', 'اختر الرحلة الأساسية لنسخها') : `${base?.trip_number} → ${t('configure', 'الإعداد')}`}
            </p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none">×</button>
        </div>

        {error && <div className="m-4 mb-0 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg p-2">{error}</div>}

        {step === 1 ? (
          <>
            <div className="p-4 border-b border-gray-100">
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder={t('Search trips…', 'بحث برقم الرحلة أو المحطة…')}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none" />
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {loading ? (
                <p className="text-center text-gray-400 py-8 text-sm">{t('Loading…', 'جارٍ التحميل…')}</p>
              ) : shown.length === 0 ? (
                <p className="text-center text-gray-400 py-8 text-sm">{t('No trips found', 'لا توجد رحلات')}</p>
              ) : shown.map(tr => (
                <button key={tr.id} onClick={() => pickBase(tr)}
                  className="w-full text-start rounded-lg border border-gray-200 px-3 py-2.5 hover:border-purple-500 hover:bg-purple-50 transition">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-purple-700">{tr.trip_number}</span>
                    {tr.route && <span className="text-xs text-gray-400">{tr.route}</span>}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 truncate">
                    {stName(tr.from_station)} {' → '} {stName(tr.to_station)}
                    {tr.scheduled_departure && <span className="text-gray-400"> · {tr.scheduled_departure.slice(0, 5)}</span>}
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="p-4 border-b border-gray-100 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">{t('Trip number', 'رقم الرحلة')}</label>
                <input value={tripNumber} onChange={e => setTripNumber(e.target.value)} dir="ltr"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">{t('Date', 'تاريخ التشغيل')}</label>
                <DatePicker value={rfDate} onChange={setRfDate} isAr={isAr}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:outline-none" />
              </div>
              <div className="col-span-2 text-xs text-gray-500">
                {t('Route', 'المسار')}: <span className="font-medium text-gray-700">{stName(base?.from_station)} → {stName(base?.to_station)}</span>
                {base?.scheduled_departure && <span className="text-gray-400"> · {base.scheduled_departure.slice(0, 5)}</span>}
              </div>
            </div>

            <div className="px-4 pt-3 pb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-600">{t('Stations / stops', 'المحطات والتوقفات')}</span>
              <div className="flex gap-2 text-[11px]">
                <button onClick={() => setStops(p => p.map(s => ({ ...s, on: true })))} className="text-purple-600 hover:underline">{t('All', 'الكل')}</button>
                <button onClick={() => setStops(p => p.map(s => ({ ...s, on: false })))} className="text-gray-400 hover:underline">{t('None', 'لا شيء')}</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
              {stops.map(s => (
                <label key={s.station_id}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition ${s.on ? 'border-purple-300 bg-purple-50' : 'border-gray-200'}`}>
                  <input type="checkbox" checked={s.on} onChange={() => toggleStop(s.station_id)} className="rounded accent-purple-600" />
                  <span className="flex-1 text-sm text-gray-700">{stName(s.station)}
                    {s.endpoint === 'from' && <span className="text-[10px] text-green-600 ms-2">{t('Origin', 'المنشأ')}</span>}
                    {s.endpoint === 'to' && <span className="text-[10px] text-blue-600 ms-2">{t('Destination', 'الوجهة')}</span>}
                  </span>
                  <span className="text-xs text-gray-400 font-mono">
                    {s.departure_time ? s.departure_time.slice(0, 5) : (s.arrival_time ? s.arrival_time.slice(0, 5) : '')}
                  </span>
                </label>
              ))}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
          {step === 2 ? (
            <button onClick={() => setStep(1)} className="text-sm text-gray-500 hover:text-gray-700">← {t('Back', 'رجوع')}</button>
          ) : <span />}
          {step === 2 && (
            <button onClick={create} disabled={saving}
              className="bg-purple-700 text-white rounded-lg px-6 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              {saving ? t('Creating…', 'جارٍ الإنشاء…') : `✓ ${t('Create RF trip', 'إنشاء الرحلة الإضافية')}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
