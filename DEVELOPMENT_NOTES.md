# Development Notes

This document contains important development information, architecture decisions, and implementation details for the multi-branding system.

## 🏗️ Architecture Overview

### Multi-Branding System

The application supports two brands (ESAIE and MONOKLIX) from a single codebase using:

1. **Brand Configuration** (`services/brandConfig.ts`)
   - Centralized brand-specific settings (colors, logos, domains, meta info)
   - Brand detection logic (env var → Electron localStorage → domain)
   - Dynamic theme application via CSS variables

2. **Supabase Separation**
   - Each brand uses a separate Supabase project
   - ESAIE: `supa.esaie.tech`
   - MONOKLIX: `supa.monoklix.com`
   - Both use `users` table but in different projects (data isolation)

3. **Table Structure Differences**

   **ESAIE:**
   - `users` table: Contains `email_code`, `subscription_expiry`, `personal_auth_token`, `personal_auth_token_updated_at`
   - `master_recaptcha_tokens` table: Master Anti-Captcha API keys
   - `ultra_ai_email_pool` table: Flow account emails (E prefixes)

   **MONOKLIX:**
   - `users` table: Basic user data
   - `token_ultra_registrations` table: Token Ultra subscription data (`email_code`, `expires_at`, `allow_master_token`)
   - `ultra_ai_email_pool` table: Flow account emails (G prefixes)
   - `master_recaptcha_tokens` table: Master Anti-Captcha API keys
   - `token_new_active` / `token_imagen_only_active`: Token pools (not used by ESAIE)

## 🔧 Key Implementation Details

### Brand Detection Flow

```typescript
// Priority order:
1. VITE_BRAND environment variable (for dev/build)
2. Electron localStorage (electron_brand) for runtime switching
3. Domain auto-detection (hostname.includes('esai') or 'monoklix')
4. Default: MONOKLIX
```

### Supabase Client Initialization

**Important**: Supabase client is initialized **once** at module load time. Brand detection happens during this initialization.

```typescript
// services/supabaseClient.ts
const currentBrand = detectBrand(); // Called once at module load
const config = SUPABASE_CONFIGS[currentBrand];
export const supabase = createClient(config.url, config.anonKey);
```

**Implication**: If brand changes after app load, Supabase client won't re-initialize. This is intentional - brand should be set before app starts.

### Brand-Aware Features

#### 1. Flow Account Codes
- **ESAIE**: E1, E2, E3, E4, E5 (max 5 servers = max 5 flow accounts)
- **MONOKLIX**: G1, G2, G3, ... G12 (max 12 servers = max 12 flow accounts)
- Generated in: `backend/flow_account_manager.py` and frontend `FlowAccountManagementView.tsx`

#### 2. Cookie Folder Filtering
- **ESAIE**: Only shows folders matching `/^E\d+$/i` (E1, E2, etc.) + 'Root'
- **MONOKLIX**: Only shows folders matching `/^G\d+$/i` (G1, G2, etc.) + 'Root'
- Implemented in: `CookieManagementView.tsx`, `GetTokenView.tsx`, `TokenDashboardView.tsx`

#### 3. Proxy Servers
- **ESAIE**: `s1.esaie.tech` to `s5.esaie.tech` (5 servers)
- **MONOKLIX**: `s1.monoklix.com` to `s12.monoklix.com` (12 servers)
- Configured in: `services/serverConfig.ts`

#### 4. Token Management

**ESAIE:**
- Always shows "Generate NEW Token" button
- Always uses master Anti-Captcha token (read-only)
- No Token Ultra feature
- Token saved to `users.personal_auth_token`

**MONOKLIX:**
- Shows "Generate NEW Token" only for Token Ultra active users
- Master token usage depends on Token Ultra status and `allow_master_token`
- Token Ultra subscription management
- Token saved to `users.personal_auth_token`

#### 5. User Management

**ESAIE:**
- `email_code` comes directly from `users` table
- `subscription_expiry` comes directly from `users.subscription_expiry`
- All users displayed (no filter for email_code assignment)
- Flow code filter shows E folders only

