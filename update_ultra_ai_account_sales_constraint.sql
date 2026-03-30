-- Fix: Update constraint to include 'new_stock' and 'transferred' status
-- Run this SQL if you already have the table created

-- Drop existing constraint if it exists
ALTER TABLE ultra_ai_account_sales
  DROP CONSTRAINT IF EXISTS chk_status_values;

-- Add updated constraint with 'new_stock' and 'transferred'
ALTER TABLE ultra_ai_account_sales
  ADD CONSTRAINT chk_status_values 
  CHECK (status IN ('new_stock', 'available', 'reserved', 'sold', 'transferred', 'suspended', 'expired'));

-- Verify the constraint
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'ultra_ai_account_sales'::regclass
  AND conname = 'chk_status_values';

