# Perbezaan Antara Brand ESAIE dan MONOKLIX

Dokumen ini menerangkan perbezaan terperinci antara dua brand yang disokong oleh platform ini: **ESAIE.TECH** dan **MONOKLIX.COM**.

---

## 📋 Ringkasan Perbezaan

| Feature | ESAIE | MONOKLIX |
|---------|-------|----------|
| **Domain** | `esaie.tech` | `monoklix.com` |
| **Warna Brand** | Orange → Yellow | Blue → Purple |
| **Token Ultra** | ❌ Tidak tersedia | ✅ RM20/month |
| **Master Token** | ✅ Selalu (read-only) | ✅ Conditional (Token Ultra) |
| **Personal Token** | ✅ Editable | ✅ Editable |
| **Token Pool** | ❌ Tidak wujud | ✅ Tersedia |
| **Email Pool** | ❌ Tidak digunakan | ✅ Untuk Token Ultra |
| **Supabase Project** | `supa.esaie.tech` | `supa.monoklix.com` |
| **Flow Account Prefix** | `E` (E1, E2, E3...) | `G` (G1, G2, G3...) |
| **Proxy Servers** | s1-s5.esaie.tech (5 servers) | s1-s12.monoklix.com (12 servers) |

---

## 🎨 1. Brand Identity & UI

### ESAIE
- **Domain**: `esaie.tech` (dan subdomains)
- **Warna Brand**:
  - Start: `#F97316` (Bright Orange)
  - End: `#EAB308` (Vibrant Yellow)
  - Theme Color: `#F97316`
- **Logo**: Image URL (`https://monoklix.com/wp-content/uploads/2025/11/ESAIE-Logo-latest.png`)
- **Session Key**: `esaie_session_api_key`
- **App Version Format**: `ESAIE.Anti_Captcha_PC_v6`

### MONOKLIX
- **Domain**: `monoklix.com` (dan subdomains seperti `app.monoklix.com`, `app2.monoklix.com`, `dev.monoklix.com`)
- **Warna Brand**:
  - Start: `#4A6CF7` (Bright Creative Blue)
  - End: `#A05BFF` (Violet Purple)
  - Theme Color: `#4A6CF7`
- **Logo**: SVG inline component
- **Session Key**: `monoklix_session_api_key`
- **App Version Format**: `MK_Anti_Captcha_PC_v6`

---

## 🔐 2. Token Management

### ESAIE

#### Personal Auth Token
- ✅ **Boleh generate** token melalui "Generate NEW Token" button
- ✅ **Boleh save** token ke Supabase (`users.personal_auth_token`)
- ✅ **Selalu tunjukkan** "Generate NEW Token" button (tidak bergantung pada subscription)

#### Anti-Captcha API Key
- ✅ **Selalu guna master token** dari `master_recaptcha_tokens` table
- 🔒 **Read-only** - User tidak boleh edit atau ubah
- ✅ **Auto-fetch** master token pada load
- ✅ **Cache** dalam `sessionStorage` sebagai `master_recaptcha_token`

#### Token Ultra
- ❌ **Tidak tersedia** untuk brand ESAIE
- ❌ Function `hasActiveTokenUltraWithRegistration()` selalu return `false`
- ❌ Tab "Token Ultra" dalam Settings tidak ditunjukkan

### MONOKLIX

#### Personal Auth Token
- ✅ **Boleh generate** token melalui "Generate NEW Token" button
- ✅ **Boleh save** token ke Supabase (`users.personal_auth_token`)
- ⚠️ **Conditional display** - Bergantung pada Token Ultra status

#### Anti-Captcha API Key
- **Scenario 1**: Token Ultra **active** + `allow_master_token = true`
  - ✅ Guna **master token** (read-only)
  - 🔒 User tidak boleh edit
  
- **Scenario 2**: Token Ultra **active** + `allow_master_token = false`
  - ✅ Guna **personal token** (editable)
  - ✏️ User boleh edit dan save
  
