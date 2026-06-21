import { supabase } from '../lib/supabase'
import { todayStr } from './dates'

/**
 * حفظ جدول الرحلات المقروء من Excel في قاعدة البيانات.
 *
 * الاستراتيجية (آمنة): مطابقة على trip_number
 *   - الرحلات الجديدة تُضاف
 *   - الموجودة تُحدَّث (نفس الصف → يحفظ التاريخ واختيارات المشرفين)
 *   - المختفية من الملف تُعطَّل (is_active=false) بدون حذف
 *   - محطات العبور تُحذف وتُعاد (بيانات مشتقة، لا ترتبط بأي تاريخ)
 *
 * @param parsed  مخرجات parseSchedule()
 * @param profile ملف المستخدم (الأدمن)
 * @param fileName اسم الملف
 * @returns ملخص العملية
 */
export async function importSchedule(parsed, profile, fileName = '', opts = {}) {
  const { startDate = null, endDate = null } = opts
  const tnull = v => (v && String(v).length) ? v : null
  const summary = {
    period: parsed.period, newStations: 0, tripsAdded: 0,
    tripsUpdated: 0, tripsDeactivated: 0, stops: 0,
  }

  /* 1) المحطات — إضافة الناقصة فقط (بدون تكرار، أسماء إنجليزية كما هي) */
  const { data: existSt, error: e1 } = await supabase.from('stations').select('id, name_en')
  if (e1) throw new Error('فشل قراءة المحطات: ' + e1.message)
  const stId = {}
  ;(existSt || []).forEach(s => { if (s.name_en) stId[s.name_en] = s.id })

  // كل أسماء المحطات: نقاط الانطلاق/الوصول + كل نقاط التوقف (بدون تكرار)
  const allNames = [...new Set([
    ...parsed.stations,
    ...parsed.stops.map(s => s.station).filter(Boolean),
  ])]
  const missing = allNames.filter(n => !stId[n])
  if (missing.length) {
    const rows = missing.map(n => ({
      name_ar: n, name_en: n, type: 'main', is_active: true, created_by: profile.id,
    }))
    for (let i = 0; i < rows.length; i += 200) {
      const { data: ins, error: e2 } = await supabase.from('stations').insert(rows.slice(i, i + 200)).select('id, name_en')
      if (e2) throw new Error('فشل إضافة المحطات: ' + e2.message)
      ins.forEach(s => { stId[s.name_en] = s.id })
    }
    summary.newStations = missing.length
  }

  /* 2) الرحلات الحالية */
  const { data: existTrips, error: e3 } = await supabase.from('trip_schedule').select('id, trip_number')
  if (e3) throw new Error('فشل قراءة الرحلات: ' + e3.message)
  const tripId = {}
  ;(existTrips || []).forEach(t => { tripId[t.trip_number] = t.id })

  // إزالة تكرار رقم الرحلة داخل الملف (يمنع خطأ التكرار عند الإضافة)
  const seenCode = new Set()
  const fileTrips = parsed.trips.filter(t => {
    if (!t.code || seenCode.has(t.code)) return false
    seenCode.add(t.code); return true
  })
  const fileCodes = seenCode

  /* 3) تعطيل الرحلات المختفية من الملف */
  const toOff = (existTrips || []).filter(t => !fileCodes.has(t.trip_number)).map(t => t.id)
  for (let i = 0; i < toOff.length; i += 200) {
    const chunk = toOff.slice(i, i + 200)
    const { error } = await supabase.from('trip_schedule').update({ is_active: false }).in('id', chunk)
    if (error) throw new Error('فشل تعطيل الرحلات القديمة: ' + error.message)
  }
  summary.tripsDeactivated = toOff.length

  /* 4) إضافة/تحديث رحلات الملف */
  const rowOf = t => ({
    trip_number: t.code,
    trip_name: t.route,
    route: t.route,
    scheduled_departure: tnull(t.startTime),
    scheduled_arrival: tnull(t.endTime),
    dispatch_info: tnull(t.dispatchInfo),
    dispatch_time: tnull(t.dispatchTime),
    schedule_period: parsed.period || null,
    bus_type: t.busType || null,
    from_station_id: stId[t.startStation] ?? null,
    to_station_id: stId[t.endStation] ?? null,
    is_active: true,
  })

  const newTrips = fileTrips.filter(t => !tripId[t.code])
  const updTrips = fileTrips.filter(t => tripId[t.code])

  // إضافة الجديدة دفعة واحدة
  for (let i = 0; i < newTrips.length; i += 200) {
    const chunk = newTrips.slice(i, i + 200).map(rowOf)
    const { data, error } = await supabase.from('trip_schedule').insert(chunk).select('id, trip_number')
    if (error) throw new Error('فشل إضافة الرحلات: ' + error.message)
    data.forEach(t => { tripId[t.trip_number] = t.id })
  }
  summary.tripsAdded = newTrips.length

  // تحديث الموجودة (على دفعات متوازية) — مع التحقق من الأخطاء
  for (let i = 0; i < updTrips.length; i += 25) {
    const chunk = updTrips.slice(i, i + 25)
    const results = await Promise.all(chunk.map(t =>
      supabase.from('trip_schedule').update(rowOf(t)).eq('id', tripId[t.code])
    ))
    const failed = results.find(r => r.error)
    if (failed) throw new Error('فشل تحديث الرحلات: ' + failed.error.message)
  }
  summary.tripsUpdated = updTrips.length

  /* 5) محطات العبور — حذف وإعادة (للرحلات الموجودة في الملف فقط) */
  const fileTripIds = fileTrips.map(t => tripId[t.code]).filter(Boolean)
  for (let i = 0; i < fileTripIds.length; i += 200) {
    const chunk = fileTripIds.slice(i, i + 200)
    const { error } = await supabase.from('trip_schedule_stops').delete().in('trip_schedule_id', chunk)
    if (error) throw new Error('فشل حذف محطات العبور القديمة: ' + error.message)
  }

  const stopRows = []
  const seenStop = new Set()                 // منع تكرار (رحلة + محطة)
  parsed.stops.forEach(s => {
    const tid = tripId[s.code]
    const sid = stId[s.station]              // فقط المحطات المعروفة (الرئيسية)
    if (!tid || !sid) return
    const key = `${tid}|${sid}`
    if (seenStop.has(key)) return            // تخطّي التكرار
    seenStop.add(key)
    stopRows.push({
      trip_schedule_id: tid,
      station_id: sid,
      stop_order: s.stopOrder,
      arrival_time: tnull(s.arrival),
      departure_time: tnull(s.departure),
      status: tnull(s.status),
    })
  })
  for (let i = 0; i < stopRows.length; i += 500) {
    const chunk = stopRows.slice(i, i + 500)
    // upsert: يحدّث عند تعارض (رحلة+محطة) بدل الفشل — يتجاوز بقايا الصفوف القديمة
    const { error } = await supabase.from('trip_schedule_stops')
      .upsert(chunk, { onConflict: 'trip_schedule_id,station_id' })
    if (error) throw new Error('فشل إضافة محطات العبور: ' + error.message)
  }
  summary.stops = stopRows.length

  /* 5.4) ربط رحلات كل محطة تلقائياً (منشأ/وجهة/عبور) بمواعيدها — بدون إدخال يدوي */
  const { data: existST } = await supabase.from('station_trips').select('station_id, trip_schedule_id')
  const haveST = new Set((existST || []).map(r => `${r.station_id}|${r.trip_schedule_id}`))
  const stRows = []
  const pushST = (sid, tid, fields) => {
    if (!sid || !tid) return
    const k = `${sid}|${tid}`
    if (haveST.has(k)) return            // لا نلمس الموجود (يحفظ تعديلات المشرف)
    haveST.add(k)
    stRows.push({ station_id: sid, trip_schedule_id: tid, departure_station_id: null, dep_enabled: false, arr_enabled: false,
      selected_by: profile.id, selected_by_name: profile.full_name_ar, ...fields })
  }
  const hhmm = v => (v ? String(v).slice(0, 5) : null)
  fileTrips.forEach(t => {
    const tid = tripId[t.code]; if (!tid) return
    pushST(stId[t.startStation], tid, { departure_time: hhmm(t.startTime) })   // منشأ → مغادرة
    pushST(stId[t.endStation], tid, { arrival_time: hhmm(t.endTime) })          // وجهة → وصول
  })
  parsed.stops.forEach(s => {
    pushST(stId[s.station], tripId[s.code], { arrival_time: hhmm(s.arrival), departure_time: hhmm(s.departure) })  // عبور
  })
  for (let i = 0; i < stRows.length; i += 500) {
    const { error } = await supabase.from('station_trips')
      .upsert(stRows.slice(i, i + 500), { onConflict: 'station_id,trip_schedule_id' })
    if (error) throw new Error('فشل ربط رحلات المحطات: ' + error.message)
  }

  /* 5.5) إعادة ربط رحلات المحطات حسب أرقامها الثابتة */
  await reapplyStationNumbers(profile)

  /* 6) سجل الرفع */
  await supabase.from('schedule_uploads').insert({
    period: parsed.period || null,
    file_name: fileName || null,
    trip_count: parsed.trips.length,
    station_count: parsed.stations.length,
    start_date: startDate,
    end_date: endDate,
    status: 'applied',
    uploaded_by: profile.id,
    uploaded_by_name: profile.full_name_ar,
  })

  return summary
}

