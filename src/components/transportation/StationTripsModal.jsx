import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import TimeInput24 from '../shared/TimeInput24'

/**
 * شاشة اختيار رحلات المحطة — للمشرف (والأدمن).
 * يختار المشرف أي رحلة لمحطته، ولكل رحلة مختارة يمكنه:
 *   - تعديل محطة المغادرة (افتراضياً محطته)
 *   - تثبيت موعد المغادرة من محطته (طوال فترة الجدول)
 *   - محطة الوصول ثابتة (وجهة الرحلة)
 * تُحفظ في جدول station_trips (departure_time, departure_station_id).
 */
const tripFields = `
  id, trip_number, trip_name, route, scheduled_departure, scheduled_arrival,
  from_station:from_station_id(name_en, name_ar),
  to_station:to_station_id(name_en, name_ar)
`

// خانة وقت بعرض تلقائي من الجدول + تعديل وتأكيد (للمشرف/الأدمن فقط)
function TimeCell({ value, fallback, canEdit, onConfirm, isAr }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || fallback || '')
  const effective = value || fallback || '—'
  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <TimeInput24 value={draft} placeholder={fallback || '--:--'} onChange={setDraft}
          className="!px-2 !py-1 !text-xs !rounded-lg" />
        <button onClick={() => { onConfirm(draft); setEditing(false) }}
          title={isAr ? 'تأكيد' : 'Confirm'}
          className="bg-green-600 text-white rounded-lg w-7 h-7 grid place-items-center text-sm shrink-0 hover:opacity-90">✓</button>
        <button onClick={() => setEditing(false)} title={isAr ? 'إلغاء' : 'Cancel'}
          className="text-gray-400 hover:text-gray-600 w-5 shrink-0">×</button>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-sm text-gray-800">{effective}</span>
      {!value && fallback && (
        <span className="text-[9px] text-gray-400 bg-gray-100 rounded px-1">{isAr ? 'تلقائي' : 'auto'}</span>
      )}
      {canEdit && (
        <button onClick={() => { setDraft(value || fallback || ''); setEditing(true) }}
          title={isAr ? 'تعديل' : 'Edit'}
          className="text-gray-400 hover:text-nwbus-primary text-xs ms-auto">✎</button>
      )}
    </div>
  )
}

