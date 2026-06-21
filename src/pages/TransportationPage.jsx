import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { TRIP_STATUSES } from '../utils/constants'
import { toLatinDigits, cleanNumber } from '../utils/digits'
import DatePicker from '../components/shared/DatePicker'
import TimeInput24 from '../components/shared/TimeInput24'
import SearchSelect from '../components/shared/SearchSelect'
import ScheduleUploadModal from '../components/transportation/ScheduleUploadModal'
import StationTripsModal from '../components/transportation/StationTripsModal'
import ExtraTripModal from '../components/transportation/ExtraTripModal'
import { applyDueSchedules } from '../utils/importSchedule'

/* ─── helpers ────────────────────────────────────────────── */
import { todayStr } from '../utils/dates'
import { isRestStation } from '../utils/stations'

const accuracyColor = v => ({
  'On Time':    'text-green-600 font-semibold',
  'Early':      'text-blue-600 font-semibold',
  'Not On Time':'text-yellow-600',
  'Delayed':    'text-red-600 font-semibold',
}[v] ?? 'text-gray-400')

const accuracyAr = v => ({
  'On Time':    'في الوقت ✓',
  'Early':      'مبكر',
  'Not On Time':'غير منتظم',
  'Delayed':    'متأخر ⚠',
}[v] ?? '—')

// اتجاه الرحلة من رقمها: ذهاب (مغادرة) / عودة (وصول)
// NW05-O-… أو ينتهي بفردي = ذهاب · NW05-I-… أو ينتهي بزوجي = عودة
function tripDir(code) {
  const c = String(code || '').toUpperCase()
  if (/-I-|-I\d/.test(c)) return 'arrival'
  if (/-O-|-O\d/.test(c)) return 'departure'
  const m = c.match(/(\d+)\s*$/)
  if (m) return parseInt(m[1], 10) % 2 === 0 ? 'arrival' : 'departure'
  return 'departure'
}

const BUS_TYPE = {
  VIP:        { ar: 'VIP',        en: 'VIP',        color: 'bg-amber-100 text-amber-700' },
  WHEELCHAIR: { ar: 'ويل تشير',   en: 'Wheelchair', color: 'bg-blue-100 text-blue-700' },
  STANDARD:   { ar: 'عادية',      en: 'Standard',   color: 'bg-gray-100 text-gray-600' },
  QAID:       { ar: 'قائد',       en: 'Qaid',       color: 'bg-purple-100 text-purple-700' },
}

