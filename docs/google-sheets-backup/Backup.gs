/**
 * ============================================================
 *  NWBUS — نسخ احتياطي تلقائي لبيانات الترحيل إلى Google Sheets
 * ============================================================
 *  يسحب جدول trip_records من Supabase يومياً وينشئ تبويب (شيت)
 *  لكل محطة. يعمل على سيرفرات Google تلقائياً 24/7.
 *
 *  خطوات التركيب في الأسفل (انظر README).
 * ============================================================
 */

// ─── الإعدادات ─── عدّل القيمتين التاليتين فقط ───
const SUPABASE_URL  = 'https://kjngtbwcnyilemuiwjbp.supabase.co';
const SERVICE_KEY   = 'ضع_هنا_مفتاح_service_role_من_لوحة_Supabase';
// ───────────────────────────────────────────────

// أعمدة الترحيل وعناوينها العربية في الشيت
const COLUMNS = [
  ['record_date',        'التاريخ'],
  ['bus_number',         'رقم الباص'],
  ['passenger_count',    'عدد الركاب'],
  ['missed_count',       'عدد المتخلفين'],
  ['actual_departure',   'وقت المغادرة الفعلي'],
  ['operational_status', 'الحالة التشغيلية'],
  ['is_extra_trip',      'رحلة إضافية'],
  ['is_cancelled',       'ملغاة'],
  ['notes',              'ملاحظات'],
  ['created_by_name',    'أُدخل بواسطة'],
  ['trip_schedule_id',   'رقم الرحلة'],
];

/**
 * الدالة الرئيسية — تُشغَّل يومياً.
 */
function backupTransportation() {
  const stations = sbGet('stations', 'id,name_ar,name_en');
  const records  = sbGet('trip_records', '*', 'order=record_date.desc');

  // اسم المحطة حسب المعرّف
  const stationName = {};
  stations.forEach(function (s) {
    stationName[s.id] = (s.name_ar || s.name_en || ('محطة ' + s.id)).toString();
  });

  // تجميع السجلات حسب المحطة
  const byStation = {};
  records.forEach(function (r) {
    const sid = r.station_id;
    if (!byStation[sid]) byStation[sid] = [];
    byStation[sid].push(r);
  });

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // تبويب لكل محطة فعّالة
  stations.forEach(function (s) {
    const rows = byStation[s.id] || [];
    writeStationSheet(ss, sheetName(stationName[s.id]), rows);
  });

  // تحديث وقت آخر نسخة
  updateStatusSheet(ss, stations.length, records.length);
}

/**
 * كتابة بيانات محطة في تبويبها (مسح وإعادة كتابة كاملة = مرآة دقيقة).
 */
function writeStationSheet(ss, name, rows) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  sheet.clear();

  const header = COLUMNS.map(function (c) { return c[1]; });
  const data = rows.map(function (r) {
    return COLUMNS.map(function (c) {
      const v = r[c[0]];
      if (v === null || v === undefined) return '';
      if (v === true)  return 'نعم';
      if (v === false) return 'لا';
      return v;
    });
  });

  const out = [header].concat(data);
  sheet.getRange(1, 1, out.length, header.length).setValues(out);

  // تنسيق الرأس
  const hr = sheet.getRange(1, 1, 1, header.length);
  hr.setBackground('#16315e').setFontColor('#ffffff').setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, header.length);
}

/**
 * تبويب "الحالة" — يبيّن وقت آخر نسخة احتياطية.
 */
function updateStatusSheet(ss, stationCount, recordCount) {
  let sheet = ss.getSheetByName('ℹ️ الحالة');
  if (!sheet) sheet = ss.insertSheet('ℹ️ الحالة', 0);
  sheet.clear();
  const tz = Session.getScriptTimeZone();
  const now = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
  sheet.getRange(1, 1, 4, 2).setValues([
    ['آخر نسخة احتياطية', now],
    ['عدد المحطات', stationCount],
    ['إجمالي سجلات الترحيل', recordCount],
    ['المصدر', 'NWBUS — Supabase'],
  ]);
  sheet.getRange(1, 1, 4, 1).setFontWeight('bold');
  sheet.autoResizeColumns(1, 2);
}

/**
 * قراءة من Supabase REST API.
 */
function sbGet(table, select, extra) {
  let url = SUPABASE_URL + '/rest/v1/' + table + '?select=' + encodeURIComponent(select);
  if (extra) url += '&' + extra;
  const res = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY },
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code !== 200) {
    throw new Error('فشل جلب ' + table + ' — رمز ' + code + ': ' + res.getContentText());
  }
  return JSON.parse(res.getContentText());
}

/**
 * اسم تبويب صالح (Google يمنع بعض الرموز ويحدّ الطول 100 حرف).
 */
function sheetName(name) {
  return name.replace(/[\\/?*\[\]:]/g, ' ').substring(0, 90).trim() || 'محطة';
}

/**
 * إعداد المُشغّل اليومي — شغّلها مرة واحدة فقط.
 */
function createDailyTrigger() {
  // حذف أي مُشغّل سابق لتفادي التكرار
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'backupTransportation') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('backupTransportation')
    .timeBased()
    .everyDays(1)
    .atHour(23)      // 11 مساءً
    .create();
}
