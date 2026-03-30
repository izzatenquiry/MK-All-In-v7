# 🔒 LAPORAN AUDIT KESELAMATAN APLIKASI

**Tarikh Audit:** 2025-02-04  
**Versi Aplikasi:** VERSION ALL NEW + TOKEN GEN (ON)  
**Status:** ⚠️ **15+ ISU KESELAMATAN DITEMUI**

---

## 📋 RINGKASAN EKSEKUTIF

Audit keselamatan penuh telah dijalankan ke atas aplikasi ini. Ditemui **15+ isu keselamatan** dengan pelbagai tahap keparahan. Beberapa isu adalah **KRITIS** dan memerlukan tindakan segera.

### Statistik
- **KRITIS:** 5 isu
- **TINGGI:** 6 isu
- **SEDANG:** 4 isu
- **RENDAH:** 1 isu

---

## 1. 🔐 AUTHENTICATION & AUTHORIZATION

### ⚠️ KRITIS: Default Admin Credentials
**Lokasi:** `backend/web_dashboard.py:222-230`

**Masalah:**
```python
# Default credentials created if file doesn't exist
default_creds = {
    "username": "admin",
    "password_hash": generate_password_hash("admin123"),
    ...
}
```

**Risiko:**
- Attacker boleh akses dashboard admin dengan default credentials
- Jika file `admin_credentials.json` tidak wujud, default password akan digunakan

**Rekomendasi:**
```python
# 1. Force password change on first login
# 2. Remove default credentials, require setup wizard
# 3. Add password complexity requirements:
#    - Minimum 12 characters
#    - Mix of uppercase, lowercase, numbers, special chars
#    - Cannot be common passwords
```

**Tindakan:**
- [ ] Remove default credentials
- [ ] Implement setup wizard for first-time admin
- [ ] Add password strength meter
- [ ] Force password change on first login

---

### 🔴 TINGGI: Session Management Lemah
**Lokasi:** `backend/web_dashboard.py:250-253`

**Masalah:**
```python
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session or not session['logged_in']:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function
```

**Risiko:**
- Session tidak expire (boleh digunakan selamanya)
- Tiada session rotation
- Tiada protection terhadap session fixation
- Session hijacking possible

**Rekomendasi:**
```python
# Add session timeout
from datetime import datetime, timedelta

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session or not session['logged_in']:
            return redirect(url_for('login'))
        
        # Check session expiry (30 minutes)
        if 'last_activity' in session:
            if datetime.now() - session['last_activity'] > timedelta(minutes=30):
                session.clear()
                flash('Session expired. Please login again.', 'warning')
                return redirect(url_for('login'))
        
        session['last_activity'] = datetime.now()
        return f(*args, **kwargs)
    return decorated_function

# In Flask app config:
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=30)
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = True  # HTTPS only
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
```

**Tindakan:**
- [ ] Implement session timeout (30 minutes)
- [ ] Add session rotation on privilege changes
- [ ] Use secure, HttpOnly cookies
- [ ] Add session ID regeneration on login

---

### 🟡 SEDANG: Authorization Bypass untuk Localhost
**Lokasi:** `backend/web_dashboard.py:160-196`

**Masalah:**
```python
# Always allow localhost (development)
is_localhost = is_localhost_addr or is_localhost_host or is_localhost_origin

if is_localhost:
    logger.debug(f"Localhost access granted...")
    return f(*args, **kwargs)  # Bypass semua auth checks
```

**Risiko:**
- Jika attacker dapat akses localhost, mereka boleh bypass semua security
- Development code masih dalam production

**Rekomendasi:**
```python
# Remove localhost bypass in production
# Use environment variable to control this
ALLOW_LOCALHOST_BYPASS = os.getenv('ALLOW_LOCALHOST_BYPASS', 'False') == 'True'

if is_localhost and ALLOW_LOCALHOST_BYPASS:
    # Only in development
    return f(*args, **kwargs)
```

**Tindakan:**
- [ ] Remove localhost bypass in production
- [ ] Use proper authentication even for localhost
- [ ] Add IP whitelist instead of blanket localhost access

---

## 2. 🌐 API SECURITY

### ⚠️ KRITIS: CORS Terlalu Permissive
**Lokasi:** `backend/web_dashboard.py:47-58`

