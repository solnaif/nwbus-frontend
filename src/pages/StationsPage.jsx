import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { toLatinDigits } from '../utils/digits'
import { syncStationTripsByNumbers } from '../utils/importSchedule'

function StationModal({ station, onClose, onSaved }) {
  const { profile } = useAuth()
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'

  const [form, setForm] = useState({
    name_ar:   station?.name_ar   ?? '',
    name_en:   station?.name_en   ?? '',
    type:      station?.type      ?? 'main',
    region:    station?.region    ?? '',
    operational: station?.operational ?? true,
    is_active: station?.is_active ?? true,
  })
  const [tripNums, setTripNums] = useState(Array.isArray(station?.trip_numbers) ? station.trip_numbers : [])
  const [numInput, setNumInput] = useState('')
  const [allTrips, setAllTrips] = useState([])   // قائمة الرحلات من الجدول
  const [tripSearch, setTripSearch] = useState('')
  const [tripOpen, setTripOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    supabase.from('trip_schedule')
      .select('trip_number, route, from_station:from_station_id(name_ar,name_en), to_station:to_station_id(name_ar,name_en)')
      .eq('is_active', true).order('trip_number')
      .then(({ data }) => setAllTrips(data ?? []))
  }, [])

  const addNum = v => {
    const code = (v ?? toLatinDigits(numInput)).trim().toUpperCase()
    if (code && !tripNums.includes(code)) setTripNums(n => [...n, code])
    setNumInput('')
    setTripSearch('')   // تصفير البحث ليبدأ الاختيار التالي من جديد
  }
  const removeNum = i => setTripNums(n => n.filter((_, idx) => idx !== i))

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const payload = { ...form, name_ar: form.name_en, trip_numbers: tripNums, created_by: profile.id }
    const res = station
      ? await supabase.from('stations').update(payload).eq('id', station.id).select('id').single()
      : await supabase.from('stations').insert(payload).select('id').single()
    if (res.error) { setError(res.error.message); setSaving(false); return }
    // ربط أرقام الرحلات بالترحيل تلقائياً
    try { await syncStationTripsByNumbers(res.data.id, tripNums, profile) }
    catch (err) { setError(err.message); setSaving(false); return }
    onSaved(); onClose()
    setSaving(false)
  }

  const inputCls = "w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none"

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="font-bold text-nwbus-primary text-lg">
            📍 {station ? (isAr ? 'تعديل محطة' : 'Edit Station') : (isAr ? 'إضافة محطة' : 'Add Station')}
          </h2>
          <button onClick={onClose} className="text-gray-400 text-2xl leading-none">×</button>
        </div>
        <form onSubmit={handleSave} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{isAr ? 'اسم المحطة (إنجليزي) *' : 'Station Name (English) *'}</label>
            <input required dir="ltr" className={inputCls} value={form.name_en} onChange={e => set('name_en', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isAr ? 'النوع' : 'Type'}</label>
              <select className={inputCls} value={form.type} onChange={e => set('type', e.target.value)}>
                <option value="main">{isAr ? 'رئيسية' : 'Main'}</option>
                <option value="transit">{isAr ? 'مرور' : 'Transit'}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isAr ? 'المنطقة' : 'Region'}</label>
              <input className={inputCls} value={form.region} onChange={e => set('region', e.target.value)} />
            </div>
          </div>
          {/* أرقام رحلات المحطة (ثابتة) */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              🚌 {isAr ? 'أرقام رحلات المحطة (وصول/مغادرة)' : 'Station trip numbers'}
            </label>
            <div className="flex gap-2">
              <input value={tripSearch} onFocus={() => setTripOpen(true)} onChange={e => { setTripSearch(e.target.value); setTripOpen(true) }}
                placeholder={isAr ? '🔍 ابحث أو افتح القائمة...' : '🔍 Search or open list...'}
                className={inputCls + ' flex-1'} />
              <button type="button" onClick={() => setTripOpen(o => !o)}
                className="shrink-0 border rounded-lg px-3 text-sm text-gray-500 hover:bg-gray-50">{tripOpen ? '▲' : '▼'}</button>
            </div>
            {tripOpen && (() => {
              const q = tripSearch.trim().toLowerCase()
              const matches = allTrips.filter(t => !tripNums.includes(t.trip_number) && (!q || (
                (t.trip_number || '').toLowerCase().includes(q) ||
                (t.route || '').toLowerCase().includes(q) ||
                (t.from_station?.name_ar || '').includes(q) || (t.from_station?.name_en || '').toLowerCase().includes(q) ||
                (t.to_station?.name_ar || '').includes(q) || (t.to_station?.name_en || '').toLowerCase().includes(q)
              )))
              return (
                <div className="mt-1 border rounded-lg max-h-52 overflow-y-auto divide-y divide-gray-100 bg-white">
                  {matches.length === 0
                    ? <p className="text-xs text-gray-400 text-center py-3">{isAr ? 'لا رحلات' : 'No trips'}</p>
                    : matches.map(t => (
                      <button type="button" key={t.trip_number}
                        onClick={() => addNum(t.trip_number)}
                        className="w-full text-right px-2 py-1.5 hover:bg-blue-50 text-xs flex items-center gap-2">
                        <span className="font-mono font-bold text-nwbus-primary">{t.trip_number}</span>
                        {t.route && <span className="text-gray-400">· {t.route}</span>}
                        <span className="text-gray-400 truncate">{t.from_station ? `${isAr ? t.from_station.name_ar : t.from_station.name_en} → ${isAr ? t.to_station?.name_ar : t.to_station?.name_en}` : ''}</span>
                      </button>
                    ))}
                </div>
              )
            })()}
            <div className="flex flex-wrap gap-1.5 mt-2 min-h-[28px] border rounded-lg p-2 bg-gray-50">
              {tripNums.length === 0
                ? <span className="text-xs text-gray-400">{isAr ? 'لا توجد رحلات بعد' : 'No trips yet'}</span>
                : tripNums.map((n, i) => {
                  const route = allTrips.find(t => t.trip_number === n)?.route
                  return (
                    <span key={i} className="inline-flex items-center gap-1 bg-white border rounded-full px-2 py-0.5 text-xs">
                      <span className="font-mono font-bold text-nwbus-primary">{n}</span>
                      {route && <span className="text-gray-400">· {route}</span>}
                      <button type="button" onClick={() => removeNum(i)} className="text-gray-400 hover:text-red-500">×</button>
                    </span>
                  )
                })}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              {isAr ? 'تُضاف رحلاتها للترحيل تلقائياً عند الحفظ وعند رفع أي جدول جديد.' : 'Auto-added to transportation on save and on each schedule upload.'}
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="rounded"
              checked={form.is_active} onChange={e => set('is_active', e.target.checked)} />
            {isAr ? 'نشطة' : 'Active'}
          </label>
          {error && <p className="text-red-600 text-xs bg-red-50 rounded p-2">{error}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={saving}
              className="flex-1 bg-nwbus-primary text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-nwbus-dark transition-colors">
              {saving ? '...' : (isAr ? 'حفظ' : 'Save')}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function StationsPage() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const [stations, setStations] = useState([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(null)
  const [search, setSearch]     = useState('')

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('stations').select('*').order('name_ar')
    setStations(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const filtered = stations.filter(s =>
    s.name_ar.includes(search) || s.name_en.toLowerCase().includes(search.toLowerCase())
  )

  const mainCount    = stations.filter(s => s.type === 'main').length
  const transitCount = stations.filter(s => s.type === 'transit').length
  const activeCount  = stations.filter(s => s.is_active).length

  return (
    <div className="p-4 md:p-6" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <h1 className="text-xl font-bold text-nwbus-primary">📍 {isAr ? 'المحطات' : 'Stations'}</h1>
        <div className="flex gap-2">
          <input placeholder={isAr ? 'بحث...' : 'Search...'}
            value={search} onChange={e => setSearch(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none" />
          <button onClick={() => setModal('new')}
            className="bg-nwbus-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-nwbus-dark transition-colors">
            + {isAr ? 'محطة جديدة' : 'New Station'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: isAr ? 'رئيسية' : 'Main',    val: mainCount,    color: 'bg-blue-50 text-blue-700' },
          { label: isAr ? 'مرور' : 'Transit',    val: transitCount, color: 'bg-purple-50 text-purple-700' },
          { label: isAr ? 'نشطة' : 'Active',     val: activeCount,  color: 'bg-green-50 text-green-700' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl p-3 text-center ${s.color}`}>
            <div className="text-2xl font-bold">{s.val}</div>
            <div className="text-xs">{s.label}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">⏳</div>
      ) : (
        <div className="bg-white rounded-2xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-nwbus-primary text-white text-xs">
              <tr>
                {[isAr ? 'الاسم' : 'Name', isAr ? 'النوع' : 'Type',
                  isAr ? 'المنطقة' : 'Region', isAr ? 'الحالة' : 'Status', ''].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-right font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(s => (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-800">{s.name_ar}</p>
                    <p className="text-xs text-gray-400">{s.name_en}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs rounded-full px-2 py-0.5 ${s.type === 'main' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                      {s.type === 'main' ? (isAr ? 'رئيسية' : 'Main') : (isAr ? 'مرور' : 'Transit')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{s.region ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs rounded-full px-2 py-0.5 ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {s.is_active ? (isAr ? 'نشطة' : 'Active') : (isAr ? 'معطلة' : 'Inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setModal(s)}
                      className="text-xs border border-nwbus-primary text-nwbus-primary rounded-lg px-3 py-1 hover:bg-nwbus-primary hover:text-white transition-colors">
                      {isAr ? 'تعديل' : 'Edit'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <StationModal
          station={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={fetch}
        />
      )}
    </div>
  )
}