- **Scenario 3**: **Tiada Token Ultra** atau Token Ultra **expired**
  - ✅ Guna **personal token** (editable)
  - ✏️ User boleh edit dan save

#### Token Ultra
- ✅ **Tersedia** - Premium subscription service (RM20/month, RM21.50 dengan ToyyibPay fee)
- ✅ **Auto token generation** - Token di-generate secara automatik
- ✅ **Master reCAPTCHA token support** - Jika `allow_master_token = true`
- ✅ **Email credentials management** - Email dari `ultra_ai_email_pool`
- ✅ **Status tracking**: `active`, `expired`, `expiring_soon`
- ✅ **Registration flow**: ToyyibPay payment → Auto-register → Assign email code

---

## 🗄️ 3. Database Tables

### ESAIE

#### Tables yang Digunakan:
- ✅ `users` - Single source of truth untuk semua user data
  - Columns: `email_code`, `subscription_expiry`, `personal_auth_token`, `status`, dll.
- ✅ `master_recaptcha_tokens` - Untuk master Anti-Captcha token
- ✅ `api_requests` - Log API requests (jika wujud)
- ✅ `cookie_usage_stats` - Cookie usage tracking (jika wujud)

#### Tables yang **TIDAK** Digunakan:
- ❌ `token_ultra_registrations` - Tidak wujud (migrated ke `users`)
- ❌ `token_new_active` - Tidak wujud
- ❌ `token_imagen_only_active` - Tidak wujud
- ❌ `ultra_ai_email_pool` - Tidak digunakan
- ❌ `activity_log` - Skip gracefully jika tidak wujud

### MONOKLIX

#### Tables yang Digunakan:
- ✅ `users` - Single source of truth untuk semua user data
  - Columns: `token_ultra_status`, `email_code`, `expires_at`, `registered_at`, `allow_master_token`, dll.
- ✅ `master_recaptcha_tokens` - Untuk master Anti-Captcha token
- ✅ `token_new_active` - Token pool untuk assignment
- ✅ `token_imagen_only_active` - Token pool untuk Imagen generation
- ✅ `ultra_ai_email_pool` - Email pool untuk Token Ultra assignment
- ✅ `api_requests` - Log API requests
- ✅ `cookie_usage_stats` - Cookie usage tracking
- ✅ `activity_log` - User activity logging (jika wujud)

#### Tables yang **TIDAK** Digunakan:
- ❌ `token_ultra_registrations` - Migrated ke `users` table (legacy)

---

## 🎯 4. Features & Functionality

### ESAIE

#### Available Features:
- ✅ **AI Generation** - Semua services (Image, Video, Text)
- ✅ **Token Generation** - Generate NEW Token button (selalu visible)
- ✅ **Personal Token Management** - Save/edit personal token
- ✅ **Master Token** - Auto-fetch dan guna (read-only)
- ✅ **FAQ Page** - Troubleshooting guide
- ✅ **Settings Panel** - Flow Login, Profile, Cache Manager

#### Hidden/Unavailable Features:
- ❌ **Token Ultra Registration** - Panel tidak ditunjukkan
- ❌ **Token Pool Assignment** - Function skip untuk ESAIE
- ❌ **"Special for MONOklix user" Panel** - Hidden dengan `BRAND_CONFIG.name !== 'ESAIE'`
- ❌ **"ULTRA AI Sales" Button** - Hidden dalam Navigation component
- ❌ **Email Pool Management** - Tidak digunakan

### MONOKLIX

#### Available Features:
- ✅ **AI Generation** - Semua services (Image, Video, Text)
- ✅ **Token Generation** - Generate NEW Token button (conditional)
- ✅ **Personal Token Management** - Save/edit personal token
- ✅ **Token Ultra Registration** - RM21.50 via ToyyibPay
- ✅ **Token Pool Assignment** - Auto-assign dari `token_new_active`
- ✅ **Master Token** - Conditional (Token Ultra + `allow_master_token`)
- ✅ **Email Pool Management** - Untuk Token Ultra users
- ✅ **FAQ Page** - Troubleshooting guide
- ✅ **Settings Panel** - Flow Login, Profile, Cache Manager, Token Ultra
- ✅ **"Special for MONOklix user" Panel** - Visible dengan buttons untuk Token Ultra