/* ─── Trip Entry Modal ──────────────────────────────────── */
function TripModal({ trip, record, stationId, stationName, stations = [], isArrival, schedTime, onClose, onSaved }) {
  const { profile, isGeneralAdmin, isStationAdmin } = useAuth()
  const canPickStation = isGeneralAdmin || isStationAdmin
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const [form, setForm] = useState({
    bus_number:         record?.bus_number ?? '',
    actual_departure:   record?.actual_departure
      ? new Date(record.actual_departure).toTimeString().slice(0, 5) : '',
    actual_arrival:     record?.actual_arrival
      ? new Date(record.actual_arrival).toTimeString().slice(0, 5) : '',
    passenger_count:    record?.passenger_count ?? '',
    missed_count:       record?.missed_count ?? 0,
    operational_status: record?.operational_status ?? 'Normal',
    screen_works:       record?.screen_works     ?? true,
    wheelchair_works:   record?.wheelchair_works ?? true,
    toilet_works:       record?.toilet_works     ?? true,
    notes:              record?.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // تذاكر المتخلفين عن الرحلة — مربعان بأسهم
  const [missedTickets, setMissedTickets] = useState(record?.missed_tickets ?? [])  // [{station, ticket}]
  const [staged, setStaged] = useState([])                                           // [{ticket, station}] بانتظار النقل
  const [ticket, setTicket] = useState('')
  // المحطة المختارة للإدخال — تلقائياً محطة المستخدم، ويمكن للأدمن/المشرف تغييرها
  const [ticketStation, setTicketStation] = useState(stationName || stations[0]?.name_ar || stations[0]?.name_en || '—')

  function onTicketKey(e) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (ticket.trim()) {
      setStaged(s => [...s, { ticket: ticket.trim(), station: ticketStation }]); setTicket('')
    } else if (staged.length) {
      transferStaged()   // Enter على فراغ = النقل للمربع الثاني
    }
  }
  function transferStaged() {
    if (!staged.length) return
    setMissedTickets(m => [...m, ...staged])
    setStaged([])
  }
  const removeStaged = i => setStaged(s => s.filter((_, idx) => idx !== i))
  const removeMissed = i => setMissedTickets(m => m.filter((_, idx) => idx !== i))
  // إرجاع تذكرة محددة من المربع الثاني للأول
  const returnTicket = i => {
    const item = missedTickets[i]
    if (!item) return
    setMissedTickets(m => m.filter((_, idx) => idx !== i))
    setStaged(s => [...s, item])
  }

  // الوقت المجدول والفعلي حسب النوع (وصول/مغادرة)
  const schedDep = schedTime || (isArrival ? trip.scheduled_arrival : trip.scheduled_departure)?.slice(0, 5) || ''
  const actualKey = isArrival ? 'actual_arrival' : 'actual_departure'

  // Live accuracy preview
  const accuracyPreview = () => {
    if (!form[actualKey] || !schedDep) return null
    const [sh, sm] = schedDep.split(':').map(Number)
    const [ah, am] = form[actualKey].split(':').map(Number)
    const diff = (ah * 60 + am) - (sh * 60 + sm)
    if (diff < -2) return <span className="text-blue-500">{isAr ? 'مبكر' : 'Early'} ({Math.abs(diff)} {isAr ? 'د' : 'min'})</span>
    if (diff <= 5)  return <span className="text-green-500">{isAr ? 'في الوقت ✓' : 'On Time ✓'}</span>
    if (diff <= 15) return <span className="text-yellow-500">{isAr ? 'غير منتظم' : 'Not On Time'} (+{diff} {isAr ? 'د' : 'min'})</span>
    return <span className="text-red-500">{isAr ? 'متأخر ⚠' : 'Delayed ⚠'} (+{diff} {isAr ? 'د' : 'min'})</span>
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true); setError('')

    const ts = v => v ? `${todayStr()}T${v}:00` : null

    const base = {
      trip_schedule_id:   trip.id,
      record_date:        todayStr(),
      station_id:         stationId,
      bus_number:         form.bus_number || null,
      passenger_count:    Number(form.passenger_count),
      missed_count:       missedTickets.length,
      missed_tickets:     missedTickets,
      screen_works:       form.screen_works,
      wheelchair_works:   form.wheelchair_works,
      toilet_works:       form.toilet_works,
      operational_status: form.operational_status,
      is_extra_trip:      !!trip.is_extra,   // وسم RF من شاشة اختيار الرحلات
      notes:              form.notes || null,
      created_by:         profile.id,
      created_by_name:    profile.full_name_ar,
    }

    // وقت المغادرة أو الوصول حسب النوع
    if (isArrival) base.actual_arrival = ts(form.actual_arrival)
    else           base.actual_departure = ts(form.actual_departure)

    let res
    if (record) {
      // قفل متفائل: لا تكتب إلا إذا لم يتغيّر الصف منذ فتحه (يمنع الكتابة فوق تعديل مستخدم آخر)
      let q = supabase.from('trip_records').update({
        ...base,
        updated_by:      profile.id,
        updated_by_name: profile.full_name_ar,
        updated_at:      new Date().toISOString(),
      }).eq('id', record.id)
      q = record.updated_at ? q.eq('updated_at', record.updated_at) : q.is('updated_at', null)
      res = await q.select('id')
      if (!res.error && (!res.data || res.data.length === 0)) {
        setError(isAr
          ? '⚠️ عُدّل هذا السجل من مستخدم آخر للتو. حدّث الصفحة وأعد الإدخال حتى لا تُمحى بياناته.'
          : '⚠️ This record was just changed by another user. Refresh and re-enter to avoid overwriting.')
        setSaving(false)
        return
      }
    } else {
      res = await supabase.from('trip_records').insert(base)
    }

    if (res.error) setError(res.error.message)
    else { onSaved(); onClose() }
    setSaving(false)
  }

  const inputCls = "w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none"

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="px-5 py-4 border-b flex items-center justify-between"
          style={{ background: isArrival ? 'linear-gradient(135deg,#0f766e,#14b8a6)' : 'linear-gradient(135deg,#0F2444,#1B3A6B)' }}>
          <div>
            <p className="font-bold text-white text-sm">{trip.trip_number}{trip.trip_name ? ` — ${trip.trip_name}` : ''}</p>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.65)' }}>
              {isAr ? trip.from_station?.name_ar : trip.from_station?.name_en}
              {' → '}
              {isAr ? trip.to_station?.name_ar : trip.to_station?.name_en}
            </p>
          </div>
          <div className="text-end flex flex-col items-end gap-1">
            <span className={`text-xs rounded-full px-2.5 py-1 font-bold ${isArrival ? 'bg-teal-100 text-teal-800' : 'bg-amber-100 text-amber-800'}`}>
              {isArrival ? (isAr ? 'وصول' : 'Arrival') : (isAr ? 'مغادرة' : 'Departure')}
            </span>
            {trip.bus_type && BUS_TYPE[trip.bus_type] && (
              <span className={`text-[10px] rounded-full px-2 py-0.5 font-semibold ${BUS_TYPE[trip.bus_type].color}`}>
                🚌 {isAr ? BUS_TYPE[trip.bus_type].ar : BUS_TYPE[trip.bus_type].en}
              </span>
            )}
            <p className="text-xs mt-0.5 font-mono text-white/60">{schedDep} {isAr ? 'مجدول' : 'sched.'}</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="px-5 py-4 space-y-4">

          {/* Bus number */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              🚌 {isAr ? 'رقم الحافلة' : 'Bus Number'}
            </label>
            <input className={inputCls}
              value={form.bus_number} onChange={e => set('bus_number', toLatinDigits(e.target.value))}
              placeholder={isAr ? 'مثال: 4521' : 'e.g. 4521'}
            />
          </div>

          {/* Actual time — departure or arrival */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              🕐 {isArrival ? (isAr ? 'وقت الوصول الفعلي' : 'Actual Arrival') : (isAr ? 'وقت المغادرة الفعلي' : 'Actual Departure')}
            </label>
            <TimeInput24
              value={form[actualKey]} onChange={v => set(actualKey, v)}
            />
            {form[actualKey] && schedDep && (
              <p className="text-xs text-gray-400 mt-1">
                {isAr ? 'المجدول:' : 'Scheduled:'} {schedDep} → {accuracyPreview()}
              </p>
            )}
          </div>

          {/* Passengers */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">👥 {isAr ? 'الركاب' : 'Passengers'}</label>
            <input type="text" inputMode="numeric" className={inputCls} placeholder="0"
              value={form.passenger_count} onChange={e => set('passenger_count', cleanNumber(e.target.value))}
            />
          </div>

          {/* Missed tickets — مربعان بأسهم */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              🎫 {isAr ? 'تذاكر المتخلفين عن الرحلة' : 'Missed Passenger Tickets'}
              <span className="text-gray-400 font-normal"> · {isAr ? 'العدد' : 'count'}: {missedTickets.length}</span>
            </label>
            <div className="flex items-stretch gap-2">

              {/* المربع الأول — الإدخال */}
              <div className="flex-1 border rounded-xl p-2 bg-gray-50">
                {/* محدد المحطة — تلقائي للموظف، قابل للتغيير للأدمن/المشرف */}
                {canPickStation && stations.length > 0 ? (
                  <select value={ticketStation} onChange={e => setTicketStation(e.target.value)}
                    className="w-full border rounded-lg px-2 py-1.5 text-xs bg-white focus:ring-2 focus:ring-nwbus-primary focus:outline-none mb-2">
                    {stations.map(s => {
                      const nm = isAr ? s.name_ar : s.name_en
                      return <option key={s.id} value={nm}>{nm}</option>
                    })}
                  </select>
                ) : (
                  <div className="text-[11px] text-gray-500 bg-white border rounded-lg px-2 py-1.5 mb-2 truncate">
                    📍 {ticketStation}
                  </div>
                )}
                <input value={ticket} onChange={e => setTicket(toLatinDigits(e.target.value))} onKeyDown={onTicketKey}
                  placeholder={isAr ? 'رقم التذكرة ثم Enter' : 'Ticket # then Enter'}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none mb-2" />
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {staged.length === 0
                    ? <p className="text-[11px] text-gray-400 text-center py-2">{isAr ? 'اكتب رقم التذكرة' : 'Type ticket #'}</p>
                    : staged.map((s, i) => (
                      <div key={i} className="flex items-center justify-between bg-white border rounded px-2 py-1 text-xs gap-1">
                        <span className="font-mono">{s.ticket}</span>
                        <span className="text-[10px] text-gray-400 truncate flex-1 text-center">{s.station}</span>
                        <button type="button" onClick={() => removeStaged(i)} className="text-gray-400 hover:text-red-500 shrink-0">×</button>
                      </div>
                    ))}
                </div>
              </div>

              {/* السهم — نقل المُدخل للجدول */}
              <div className="flex flex-col justify-center">
                <button type="button" onClick={transferStaged} title={isAr ? 'نقل للجدول' : 'Move'}
                  className="w-9 h-9 grid place-items-center rounded-lg border-2 border-nwbus-primary text-nwbus-primary hover:bg-nwbus-primary hover:text-white font-bold transition">
                  {isAr ? '⬅' : '➡'}
                </button>
              </div>

              {/* المربع الثاني — جدول المتخلفين */}
              <div className="flex-1 border rounded-xl p-2">
                <div className="flex justify-between text-[10px] font-semibold text-gray-400 px-1 pb-1 border-b mb-1">
                  <span>{isAr ? 'المحطة' : 'Station'}</span>
                  <span>{isAr ? 'رقم التذكرة' : 'Ticket #'}</span>
                </div>
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {missedTickets.length === 0
                    ? <p className="text-[11px] text-gray-400 text-center py-2">{isAr ? 'لا يوجد متخلفون' : 'No missed'}</p>
                    : missedTickets.map((m, i) => (
                      <div key={i} className="flex items-center justify-between bg-red-50 rounded px-2 py-1 text-xs gap-1">
                        <span className="truncate text-gray-600 flex-1">{m.station}</span>
                        <span className="font-mono text-red-600">{m.ticket}</span>
                        <button type="button" onClick={() => returnTicket(i)} title={isAr ? 'إرجاع للإدخال' : 'Return'}
                          className="text-gray-400 hover:text-nwbus-primary shrink-0">{isAr ? '➡' : '⬅'}</button>
                        <button type="button" onClick={() => removeMissed(i)} title={isAr ? 'حذف' : 'Delete'}
                          className="text-gray-400 hover:text-red-500 shrink-0">×</button>
                      </div>
                    ))}
                </div>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              {isAr ? 'اكتب رقم التذكرة واضغط Enter لإضافته، ثم Enter مرة ثانية (والحقل فارغ) لنقله للجدول.' : 'Type a ticket and press Enter to add, then Enter again (empty field) to move it to the table.'}
            </p>
          </div>

          {/* Trip Status */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              ⚡ {isAr ? 'حالة الرحلة' : 'Trip Status'}
            </label>
            <select className={inputCls}
              value={form.operational_status} onChange={e => set('operational_status', e.target.value)}>
              {TRIP_STATUSES.map(s => (
                <option key={s.value} value={s.value}>{isAr ? s.ar : s.en}</option>
              ))}
            </select>
          </div>

          {/* Facilities status */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              🛠️ {isAr ? 'حالة التجهيزات' : 'Facilities'}
            </label>
            <div className="space-y-1.5">
              {[
                { k: 'screen_works',     label: isAr ? '📺 الشاشة' : 'Screen' },
                { k: 'wheelchair_works', label: isAr ? '♿ ويل تشير' : 'Wheelchair' },
                { k: 'toilet_works',     label: isAr ? '🚻 دورات المياه' : 'Toilets' },
              ].map(f => (
                <div key={f.k} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                  <span className="text-sm text-gray-700">{f.label}</span>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => set(f.k, true)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${form[f.k] ? 'bg-green-600 text-white' : 'bg-white border text-gray-400'}`}>
                      {isAr ? 'تعمل' : 'Works'}
                    </button>
                    <button type="button" onClick={() => set(f.k, false)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${!form[f.k] ? 'bg-red-500 text-white' : 'bg-white border text-gray-400'}`}>
                      {isAr ? 'لا تعمل' : 'Faulty'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              📝 {isAr ? 'ملاحظات' : 'Notes'}
            </label>
            <textarea rows={2} className={`${inputCls} resize-none`}
              value={form.notes} onChange={e => set('notes', e.target.value)}
            />
          </div>

          {error && <p className="text-red-600 text-xs bg-red-50 rounded-lg p-2">{error}</p>}

          <p className="text-xs text-gray-400 border-t pt-2">
            ✍️ {profile?.full_name_ar} · {new Date().toLocaleDateString('ar-SA-u-ca-gregory')} {new Date().toLocaleTimeString('ar-SA-u-ca-gregory', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </p>

          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="flex-1 text-white py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 transition-colors"
              style={{ background: isArrival ? '#0d9488' : '#1B3A6B' }}>
              {saving ? (isAr ? 'جارٍ الحفظ...' : 'Saving...') : (isAr ? '💾 حفظ' : '💾 Save')}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─── Main Page ─────────────────────────────────────────── */
export default function TransportationPage() {
  const { profile, isGeneralAdmin, isStationAdmin, isAccountant } = useAuth()
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const [date, setDate]       = useState(todayStr())
  const [trips, setTrips]     = useState([])   // merged: { ...schedule, role: 'departure'|'transit' }
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]     = useState(null)
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState('departure') // 'departure' | 'arrival' | 'all'

  const [stations, setStations]           = useState([])
  const [selectedStation, setSelectedStation] = useState(profile?.station_id ?? '')
  const [showUpload, setShowUpload]       = useState(false)
  const [showSelect, setShowSelect]       = useState(false)
  const [showExtra, setShowExtra]         = useState(false)

  // الأدمن/المحاسب يتنقّلون بين كل المحطات؛ المشرف بين محطاته المعيّنة فقط
  const stationId = selectedStation || null

  // جلب المحطات: الأدمن يرى الكل؛ المشرف والمحاسب محطاتهم فقط
  useEffect(() => {
    if (isGeneralAdmin) {
      supabase.from('stations').select('id, name_ar, name_en').eq('is_active', true).order('name_ar')
        .then(({ data }) => { if (data?.length) setStations(data.filter(s => !isRestStation(s))) })
    } else if ((isStationAdmin || isAccountant) && profile?.id) {
      supabase.from('user_stations').select('station:station_id(id, name_ar, name_en)').eq('user_id', profile.id)
        .then(({ data }) => {
          let sts = (data ?? []).map(r => r.station).filter(Boolean).filter(s => !isRestStation(s))
          if (sts.length === 0 && profile?.station) sts = [profile.station]
          setStations(sts)
        })
    }
  }, [isGeneralAdmin, isAccountant, isStationAdmin, profile?.id])

  // اختيار محطة افتراضية
  useEffect(() => {
    if (selectedStation) return
    if (stations.length) setSelectedStation(stations[0].id)
    else if (profile?.station_id) setSelectedStation(profile.station_id)
  }, [stations, profile])

  const fetchData = useCallback(async () => {
    if (!stationId) {
      setTrips([]); setRecords([]); setLoading(false)
      return
    }
    setLoading(true)

    const tripFields = `
      id, trip_number, trip_name, scheduled_departure, scheduled_arrival, bus_type, is_active, is_rf, rf_date,
      from_station:from_station_id(id, name_ar, name_en),
      to_station:to_station_id(id, name_ar, name_en)
    `

    const [
      { data: chosen },
      { data: stopRows },
      { data: recs },
    ] = await Promise.all([
      // الرحلات التي اختارها مشرف المحطة فقط (station_trips) مع تعديلات المغادرة
      // كل رحلات المحطة — الفلترة لكل اتجاه (مغادرة/وصول) على حِدة
      supabase.from('station_trips')
        .select(`departure_time, arrival_time, is_extra, dep_enabled, arr_enabled, departure_station:departure_station_id(id, name_ar, name_en), trip:trip_schedule_id(${tripFields})`)
        .eq('station_id', stationId),

      // أوقات مرور الباص بهذه المحطة (للرحلات العابرة)
      supabase.from('trip_schedule_stops')
        .select('trip_schedule_id, arrival_time, departure_time')
        .eq('station_id', stationId),

      // Daily records for this station & date
      supabase.from('trip_records')
        .select('*')
        .eq('record_date', date)
        .eq('station_id', stationId),
    ])

    const stopMap = {}
    ;(stopRows ?? []).forEach(s => { stopMap[s.trip_schedule_id] = { arrival: s.arrival_time, departure: s.departure_time } })
    const stationObj = stations.find(s => s.id === stationId) || profile?.station || { id: stationId }
    const s5 = t => t ? String(t).slice(0, 5) : ''

    const entries = []
    ;(chosen ?? []).forEach(r => {
      const tr = r.trip
      if (!tr || !tr.is_active) return
      if (tr.is_rf && tr.rf_date !== date) return            // رحلة إضافية تظهر في تاريخها فقط
      const isDest   = tr.to_station?.id === stationId       // المحطة هي الوجهة
      const isOrigin = tr.from_station?.id === stationId      // المحطة هي المنشأ
      const stop     = stopMap[tr.id]                          // المحطة محطة عبور
      const base = { ...tr, is_extra: !!r.is_extra, is_rf: !!tr.is_rf }
      const arrOn = r.arr_enabled !== false   // وصول مفعّل؟
      const depOn = r.dep_enabled !== false   // مغادرة مفعّلة؟

      // الوقتان المخصصان للمحطة (يتجاوزان وقت الجدول)
      const arrT = r.arrival_time || ''
      const depT = r.departure_time || ''
      const addArr = (toStation, time) => arrOn && entries.push({ ...base, role: 'arrival', ...(toStation ? { to_station: toStation } : {}), schedTime: s5(time), _key: tr.id + '-a' })
      const addDep = (fromStation, time) => depOn && entries.push({ ...base, role: 'departure', ...(fromStation ? { from_station: fromStation } : {}), schedTime: s5(time), _key: tr.id + '-d' })

      if (isDest) {
        addArr(null, arrT || tr.scheduled_arrival)
      } else if (isOrigin) {
        addDep(r.departure_station || tr.from_station, depT || tr.scheduled_departure)
      } else if (stop) {
        addArr(stationObj, arrT || stop.arrival || tr.scheduled_arrival)
        addDep(stationObj, depT || stop.departure || tr.scheduled_departure)
      } else {
        addArr(stationObj, arrT || tr.scheduled_arrival || tr.scheduled_departure)
        addDep(stationObj, depT || tr.scheduled_departure)
      }
    })
    entries.sort((a, b) => (a.schedTime || '').localeCompare(b.schedTime || ''))

    setTrips(entries)
    setRecords(recs ?? [])
    setLoading(false)
  }, [date, stationId, stations, profile])

  useEffect(() => { fetchData() }, [fetchData])

  // تقدّم التاريخ تلقائياً عند منتهى اليوم (لو معروض «اليوم») بدون تحديث يدوي
  const todayRef = useRef(todayStr())
  useEffect(() => {
    const id = setInterval(() => {
      const now = todayStr()
      if (now !== todayRef.current) {
        setDate(prev => (prev === todayRef.current ? now : prev))
        todayRef.current = now
      }
    }, 30000)
    return () => clearInterval(id)
  }, [])

  // إخفاء (تعليق) اتجاه واحد من الرحلة (مغادرة أو وصول) — للأدمن
  async function suspendStationTrip(tripId, role) {
    const patch = role === 'arrival' ? { arr_enabled: false } : { dep_enabled: false }
    const { error } = await supabase.from('station_trips').update(patch)
      .eq('station_id', stationId).eq('trip_schedule_id', tripId)
    if (error) { alert((isAr ? 'فشل: ' : 'Failed: ') + error.message); return }
    fetchData()
  }

  // حذف رحلة إضافية (RF) نهائياً — للمشرف والأدمن
  async function deleteRfTrip(tripId) {
    if (!window.confirm(isAr ? 'حذف الرحلة الإضافية (RF) نهائياً من كل المحطات؟' : 'Permanently delete this extra (RF) trip from all stations?')) return
    try {
      await supabase.from('trip_records').delete().eq('trip_schedule_id', tripId)
      await supabase.from('station_trips').delete().eq('trip_schedule_id', tripId)
      await supabase.from('trip_schedule_stops').delete().eq('trip_schedule_id', tripId)
      const { error } = await supabase.from('trip_schedule').delete().eq('id', tripId)
      if (error) throw error
      fetchData()
    } catch (err) {
      alert((isAr ? 'فشل الحذف: ' : 'Delete failed: ') + (err.message || ''))
    }
  }

  // تطبيق أي جدول مستقبلي حان موعده (للأدمن فقط، مرة عند الفتح)
  useEffect(() => {
    if (!isGeneralAdmin || !profile?.id) return
    applyDueSchedules(profile).then(n => { if (n > 0) fetchData() }).catch(() => {})
  }, [isGeneralAdmin, profile?.id])

  const recordMap = {}
  records.forEach(r => { recordMap[r.trip_schedule_id] = r })

  // Filter & search
  const filtered = trips.filter(t => {
    if (filter !== 'all' && t.role !== filter) return false
    if (!search) return true
    const q = search.toLowerCase()
    return (
      t.trip_number?.toLowerCase().includes(q) ||
      t.trip_name?.toLowerCase().includes(q) ||
      t.trip_name?.includes(q) ||
      t.to_station?.name_ar?.includes(q) ||
      t.to_station?.name_en?.toLowerCase().includes(q) ||
      recordMap[t.id]?.bus_number?.includes(q)
    )
  })

  // Stats
  const total        = trips.length
  const departureCnt = trips.filter(t => t.role === 'departure').length
  const arrivalCnt   = trips.filter(t => t.role === 'arrival').length
  const entered      = Object.keys(recordMap).length
  const onTime       = records.filter(r => r.departure_accuracy === 'On Time').length
  const delayed      = records.filter(r => r.departure_accuracy === 'Delayed').length
  const cancelled    = records.filter(r => r.is_cancelled).length
  const extra        = records.filter(r => r.is_extra_trip).length
  const enteredPct   = total > 0 ? Math.round((entered / total) * 100) : 0

  const canEdit = !isAccountant

  const selectedStationName = stations.find(s => s.id === selectedStation)
    ? (isAr
        ? stations.find(s => s.id === selectedStation)?.name_ar
        : stations.find(s => s.id === selectedStation)?.name_en)
    : (isAr ? 'اختر محطة' : 'Select station')

  return (
    <div className="p-4 md:p-6" dir={isAr ? 'rtl' : 'ltr'}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-nwbus-primary">
            🚌 {isAr ? 'الترحيل' : 'Transportation'}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            📍 {profile?.station ? (isAr ? profile.station.name_ar : profile.station.name_en) : selectedStationName}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {/* Upload schedule — admin only */}
          {isGeneralAdmin && (
            <button onClick={() => setShowUpload(true)}
              className="bg-nwbus-primary text-white rounded-xl px-3 py-2 text-sm font-semibold hover:opacity-90">
              {isAr ? '📤 رفع جدول الرحلات' : '📤 Upload Schedule'}
            </button>
          )}
          {/* Select station trips — supervisor & admin */}
          {isGeneralAdmin && stationId && (
            <button onClick={() => setShowSelect(true)}
              className="bg-white border border-nwbus-primary text-nwbus-primary rounded-xl px-3 py-2 text-sm font-semibold hover:bg-blue-50">
              {isAr ? '⚙️ تفعيل رحلات المحطة' : '⚙️ Activate Trips'}
            </button>
          )}
          {/* Add extra trip (RF) — supervisor & admin */}
          {(isGeneralAdmin || isStationAdmin) && (
            <button onClick={() => setShowExtra(true)}
              className="bg-white border border-purple-600 text-purple-700 rounded-xl px-3 py-2 text-sm font-semibold hover:bg-purple-50">
              {isAr ? '🔁 رحلة إضافية (RF)' : '🔁 Extra Trip (RF)'}
            </button>
          )}
          {/* Station selector — admin/accountant always, supervisor when multi-station */}
          {(isGeneralAdmin || ((isStationAdmin || isAccountant) && stations.length > 1)) && stations.length > 0 && (
            <SearchSelect isAr={isAr} value={selectedStation} onChange={setSelectedStation}
              placeholder={isAr ? '— اختر محطة —' : '— Select station —'}
              className="border rounded-xl px-3 py-2 text-sm bg-white min-w-[180px]"
              options={stations.map(s => ({ value: s.id, label: isAr ? s.name_ar : s.name_en }))} />
          )}
          <DatePicker inline value={date} onChange={setDate} isAr={isAr}
            className="border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none bg-white"
          />
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
        {[
          { label: isAr ? 'إجمالي' : 'Total',        val: total,                                    color: 'bg-blue-50 text-blue-700' },
          { label: isAr ? 'مُدخلة' : 'Entered',      val: `${entered} (${enteredPct}%)`,           color: 'bg-green-50 text-green-700' },
          { label: isAr ? 'في الوقت' : 'On Time',    val: onTime,                                   color: 'bg-emerald-50 text-emerald-700' },
          { label: isAr ? 'متأخرة' : 'Delayed',      val: delayed,                                  color: 'bg-red-50 text-red-700' },
          { label: isAr ? 'مغادرة' : 'Departure',    val: departureCnt,                             color: 'bg-nwbus-primary/10 text-nwbus-primary' },
          { label: isAr ? 'وصول' : 'Arrival',         val: arrivalCnt,                               color: 'bg-teal-50 text-teal-700' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl p-2.5 text-center ${s.color}`}>
            <div className="text-lg font-bold">{s.val}</div>
            <div className="text-xs leading-tight">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-3 mb-4">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>{isAr ? 'تقدم الإدخال اليومي' : 'Daily Entry Progress'}</span>
            <span className="font-semibold">{entered} / {total} ({enteredPct}%)</span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-nwbus-primary rounded-full transition-all duration-700"
              style={{ width: `${enteredPct}%` }} />
          </div>
        </div>
      )}

      {/* Tabs — مغادرة / وصول */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { val: 'departure', label: isAr ? 'مغادرة' : 'Departures', cnt: departureCnt, icon: '🔵', active: 'bg-nwbus-primary text-white border-nwbus-primary', idle: 'bg-white text-nwbus-primary border-blue-200' },
          { val: 'arrival',   label: isAr ? 'وصول' : 'Arrivals',     cnt: arrivalCnt,   icon: '🟢', active: 'bg-teal-600 text-white border-teal-600',   idle: 'bg-white text-teal-700 border-teal-200' },
          { val: 'all',       label: isAr ? 'الكل' : 'All',          cnt: total,        icon: '📋', active: 'bg-gray-800 text-white border-gray-800',  idle: 'bg-white text-gray-600 border-gray-200' },
        ].map(t => (
          <button key={t.val} onClick={() => setFilter(t.val)}
            className={`flex items-center justify-center gap-2 rounded-xl border-2 py-3 font-bold text-sm transition-all ${filter === t.val ? t.active + ' shadow-md' : t.idle + ' hover:shadow-sm'}`}>
            <span>{t.icon} {t.label}</span>
            <span className={`text-xs rounded-full px-2 py-0.5 ${filter === t.val ? 'bg-white/25' : 'bg-gray-100'}`}>{t.cnt}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <input type="text"
          placeholder={isAr ? '🔍 بحث برقم الرحلة أو الاسم أو رقم الحافلة...' : '🔍 Search by trip #, name or bus #...'}
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none bg-white"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-20 text-gray-400">
          <div className="text-4xl animate-pulse mb-2">🚌</div>
          <p>{isAr ? 'جارٍ تحميل الرحلات...' : 'Loading trips...'}</p>
        </div>
      ) : !stationId ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-2">📍</p>
          <p>{isAr ? 'اختر محطة لعرض رحلاتها' : 'Select a station to view trips'}</p>
        </div>
      ) : trips.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-2">📋</p>
          <p>{isAr ? 'لا توجد رحلات مسجلة لهذه المحطة' : 'No trips found for this station'}</p>
          <p className="text-xs mt-1 text-gray-300">
            {isAr ? 'يمكن للأدمن العام إضافة رحلات من صفحة إدارة الرحلات' : 'General admin can add trips from trip management'}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-3xl mb-2">🔍</p>
          <p>{isAr ? 'لا نتائج للبحث' : 'No results found'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(trip => {
            const rec      = recordMap[trip.id]
            const isEntry  = !!rec
            const isCancelled = rec?.is_cancelled
            const isArrival   = trip.role === 'arrival'
            const showTime    = trip.schedTime

            return (
              <div key={trip._key}
                className={`bg-white rounded-2xl shadow-sm border transition-all
                  ${isCancelled ? 'opacity-50 border-gray-200'
                    : 'border-gray-100 hover:border-nwbus-primary/30 hover:shadow-md'}`}
              >
                <div className="flex items-center gap-3 p-4">

                  {/* Time badge */}
                  <div className={`text-center w-16 shrink-0 rounded-xl py-2
                    ${isEntry
                      ? (isArrival ? 'bg-teal-600 text-white' : 'bg-nwbus-primary text-white')
                      : 'bg-gray-100 text-gray-500'}`}>
                    <div className="text-sm font-bold font-mono">
                      {showTime}
                    </div>
                    <div className="text-xs opacity-70">
                      {isArrival ? (isAr ? 'وصول' : 'Arr.') : (isAr ? 'مغادرة' : 'Dep.')}
                    </div>
                  </div>

                  {/* Trip info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="font-bold text-nwbus-primary text-sm">{trip.trip_number}</span>
                      {trip.trip_name && (
                        <span className="text-xs text-gray-500 font-medium">{trip.trip_name}</span>
                      )}
                      {isArrival && (
                        <span className="text-xs bg-teal-100 text-teal-700 rounded-full px-2 py-0.5 font-semibold">
                          {isAr ? 'وصول' : 'Arrival'}
                        </span>
                      )}
                      {trip.bus_type && BUS_TYPE[trip.bus_type] && (
                        <span className={`text-[10px] rounded-full px-2 py-0.5 font-semibold ${BUS_TYPE[trip.bus_type].color}`}>
                          🚌 {isAr ? BUS_TYPE[trip.bus_type].ar : BUS_TYPE[trip.bus_type].en}
                        </span>
                      )}
                      {trip.enabled === false && (
                        <span className="text-[10px] rounded-full px-2 py-0.5 font-semibold bg-gray-200 text-gray-500">
                          {isAr ? 'معلّقة' : 'Suspended'}
                        </span>
                      )}
                      {(trip.is_rf || trip.is_extra || rec?.is_extra_trip) && (
                        <span className="text-xs bg-purple-100 text-purple-700 rounded-full px-2 py-0.5 font-bold">RF</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 truncate">
                      {isAr ? trip.from_station?.name_ar : trip.from_station?.name_en}
                      {' → '}
                      {isAr ? trip.to_station?.name_ar : trip.to_station?.name_en}
                    </p>
                    {isEntry && (
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {rec.departure_accuracy && !isArrival && (
                          <span className={`text-xs ${accuracyColor(rec.departure_accuracy)}`}>
                            {isAr ? accuracyAr(rec.departure_accuracy) : rec.departure_accuracy}
                          </span>
                        )}
                        {rec.bus_number && (
                          <span className="text-xs text-gray-400 font-mono bg-gray-50 rounded px-1.5 py-0.5">
                            🚌 {rec.bus_number}
                          </span>
                        )}
                        {rec.passenger_count > 0 && (
                          <span className="text-xs text-gray-400">👥 {rec.passenger_count}</span>
                        )}
                        {rec.operational_status && rec.operational_status !== 'Normal' && (
                          <span className="text-xs bg-red-50 text-red-600 rounded-full px-2 py-0.5">
                            {isAr ? TRIP_STATUSES.find(s => s.value === rec.operational_status)?.ar : rec.operational_status}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {trip.is_rf && (isGeneralAdmin || isStationAdmin) && (
                      <button onClick={() => deleteRfTrip(trip.id)}
                        title={isAr ? 'حذف الرحلة الإضافية' : 'Delete extra trip'}
                        className="text-xs border border-purple-300 text-purple-500 rounded-lg px-2 py-2 hover:bg-purple-50 hover:text-red-600">
                        🗑️
                      </button>
                    )}
                    {isGeneralAdmin && (
                      <button onClick={() => suspendStationTrip(trip.id, trip.role)}
                        title={isAr ? (trip.role === 'arrival' ? 'إخفاء الوصول' : 'إخفاء المغادرة') : 'Hide'}
                        className="text-xs border border-gray-300 text-gray-400 rounded-lg px-2 py-2 hover:bg-gray-100 hover:text-red-500">
                        🚫
                      </button>
                    )}
                    {canEdit ? (
                      <button
                        onClick={() => setModal({ trip, record: rec ?? null, isArrival, schedTime: trip.schedTime })}
                        className={`text-sm rounded-xl px-4 py-2 font-semibold transition-colors whitespace-nowrap
                          ${isEntry
                            ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            : isArrival
                              ? 'bg-teal-600 text-white hover:bg-teal-700'
                              : 'bg-nwbus-primary text-white hover:bg-nwbus-dark'}`}
                      >
                        {isEntry ? (isAr ? 'تعديل' : 'Edit') : (isAr ? '+ إدخال' : '+ Enter')}
                      </button>
                    ) : (
                      <div className={`w-3 h-3 rounded-full ${isEntry ? 'bg-green-400' : 'bg-gray-200'}`} />
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Stats footer */}
      {trips.length > 0 && !loading && (
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-400">
          {extra > 0 && <span className="bg-purple-50 text-purple-600 rounded-full px-3 py-1">+ {extra} {isAr ? 'إضافية' : 'extra'}</span>}
          {cancelled > 0 && <span className="bg-red-50 text-red-600 rounded-full px-3 py-1">✕ {cancelled} {isAr ? 'ملغاة' : 'cancelled'}</span>}
          {delayed > 0 && <span className="bg-orange-50 text-orange-600 rounded-full px-3 py-1">⚠ {delayed} {isAr ? 'متأخرة' : 'delayed'}</span>}
        </div>
      )}

      {modal && (
        <TripModal
          trip={modal.trip}
          record={modal.record}
          stationId={stationId}
          stationName={selectedStationName || (isAr ? profile?.station?.name_ar : profile?.station?.name_en) || ''}
          stations={stations}
          isArrival={modal.isArrival}
          schedTime={modal.schedTime}
          onClose={() => setModal(null)}
          onSaved={fetchData}
        />
      )}

      {showUpload && (
        <ScheduleUploadModal
          isAr={isAr}
          onClose={() => setShowUpload(false)}
          onDone={fetchData}
        />
      )}

      {showSelect && stationId && (
        <StationTripsModal
          stationId={stationId}
          stationName={selectedStationName || (isAr ? profile?.station?.name_ar : profile?.station?.name_en) || ''}
          stations={stations}
          isAr={isAr}
          onClose={() => setShowSelect(false)}
          onDone={fetchData}
        />
      )}

      {showExtra && (
        <ExtraTripModal
          isAr={isAr}
          onClose={() => setShowExtra(false)}
          onCreated={fetchData}
        />
      )}
    </div>
  )
}
