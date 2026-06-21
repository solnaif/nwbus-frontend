-- ============================================================
-- Seed Data — NWBus
-- Run AFTER creating Supabase Auth users manually
-- ============================================================

-- ============================================================
-- Sample Stations (replace with full 100 stations from Excel)
-- ============================================================

INSERT INTO stations (name_ar, name_en, type, region) VALUES
  ('المحطة الرئيسية - الرياض',     'Main Station - Riyadh',     'main',    'Riyadh'),
  ('المحطة الرئيسية - جدة',        'Main Station - Jeddah',     'main',    'Jeddah'),
  ('المحطة الرئيسية - الدمام',     'Main Station - Dammam',     'main',    'Eastern'),
  ('محطة مرور - القصيم',           'Transit - Qassim',          'transit', 'Qassim'),
  ('محطة مرور - المدينة المنورة',  'Transit - Madinah',         'transit', 'Madinah'),
  ('محطة مرور - حائل',             'Transit - Hail',            'transit', 'Hail');

-- ============================================================
-- Default General Admin user
-- (Create in Supabase Auth first, then update auth_id here)
-- ============================================================

-- INSERT INTO users (username, full_name_ar, full_name_en, role, language, auth_id)
-- VALUES ('admin', 'المدير العام', 'General Admin', 'general_admin', 'ar', '<auth-uuid-here>');

-- ============================================================
-- Trip Status reference (documentation only — stored as ENUM)
-- ============================================================

-- الحالات المتاحة للرحلات:
-- 'Accident between other vehicles'  → حادث بين المركبات الأخرى
-- 'Health (Driver/Passengers)'       → الصحة (السائق/الركاب)
-- 'Passenger Misbehavior'            → سوء سلوك الركاب
-- 'Police Control'                   → سيطرة الشرطة
-- 'Traffic Jam'                      → الازدحام المروري
-- 'Weather'                          → طقس
-- 'Accident with NWB bus'            → حادث مع حافلة NWB
-- 'Malfunction inside the station'   → عطل داخل المحطة
-- 'Out-of-station malfunction'       → عطل خارج المحطة
-- 'Normal'                           → طبيعي (الحالة الافتراضية)
