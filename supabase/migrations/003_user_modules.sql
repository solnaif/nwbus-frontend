-- Add allowed_modules to users table
-- NULL = access to all modules
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS allowed_modules TEXT[] DEFAULT NULL;

-- Add supervisor_id for station employees/accountants
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS supervisor_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_supervisor ON users(supervisor_id);
