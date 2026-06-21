-- ============================================================
-- NWBus System — Initial Schema
-- North West Bus Company
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE station_type AS ENUM ('main', 'transit');
CREATE TYPE bus_type AS ENUM ('VIP', 'WCH', 'Standard', 'Qaid');
CREATE TYPE user_role AS ENUM ('station_employee', 'accountant', 'station_admin', 'general_admin');
CREATE TYPE trip_status AS ENUM (
  'Accident between other vehicles',
  'Health (Driver/Passengers)',
  'Passenger Misbehavior',
  'Police Control',
  'Traffic Jam',
  'Weather',
  'Accident with NWB bus',
  'Malfunction inside the station',
  'Out-of-station malfunction',
  'Normal'
);
CREATE TYPE departure_accuracy AS ENUM ('Early', 'On Time', 'Not On Time', 'Delayed');
CREATE TYPE shift_type AS ENUM ('A', 'B', 'C');
CREATE TYPE lost_found_status AS ENUM ('unclaimed', 'claimed', 'disposed');
CREATE TYPE app_language AS ENUM ('ar', 'en');

-- ============================================================
-- STATIONS
-- ============================================================

CREATE TABLE stations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name_ar       TEXT NOT NULL,
  name_en       TEXT NOT NULL,
  type          station_type NOT NULL DEFAULT 'main',
  region        TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID  -- references users.id (set after users table)
);

-- ============================================================
-- USERS (employees)
-- ============================================================

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username      TEXT NOT NULL UNIQUE,
  full_name_ar  TEXT NOT NULL,
  full_name_en  TEXT,
  role          user_role NOT NULL DEFAULT 'station_employee',
  station_id    UUID REFERENCES stations(id) ON DELETE SET NULL,
  language      app_language NOT NULL DEFAULT 'ar',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Supabase Auth link (auth.users.id)
  auth_id       UUID UNIQUE
);

-- Add FK from stations back to users
ALTER TABLE stations
  ADD CONSTRAINT fk_stations_created_by
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- ============================================================
-- TRIP SCHEDULE (الجدول الثابت)
-- ============================================================

CREATE TABLE trip_schedule (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_number           TEXT NOT NULL UNIQUE,          -- e.g. "R001"
  from_station_id       UUID NOT NULL REFERENCES stations(id),
  to_station_id         UUID NOT NULL REFERENCES stations(id),
  scheduled_departure   TIME NOT NULL,                 -- scheduled time HH:MM
  bus_type              bus_type NOT NULL DEFAULT 'Standard',
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Transit stations order for each scheduled trip
CREATE TABLE trip_schedule_stops (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_schedule_id  UUID NOT NULL REFERENCES trip_schedule(id) ON DELETE CASCADE,
  station_id        UUID NOT NULL REFERENCES stations(id),
  stop_order        INTEGER NOT NULL,
  UNIQUE(trip_schedule_id, station_id)
);

-- ============================================================
-- DAILY TRIP RECORDS — Main Station Entry
-- (محطة الانطلاق / محطة الوصول)
-- ============================================================

CREATE TABLE trip_records (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_schedule_id      UUID NOT NULL REFERENCES trip_schedule(id),
  record_date           DATE NOT NULL,                 -- the day this record belongs to
  station_id            UUID NOT NULL REFERENCES stations(id),  -- recording station

  -- Trip details
  bus_number            TEXT,
  actual_departure      TIMESTAMPTZ,
  delay_minutes         INTEGER,
  departure_accuracy    departure_accuracy,
  passenger_count       INTEGER DEFAULT 0,
  missed_count          INTEGER DEFAULT 0,
  operational_status    trip_status NOT NULL DEFAULT 'Normal',
  notes                 TEXT,
  is_extra_trip         BOOLEAN NOT NULL DEFAULT FALSE,  -- RF رحلة إضافية
  is_cancelled          BOOLEAN NOT NULL DEFAULT FALSE,

  -- Audit — auto-filled
  created_by            UUID NOT NULL REFERENCES users(id),
  created_by_name       TEXT NOT NULL,    -- snapshot of name at entry time
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by            UUID REFERENCES users(id),
  updated_by_name       TEXT,
  updated_at            TIMESTAMPTZ,

  UNIQUE(trip_schedule_id, record_date, station_id)
);

-- Auto-calculate departure_accuracy on insert/update
CREATE OR REPLACE FUNCTION calc_departure_accuracy()
RETURNS TRIGGER AS $$
DECLARE
  sched TIME;
  diff  INTEGER;
BEGIN
  SELECT scheduled_departure INTO sched
  FROM trip_schedule WHERE id = NEW.trip_schedule_id;

  IF NEW.actual_departure IS NOT NULL THEN
    diff := ROUND(EXTRACT(EPOCH FROM (NEW.actual_departure::TIME - sched)) / 60);
    NEW.delay_minutes := diff;
    NEW.departure_accuracy := CASE
      WHEN diff < -2  THEN 'Early'
      WHEN diff <= 5  THEN 'On Time'
      WHEN diff <= 15 THEN 'Not On Time'
      ELSE 'Delayed'
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_departure_accuracy
  BEFORE INSERT OR UPDATE ON trip_records
  FOR EACH ROW EXECUTE FUNCTION calc_departure_accuracy();

-- ============================================================
-- TRANSIT STATION RECORDS
-- (محطة المرور — تُدخل بيانات الوصول/المغادرة في يومها)
-- ============================================================

CREATE TABLE trip_transit_records (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_record_id    UUID NOT NULL REFERENCES trip_records(id) ON DELETE CASCADE,
  station_id        UUID NOT NULL REFERENCES stations(id),
  transit_date      DATE NOT NULL,               -- the date at this transit station
  arrival_time      TIMESTAMPTZ,
  departure_time    TIMESTAMPTZ,
  bus_number        TEXT,                         -- transit can only edit bus number
  passenger_count   INTEGER DEFAULT 0,
  missed_count      INTEGER DEFAULT 0,
  notes             TEXT,

  -- Audit
  created_by        UUID NOT NULL REFERENCES users(id),
  created_by_name   TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by        UUID REFERENCES users(id),
  updated_by_name   TEXT,
  updated_at        TIMESTAMPTZ,

  UNIQUE(trip_record_id, station_id)
);

-- ============================================================
-- TRIP CANCELLATIONS (إلغاء رحلة — بإشعار مسبق قبل شهر)
-- ============================================================

CREATE TABLE trip_cancellations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_schedule_id  UUID NOT NULL REFERENCES trip_schedule(id),
  cancel_date       DATE NOT NULL,               -- the day the trip is cancelled
  reason            TEXT,
  notified_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID NOT NULL REFERENCES users(id),
  created_by_name   TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- LOST & FOUND (الموجودات)
-- ============================================================

CREATE TABLE lost_found_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_description  TEXT NOT NULL,
  item_type         TEXT,                        -- e.g. bag, phone, wallet
  found_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  found_location    TEXT,                        -- where inside station / trip
  station_id        UUID NOT NULL REFERENCES stations(id),
  trip_number       TEXT,                        -- optional link to a trip
  bus_number        TEXT,
  status            lost_found_status NOT NULL DEFAULT 'unclaimed',
  owner_name        TEXT,
  owner_contact     TEXT,
  resolved_date     DATE,
  notes             TEXT,

  -- Audit
  created_by        UUID NOT NULL REFERENCES users(id),
  created_by_name   TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by        UUID REFERENCES users(id),
  updated_by_name   TEXT,
  updated_at        TIMESTAMPTZ
);