export default function StationTripsModal({ stationId, stationName, stations = [], isAr, onClose, onDone }) {
  const { profile, isGeneralAdmin, isStationAdmin } = useAuth()
  const canEdit = isGeneralAdmin || isStationAdmin
  const [candidates, setCandidates] = useState([])
  const [selected, setSelected]     = useState(new Map())   // tripId -> {departure_time, departure_station_id}
  const [stopTimes, setStopTimes]   = useState({})          // tripId -> "HH:MM" من جدول العبور
  const [loading, setLoading]       = useState(true)
  const [busy, setBusy]             = useState(null)
  const [search, setSearch]         = useState('')
  const [error, setError]           = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [{ data: all }, { data: dep }, { data: stops }, { data: sel }] = await Promise.all([
        supabase.from('trip_schedule').select(tripFields).eq('is_active', true).order('scheduled_departure'),
        supabase.from('trip_schedule').select('id').eq('is_active', true).eq('from_station_id', stationId),
        supabase.from('trip_schedule_stops').select('trip_schedule_id, arrival_time, departure_time').eq('station_id', stationId),
        supabase.from('station_trips').select('trip_schedule_id, departure_time, arrival_time, departure_station_id, is_extra, dep_enabled, arr_enabled').eq('station_id', stationId),
      ])

      const passes = new Set([
        ...(dep ?? []).map(t => t.id),
        ...(stops ?? []).map(s => s.trip_schedule_id),
      ])
      // أوقات مرور الباص بهذه المحطة من جدول الأدمن (تُستخدم كموعد افتراضي/placeholder)
      const stMap = {}
      ;(stops ?? []).forEach(s => {
        stMap[s.trip_schedule_id] = {
          dep: (s.departure_time || '').slice(0, 5),
          arr: (s.arrival_time || '').slice(0, 5),
        }
      })
      setStopTimes(stMap)
      setCandidates((all ?? []).map(t => ({ ...t, passes: passes.has(t.id) })))

      const m = new Map()
      ;(sel ?? []).forEach(s => m.set(s.trip_schedule_id, {
        departure_time: s.departure_time ?? '',
        arrival_time: s.arrival_time ?? '',
        departure_station_id: s.departure_station_id ?? '',   // '' = محطة الانطلاق الأصلية من الجدول
        is_extra: !!s.is_extra,
        enabled: s.dep_enabled === true || s.arr_enabled === true,
        exists: true,
      }))
      setSelected(m)
    } catch (err) {
      setError(err.message || 'تعذّر التحميل')
    } finally {
      setLoading(false)
    }
  }, [stationId])

  useEffect(() => { load() }, [load])

  // تفعيل/تعليق رحلة للمحطة (لا حذف — التعليق يخفيها عن الموظف/المشرف)
  async function toggle(tr) {
    setBusy(tr.id); setError('')
    try {
      const ov = selected.get(tr.id)
      if (ov?.exists) {
        const nv = !ov.enabled
        const { error } = await supabase.from('station_trips').update({ dep_enabled: nv, arr_enabled: nv })
          .eq('station_id', stationId).eq('trip_schedule_id', tr.id)
        if (error) throw error
        setSelected(prev => { const n = new Map(prev); n.set(tr.id, { ...ov, enabled: nv }); return n })
      } else {
        const row = {
          station_id: stationId, trip_schedule_id: tr.id, departure_station_id: null, dep_enabled: true, arr_enabled: true,
          departure_time: null, arrival_time: null,   // يُشتقّ وقت التوقف من الجدول
          selected_by: profile.id, selected_by_name: profile.full_name_ar,
        }
        const { error } = await supabase.from('station_trips').insert(row)
        if (error) throw error
        setSelected(prev => new Map(prev).set(tr.id, {
          departure_time: row.departure_time ?? '', arrival_time: '', departure_station_id: '', is_extra: false, enabled: true, exists: true,
        }))
      }
    } catch (err) {
      setError(err.message || 'تعذّر الحفظ')
    } finally {
      setBusy(null)
    }
  }

  // تفعيل كل الرحلات المارّة بالمحطة دفعة واحدة
  async function bulkAddPassing() {
    setBusy('bulk'); setError('')
    try {
      const passingIds = candidates.filter(c => c.passes).map(c => c.id)
      if (!passingIds.length) return
      await supabase.from('station_trips').update({ dep_enabled: true, arr_enabled: true })
        .eq('station_id', stationId).in('trip_schedule_id', passingIds)
      const missing = candidates.filter(c => c.passes && !selected.get(c.id)?.exists)
      if (missing.length) {
        const rows = missing.map(c => ({
          station_id: stationId, trip_schedule_id: c.id, departure_station_id: null, dep_enabled: true, arr_enabled: true,
          departure_time: null, arrival_time: null,
          selected_by: profile.id, selected_by_name: profile.full_name_ar,
        }))
        await supabase.from('station_trips').insert(rows)
      }
      await load()
    } catch (err) {
      setError(err.message || 'تعذّر التفعيل')
    } finally {
      setBusy(null)
    }
  }

  async function updateOverride(tripId, patch) {
    setSelected(prev => { const n = new Map(prev); n.set(tripId, { ...n.get(tripId), ...patch }); return n })
    const { error } = await supabase.from('station_trips').update(patch)
      .eq('station_id', stationId).eq('trip_schedule_id', tripId)
    if (error) setError(error.message)
  }

  const shown = candidates.filter(t => {
    if (!search) return true
    const q = search.toLowerCase()
    return (t.trip_number ?? '').toLowerCase().includes(q) ||
           (t.route ?? '').toLowerCase().includes(q) ||
           (t.from_station?.name_en ?? '').toLowerCase().includes(q) ||
           (t.to_station?.name_en ?? '').toLowerCase().includes(q)
  }).sort((a, b) => (b.passes ? 1 : 0) - (a.passes ? 1 : 0) || (a.trip_number ?? '').localeCompare(b.trip_number ?? ''))

  const t = (en, ar) => isAr ? ar : en
  const stName = s => isAr ? s.name_ar : s.name_en

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between bg-nwbus-primary text-white px-5 py-3 rounded-t-2xl">
          <div>
            <h3 className="font-bold">{t('Activate Station Trips', '⚙️ تفعيل رحلات المحطة')}</h3>
            <p className="text-xs text-white/70 mt-0.5">{stationName} · {(() => { const e = [...selected.values()].filter(v => v.enabled).length; return t(`${e} active`, `${e} مفعّلة`) })()}</p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="p-4 border-b border-gray-100 space-y-2">
          <div className="flex gap-2">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={t('Search trips…', 'بحث برقم الرحلة أو المحطة…')}
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-nwbus-primary focus:outline-none" />
            {(() => {
              const n = candidates.filter(c => c.passes && !selected.get(c.id)?.enabled).length
              return canEdit && n > 0 && (
                <button onClick={bulkAddPassing} disabled={busy === 'bulk'}
                  className="shrink-0 bg-green-600 text-white rounded-lg px-3 py-2 text-xs font-semibold hover:opacity-90 disabled:opacity-50">
                  {busy === 'bulk' ? '…' : `✓ ${t('Activate passing', 'تفعيل المارّة')} (${n})`}
                </button>
              )
            })()}
          </div>
          {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg p-2">{error}</div>}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {loading ? (
            <p className="text-center text-gray-400 py-8 text-sm">{t('Loading…', 'جارٍ التحميل…')}</p>
          ) : shown.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">{t('No trips found', 'لا توجد رحلات')}</p>
          ) : shown.map(tr => {
            const ov = selected.get(tr.id)
            const isSel = ov?.enabled === true
            return (
              <div key={tr.id}
                className={`rounded-lg border px-3 py-2.5 transition ${isSel ? 'border-nwbus-primary bg-blue-50' : 'border-gray-200'}`}>
                {/* صف الرحلة */}
                <div className={`flex items-center gap-3 ${canEdit ? 'cursor-pointer' : ''}`} onClick={() => canEdit && busy !== tr.id && toggle(tr)}>
                  <span className={`w-5 h-5 rounded grid place-items-center shrink-0 border
                    ${isSel ? 'bg-nwbus-primary border-nwbus-primary text-white' : 'border-gray-300'}`}>
                    {isSel && '✓'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-nwbus-primary">{tr.trip_number}</span>
                      {tr.route && <span className="text-xs text-gray-400">{tr.route}</span>}
                      {ov?.is_extra && (
                        <span className="text-[10px] rounded-full px-2 py-0.5 bg-purple-100 text-purple-700 font-bold">RF</span>
                      )}
                      {tr.passes && (
                        <span className="text-[10px] rounded-full px-2 py-0.5 bg-green-100 text-green-700">
                          {t('Passes your station', 'تمر بمحطتك')}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 truncate">
                      {tr.from_station ? stName(tr.from_station) : '—'} {' → '} {tr.to_station ? stName(tr.to_station) : '—'}
                      {tr.scheduled_departure && <span className="text-gray-400"> · {tr.scheduled_departure.slice(0, 5)}</span>}
                    </div>
                  </div>
                  {busy === tr.id && <span className="text-xs text-gray-400">…</span>}
                </div>

                {/* محرّر محطة/موعد المغادرة — للرحلة المختارة */}
                {isSel && (
                  <div className="mt-2 pt-2 border-t border-blue-100 grid grid-cols-3 gap-2" onClick={e => e.stopPropagation()}>
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-0.5">{t('Departure station', 'محطة المغادرة')}</label>
                      <select value={ov.departure_station_id || ''} disabled={!canEdit}
                        onChange={e => updateOverride(tr.id, { departure_station_id: e.target.value || null })}
                        className="w-full border rounded-lg px-2 py-1.5 text-xs bg-white focus:ring-2 focus:ring-nwbus-primary focus:outline-none disabled:bg-gray-50 disabled:text-gray-500">
                        <option value="">{t('Schedule origin', 'الأصلية')}: {tr.from_station ? stName(tr.from_station) : '—'}</option>
                        {stations.map(s => <option key={s.id} value={s.id}>{stName(s)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-0.5">🔵 {t('Departure time', 'موعد المغادرة')}</label>
                      <div className="border rounded-lg px-2 py-1.5 min-h-[34px] flex items-center bg-white">
                        <TimeCell value={ov.departure_time ?? ''}
                          fallback={stopTimes[tr.id]?.dep || tr.scheduled_departure?.slice(0, 5) || ''}
                          canEdit={canEdit} isAr={isAr}
                          onConfirm={v => updateOverride(tr.id, { departure_time: v })} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-0.5">🟢 {t('Arrival time', 'موعد الوصول')}</label>
                      <div className="border rounded-lg px-2 py-1.5 min-h-[34px] flex items-center bg-white">
                        <TimeCell value={ov.arrival_time ?? ''}
                          fallback={stopTimes[tr.id]?.arr || tr.scheduled_arrival?.slice(0, 5) || ''}
                          canEdit={canEdit} isAr={isAr}
                          onConfirm={v => updateOverride(tr.id, { arrival_time: v })} />
                      </div>
                    </div>
                    <div className="col-span-3 text-[10px] text-gray-400">
                      {t('Destination', 'الوجهة')}: {tr.to_station ? stName(tr.to_station) : '—'}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
          <span className="text-sm text-gray-500">{(() => { const e = [...selected.values()].filter(v => v.enabled).length; return t(`${candidates.length} trips · ${e} active`, `${candidates.length} رحلة · ${e} مفعّلة`) })()}</span>
          <button onClick={() => { onDone?.(); onClose() }}
            className="bg-nwbus-primary text-white rounded-lg px-6 py-2 text-sm font-semibold hover:opacity-90">
            {t('Done', 'تم')}
          </button>
        </div>
      </div>
    </div>
  )
}
