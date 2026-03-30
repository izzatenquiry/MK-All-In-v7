-- =============================================================================
-- Drop unused columns from public.users (VEOLY-AI app — verified against codebase)
-- =============================================================================
-- BEFORE RUNNING:
-- 1) Backup the database (or at least: pg_dump -t users ...).
-- 2) In Supabase: check for VIEWS, RLS policies, or TRIGGERS on these columns
--    (SQL Editor → search object dependencies).
-- 3) Do NOT run if you use these columns from Edge Functions, n8n, or external tools.
--
-- COLUMNS REMOVED (not read/written by the web app for `users`):
--   webhook_url, notes, cookie_file, cookie_files, usage_count, last_used
--
-- NOT REMOVED (still used):
--   last_cookies_file, cookie flow via saveUserPersonalAuthToken, etc.
-- =============================================================================

BEGIN;

ALTER TABLE public.users
  DROP COLUMN IF EXISTS webhook_url,
  DROP COLUMN IF EXISTS notes,
  DROP COLUMN IF EXISTS cookie_file,
  DROP COLUMN IF EXISTS cookie_files,
  DROP COLUMN IF EXISTS usage_count,
  DROP COLUMN IF EXISTS last_used;

COMMIT;

-- Optional: refresh PostgREST schema cache in Supabase Dashboard → Settings → API
-- or run: NOTIFY pgrst, 'reload schema';  (if your project uses it)