/** إضافة رحلات لمحطة في الترحيل بناءً على أرقام رحلاتها الثابتة. يُرجع عدد المُضاف. */
export async function syncStationTripsByNumbers(stationId, numbers, profile) {
  const nums = [...new Set((numbers || []).map(n => String(n).trim()).filter(Boolean))]
  if (!nums.length) return 0
  const { data: trips } = await supabase.from('trip_schedule')
    .select('id, trip_number, scheduled_departure').eq('is_active', true).in('trip_number', nums)
  if (!trips?.length) return 0
  const { data: existing } = await supabase.from('station_trips')
    .select('trip_schedule_id').eq('station_id', stationId)
  const have = new Set((existing || []).map(r => r.trip_schedule_id))
  const rows = trips.filter(t => !have.has(t.id)).map(t => ({
    station_id: stationId, trip_schedule_id: t.id,
    departure_station_id: null, dep_enabled: true, arr_enabled: true,
    // نترك الوقت فارغاً → العرض اليومي يجيب وقت التوقف الصحيح من الجدول
    departure_time: null, arrival_time: null,
    selected_by: profile?.id ?? null, selected_by_name: profile?.full_name_ar ?? null,
  }))
  if (rows.length) {
    const { error } = await supabase.from('station_trips')
      .upsert(rows, { onConflict: 'station_id,trip_schedule_id' })
    if (error) throw new Error('فشل ربط رحلات المحطة: ' + error.message)
  }
  return rows.length
}

