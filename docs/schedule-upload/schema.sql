-- ============================================================
--  NWBUS — تجهيز قاعدة البيانات لميزة رفع جدول الرحلات
--  شغّل هذا مرة واحدة في: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1) أعمدة إضافية لجدول الرحلات (trip_schedule)
ALTER TABLE trip_schedule
  ADD COLUMN IF NOT EXISTS route             text,        -- رقم المسار (NW15)
  ADD COLUMN IF NOT EXISTS scheduled_arrival text,        -- وقت الوصول
  ADD COLUMN IF NOT EXISTS dispatch_info     text,        -- معلومات الإرسال
  ADD COLUMN IF NOT EXISTS dispatch_time     text,        -- وقت الإرسال
  ADD COLUMN IF NOT EXISTS schedule_period   text;        -- فترة صلاحية الجدول

-- 2) أعمدة إضافية لمحطات العبور (trip_schedule_stops)
ALTER TABLE trip_schedule_stops
  ADD COLUMN IF NOT EXISTS arrival_time   text,
  ADD COLUMN IF NOT EXISTS departure_time text,
  ADD COLUMN IF NOT EXISTS status         text;           -- ACTIVE / REST

-- 3) جدول ربط: اختيار المشرف لرحلات محطته (الاختيار اليدوي)
CREATE TABLE IF NOT EXISTS station_trips (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id       uuid NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
  trip_schedule_id uuid NOT NULL REFERENCES trip_schedule(id) ON DELETE CASCADE,
  selected_by      uuid REFERENCES users(id),
  selected_by_name text,
  created_at       timestamptz DEFAULT now(),
  UNIQUE (station_id, trip_schedule_id)
);

-- 4) سجل عمليات رفع الجداول (للتتبع)
CREATE TABLE IF NOT EXISTS schedule_uploads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period           text,
  file_name        text,
  trip_count       int,
  station_count    int,
  uploaded_by      uuid REFERENCES users(id),
  uploaded_by_name text,
  uploaded_at      timestamptz DEFAULT now()
);

-- 5) صلاحيات RLS
ALTER TABLE station_trips    ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_uploads ENABLE ROW LEVEL SECURITY;

-- قراءة مسموحة لكل مستخدم مسجّل
CREATE POLICY "read station_trips"    ON station_trips    FOR SELECT TO authenticated USING (true);
CREATE POLICY "read schedule_uploads" ON schedule_uploads FOR SELECT TO authenticated USING (true);

-- الكتابة في station_trips: لأي مستخدم مسجّل (المشرف) — يُضبط منطق الدور في التطبيق
CREATE POLICY "write station_trips" ON station_trips FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- الكتابة في schedule_uploads: لأي مستخدم مسجّل (الأدمن) — يُضبط منطق الدور في التطبيق
CREATE POLICY "write schedule_uploads" ON schedule_uploads FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ملاحظة: تأكد أن سياسات RLS على trip_schedule و trip_schedule_stops و stations
--         تسمح للأدمن بالإدراج/التحديث (INSERT/UPDATE). إن لم تكن موجودة أضِفها.
