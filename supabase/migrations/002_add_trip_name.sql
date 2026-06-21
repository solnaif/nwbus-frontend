-- Add trip_name to trip_schedule
ALTER TABLE trip_schedule
  ADD COLUMN IF NOT EXISTS trip_name TEXT;

-- Update stop_order to allow NULL (stops may not need strict ordering)
-- No change needed for trip_schedule_stops

-- Add index for trip_name search
CREATE INDEX IF NOT EXISTS idx_trip_schedule_name ON trip_schedule(trip_name);