/** بعد رفع/تطبيق جدول: إعادة ربط رحلات كل محطة حسب أرقامها الثابتة. */
async function reapplyStationNumbers(profile) {
  const { data: sts } = await supabase.from('stations').select('id, trip_numbers')
  for (const s of sts || []) {
    const nums = Array.isArray(s.trip_numbers) ? s.trip_numbers : []
    if (nums.length) { try { await syncStationTripsByNumbers(s.id, nums, profile) } catch { /* تجاهل */ } }
  }
}

/** حفظ جدول مستقبلي معلّق (يُطبَّق تلقائياً في تاريخ بدايته). */
export async function savePendingSchedule(parsed, profile, fileName, { startDate, endDate }) {
  const { error } = await supabase.from('schedule_uploads').insert({
    period: parsed.period || null,
    file_name: fileName || null,
    trip_count: parsed.trips.length,
    station_count: parsed.stations.length,
    start_date: startDate,
    end_date: endDate,
    status: 'pending',
    payload: parsed,
    uploaded_by: profile.id,
    uploaded_by_name: profile.full_name_ar,
  })
  if (error) throw new Error('فشل حفظ الجدول المعلّق: ' + error.message)
}

/** تطبيق أي جداول معلّقة حان موعدها (start_date <= اليوم). يُستدعى عند فتح التطبيق. */
export async function applyDueSchedules(profile) {
  const today = todayStr()
  const { data } = await supabase.from('schedule_uploads')
    .select('id, payload, start_date, end_date, file_name')
    .eq('status', 'pending').lte('start_date', today).order('start_date')
  if (!data?.length) return 0
  let applied = 0
  for (const row of data) {
    if (!row.payload) continue
    await importSchedule(row.payload, profile, row.file_name || '', { startDate: row.start_date, endDate: row.end_date })
    await supabase.from('schedule_uploads').update({ status: 'applied' }).eq('id', row.id)
    applied++
  }
  return applied
}