**Masalah:**
```python
CORS(app, resources={
    r"/api/*": {
        "origins": [
            "http://localhost:8080",      # ❌ HTTP allowed
            "http://127.0.0.1:8080",      # ❌ HTTP allowed
            "http://app.monoklix.com",   # ❌ HTTP allowed
            "https://app.monoklix.com",  # ✅ HTTPS OK
            ...
        ],
        "supports_credentials": True
    }
})
```

**Risiko:**
- CSRF attacks possible
- Data interception via HTTP
- Man-in-the-middle attacks

**Rekomendasi:**
```python
# Environment-based CORS
ALLOWED_ORIGINS = os.getenv('ALLOWED_ORIGINS', '').split(',')

# In production, only HTTPS
if os.getenv('ENVIRONMENT') == 'production':
    ALLOWED_ORIGINS = [origin for origin in ALLOWED_ORIGINS if origin.startswith('https://')]

CORS(app, resources={
    r"/api/*": {
        "origins": ALLOWED_ORIGINS,
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization", "X-User-Email"],
        "supports_credentials": True,
        "max_age": 3600
    }
})
```

**Tindakan:**
- [ ] Remove HTTP origins in production
- [ ] Use environment-based CORS configuration
- [ ] Implement CSRF tokens for state-changing operations
- [ ] Add origin validation

---

### 🔴 TINGGI: API Authentication Lemah
**Lokasi:** `backend/web_dashboard.py:199-203`

**Masalah:**
```python
# Production: Require user email in header
user_email = request.headers.get('X-User-Email', '').strip()

if not user_email:
    return jsonify({'error': 'Unauthorized: User email required'}), 401
```

**Risiko:**
- Header `X-User-Email` mudah dipalsu
- Tiada signature verification
- Unauthorized API access possible

**Rekomendasi:**
```python
# Use JWT tokens instead
import jwt
from datetime import datetime, timedelta

def generate_api_token(user_email, user_id):
    payload = {
        'email': user_email,
        'user_id': user_id,
        'exp': datetime.utcnow() + timedelta(hours=1),
        'iat': datetime.utcnow()
    }
    return jwt.encode(payload, SECRET_KEY, algorithm='HS256')

def verify_api_token(token):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

# In decorator:
def require_user_email_or_localhost(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]
            payload = verify_api_token(token)
            if payload:
                return f(*args, **kwargs)
        
        # Fallback to email header (deprecated)
        user_email = request.headers.get('X-User-Email', '').strip()
        if not user_email:
            return jsonify({'error': 'Unauthorized'}), 401
        
        return f(*args, **kwargs)
    return decorated_function
```

**Tindakan:**
- [ ] Implement JWT token authentication
- [ ] Add HMAC signature verification
- [ ] Add rate limiting per user
- [ ] Deprecate X-User-Email header

---

### 🟡 SEDANG: Tiada Rate Limiting
**Masalah:** Tiada rate limiting pada API endpoints

**Risiko:**
- DoS attacks
- Brute force attacks
- Resource exhaustion

**Rekomendasi:**
```python
# Install: pip install flask-limiter
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"]
)

# Apply to endpoints:
@app.route('/api/login', methods=['POST'])
@limiter.limit("5 per minute")  # Stricter for auth
def login():
    ...

@app.route('/api/get-token', methods=['POST'])
@limiter.limit("100 per hour")
def api_get_token():
    ...
```

**Tindakan:**
- [ ] Install flask-limiter
- [ ] Add rate limits: 100 requests/minute per IP
- [ ] Add stricter limits for auth endpoints (5/minute)
- [ ] Add rate limit headers in response

---

## 3. 🔒 DATA PROTECTION

### ⚠️ KRITIS: Sensitive Data dalam localStorage
**Lokasi:** `services/apiClient.ts`, `services/userService.ts`

**Masalah:**
```typescript
// Tokens stored in localStorage (persistent, accessible via XSS)
localStorage.setItem('currentUser', JSON.stringify(user));
localStorage.setItem('captchaProvider', provider);
sessionStorage.setItem('selectedProxyServer', server);
```

**Risiko:**
- XSS attacks boleh mencuri semua data dari localStorage
- Tokens persistent (tidak expire automatically)
- Data accessible to any script on page

