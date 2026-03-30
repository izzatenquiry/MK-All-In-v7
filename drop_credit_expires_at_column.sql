-- Single source of truth for Token Ultra + package credit validity: users.expires_at
-- Run in Supabase SQL Editor after deploying app code that no longer references credit_expires_at.
--
-- 1) Backfill expires_at from credit_expires_at where expires_at is null
UPDATE public.users
SET expires_at = credit_expires_at
WHERE expires_at IS NULL AND credit_expires_at IS NOT NULL;

-- 2) Drop redundant column
ALTER TABLE public.users DROP COLUMN IF EXISTS credit_expires_at;

-- 3) REQUIRED: Edit RPC functions in Supabase (e.g. apply_credit_package, consume_package_credits)
--    so they only read/write expires_at (not credit_expires_at). Example for apply_credit_package:
--    - When extending validity, use: UPDATE users SET credit_balance = ..., expires_at = <new expiry> WHERE id = ...