**MONOKLIX:**
- `email_code` comes from `token_ultra_registrations` table (joined)
- `expires_at` comes from `token_ultra_registrations.expires_at`
- Only shows users with assigned `email_code` (filtered)
- Flow code filter shows G folders only

### Dynamic Theming

Themes are applied via CSS variables set by `applyBrandTheme()` in `services/brandConfig.ts`:

```css
--brand-start: #F97316 (ESAIE Orange) or #4A6CF7 (MONOKLIX Blue)
--brand-end: #EAB308 (ESAIE Yellow) or #A05BFF (MONOKLIX Purple)
```

These are used in Tailwind config for gradients and theme colors.

### Logo Handling

- **MONOKLIX**: Uses inline SVG component (`LogoIcon` in `components/Icons.tsx`)
- **ESAIE**: Uses image URL from `brandConfig.ts` (hosted on monoklix.com)
- Detection in `Icons.tsx` via `BRAND_CONFIG.logo.svgComponent`

## 🗂️ File Organization

### Critical Files for Multi-Branding

1. **`services/brandConfig.ts`** - Central brand configuration
   - `BRAND_CONFIGS` object with all brand settings
   - `detectBrand()` function
   - `applyBrandTheme()` function
   - `getBrandConfig()` function

2. **`services/supabaseClient.ts`** - Supabase initialization
   - `SUPABASE_CONFIGS` with project URLs and keys
   - Client creation based on detected brand

3. **`backend/config.py`** - Backend brand detection
   - `SUPABASE_CONFIGS` (same as frontend)
   - `get_brand()` from `BRAND` environment variable
   - `get_supabase_config()` returns brand-specific config

4. **`backend/web_dashboard.py`** - Backend API
   - Brand-aware user fetching
   - CORS origins include both brand domains
   - Graceful handling for ESAIE (minimal user creation if Supabase fails)

5. **`backend/flow_account_manager.py`** - Flow account code generation
   - `_get_brand_prefix()` returns 'E' or 'G'
   - `_generate_code()` uses brand prefix

6. **`services/userService.ts`** - User management
   - Brand-aware `getAllUsers()` (handles `token_ultra_registrations` for MONOKLIX)
   - Brand-aware token pool management (skips for ESAIE)
   - Brand-aware Supabase queries

7. **`services/flowAccountService.ts`** - Flow account management
   - Brand-aware table queries
   - ESAIE: Updates `users.email_code` directly
   - MONOKLIX: Uses `token_ultra_registrations` and `ultra_ai_email_pool`

### Components with Brand-Aware Logic

- `components/views/token-management/UserManagementView.tsx`
- `components/views/token-management/CookieManagementView.tsx`
- `components/views/token-management/FlowAccountManagementView.tsx`
- `components/views/token-management/TokenDashboardView.tsx`
- `components/views/token-management/GetTokenView.tsx`
- `components/views/settings/FlowLogin.tsx`
- `components/views/settings/SettingsView.tsx`
- `components/Icons.tsx` (LogoIcon)
- `App.tsx` (Brand display, server health)

## 🚨 Important Notes

### Backend Environment Variable

**Critical**: When running ESAIE backend, **must** set `BRAND=esai`:

```bash
# Windows
set BRAND=esai && python web_dashboard.py

# Linux/Mac
BRAND=esai python web_dashboard.py
```

This ensures:
- Correct Supabase project connection
- Correct flow account prefix (E vs G)
- Correct table queries

### Frontend Environment Variable

Set via `.env.esai` or `.env.monoklix` files, or via Vite mode:
- `npm run dev:esai` → loads `.env.esai` → `VITE_BRAND=esai`
- `npm run dev:monoklix` → loads `.env.monoklix` → `VITE_BRAND=monoklix`

### Supabase Client Re-initialization

**Current Limitation**: Supabase client is created once at module load. If brand changes after app starts, client won't update automatically.

**Solution**: Restart the app when switching brands, or ensure brand is set correctly before app loads.

### LocalStorage Keys

All localStorage keys are now brand-aware to prevent data mixing:
- Tutorial content: `{brand}-ai-tutorial-content`
- Platform status: `{brand}-ai-platform-status`
- Announcements: `{brand}-ai-announcements`