**Rekomendasi:**
```typescript
// 1. Use httpOnly cookies for sensitive data (requires backend changes)
// 2. Encrypt sensitive data before storing
import CryptoJS from 'crypto-js';

const SECRET_KEY = 'your-secret-key'; // Should be from environment

function encryptData(data: string): string {
    return CryptoJS.AES.encrypt(data, SECRET_KEY).toString();
}

function decryptData(encrypted: string): string {
    const bytes = CryptoJS.AES.decrypt(encrypted, SECRET_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
}

// 3. Use sessionStorage instead of localStorage (cleared on tab close)
sessionStorage.setItem('token', encryptData(token));

// 4. Implement secure token refresh mechanism
// 5. Clear tokens on logout
function logout() {
    sessionStorage.clear();
    localStorage.removeItem('currentUser');
    // Clear httpOnly cookies via API call
}
```

**Tindakan:**
- [ ] Move sensitive data to httpOnly cookies
- [ ] Encrypt data before storing in storage
- [ ] Use sessionStorage instead of localStorage
- [ ] Implement token refresh mechanism
- [ ] Clear all tokens on logout

---

### 🔴 TINGGI: Supabase Keys dalam Config File
**Lokasi:** `backend/config.py:27-28`

**Masalah:**
```python
# Supabase keys stored in plaintext JSON file
Config.SUPABASE_URL = data.get('supabase_url', '')
Config.SUPABASE_KEY = data.get('supabase_key', '')
```

**Risiko:**
- Jika file `data/config.json` terekspos, database boleh diakses
- Keys dalam plaintext
- Tiada encryption

**Rekomendasi:**
```python
# Use environment variables
import os

Config.SUPABASE_URL = os.getenv('SUPABASE_URL', '')
Config.SUPABASE_KEY = os.getenv('SUPABASE_KEY', '')

# Or use encrypted config file
from cryptography.fernet import Fernet

def encrypt_config(data):
    key = Fernet.generate_key()
    f = Fernet(key)
    encrypted = f.encrypt(json.dumps(data).encode())
    return encrypted, key

# Or use secrets management
# - AWS Secrets Manager
# - HashiCorp Vault
# - Azure Key Vault
```

**Tindakan:**
- [ ] Move to environment variables
- [ ] Encrypt config file if must use file
- [ ] Set file permissions (chmod 600)
- [ ] Add config file to .gitignore
- [ ] Use secrets management service

---

### 🔴 TINGGI: Cookie Files Tidak Di-encrypt
**Lokasi:** `backend/cookies/` directory

**Masalah:**
- Cookie JSON files disimpan dalam plaintext
- Tiada encryption at rest

**Risiko:**
- Jika server compromised, semua cookies boleh dicuri
- Session hijacking possible

**Rekomendasi:**
```python
from cryptography.fernet import Fernet
import json

class EncryptedCookieManager:
    def __init__(self):
        # Load encryption key from environment or secure storage
        key = os.getenv('COOKIE_ENCRYPTION_KEY')
        if not key:
            # Generate and store key (first time only)
            key = Fernet.generate_key()
            # Store in secure location
        self.cipher = Fernet(key)
    
    def save_cookie(self, filename, cookies):
        encrypted_data = self.cipher.encrypt(json.dumps(cookies).encode())
        with open(filename, 'wb') as f:
            f.write(encrypted_data)
    
    def load_cookie(self, filename):
        with open(filename, 'rb') as f:
            encrypted_data = f.read()
        decrypted = self.cipher.decrypt(encrypted_data)
        return json.loads(decrypted.decode())
```

**Tindakan:**
- [ ] Encrypt cookie files at rest
- [ ] Set file system permissions (chmod 600)
- [ ] Implement secure deletion when cookies expire
- [ ] Add encryption key rotation mechanism

---

## 4. ✅ INPUT VALIDATION

### 🔴 TINGGI: Tiada Input Sanitization
**Lokasi:** Multiple endpoints di `web_dashboard.py`

**Masalah:**
```python
# No validation on inputs
email = request.form.get('email', '').strip()  # No format validation
password = request.form.get('password', '')     # No length/complexity check
cookie_file = request.form.get('cookie_file', '').strip()  # No path validation
```

**Risiko:**
- Injection attacks
- Path traversal attacks
- Data corruption
- Buffer overflow