-- ============================================================
-- SALES RECORDS (المبيعات)
-- ============================================================

CREATE TABLE sales_records (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  station_id          UUID NOT NULL REFERENCES stations(id),
  sale_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  shift               shift_type NOT NULL,

  -- Payment breakdown
  cash_amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
  mada_amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
  mada_network_ref    TEXT,
  visa_amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
  mastercard_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_type          TEXT,                      -- describe other payment method

  -- Totals
  balance_ref         TEXT,                      -- رقم الموازنة
  total_actual        NUMERIC(12,2) GENERATED ALWAYS AS (
                        cash_amount + mada_amount + visa_amount + mastercard_amount + other_amount
                      ) STORED,
  total_expected      NUMERIC(12,2),             -- entered by employee (system target)
  surplus_deficit     NUMERIC(12,2) GENERATED ALWAYS AS (
                        cash_amount + mada_amount + visa_amount + mastercard_amount + other_amount
                        - COALESCE(total_expected, 0)
                      ) STORED,

  -- Accountant confirmation
  is_confirmed        BOOLEAN NOT NULL DEFAULT FALSE,
  confirmed_by        UUID REFERENCES users(id),
  confirmed_by_name   TEXT,
  confirmed_at        TIMESTAMPTZ,
  accountant_notes    TEXT,

  -- Bank deposit
  bank_deposit_amount NUMERIC(12,2) DEFAULT 0,
  bank_deposit_ref    TEXT,

  -- Audit
  created_by          UUID NOT NULL REFERENCES users(id),
  created_by_name     TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by          UUID REFERENCES users(id),
  updated_by_name     TEXT,
  updated_at          TIMESTAMPTZ,

  UNIQUE(station_id, sale_date, shift, created_by)
);

-- ============================================================
-- AUDIT LOG — generic log for all sensitive actions
-- ============================================================

CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name  TEXT NOT NULL,
  record_id   UUID NOT NULL,
  action      TEXT NOT NULL,          -- INSERT / UPDATE / DELETE
  old_data    JSONB,
  new_data    JSONB,
  performed_by      UUID REFERENCES users(id),
  performed_by_name TEXT,
  performed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES for performance
-- ============================================================

CREATE INDEX idx_trip_records_date        ON trip_records(record_date);
CREATE INDEX idx_trip_records_station     ON trip_records(station_id);
CREATE INDEX idx_trip_records_schedule    ON trip_records(trip_schedule_id);
CREATE INDEX idx_transit_records_trip     ON trip_transit_records(trip_record_id);
CREATE INDEX idx_transit_records_station  ON trip_transit_records(station_id);
CREATE INDEX idx_transit_records_date     ON trip_transit_records(transit_date);
CREATE INDEX idx_sales_station_date       ON sales_records(station_id, sale_date);
CREATE INDEX idx_lost_found_station       ON lost_found_items(station_id);
CREATE INDEX idx_lost_found_status        ON lost_found_items(status);
CREATE INDEX idx_users_station            ON users(station_id);
CREATE INDEX idx_audit_table_record       ON audit_log(table_name, record_id);
