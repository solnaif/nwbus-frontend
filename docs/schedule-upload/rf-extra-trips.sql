-- ============================================================
--  NWBUS — الرحلات الإضافية (RF) كرحلات مكررة لتاريخ محدّد
--  شغّل هذا مرة واحدة في: Supabase Dashboard → SQL Editor
-- ============================================================

-- أعمدة الرحلة الإضافية على جدول الرحلات (آمنة — إضافة فقط)
ALTER TABLE trip_schedule
  ADD COLUMN IF NOT EXISTS is_rf          boolean DEFAULT false,  -- رحلة إضافية (RF)؟
  ADD COLUMN IF NOT EXISTS rf_date        date,                   -- تاريخ تشغيل الرحلة الإضافية
  ADD COLUMN IF NOT EXISTS parent_trip_id uuid REFERENCES trip_schedule(id) ON DELETE SET NULL;  -- الرحلة الأساسية المنسوخة منها

-- فهرس لتسريع جلب رحلات RF حسب التاريخ
CREATE INDEX IF NOT EXISTS idx_trip_schedule_rf ON trip_schedule (is_rf, rf_date);