**Rekomendasi:**
```python
# Use validation library
from marshmallow import Schema, fields, validate, ValidationError

class UserSchema(Schema):
    email = fields.Email(required=True)
    password = fields.Str(
        required=True,
        validate=validate.Length(min=8, max=128),
        # Add custom validator for complexity
    )
    cookie_file = fields.Str(
        validate=validate.Regexp(r'^[a-zA-Z0-9_\-\.]+\.json$')  # Safe filename
    )

# In endpoint:
@app.route('/api/users/add', methods=['POST'])
def add_user():
    try:
        schema = UserSchema()
        data = schema.load(request.json)
        # Use validated data
    except ValidationError as err:
        return jsonify({'error': err.messages}), 400
```

**Tindakan:**
- [ ] Add input validation library (marshmallow, pydantic)
- [ ] Validate email format
- [ ] Enforce password complexity (min 8 chars, uppercase, lowercase, number)
- [ ] Sanitize all user inputs
- [ ] Validate file paths (prevent path traversal)
- [ ] Add length limits on all inputs

---

### 🟡 SEDANG: File Upload Validation
**Lokasi:** `components/common/ImageUpload.tsx:30`

**Status:** ✅ Client-side validation ada

**Masalah:**
- Hanya client-side validation
- Server-side validation kurang

**Rekomendasi:**
```python
# Server-side validation
import magic  # python-magic library

ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg']
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file'}), 400
    
    file = request.files['file']
    
    # Check file size
    if len(file.read()) > MAX_FILE_SIZE:
        return jsonify({'error': 'File too large'}), 400
    file.seek(0)
    
    # Check MIME type using magic bytes (not just extension)
    mime = magic.from_buffer(file.read(1024), mime=True)
    if mime not in ALLOWED_MIME_TYPES:
        return jsonify({'error': 'Invalid file type'}), 400
    
    # Additional checks
    # - Scan for malware
    # - Validate image dimensions
    # - Check for embedded scripts
```

**Tindakan:**
- [ ] Add server-side file type validation
- [ ] Check file magic bytes, not just extension
- [ ] Add file size limits (currently 500MB - consider reducing)
- [ ] Scan files for malware
- [ ] Validate image dimensions

---

## 5. 🚨 XSS (Cross-Site Scripting)

### ⚠️ KRITIS: Penggunaan `dangerouslySetInnerHTML`
**Lokasi:** `components/views/ai-image/Nanobanana2GenerationView.tsx:618`

**Masalah:**
```tsx
<p 
  className="..."
  dangerouslySetInnerHTML={{ 
    __html: 'You are in <strong>Image Editing Mode</strong>...' 
  }}
/>
```

**Risiko:**
- Jika content tercemar, XSS attack possible
- User input boleh execute JavaScript

**Rekomendasi:**
```tsx
// Option 1: Remove dangerouslySetInnerHTML
<p className="...">
  You are in <strong>Image Editing Mode</strong>. The prompt will be used...
</p>

// Option 2: If HTML needed, use DOMPurify
import DOMPurify from 'dompurify';

<p 
  dangerouslySetInnerHTML={{ 
    __html: DOMPurify.sanitize(htmlContent) 
  }}
/>

// Option 3: Use React's built-in escaping
// React automatically escapes content, so just use:
<p>{content}</p>  // Safe, automatically escaped
```

**Tindakan:**
- [ ] Remove all `dangerouslySetInnerHTML` usage
- [ ] Use React's built-in escaping
- [ ] If HTML needed, use DOMPurify library
- [ ] Sanitize all user-generated content

---

### 🟡 SEDANG: Error Messages
**Masalah:** Error messages mungkin expose sensitive information

**Rekomendasi:**
```python
# Don't expose stack traces in production
if app.debug:
    return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500
else:
    logger.error(f"Error: {str(e)}", exc_info=True)
    return jsonify({'error': 'An error occurred. Please try again.'}), 500
```

**Tindakan:**
- [ ] Don't expose stack traces in production
- [ ] Use generic error messages for users
- [ ] Log detailed errors server-side only
- [ ] Don't expose database structure in errors

---

## 6. 💉 SQL INJECTION

### ✅ RENDAH: Supabase Client Protection
**Status:** ✅ Supabase client menggunakan parameterized queries

**Rekomendasi:**
- ✅ Continue using Supabase client (already safe)
- ⚠️ Still validate input before querying
- ⚠️ Don't build queries with string concatenation

---