---

## 🔒 5. User Status Enforcement

### ESAIE

#### Login Blocking:
- ❌ `status === 'inactive'` → **Block login**
- ❌ `subscriptionExpiry < now` → **Block login**

#### Token Generation Blocking:
- ❌ `status === 'inactive'` → **Block token generation**
- ❌ `subscriptionExpiry < now` → **Block token generation**

#### AI Generation Blocking:
- ❌ `status === 'inactive'` → **Block AI generation**
- ❌ `subscriptionExpiry < now` → **Block AI generation**

#### Token Ultra Check:
- ✅ **Tidak ada** - Feature tidak tersedia untuk ESAIE

### MONOKLIX

#### Login Blocking:
- ❌ `status === 'inactive'` → **Block login**
- ❌ `subscriptionExpiry < now` → **Block login**
- ✅ `token_ultra_status === 'expired'` → **Boleh login** (tetapi block token/AI generation)

#### Token Generation Blocking:
- ❌ `status === 'inactive'` → **Block token generation**
- ❌ `subscriptionExpiry < now` → **Block token generation**
- ❌ `token_ultra_status === 'expired'` → **Block token generation**

#### AI Generation Blocking:
- ❌ `status === 'inactive'` → **Block AI generation**
- ❌ `subscriptionExpiry < now` → **Block AI generation**
- ❌ `token_ultra_status === 'expired'` → **Block AI generation**

#### Token Ultra Check:
- ✅ **Ada** - Check `hasActiveTokenUltraWithRegistration()` sebelum allow token/AI generation

---

## 🔧 6. Code Logic Differences

### Anti-Captcha Token Resolution

#### ESAIE:
```typescript
// Always use master token (read-only)
if (BRAND_CONFIG.name === 'ESAIE') {
  const masterToken = await getMasterRecaptchaToken();
  setAntiCaptchaApiKey(masterToken); // Read-only, cannot edit
  return; // Exit early
}
```

#### MONOKLIX:
```typescript
// Conditional based on Token Ultra status
if (hasActiveTokenUltra && allowMasterToken) {
  // Use master token (read-only)
  const masterToken = await getMasterRecaptchaToken();
  setAntiCaptchaApiKey(masterToken);
} else {
  // Use personal token (editable)
  setAntiCaptchaApiKey(currentUser.recaptchaToken || '');
}
```

### Token Ultra Check

#### ESAIE:
```typescript
// Always return inactive (feature not available)
if (BRAND_CONFIG.name === 'ESAIE') {
  return { isActive: false, registration: null };
}
```

#### MONOKLIX:
```typescript
// Check users table for token_ultra_status
const user = await fetchUserFromSupabase(userId);
if (!user.token_ultra_status || !user.expires_at) {
  return { isActive: false, registration: null };
}

// Calculate status based on expires_at
const status = calculateTokenUltraStatus(user.expires_at);
return { isActive: status === 'active', registration: {...} };
```

### Token Pool Assignment

#### ESAIE:
```typescript
// Skip token pool assignment
if (BRAND_CONFIG.name === 'ESAIE') {
  return { success: false, message: 'Token pool tables are not available for ESAIE' };
}
```

#### MONOKLIX:
```typescript
// Assign from token_new_active pool
const { data: token } = await supabase
  .from('token_new_active')
  .select('token')
  .eq('status', 'active')
  .order('total_user', { ascending: true })
  .limit(1)
  .single();

// Atomically increment usage
await supabase.rpc('increment_token_if_available', { token_to_check: token.token });
```

---

## 🌐 7. Supabase Configuration