### Video Tutorial URLs

Video tutorial URLs remain hardcoded to `monoklix.com/wp-content/...` as per user request. They are unchanged for both brands.

### API Backend URL

API backend (`api.monoklix.com`) is **shared** by both brands. This is intentional - both brands use the same backend API.

## 🧪 Testing Checklist

### ESAIE Version
- [ ] Brand detection shows ESAIE
- [ ] Supabase connects to ESAIE project (`supa.esaie.tech`)
- [ ] Flow account codes start with 'E' (E1, E2, etc.)
- [ ] Cookie folders show only E folders + Root
- [ ] "Generate NEW Token" button always visible
- [ ] Master token field shows and is read-only
- [ ] Token Ultra tab is hidden
- [ ] Proxy servers show `s1-s5.esaie.tech`
- [ ] Total Users count from ESAIE Supabase

### MONOKLIX Version
- [ ] Brand detection shows MONOKLIX
- [ ] Supabase connects to MONOKLIX project (`supa.monoklix.com`)
- [ ] Flow account codes start with 'G' (G1, G2, etc.)
- [ ] Cookie folders show only G folders + Root
- [ ] "Generate NEW Token" button only for Token Ultra users
- [ ] Token Ultra tab shows for non-active users
- [ ] Proxy servers show `s1-s12.monoklix.com`
- [ ] Total Users count from MONOKLIX Supabase

## 🔄 Migration Notes

### From Separate Versions to Unified

1. **Supabase Projects**: Already separate, no migration needed
2. **Cookie Folders**: Already prefixed (E for ESAIE, G for MONOKLIX)
3. **Flow Accounts**: Already prefixed in database
4. **User Data**: Already in separate Supabase projects

### Adding New Brand Features

When adding features that should be brand-aware:

1. Check `BRAND_CONFIG.name === 'ESAIE'` or use `BRAND_CONFIG` properties
2. Query correct Supabase tables based on brand
3. Filter by brand prefix (E/G) where applicable
4. Use brand-aware domain/URL generation
5. Update both brands' configurations if needed

## 📝 Code Patterns

### Brand Detection Pattern

```typescript
import { BRAND_CONFIG } from './services/brandConfig';

const isEsaie = BRAND_CONFIG.name === 'ESAIE';
// Use isEsaie for conditional logic
```

### Supabase Query Pattern

```typescript
import { supabase } from './services/supabaseClient';

// supabase client is already brand-aware (initialized with correct project)
const { data } = await supabase.from('users').select('*');
```

### Table Query Pattern (Brand-Aware)

```typescript
import { BRAND_CONFIG } from './services/brandConfig';

// Both ESAIE and MONOKLIX now use users table only (token_ultra_registrations migrated to users)
// Query users table directly for Token Ultra data
const { data } = await supabase
  .from('users')
  .select('id, email_code, expires_at, token_ultra_status, registered_at, allow_master_token')
  .not('token_ultra_status', 'is', null);
```

### Domain Generation Pattern

```typescript
import { BRAND_CONFIG } from './services/brandConfig';

const domain = BRAND_CONFIG.domain; // 'esaie.tech' or 'monoklix.com'
const serverUrl = `https://s1.${domain}`;
```

## 🐛 Common Issues

### Issue: Both brands showing same data
**Cause**: Supabase client initialized with wrong brand
**Solution**: Check console log `[SupabaseClient] Using ...` - should show different URLs for each brand

### Issue: Flow account codes wrong prefix
**Cause**: Backend `BRAND` env var not set
**Solution**: Set `BRAND=esai` for ESAIE backend

### Issue: Cookies showing for wrong brand
**Cause**: Filter regex not matching brand prefix
**Solution**: Check folder name format matches `/^E\d+$/i` or `/^G\d+$/i`

### Issue: Master token not loading (ESAIE)
**Cause**: `master_recaptcha_tokens` table not found or empty
**Solution**: Verify table exists in ESAIE Supabase and has active records

## 📚 Related Documentation

- See `README.md` for user-facing features and setup
- See `USER_GUIDE.md` for end-user documentation
- See code comments in `services/brandConfig.ts` for brand configuration details



