-- =====================================================
-- Migration Script: Consolidate token_ultra_registrations into users table
-- =====================================================
-- This script migrates all Token Ultra registration data from the separate
-- token_ultra_registrations table into the users table for MONOKLIX.
-- After migration, MONOKLIX will use only the users table (same as ESAIE).

-- Step 1: Add new columns to users table
-- =====================================================
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS token_ultra_status TEXT CHECK (token_ultra_status IN ('active', 'expired', 'expiring_soon')) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS allow_master_token BOOLEAN DEFAULT NULL;

-- Add comments for documentation
COMMENT ON COLUMN users.token_ultra_status IS 'Token Ultra subscription status: active, expired, or expiring_soon (MONOKLIX only)';
COMMENT ON COLUMN users.allow_master_token IS 'Whether user can use master recaptcha token (null = true by default, false = blocked)';

-- Step 2: Migrate data from token_ultra_registrations to users
-- =====================================================
-- Update users table with latest registration data for each user
-- Uses DISTINCT ON to get the most recent registration per user
UPDATE users u
SET 
    email_code = COALESCE(u.email_code, tur.email_code),
    registered_at = COALESCE(u.registered_at, tur.registered_at),
    expires_at = COALESCE(u.expires_at, tur.expires_at),
    token_ultra_status = tur.status,
    allow_master_token = COALESCE(tur.allow_master_token, true), -- Default to true if null
    telegram_id = COALESCE(u.telegram_id, tur.telegram_id)
FROM (
    SELECT DISTINCT ON (user_id) 
        user_id,
        email_code,
        registered_at,
        expires_at,
        status,
        allow_master_token,
        telegram_id
    FROM token_ultra_registrations
    ORDER BY user_id, registered_at DESC
) tur
WHERE u.id = tur.user_id;

-- Step 3: Calculate status for users that have expires_at but no status
-- =====================================================
-- For users that don't have registration but have email_code/expires_at, 
-- set status based on expires_at
UPDATE users
SET token_ultra_status = CASE
    WHEN expires_at IS NULL THEN NULL
    WHEN expires_at < NOW() THEN 'expired'
    WHEN expires_at <= NOW() + INTERVAL '7 days' THEN 'expiring_soon'
    ELSE 'active'
END
WHERE token_ultra_status IS NULL 
  AND (email_code IS NOT NULL OR expires_at IS NOT NULL);

-- Step 4: Verify migration (optional - run this to check results)
-- =====================================================
-- SELECT 
--     u.id,
--     u.email,
--     u.email_code,
--     u.token_ultra_status,
--     u.expires_at,
--     u.allow_master_token,
--     tur.id as old_registration_id
-- FROM users u
-- LEFT JOIN token_ultra_registrations tur ON u.id = tur.user_id
-- WHERE u.token_ultra_status IS NOT NULL
-- ORDER BY u.email;

-- Step 5: Drop token_ultra_registrations table (AFTER VERIFICATION)
-- =====================================================
-- ⚠️ IMPORTANT: Only run this after verifying the migration is successful!
-- Uncomment the line below after confirming all data is migrated correctly.
-- DROP TABLE IF EXISTS token_ultra_registrations CASCADE;
