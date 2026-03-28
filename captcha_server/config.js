/**
 * Configuration for Bridge Server
 * 
 * This config file is for the bridge-server.js in recaptcha_generator folder.
 * Edit this file to configure IP whitelist and server settings.
 */

export const CONFIG = {
    // ═══════════════════════════════════════════════════════════════
    // Server Settings
    // ═══════════════════════════════════════════════════════════════

    // Port for the bridge server (default: 3001)
    SERVER_PORT: 3001,

    // ═══════════════════════════════════════════════════════════════
    // IP Whitelist Settings
    // ═══════════════════════════════════════════════════════════════

    // List of IP addresses allowed to access the bridge server
    // - If EMPTY ([]) → No IP restriction, all IPs can access
    // - If HAS VALUES → Only listed IPs can access (whitelist mode)
    // 
    // Note: localhost (127.0.0.1, ::1) is ALWAYS allowed regardless of this setting
    //
    // ┌──────────────────────────────────────────────────────────────┐
    // │ EXAMPLES:                                                    │
    // ├──────────────────────────────────────────────────────────────┤
    // │ No restriction (all IPs allowed):                            │
    // │   ALLOWED_IPS: [],                                           │
    // │                                                              │
    // │ Single IP only:                                              │
    // │   ALLOWED_IPS: ['192.168.1.100'],                            │
    // │                                                              │
    // │ Multiple IPs:                                                │
    // │   ALLOWED_IPS: ['192.168.1.100', '10.0.0.1', '10.0.0.2'],     │
    // │                                                              │
    // │ Remote/VPS IPs:                                              │
    // │   ALLOWED_IPS: ['46.250.227.106', '103.123.45.67'],          │
    // └──────────────────────────────────────────────────────────────┘

    // 👇 CONFIGURE YOUR ALLOWED IPS HERE 👇
    ALLOWED_IPS: [
        // '192.168.1.100',    // Example: Local network IP
        // '46.250.227.106',   // Example: Remote VPS IP
        // '10.0.0.1',         // Example: Another IP
    ],

    // ═══════════════════════════════════════════════════════════════
    // Token Settings
    // ═══════════════════════════════════════════════════════════════

    // Maximum time to wait for a fresh token (in milliseconds)
    MAX_WAIT_TIME: 30000,       // 30 seconds

    // Token expiry time (in milliseconds)
    // reCAPTCHA tokens typically expire after 2 minutes
    TOKEN_EXPIRY: 90000,       // 90 seconds

    // Maximum tokens to keep in pool
    MAX_TOKENS_IN_POOL: 50,

    // ═══════════════════════════════════════════════════════════════
    // Rate Limiting
    // ═══════════════════════════════════════════════════════════════

    // Rate limit window in milliseconds
    RATE_LIMIT_WINDOW: 1000,

    // Maximum requests per window per endpoint
    RATE_LIMIT_MAX: 50,

    // ═══════════════════════════════════════════════════════════════
    // Multi-Extension Rotation Settings
    // ═══════════════════════════════════════════════════════════════
    // 
    // Use multiple Chrome profiles with the same extension to rotate
    // token generation, minimizing bot detection risk.
    //
    // How to use:
    // 1. Create multiple Chrome profiles (e.g., Profile 1-10)
    // 2. Install the extension on each profile
    // 3. Open labs.google.com on each profile
    // 4. The server will automatically rotate between extensions
    //
    // ┌──────────────────────────────────────────────────────────────┐
    // │ ROTATION MODES:                                               │
    // ├──────────────────────────────────────────────────────────────┤
    // │ 'round-robin'  → Cycle through extensions in order           │
    // │ 'random'       → Random extension selection                  │
    // │ 'least-used'   → Select least recently used extension        │
    // │ 'smart'        → Prefer extensions with more tokens/freshest │
    // └──────────────────────────────────────────────────────────────┘

    EXTENSION_ROTATION: {
        // Enable multi-extension rotation
        ENABLED: true,

        // Rotation mode: 'round-robin', 'random', 'least-used', 'smart'
        MODE: 'round-robin',

        // Minimum cooldown per extension before it can be used again (ms)
        // This prevents the same extension from being called too frequently
        COOLDOWN_PER_EXTENSION: 10000,    // 10 seconds (reduced for faster rotation)

        // Time before an extension is considered offline/inactive (ms)
        EXTENSION_TIMEOUT: 60000,         // 1 minute (reduced for faster detection)

        // Maximum tokens to accept from a single extension per minute
        MAX_TOKENS_PER_EXT_PER_MIN: 5,    // Increased to allow more tokens

        // Minimum extensions required for rotation (warning if less)
        MIN_EXTENSIONS_RECOMMENDED: 3,

        // Maximum extensions supported
        MAX_EXTENSIONS: 20,

        // Time before reassigning a pending request to another extension (ms)
        // If an assigned extension doesn't generate a token within this time, another extension will be assigned
        ASSIGNMENT_TIMEOUT: 5000,         // 5 seconds (reduced for faster failover)

        // Log rotation decisions (for debugging)
        DEBUG_LOGGING: true,
    },
};
