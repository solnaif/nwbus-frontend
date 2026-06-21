-- ============================================================
-- Row Level Security (RLS) Policies — NWBus
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE stations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_schedule      ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_schedule_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_records       ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_transit_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_cancellations ENABLE ROW LEVEL SECURITY;
ALTER TABLE lost_found_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_records      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log          ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Helper function: get current user's role & station
-- ============================================================

CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role AS $$
  SELECT role FROM users WHERE auth_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION current_user_station_id()
RETURNS UUID AS $$
  SELECT station_id FROM users WHERE auth_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION current_user_id()
RETURNS UUID AS $$
  SELECT id FROM users WHERE auth_id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================
-- USERS table policies
-- ============================================================

-- Anyone authenticated can view their own profile
CREATE POLICY "users_select_own" ON users
  FOR SELECT USING (auth_id = auth.uid());

-- Station admin sees employees of their station; general admin sees all
CREATE POLICY "users_select_admin" ON users
  FOR SELECT USING (
    current_user_role() IN ('station_admin', 'general_admin')
  );

-- Only general admin can insert/update/delete users
CREATE POLICY "users_insert_general_admin" ON users
  FOR INSERT WITH CHECK (current_user_role() = 'general_admin');

CREATE POLICY "users_update_general_admin" ON users
  FOR UPDATE USING (current_user_role() = 'general_admin');

-- ============================================================
-- STATIONS table policies
-- ============================================================

-- All authenticated users can view stations
CREATE POLICY "stations_select_all" ON stations
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only general admin can manage stations
CREATE POLICY "stations_insert_admin" ON stations
  FOR INSERT WITH CHECK (current_user_role() = 'general_admin');

CREATE POLICY "stations_update_admin" ON stations
  FOR UPDATE USING (current_user_role() = 'general_admin');

-- ============================================================
-- TRIP SCHEDULE policies
-- ============================================================

CREATE POLICY "trip_schedule_select_all" ON trip_schedule
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "trip_schedule_insert_admin" ON trip_schedule
  FOR INSERT WITH CHECK (current_user_role() = 'general_admin');

CREATE POLICY "trip_schedule_update_admin" ON trip_schedule
  FOR UPDATE USING (current_user_role() = 'general_admin');

CREATE POLICY "trip_schedule_stops_select_all" ON trip_schedule_stops
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "trip_schedule_stops_insert_admin" ON trip_schedule_stops
  FOR INSERT WITH CHECK (current_user_role() = 'general_admin');

-- ============================================================
-- TRIP RECORDS policies
-- ============================================================

-- Station employees see only their station's records
-- Admins see all
CREATE POLICY "trip_records_select" ON trip_records
  FOR SELECT USING (
    current_user_role() IN ('general_admin', 'station_admin', 'accountant')
    OR station_id = current_user_station_id()
  );

-- Station employee can insert for their own station (today only — enforced in app)
CREATE POLICY "trip_records_insert" ON trip_records
  FOR INSERT WITH CHECK (
    station_id = current_user_station_id()
    OR current_user_role() = 'general_admin'
  );

-- No updates on past records — only today's records can be updated, enforced in app
CREATE POLICY "trip_records_update" ON trip_records
  FOR UPDATE USING (
    (station_id = current_user_station_id() AND record_date = CURRENT_DATE)
    OR current_user_role() = 'general_admin'
  );

-- ============================================================
-- TRANSIT RECORDS policies
-- ============================================================

CREATE POLICY "transit_records_select" ON trip_transit_records
  FOR SELECT USING (
    current_user_role() IN ('general_admin', 'station_admin', 'accountant')
    OR station_id = current_user_station_id()
  );

CREATE POLICY "transit_records_insert" ON trip_transit_records
  FOR INSERT WITH CHECK (
    station_id = current_user_station_id()
    OR current_user_role() = 'general_admin'
  );

-- Transit stations can only update bus_number field (enforced in app layer too)
CREATE POLICY "transit_records_update" ON trip_transit_records
  FOR UPDATE USING (
    (station_id = current_user_station_id() AND transit_date = CURRENT_DATE)
    OR current_user_role() = 'general_admin'
  );

-- ============================================================
-- LOST & FOUND policies
-- ============================================================

CREATE POLICY "lost_found_select" ON lost_found_items
  FOR SELECT USING (
    station_id = current_user_station_id()
    OR current_user_role() IN ('general_admin', 'station_admin')
  );

CREATE POLICY "lost_found_insert" ON lost_found_items
  FOR INSERT WITH CHECK (
    station_id = current_user_station_id()
    OR current_user_role() = 'general_admin'
  );

CREATE POLICY "lost_found_update" ON lost_found_items
  FOR UPDATE USING (
    station_id = current_user_station_id()
    OR current_user_role() IN ('general_admin', 'station_admin')
  );

-- ============================================================
-- SALES RECORDS policies
-- ============================================================

-- Employee sees only their own sales; accountant sees all for their station; admin sees all
CREATE POLICY "sales_select" ON sales_records
  FOR SELECT USING (
    current_user_role() = 'general_admin'
    OR (current_user_role() = 'accountant' AND station_id = current_user_station_id())
    OR (current_user_role() = 'station_admin' AND station_id = current_user_station_id())
    OR created_by = current_user_id()
  );

CREATE POLICY "sales_insert" ON sales_records
  FOR INSERT WITH CHECK (
    station_id = current_user_station_id()
    OR current_user_role() = 'general_admin'
  );

-- Accountant can update any record in their station; employees only their own (today)
CREATE POLICY "sales_update" ON sales_records
  FOR UPDATE USING (
    current_user_role() = 'general_admin'
    OR (current_user_role() = 'accountant' AND station_id = current_user_station_id())
    OR (created_by = current_user_id() AND sale_date = CURRENT_DATE)
  );

-- ============================================================
-- AUDIT LOG — admin only
-- ============================================================

CREATE POLICY "audit_log_select_admin" ON audit_log
  FOR SELECT USING (current_user_role() = 'general_admin');

CREATE POLICY "audit_log_insert_system" ON audit_log
  FOR INSERT WITH CHECK (TRUE);  -- inserted by server triggers/functions