## 7. 🐛 ERROR HANDLING & INFORMATION DISCLOSURE

### 🔴 TINGGI: Debug Mode dalam Production
**Lokasi:** `backend/web_dashboard.py:3613`

**Masalah:**
```python
app.run(host='0.0.0.0', port=1247, debug=True, use_reloader=False)
```

**Risiko:**
- Stack traces exposed to users
- Debug information leaked
- Interactive debugger accessible (if enabled)

**Rekomendasi:**
```python
# Use environment variable
DEBUG = os.getenv('DEBUG', 'False') == 'True'
ENVIRONMENT = os.getenv('ENVIRONMENT', 'production')

app.run(
    host='0.0.0.0',
    port=1247,
    debug=DEBUG and ENVIRONMENT == 'development',
    use_reloader=False
)

# Or use proper WSGI server for production
# gunicorn -w 4 -b 0.0.0.0:1247 web_dashboard:app
```

**Tindakan:**
- [ ] Set `debug=False` in production
- [ ] Use environment variable to control debug mode
- [ ] Implement proper logging instead
- [ ] Use production WSGI server (gunicorn, uWSGI)

---

### 🟡 SEDANG: Error Logging
**Rekomendasi:**
```python
import logging
import json
from datetime import datetime

# Structured logging
def log_error(error, context=None):
    log_entry = {
        'timestamp': datetime.now().isoformat(),
        'error': str(error),
        'context': context,
        'traceback': traceback.format_exc() if app.debug else None
    }
    logger.error(json.dumps(log_entry))

# In error handlers:
try:
    # ... code ...
except Exception as e:
    log_error(e, {'endpoint': request.endpoint, 'user': current_user})
    return jsonify({'error': 'An error occurred'}), 500
```

**Tindakan:**
- [ ] Log errors server-side with full details
- [ ] Return generic messages to client
- [ ] Use structured logging (JSON format)
- [ ] Set up log rotation
- [ ] Monitor error logs for security issues

---

## 8. 📦 DEPENDENCIES SECURITY

### 🟡 SEDANG: Dependency Vulnerabilities
**Lokasi:** `package.json`

**Masalah:** Tiada audit dependencies

**Rekomendasi:**
```bash
# Run security audit
npm audit
npm audit fix

# Update dependencies
npm-check-updates -u
npm install

# Use automated scanning
# - Snyk: snyk test
# - Dependabot (GitHub)
# - npm audit in CI/CD
```

**Tindakan:**
- [ ] Run `npm audit` regularly
- [ ] Run `npm audit fix` to fix vulnerabilities
- [ ] Use `npm-check-updates` to update dependencies
- [ ] Set up Snyk or Dependabot for automated scanning
- [ ] Pin dependency versions in package.json

---

### 🟡 SEDANG: Python Dependencies
**Masalah:** Tiada audit Python dependencies

**Rekomendasi:**
```bash
# Use pip-audit
pip install pip-audit
pip-audit

# Or use safety
pip install safety
safety check

# Pin versions in requirements.txt
# Update regularly
```

**Tindakan:**
- [ ] Run `pip-audit` or `safety check`
- [ ] Pin dependency versions in requirements.txt
- [ ] Regularly update dependencies
- [ ] Set up automated dependency scanning

---

## 9. 🌐 NETWORK SECURITY

### ⚠️ KRITIS: HTTP Allowed
**Lokasi:** CORS configuration

**Masalah:** HTTP origins allowed in CORS

**Risiko:**
- Man-in-the-middle attacks
- Data interception
- Session hijacking

**Rekomendasi:**
```python
# Force HTTPS in production
from flask_talisman import Talisman

if os.getenv('ENVIRONMENT') == 'production':
    Talisman(app, force_https=True)

# Or use reverse proxy (nginx) with SSL termination
# nginx config:
# server {
#     listen 80;
#     server_name app.monoklix.com;
#     return 301 https://$server_name$request_uri;
# }
```

**Tindakan:**
- [ ] Force HTTPS in production
- [ ] Use HSTS headers
- [ ] Remove HTTP origins from CORS
- [ ] Set up SSL/TLS certificates
- [ ] Use reverse proxy (nginx) with SSL termination

---

