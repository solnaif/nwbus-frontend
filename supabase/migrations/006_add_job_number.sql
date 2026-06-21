-- Add job number (employee ID) to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS job_number TEXT;
