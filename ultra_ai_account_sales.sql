-- Google ULTRA AI Account Sales Management Table
-- Latest SQL Schema

CREATE TABLE IF NOT EXISTS ultra_ai_account_sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Account Information
  email TEXT UNIQUE NOT NULL,
  password TEXT,
  status TEXT NOT NULL DEFAULT 'available', -- 'new_stock', 'available', 'reserved', 'sold', 'suspended', 'expired'
  
  -- Buyer Information
  buyer_name TEXT,
  buyer_email TEXT,
  buyer_phone TEXT,
  buyer_telegram TEXT,
  buyer_notes TEXT,
  
  -- Sale Information
  sale_date TIMESTAMPTZ,
  sale_price DECIMAL(10, 2),
  payment_method TEXT, -- 'bank_transfer', 'ewallet', 'monoklix', 'other'
  payment_status TEXT, -- 'pending', 'paid', 'refunded'
  
  -- Account Details
  account_type TEXT DEFAULT 'ultra_ai', -- 'ultra_ai', 'premium', 'basic'
  account_tier TEXT, -- 'basic', 'pro', 'enterprise', etc
  expiry_date TIMESTAMPTZ, -- Auto-set to 1 month from sale_date when marked as sold
  last_checked_at TIMESTAMPTZ,
  account_status TEXT, -- 'active', 'inactive', 'banned'
  
  -- Metadata
  notes TEXT,
  tags TEXT[], -- Array untuk tags seperti ['verified', 'premium', 'bulk']
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_ultra_ai_account_sales_status ON ultra_ai_account_sales(status);
CREATE INDEX IF NOT EXISTS idx_ultra_ai_account_sales_sale_date ON ultra_ai_account_sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_ultra_ai_account_sales_buyer_email ON ultra_ai_account_sales(buyer_email);
CREATE INDEX IF NOT EXISTS idx_ultra_ai_account_sales_expiry_date ON ultra_ai_account_sales(expiry_date);
CREATE INDEX IF NOT EXISTS idx_ultra_ai_account_sales_payment_status ON ultra_ai_account_sales(payment_status);
CREATE INDEX IF NOT EXISTS idx_ultra_ai_account_sales_created_at ON ultra_ai_account_sales(created_at DESC);

-- Trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_ultra_ai_account_sales_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_ultra_ai_account_sales_updated_at
  BEFORE UPDATE ON ultra_ai_account_sales
  FOR EACH ROW
  EXECUTE FUNCTION update_ultra_ai_account_sales_updated_at();

-- Optional: Add check constraint for status values
ALTER TABLE ultra_ai_account_sales
  ADD CONSTRAINT chk_status_values 
  CHECK (status IN ('new_stock', 'available', 'reserved', 'sold', 'transferred', 'suspended', 'expired'));

-- Optional: Add check constraint for payment_status values
ALTER TABLE ultra_ai_account_sales
  ADD CONSTRAINT chk_payment_status_values 
  CHECK (payment_status IS NULL OR payment_status IN ('pending', 'paid', 'refunded'));

-- Comments for documentation
COMMENT ON TABLE ultra_ai_account_sales IS 'Google ULTRA AI account sales management table';
COMMENT ON COLUMN ultra_ai_account_sales.status IS 'Account status: new_stock (need activation), available, reserved, sold, transferred (to flow account), suspended, expired';
COMMENT ON COLUMN ultra_ai_account_sales.expiry_date IS 'Auto-set to 1 month from sale_date when account is marked as sold';
COMMENT ON COLUMN ultra_ai_account_sales.payment_method IS 'Payment method: bank_transfer, ewallet, monoklix, other';
COMMENT ON COLUMN ultra_ai_account_sales.payment_status IS 'Payment status: pending, paid, refunded';