### 🔴 TINGGI: Tiada HTTPS Enforcement
**Rekomendasi:**
```python
# Install: pip install flask-talisman
from flask_talisman import Talisman

Talisman(
    app,
    force_https=True,  # Redirect HTTP to HTTPS
    strict_transport_security=True,
    strict_transport_security_max_age=31536000,  # 1 year
    content_security_policy={
        'default-src': "'self'",
        'script-src': "'self' 'unsafe-inline'",
        'style-src': "'self' 'unsafe-inline'",
    }
)
```

**Tindakan:**
- [ ] Add Flask-Talisman for HTTPS enforcement
- [ ] Use reverse proxy (nginx) with SSL termination
- [ ] Set up SSL/TLS certificates (Let's Encrypt)
- [ ] Enable HSTS headers

---

## 10. 📁 FILE SYSTEM SECURITY

### 🟡 SEDANG: File Permissions
**Masalah:** Tiada kontrol permission untuk config/cookie files

**Rekomendasi:**
```python
import os
import stat

# Set secure file permissions
def set_secure_permissions(filepath):
    # Owner read/write only (600)
    os.chmod(filepath, stat.S_IRUSR | stat.S_IWUSR)

# Set secure directory permissions
def set_secure_dir_permissions(dirpath):
    # Owner read/write/execute only (700)
    os.chmod(dirpath, stat.S_IRUSR | stat.S_IWUSR | stat.S_IXUSR)

# Apply to sensitive files
set_secure_permissions('data/config.json')
set_secure_permissions('data/admin_credentials.json')
set_secure_dir_permissions('cookies/')

# Or use umask
os.umask(0o077)  # Restrict default permissions
```

**Tindakan:**
- [ ] Set file permissions: `chmod 600` for config files
- [ ] Set directory permissions: `chmod 700` for sensitive directories
- [ ] Use umask to restrict default permissions
- [ ] Document file permission requirements

---

## 11. 🎫 SESSION & TOKEN MANAGEMENT

### 🔴 TINGGI: Token Storage
**Masalah:** Tokens dalam localStorage (persistent)

**Risiko:**
- XSS boleh mencuri tokens
- Tokens tidak expire automatically
- Persistent storage (survives browser restart)

**Rekomendasi:**
```typescript
// Use httpOnly cookies (requires backend support)
// Backend:
@app.route('/api/login', methods=['POST'])
def login():
    # ... authenticate user ...
    token = generate_jwt_token(user)
    response = jsonify({'success': True})
    response.set_cookie(
        'auth_token',
        token,
        httponly=True,  // Not accessible via JavaScript
        secure=True,    // HTTPS only
        samesite='Lax',
        max_age=3600    // 1 hour
    )
    return response

// Frontend: Tokens automatically sent with requests
// No need to store in localStorage
```

**Tindakan:**
- [ ] Use httpOnly cookies for tokens
- [ ] Implement token rotation
- [ ] Add token expiry validation
- [ ] Clear tokens on logout
- [ ] Use short-lived tokens with refresh tokens

---

## 12. 📊 LOGGING & MONITORING

### 🟡 SEDANG: Tiada Security Monitoring
**Masalah:** Tiada alert untuk suspicious activities

**Rekomendasi:**
```python
import logging
from datetime import datetime, timedelta
from collections import defaultdict

# Track authentication attempts
auth_attempts = defaultdict(list)

def log_auth_attempt(email, success, ip_address):
    timestamp = datetime.now()
    auth_attempts[ip_address].append({
        'email': email,
        'success': success,
        'timestamp': timestamp
    })
    
    # Alert on multiple failures
    recent_failures = [
        attempt for attempt in auth_attempts[ip_address]
        if not attempt['success'] and 
        (timestamp - attempt['timestamp']) < timedelta(minutes=5)
    ]
    
    if len(recent_failures) >= 5:
        logger.warning(f"⚠️ Multiple failed login attempts from {ip_address}")
        # Send alert (email, SMS, Slack, etc.)

# Track API usage
api_usage = defaultdict(int)

def log_api_access(user_email, endpoint):
    key = f"{user_email}:{endpoint}"
    api_usage[key] += 1
    
    # Alert on unusual usage
    if api_usage[key] > 1000:  # Threshold
        logger.warning(f"⚠️ Unusual API usage: {user_email} -> {endpoint}")
```

**Tindakan:**
- [ ] Log all authentication attempts (success/failure)
- [ ] Log all API access with user/IP
- [ ] Set up alerts for:
  - Multiple failed logins
  - Unusual API usage patterns
  - Access from new IP addresses
  - Unusual data access patterns
- [ ] Set up log aggregation (ELK, Splunk, etc.)
- [ ] Implement security event dashboard

---

## 📋 PRIORITAS PERBAIKAN

### 🚨 SEGERA (Dalam 24 Jam)
1. ✅ Disable debug mode dalam production
2. ✅ Remove default admin credentials
3. ✅ Fix `dangerouslySetInnerHTML` usage
4. ✅ Remove HTTP origins dari CORS
5. ✅ Move sensitive data dari localStorage ke httpOnly cookies

### ⚡ PENDEK (Dalam Seminggu)
6. ✅ Implement rate limiting
7. ✅ Add input validation
8. ✅ Fix session management (timeout, rotation)
9. ✅ Encrypt cookie files
10. ✅ Add HTTPS enforcement

### 📅 MENENGAH (Dalam Sebulan)
11. ✅ Audit dan update dependencies
12. ✅ Implement security monitoring
13. ✅ Add file permission controls
14. ✅ Fix error handling (no information disclosure)
15. ✅ Implement CSRF protection

---

## ✅ CHECKLIST KESELAMATAN

### Authentication & Authorization
- [ ] Debug mode disabled dalam production
- [ ] Default credentials removed
- [ ] Session timeout implemented
- [ ] Session rotation on privilege changes
- [ ] Localhost bypass removed in production
- [ ] Password complexity enforced

### API Security
- [ ] HTTPS enforced
- [ ] CORS configured properly (no HTTP)
- [ ] Rate limiting implemented
- [ ] JWT token authentication
- [ ] CSRF protection

### Data Protection
- [ ] Sensitive data encrypted at rest
- [ ] Tokens stored securely (httpOnly cookies)
- [ ] Config files use environment variables
- [ ] Cookie files encrypted
- [ ] File permissions set correctly

### Input Validation
- [ ] Input validation on all endpoints
- [ ] File upload validation (server-side)
- [ ] Path traversal prevention
- [ ] SQL injection prevention (parameterized queries)

### XSS Prevention
- [ ] XSS vulnerabilities fixed
- [ ] `dangerouslySetInnerHTML` removed or sanitized
- [ ] User content sanitized
- [ ] Content Security Policy headers

### Error Handling
- [ ] Error messages sanitized
- [ ] Stack traces not exposed in production
- [ ] Structured logging implemented

### Dependencies
- [ ] Dependencies audited and updated
- [ ] Vulnerable packages fixed
- [ ] Dependency versions pinned

### Monitoring
- [ ] Security monitoring in place
- [ ] Alerts configured
- [ ] Log aggregation set up

---

## 🛠️ TOOLS UNTUK AUDIT BERKALA

### Automated Scanning
1. **OWASP ZAP** - Dynamic security testing
   ```bash
   zap-cli quick-scan --self-contained http://localhost:1247
   ```

2. **npm audit** - Dependency vulnerabilities
   ```bash
   npm audit
   npm audit fix
   ```

3. **pip-audit** - Python dependency vulnerabilities
   ```bash
   pip install pip-audit
   pip-audit
   ```

4. **Snyk** - Continuous security monitoring
   ```bash
   npm install -g snyk
   snyk test
   snyk monitor
   ```

5. **Bandit** - Python security linter
   ```bash
   pip install bandit
   bandit -r backend/
   ```

### Manual Testing
- [ ] Penetration testing
- [ ] Code review
- [ ] Security architecture review
- [ ] Incident response plan

---

## 📞 KONTAK & SUPPORT

Jika anda menemui isu keselamatan, sila laporkan melalui:
- Email: security@monoklix.com
- GitHub Security Advisories
- Private channel untuk sensitive issues

**Jangan** laporkan isu keselamatan melalui public channels (GitHub issues, public forums).

---

## 📝 REKOD PERUBAHAN

| Tarikh | Versi | Perubahan | Oleh |
|--------|-------|-----------|------|
| 2025-02-04 | 1.0 | Initial security audit | Security Team |

---

**⚠️ PENTING:** Audit ini perlu dijalankan **sekurang-kurangnya setiap 3 bulan** atau selepas setiap major update.

**🔒 Security is everyone's responsibility!**