### ESAIE
- **Project URL**: `https://supa.esaie.tech`
- **Anon Key**: Configured in `supabaseClient.ts`
- **Tables**: Simplified schema (no Token Ultra tables)

### MONOKLIX
- **Project URL**: `https://supa.monoklix.com`
- **Anon Key**: Configured in `supabaseClient.ts`
- **Tables**: Full schema (includes Token Ultra tables)

### Shared Configuration
- ✅ Both brands use `users` table as single source of truth
- ✅ Both brands use same column structure in `users` table
- ✅ Brand detection via `BRAND_CONFIG` from `brandConfig.ts`

---

## 📱 8. UI Component Differences

### FlowLogin Component

#### ESAIE:
- ✅ Always show "Generate NEW Token" button
- ✅ Always show master token (read-only) in Anti-Captcha field
- ❌ Hide "Special for MONOklix user" panel
- ❌ Hide Token Ultra status section

#### MONOKLIX:
- ⚠️ Conditional "Generate NEW Token" button (based on Token Ultra)
- ⚠️ Conditional master/personal token display
- ✅ Show "Special for MONOklix user" panel
- ✅ Show Token Ultra status section

### Navigation Component

#### ESAIE:
- ❌ Hide "ULTRA AI Sales" button

#### MONOKLIX:
- ✅ Show "ULTRA AI Sales" button

### SettingsView Component

#### ESAIE:
- ❌ Hide "Token Ultra" tab

#### MONOKLIX:
- ✅ Show "Token Ultra" tab (if Token Ultra not active)

---

## 🚀 9. Backend Differences

### SupabaseSync Initialization

#### ESAIE:
```python
# Pass brand='esai' for ESAIE
supabase_sync = SupabaseSync(
    supabase_url=ESAIE_SUPABASE_URL,
    supabase_key=ESAIE_SUPABASE_KEY,
    brand='esai'  # Important for logging and table detection
)
```

#### MONOKLIX:
```python
# Pass brand='monoklix' for MONOKLIX
supabase_sync = SupabaseSync(
    supabase_url=MONOKLIX_SUPABASE_URL,
    supabase_key=MONOKLIX_SUPABASE_KEY,
    brand='monoklix'  # Important for logging and table detection
)
```

### Token Generation Logic

#### ESAIE:
- ✅ Use `users` table only
- ✅ No Token Ultra checks
- ✅ Always allow token generation (if user status is active)

#### MONOKLIX:
- ✅ Use `users` table (with Token Ultra columns)
- ✅ Check Token Ultra status before allowing generation
- ✅ Block if Token Ultra expired (but allow login)

---

## 📝 10. Summary

### ESAIE - Simplified Version
- **Focus**: Simple, straightforward token management
- **Token Strategy**: Always use master token (read-only)
- **Subscription**: Standard user subscription only (no Token Ultra)
- **Use Case**: Users yang tidak perlukan Token Ultra features

### MONOKLIX - Full-Featured Version
- **Focus**: Advanced token management dengan Token Ultra subscription
- **Token Strategy**: Flexible (master atau personal, bergantung pada Token Ultra)
- **Subscription**: Standard + Token Ultra (RM20/month)
- **Use Case**: Users yang perlukan premium features dan auto token generation

---

## 🔄 Migration Notes

### From `token_ultra_registrations` to `users` table
- ✅ Both brands now use `users` table only
- ✅ `token_ultra_status`, `email_code`, `expires_at`, `registered_at`, `allow_master_token` migrated to `users`
- ✅ Legacy `token_ultra_registrations` table no longer used
- ✅ ESAIE: These columns exist but are not used (always NULL)

---

## 📚 Related Documentation

- `README.md` - Main documentation
- `USER_GUIDE.md` - User guide for both brands
- `DEVELOPMENT_NOTES.md` - Development notes
- `services/brandConfig.ts` - Brand configuration source code

---

**Last Updated**: January 2026
