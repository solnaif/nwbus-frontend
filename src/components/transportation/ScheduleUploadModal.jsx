import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { parseSchedule } from '../../utils/parseSchedule'
import { importSchedule, savePendingSchedule } from '../../utils/importSchedule'
import DatePicker from '../shared/DatePicker'
import { todayStr } from '../../utils/dates'

/**
 * شاشة رفع جدول الرحلات (Excel) — للأدمن فقط.
 * تقرأ الملف → تعرض معاينة → تحفظ في قاعدة البيانات عند الاعتماد.
 */
export default function ScheduleUploadModal({ isAr, onClose, onDone }) {
  const { profile } = useAuth()
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed]     = useState(null)
  const [error, setError]       = useState('')
  const [reading, setReading]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [result, setResult]     = useState(null)
  const [startDate, setStartDate] = useState(todayStr())
  const [endDate, setEndDate]     = useState('')
  const [pending, setPending]     = useState([])

  const loadPending = () => supabase.from('schedule_uploads')
    .select('id, file_name, period, start_date, end_date')
    .eq('status', 'pending').order('start_date')
    .then(({ data }) => setPending(data ?? []))
  useEffect(() => { loadPending() }, [])

  async function updatePending(id, patch) {
    await supabase.from('schedule_uploads').update(patch).eq('id', id)
    loadPending()
  }
  async function deletePending(id) {
    if (!confirm(isAr ? 'إلغاء هذا الجدول المجدول؟' : 'Cancel this scheduled upload?')) return
    await supabase.from('schedule_uploads').delete().eq('id', id)
    loadPending()
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(''); setParsed(null); setResult(null); setFileName(file.name); setReading(true)
    try {
      const buf = await file.arrayBuffer()
      const data = parseSchedule(buf)
      if (data.trips.length === 0) throw new Error('الملف لا يحتوي على رحلات صالحة')
      setParsed(data)
    } catch (err) {
      setError(err.message || 'تعذّر قراءة الملف')
    } finally {
      setReading(false)
    }
  }

  const isFuture = startDate && startDate > todayStr()

  async function handleConfirm() {
    setSaving(true); setError('')
    try {
      if (isFuture) {
        // جدول مستقبلي → يُحفظ معلّقاً ويُطبَّق تلقائياً في تاريخ بدايته
        await savePendingSchedule(parsed, profile, fileName, { startDate, endDate: endDate || null })
        setResult({ pending: true, startDate, endDate })
      } else {
        const summary = await importSchedule(parsed, profile, fileName, { startDate, endDate: endDate || null })
        setResult(summary)
      }
      onDone?.()
    } catch (err) {
      setError(err.message || 'تعذّر الحفظ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between bg-nwbus-primary text-white px-5 py-3 rounded-t-2xl">
          <h3 className="font-bold">{isAr ? '📤 رفع جدول الرحلات' : '📤 Upload Trip Schedule'}</h3>
          <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* تم الحفظ */}
          {result?.pending ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-3">🕒</div>
              <p className="font-bold text-gray-800 mb-2">{isAr ? 'تم جدولة الجدول للمستقبل' : 'Schedule scheduled'}</p>
              <p className="text-sm text-gray-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                {isAr ? 'سيُطبَّق تلقائياً بتاريخ' : 'Will auto-apply on'} <b>{result.startDate}</b>
                {result.endDate ? <> {isAr ? 'حتى' : 'until'} <b>{result.endDate}</b></> : null}.
                <br />{isAr ? 'الجدول الحالي يستمر حتى ذلك التاريخ.' : 'Current schedule stays until then.'}
              </p>
              <button onClick={onClose} className="mt-4 bg-nwbus-primary text-white rounded-lg px-6 py-2 text-sm font-semibold hover:opacity-90">
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          ) : result ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-3">✅</div>
              <p className="font-bold text-gray-800 mb-3">{isAr ? 'تم تحديث الجدول بنجاح' : 'Schedule updated successfully'}</p>
              <div className="text-sm text-gray-600 space-y-1 bg-gray-50 rounded-lg p-4 text-right">
                <div>{isAr ? 'الفترة:' : 'Period:'} <b>{result.period || '—'}</b></div>
                <div>{isAr ? 'رحلات جديدة:' : 'New trips:'} <b className="text-green-600">{result.tripsAdded}</b></div>
                <div>{isAr ? 'رحلات محدّثة:' : 'Updated trips:'} <b className="text-blue-600">{result.tripsUpdated}</b></div>
                <div>{isAr ? 'رحلات معطّلة:' : 'Deactivated trips:'} <b className="text-gray-500">{result.tripsDeactivated}</b></div>
                <div>{isAr ? 'محطات جديدة:' : 'New stations:'} <b>{result.newStations}</b></div>
                <div>{isAr ? 'محطات عبور:' : 'Stops:'} <b>{result.stops}</b></div>
              </div>
              <button onClick={onClose} className="mt-4 bg-nwbus-primary text-white rounded-lg px-6 py-2 text-sm font-semibold hover:opacity-90">
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          ) : (
            <>
              {/* الجداول المجدولة (مستقبلية) — تعديل التاريخ أو الإلغاء */}
              {pending.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                  <div className="text-xs font-bold text-amber-800">🕒 {isAr ? 'جداول مجدولة' : 'Scheduled uploads'}</div>
                  {pending.map(p => (
                    <div key={p.id} className="bg-white rounded-lg p-2 text-xs space-y-1.5 border border-amber-100">
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-gray-700 truncate">{p.file_name || p.period || '—'}</span>
                        <button onClick={() => deletePending(p.id)} className="text-red-500 hover:underline shrink-0">{isAr ? 'إلغاء' : 'Cancel'}</button>
                      </div>
                      <div className="flex gap-2 items-center flex-wrap">
                        <span className="text-gray-500">{isAr ? 'البداية:' : 'Start:'}</span>
                        <DatePicker value={p.start_date || ''} isAr={isAr}
                          onChange={v => updatePending(p.id, { start_date: v })}
                          className="border rounded px-2 py-1 text-xs bg-white" />
                        <span className="text-gray-500">{isAr ? 'النهاية:' : 'End:'}</span>
                        <DatePicker value={p.end_date || ''} isAr={isAr}
                          onChange={v => updatePending(p.id, { end_date: v || null })}
                          className="border rounded px-2 py-1 text-xs bg-white" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* اختيار الملف */}
              <label className="block">
                <span className="text-sm text-gray-600">{isAr ? 'اختر ملف Excel (.xlsx)' : 'Choose Excel file (.xlsx)'}</span>
                <input type="file" accept=".xlsx,.xls" onChange={handleFile}
                  className="mt-2 block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-nwbus-primary file:text-white file:text-sm file:font-semibold hover:file:opacity-90 cursor-pointer" />
              </label>

              {reading && <p className="text-sm text-gray-400">{isAr ? 'جارٍ قراءة الملف…' : 'Reading file…'}</p>}

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg p-3">{error}</div>
              )}

              {/* المعاينة */}
              {parsed && !error && (
                <div className="space-y-3">
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm space-y-1.5">
                    <div className="font-bold text-nwbus-primary mb-1">{isAr ? 'معاينة قبل الحفظ' : 'Preview'}</div>
                    <div>{isAr ? 'الفترة:' : 'Period:'} <b>{parsed.period || '—'}</b></div>
                    <div>{isAr ? 'عدد الرحلات:' : 'Trips:'} <b>{parsed.trips.length}</b></div>
                    <div>{isAr ? 'عدد المحطات الرئيسية:' : 'Main stations:'} <b>{parsed.stations.length}</b></div>
                    <div>{isAr ? 'محطات العبور:' : 'Stop rows:'} <b>{parsed.stops.length}</b></div>
                  </div>

                  {/* المحطات */}
                  <details className="bg-gray-50 rounded-lg p-3 text-sm">
                    <summary className="cursor-pointer font-semibold text-gray-700">
                      {isAr ? `المحطات (${parsed.stations.length})` : `Stations (${parsed.stations.length})`}
                    </summary>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {parsed.stations.map(s => (
                        <span key={s} className="bg-white border border-gray-200 rounded px-2 py-0.5 text-xs text-gray-600">{s}</span>
                      ))}
                    </div>
                  </details>

                  {parsed.warnings.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 text-xs rounded-lg p-3">
                      {parsed.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
                    </div>
                  )}

                  {/* تاريخ البداية والنهاية */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{isAr ? 'تاريخ البداية' : 'Start date'}</label>
                      <DatePicker value={startDate} onChange={setStartDate} isAr={isAr}
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-white" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{isAr ? 'تاريخ النهاية (اختياري)' : 'End date (optional)'}</label>
                      <DatePicker value={endDate} onChange={setEndDate} isAr={isAr}
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-white" />
                    </div>
                  </div>

                  <div className={`text-xs rounded-lg p-3 border ${isFuture ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-blue-50 border-blue-100 text-blue-800'}`}>
                    {isFuture
                      ? (isAr ? `🕒 جدول مستقبلي — سيُطبَّق تلقائياً بتاريخ ${startDate}، والجدول الحالي يستمر حتى ذلك اليوم.`
                              : `🕒 Future schedule — auto-applies on ${startDate}; current stays until then.`)
                      : (isAr ? 'سيُطبَّق الآن: الرحلات الجديدة تُضاف، الموجودة تُحدّث، والمختفية تُعطّل. التاريخ محفوظ.'
                              : 'Applies now: new added, existing updated, missing deactivated. History preserved.')}
                  </div>

                  <div className="flex gap-2 justify-end pt-1">
                    <button onClick={onClose} disabled={saving}
                      className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
                      {isAr ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button onClick={handleConfirm} disabled={saving}
                      className="px-5 py-2 text-sm rounded-lg bg-nwbus-primary text-white font-semibold hover:opacity-90 disabled:opacity-50">
                      {saving ? (isAr ? 'جارٍ الحفظ…' : 'Saving…')
                        : isFuture ? (isAr ? '🕒 جدولة للمستقبل' : '🕒 Schedule')
                        : (isAr ? '✓ اعتماد وحفظ' : '✓ Confirm & Save')}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
