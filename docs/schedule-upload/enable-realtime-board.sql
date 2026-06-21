-- ============================================================
--  NWBUS — تفعيل التحديث المباشر (Realtime) لشاشة العرض الحيّة
--  شغّل هذا مرة واحدة في: Supabase Dashboard → SQL Editor
--  بعدها أي إدخال/تعديل يظهر فوراً على الشاشة بدون تحديث.
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE trip_records;
ALTER PUBLICATION supabase_realtime ADD TABLE station_trips;
ALTER PUBLICATION supabase_realtime ADD TABLE trip_schedule;

-- ملاحظة: لو ظهر خطأ "already member of publication" فهذا يعني الجدول مُفعّل مسبقاً — تجاهله.
