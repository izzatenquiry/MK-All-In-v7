-- Add last_cookies_file column to users table in Supabase
-- This column stores the cookie file name used for the last auth token generation
-- Format: e.g., "flow_g11_c1.json" (filename only, not full path)

-- For MONOKLIX Supabase
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS last_cookies_file TEXT;

-- For ESAIE Supabase (if separate database)
-- ALTER TABLE users 
-- ADD COLUMN IF NOT EXISTS last_cookies_file TEXT;

-- Add comment to column (PostgreSQL)
COMMENT ON COLUMN users.last_cookies_file IS 'Last cookie file name used for auth token generation (e.g., flow_g11_c1.json)';
