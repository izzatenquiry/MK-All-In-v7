/**
 * Extension Bridge Server - Professional High-Concurrency Version
 * 
 * This server bridges the Chrome extension with external programs like Python.
 * Designed to handle many concurrent requests without errors.
 * 
 * Features:
 *   - In-memory token pool with file-sync backup
 *   - Request queue with fair distribution
 *   - Concurrent request handling with proper locking
 *   - Automatic cleanup and health monitoring
 *   - Detailed logging and statistics
 *   - Rate limiting protection
 *   - IP Whitelist security (config-based via ALLOWED_IPS in config.js)
 * 
 * Usage:
 *   node bridge-server.js [options]
 * 
 * Options:
 *   --port=PORT    Set custom port (default: 6003)
 *   --help         Show help
 * 
 * IP Whitelist:
 *   Configure in config.js with ALLOWED_IPS setting:
 *   - ALLOWED_IPS: []                     -> No restriction, all IPs allowed
 *   - ALLOWED_IPS: ['192.168.1.100']      -> Only this IP allowed
 *   - ALLOWED_IPS: ['10.0.0.1', '10.0.0.2'] -> Multiple IPs allowed
 *   Note: localhost (127.0.0.1, ::1) is always allowed
 * 
 * Endpoints:
 *   GET  /get-fresh-token - Get a fresh token (will wait for generation if pool is empty)
 *   GET  /pool            - View token pool
 *   POST /add-token       - Add token (from extension)
 *   POST /clear           - Clear all tokens
 *   GET  /status          - Server status with statistics
 *   GET  /stats           - Detailed statistics
 *   GET  /whitelist       - View whitelist status
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOKEN_EXCHANGE_FILE = path.join(__dirname, 'token_exchange.json');

// ═══════════════════════════════════════════════════════════════════════════
// CLI ARGUMENT PARSER
// ═══════════════════════════════════════════════════════════════════════════
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        port: 6003,
        showHelp: false
    };

    for (const arg of args) {
        if (arg === '--help' || arg === '-h') {
            options.showHelp = true;
        } else if (arg.startsWith('--port=')) {
            const port = parseInt(arg.split('=')[1]);
            if (!isNaN(port)) options.port = port;
        }
    }

    return options;
}

function showHelp() {
    console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║          Extension Bridge Server - Command Line Help              ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  Usage: node bridge-server.js [options]                           ║
║                                                                   ║
║  Options:                                                         ║
║    --port=PORT    Set custom port (default: 6003)                 ║
║    --help, -h     Show this help                                  ║
║                                                                   ║
║  IP Whitelist Configuration (in config.js):                       ║
║    ALLOWED_IPS: []                    - No restriction            ║
║    ALLOWED_IPS: ['192.168.1.100']     - Single IP allowed         ║
║    ALLOWED_IPS: ['10.0.0.1', '10.0.0.2'] - Multiple IPs allowed   ║
║                                                                   ║
║  Note: localhost (127.0.0.1, ::1) is always allowed               ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
`);
    process.exit(0);
}

const CLI_OPTIONS = parseArgs();
if (CLI_OPTIONS.showHelp) showHelp();

const PORT = CLI_OPTIONS.port;
const HOST = '0.0.0.0';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════
const CONFIG = {
    MAX_WAIT_TIME: 30000,       // Maximum time to wait for a fresh token (30 seconds)
    POLL_INTERVAL: 200,        // Check for new tokens every 200ms (faster polling)
    TOKEN_EXPIRY: 90000,       // Tokens expire after 90 seconds
    MAX_TOKENS_IN_POOL: 50,    // Maximum tokens to keep in pool
    MAX_CONCURRENT_WAIT: 100,  // Maximum concurrent requests waiting for tokens
    REQUEST_TIMEOUT: 35000,    // Request timeout (slightly more than MAX_WAIT_TIME)
    SYNC_INTERVAL: 5000,       // Sync to file every 5 seconds
    STATS_RETENTION: 3600000,  // Keep stats for 1 hour
    RATE_LIMIT_WINDOW: 1000,   // Rate limit window in ms
    RATE_LIMIT_MAX: 50,        // Max requests per window per endpoint
};

// ═══════════════════════════════════════════════════════════════════════════
// SECURITY MANAGER (IP Whitelist) - Config-Based
// ═══════════════════════════════════════════════════════════════════════════
// Load ALLOWED_IPS from local config.js
import { CONFIG as APP_CONFIG } from './config.js';

class SecurityManager {
    constructor() {
        this.blockedAttempts = 0;
        this.lastBlockedIp = null;
        this.lastBlockedTime = null;

        // Load from config.js
        this.whitelist = APP_CONFIG.ALLOWED_IPS || [];
        this.enabled = this.whitelist.length > 0;

        if (this.enabled) {
            console.log(`[Security] 🔒 IP Whitelist ENABLED - ${this.whitelist.length} IPs allowed:`);
            this.whitelist.forEach(ip => console.log(`           ✓ ${ip}`));
        } else {
            console.log('[Security] 🔓 IP Whitelist DISABLED - All IPs can access (ALLOWED_IPS is empty)');
        }
    }

    // Normalize IP address (handle IPv6-mapped IPv4)
    normalizeIp(ip) {
        if (!ip) return 'unknown';
        // Handle IPv6-mapped IPv4 addresses like ::ffff:192.168.1.1
        if (ip.startsWith('::ffff:')) {
            return ip.substring(7);
        }
        return ip;
    }

    // Check if IP is allowed
    isAllowed(ip) {
        // If whitelist is empty (disabled), allow all
        if (!this.enabled) {
            return true;
        }

        const normalizedIp = this.normalizeIp(ip);

        // Always allow localhost
        if (normalizedIp === '127.0.0.1' || normalizedIp === 'localhost' || normalizedIp === '::1') {
            return true;
        }

        // Check if IP is in the whitelist
        const allowed = this.whitelist.some(whitelistedIp => {
            const normalizedWhitelisted = this.normalizeIp(whitelistedIp);
            return normalizedWhitelisted === normalizedIp;
        });

        if (!allowed) {
            this.blockedAttempts++;
            this.lastBlockedIp = normalizedIp;
            this.lastBlockedTime = Date.now();
            console.log(`[Security] 🚫 BLOCKED request from: ${normalizedIp} (not in ALLOWED_IPS)`);
        }

        return allowed;
    }

    // Get whitelist status
    getStatus() {
        return {
            enabled: this.enabled,
            mode: this.enabled ? 'whitelist' : 'open',
            description: this.enabled
                ? 'Only IPs in ALLOWED_IPS (config.js) can access'
                : 'All IPs can access (ALLOWED_IPS is empty)',
            whitelistCount: this.whitelist.length,
            whitelist: this.whitelist,
            blockedAttempts: this.blockedAttempts,
            lastBlockedIp: this.lastBlockedIp,
            lastBlockedTime: this.lastBlockedTime
                ? new Date(this.lastBlockedTime).toISOString()
                : null,
            note: 'Edit ALLOWED_IPS in config.js to manage whitelist'
        };
    }

    // Reload config (useful if config.js is updated)
    reload() {
        // Re-import would require dynamic import, so just log instruction
        console.log('[Security] ℹ️ To reload IP whitelist, restart the server');
        console.log('[Security] ℹ️ Or edit ALLOWED_IPS in config.js and restart');
        return {
            message: 'Please restart server to apply config changes',
            currentWhitelist: this.whitelist
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXTENSION MANAGER - REMOVED
// On-demand generation is now handled by recaptchaAutoGenerator.js (port 6004)
// Chrome Extension is no longer used for reCAPTCHA token generation
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// BEARER TOKEN MANAGER - Handles Google API Bearer Tokens
// ═══════════════════════════════════════════════════════════════════════════
class BearerTokenManager {
    constructor() {
        // Store tokens per extension: Map<extensionId, TokenData>
        this.tokens = new Map();
        this.TOKEN_VALIDITY = 30 * 60 * 1000; // 30 minutes in milliseconds
        this.roundRobinIndex = 0;
        this.STORAGE_FILE = path.join(__dirname, 'bearer_tokens.json');

        // Statistics
        this.stats = {
            totalTokensReceived: 0,
            totalTokensServed: 0,
            lastTokenTime: null
        };

        // Load tokens from file on startup
        this.loadFromFile();

        console.log('[BearerTokenManager] 🔐 Multi-Extension Bearer Token Manager Initialized');
        console.log(`[BearerTokenManager] Token validity: ${this.TOKEN_VALIDITY / 1000 / 60} minutes`);
        console.log(`[BearerTokenManager] Storage file: ${this.STORAGE_FILE}`);
    }

    // Load tokens from persistent storage
    loadFromFile() {
        try {
            if (fs.existsSync(this.STORAGE_FILE)) {
                const data = JSON.parse(fs.readFileSync(this.STORAGE_FILE, 'utf8'));
                const now = Date.now();
                let loadedCount = 0;
                let expiredCount = 0;

                for (const [extId, tokenData] of Object.entries(data.tokens || {})) {
                    // Check if token is still valid
                    const age = now - tokenData.capturedAt;
                    if (age < this.TOKEN_VALIDITY) {
                        this.tokens.set(extId, tokenData);
                        loadedCount++;
                    } else {
                        expiredCount++;
                    }
                }

                console.log(`[BearerTokenManager] 📂 Loaded ${loadedCount} valid tokens from file (${expiredCount} expired)`);
            }
        } catch (error) {
            console.log('[BearerTokenManager] ⚠️ Could not load tokens from file:', error.message);
        }
    }

    // Save tokens to persistent storage
    saveToFile() {
        try {
            const data = {
                lastUpdated: Date.now(),
                tokens: Object.fromEntries(this.tokens)
            };
            fs.writeFileSync(this.STORAGE_FILE, JSON.stringify(data, null, 2));
        } catch (error) {
            console.log('[BearerTokenManager] ⚠️ Could not save tokens to file:', error.message);
        }
    }

    // Save a new bearer token from an extension
    saveToken(token, extensionId = null, profileName = null) {
        const now = Date.now();
        const extId = extensionId || 'unknown';

        // Check if this extension already has the same token
        const existing = this.tokens.get(extId);
        if (existing && existing.token === token) {
            console.log(`[BearerTokenManager] ⚠️ Same token from ${extId}, updating timestamp only`);
            existing.capturedAt = now;
            this.saveToFile(); // Persist the update
            return {
                success: true,
                message: 'Token timestamp updated (same token)',
                isNew: false,
                extensionId: extId
            };
        }

        // Save new token for this extension
        this.tokens.set(extId, {
            token: token,
            capturedAt: now,
            extensionId: extId,
            profileName: profileName || 'Unknown',
            usedCount: 0
        });

        this.stats.totalTokensReceived++;
        this.stats.lastTokenTime = now;

        // Persist to file
        this.saveToFile();

        console.log('[BearerTokenManager] ✅ Bearer token saved!');
        console.log(`[BearerTokenManager]    Preview: ${token.substring(0, 60)}...`);
        console.log(`[BearerTokenManager]    Extension: ${extId}`);
        console.log(`[BearerTokenManager]    Profile: ${profileName || 'Unknown'}`);
        console.log(`[BearerTokenManager]    Total extensions with tokens: ${this.tokens.size}`);

        return {
            success: true,
            message: 'Bearer token saved successfully',
            isNew: true,
            extensionId: extId,
            capturedAt: now,
            totalExtensions: this.tokens.size
        };
    }

    // Get all valid tokens (for bulk fetch by UGC Studio)
    getAllValidTokens() {
        const now = Date.now();
        const validTokens = [];

        for (const [extId, tokenData] of this.tokens) {
            const age = now - tokenData.capturedAt;
            if (age < this.TOKEN_VALIDITY) {
                validTokens.push({
                    token: tokenData.token,
                    extensionId: extId,
                    profileName: tokenData.profileName,
                    capturedAt: tokenData.capturedAt,
                    ageMinutes: Math.round(age / 60000),
                    remainingMinutes: Math.round((this.TOKEN_VALIDITY - age) / 60000)
                });
            }
        }

        return {
            success: true,
            tokens: validTokens,
            totalCount: validTokens.length,
            fetchedAt: now
        };
    }

    // Get token info helper
    _getTokenInfo(tokenData) {
        const now = Date.now();
        const age = now - tokenData.capturedAt;
        const ageSeconds = Math.round(age / 1000);
        const ageMinutes = Math.round(age / 60000);
        const isExpired = age >= this.TOKEN_VALIDITY;
        const remainingMs = Math.max(0, this.TOKEN_VALIDITY - age);
        const remainingMinutes = Math.round(remainingMs / 60000);
        const remainingSeconds = Math.round(remainingMs / 1000);

        return {
            token: tokenData.token,
            capturedAt: tokenData.capturedAt,
            capturedAtISO: new Date(tokenData.capturedAt).toISOString(),
            ageSeconds,
            ageMinutes,
            isExpired,
            remainingMinutes,
            remainingSeconds,
            extensionId: tokenData.extensionId,
            profileName: tokenData.profileName,
            usedCount: tokenData.usedCount,
            validity: `${this.TOKEN_VALIDITY / 60000} minutes`
        };
    }

    // Get the freshest valid bearer token (from any extension)
    getToken(preferredExtensionId = null) {
        if (this.tokens.size === 0) {
            return {
                success: false,
                error: 'No bearer token available',
                message: 'No bearer tokens captured yet. Open Google Labs page in any extension to capture tokens.',
                totalExtensions: 0
            };
        }

        const now = Date.now();

        // If preferred extension specified and has valid token, use it
        if (preferredExtensionId && this.tokens.has(preferredExtensionId)) {
            const tokenData = this.tokens.get(preferredExtensionId);
            const age = now - tokenData.capturedAt;
            if (age < this.TOKEN_VALIDITY) {
                tokenData.usedCount++;
                this.stats.totalTokensServed++;
                return {
                    success: true,
                    ...this._getTokenInfo(tokenData),
                    source: 'preferred',
                    totalExtensions: this.tokens.size,
                    message: `Token from preferred extension ${preferredExtensionId}`
                };
            }
        }

        // Find freshest valid token across all extensions
        let freshestToken = null;
        let freshestAge = Infinity;

        for (const [extId, tokenData] of this.tokens) {
            const age = now - tokenData.capturedAt;
            if (age < this.TOKEN_VALIDITY && age < freshestAge) {
                freshestAge = age;
                freshestToken = tokenData;
            }
        }

        if (freshestToken) {
            freshestToken.usedCount++;
            this.stats.totalTokensServed++;
            return {
                success: true,
                ...this._getTokenInfo(freshestToken),
                source: 'freshest',
                totalExtensions: this.tokens.size,
                message: `Freshest token from extension ${freshestToken.extensionId}`
            };
        }

        // All tokens expired
        return {
            success: false,
            error: 'All tokens expired',
            message: 'All bearer tokens have expired. Wait for auto-refresh (page reloads every 30 minutes).',
            totalExtensions: this.tokens.size,
            expiredCount: this.tokens.size
        };
    }

    // Get token by specific extension ID
    getTokenByExtension(extensionId) {
        if (!this.tokens.has(extensionId)) {
            return {
                success: false,
                error: 'Extension not found',
                message: `No bearer token from extension: ${extensionId}`,
                availableExtensions: Array.from(this.tokens.keys())
            };
        }

        const tokenData = this.tokens.get(extensionId);
        tokenData.usedCount++;
        this.stats.totalTokensServed++;

        return {
            success: true,
            ...this._getTokenInfo(tokenData),
            source: 'specific',
            message: `Token from extension ${extensionId}`
        };
    }

    // Get token using round-robin rotation across extensions
    getTokenRoundRobin() {
        if (this.tokens.size === 0) {
            return this.getToken(); // Will return error
        }

        const now = Date.now();
        const extensions = Array.from(this.tokens.keys());
        const validExtensions = [];

        // Filter valid (non-expired) tokens
        for (const extId of extensions) {
            const tokenData = this.tokens.get(extId);
            const age = now - tokenData.capturedAt;
            if (age < this.TOKEN_VALIDITY) {
                validExtensions.push(extId);
            }
        }

        if (validExtensions.length === 0) {
            return {
                success: false,
                error: 'All tokens expired',
                message: 'All bearer tokens have expired.',
                totalExtensions: this.tokens.size
            };
        }

        // Round-robin selection
        this.roundRobinIndex = (this.roundRobinIndex + 1) % validExtensions.length;
        const selectedExtId = validExtensions[this.roundRobinIndex];
        const tokenData = this.tokens.get(selectedExtId);

        tokenData.usedCount++;
        this.stats.totalTokensServed++;

        return {
            success: true,
            ...this._getTokenInfo(tokenData),
            source: 'round-robin',
            rotationIndex: this.roundRobinIndex,
            totalValidExtensions: validExtensions.length,
            message: `Token from extension ${selectedExtId} (round-robin ${this.roundRobinIndex + 1}/${validExtensions.length})`
        };
    }

    // Get status/info about all bearer tokens
    getStatus() {
        const now = Date.now();
        const extensionsInfo = [];
        let validCount = 0;
        let expiredCount = 0;

        for (const [extId, tokenData] of this.tokens) {
            const info = this._getTokenInfo(tokenData);
            extensionsInfo.push({
                extensionId: extId,
                profileName: tokenData.profileName,
                tokenPreview: tokenData.token.substring(0, 50) + '...',
                ageMinutes: info.ageMinutes,
                isExpired: info.isExpired,
                remainingMinutes: info.remainingMinutes,
                usedCount: tokenData.usedCount
            });

            if (info.isExpired) {
                expiredCount++;
            } else {
                validCount++;
            }
        }

        // Sort by freshest first
        extensionsInfo.sort((a, b) => a.ageMinutes - b.ageMinutes);

        return {
            hasToken: this.tokens.size > 0,
            totalExtensions: this.tokens.size,
            validTokens: validCount,
            expiredTokens: expiredCount,
            tokenValidity: `${this.TOKEN_VALIDITY / 60000} minutes`,
            extensions: extensionsInfo,
            stats: this.stats,
            note: 'Multi-extension bearer token pool. Each extension has its own token that refreshes every 30 minutes.'
        };
    }

    // List all extensions with tokens
    listExtensions() {
        const extensions = [];
        const now = Date.now();

        for (const [extId, tokenData] of this.tokens) {
            const age = now - tokenData.capturedAt;
            const isExpired = age >= this.TOKEN_VALIDITY;

            extensions.push({
                extensionId: extId,
                profileName: tokenData.profileName,
                isExpired: isExpired,
                ageMinutes: Math.round(age / 60000),
                remainingMinutes: isExpired ? 0 : Math.round((this.TOKEN_VALIDITY - age) / 60000)
            });
        }

        return extensions;
    }

    // Clear token for specific extension
    clearToken(extensionId = null) {
        if (extensionId) {
            if (this.tokens.has(extensionId)) {
                this.tokens.delete(extensionId);
                console.log(`[BearerTokenManager] 🗑️ Bearer token cleared for: ${extensionId}`);
                return {
                    success: true,
                    message: `Token cleared for extension ${extensionId}`,
                    remainingExtensions: this.tokens.size
                };
            }
            return {
                success: false,
                error: 'Extension not found',
                message: `No token found for extension: ${extensionId}`
            };
        }

        // Clear all tokens
        const count = this.tokens.size;
        this.tokens.clear();
        console.log(`[BearerTokenManager] 🗑️ All bearer tokens cleared (${count} tokens)`);

        return {
            success: true,
            message: `All tokens cleared (${count} tokens)`,
            clearedCount: count
        };
    }

    // Cleanup expired tokens
    cleanupExpired() {
        const now = Date.now();
        const toDelete = [];

        for (const [extId, tokenData] of this.tokens) {
            const age = now - tokenData.capturedAt;
            // Remove tokens that are 2x expired (60 minutes old)
            if (age >= this.TOKEN_VALIDITY * 2) {
                toDelete.push(extId);
            }
        }

        for (const extId of toDelete) {
            this.tokens.delete(extId);
        }

        if (toDelete.length > 0) {
            console.log(`[BearerTokenManager] 🧹 Cleaned ${toDelete.length} old tokens`);
            this.saveToFile();
        }

        return toDelete.length;
    }

    // Cleanup tokens from inactive extensions
    // Called by ExtensionManager when extensions go inactive
    cleanupInactiveExtensionTokens(activeExtensionIds) {
        const toDelete = [];

        for (const [extId, tokenData] of this.tokens) {
            // Check if this extension is in the active list
            if (!activeExtensionIds.has(extId)) {
                toDelete.push(extId);
            }
        }

        for (const extId of toDelete) {
            this.tokens.delete(extId);
            console.log(`[BearerTokenManager] 🧹 Removed bearer token from inactive extension: ${extId}`);
        }

        if (toDelete.length > 0) {
            this.saveToFile();
            console.log(`[BearerTokenManager] 🧹 Total ${toDelete.length} inactive extension tokens removed`);
        }

        return toDelete.length;
    }

    // Get list of extension IDs that have bearer tokens
    getExtensionIds() {
        return new Set(this.tokens.keys());
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// IN-MEMORY STATE (Thread-Safe Implementation)
// ═══════════════════════════════════════════════════════════════════════════
class TokenManager extends EventEmitter {
    constructor() {
        super();
        this.tokens = [];
        this.pendingRequest = false;
        this.lastRequest = null;
        this.waitQueue = [];
        this.stats = {
            totalTokensReceived: 0,
            totalTokensServed: 0,
            totalRequestsReceived: 0,
            totalTimeouts: 0,
            totalErrors: 0,
            averageWaitTime: 0,
            waitTimes: [],
            requestsPerMinute: [],
            peakConcurrent: 0,
            currentConcurrent: 0,
            serverStartTime: Date.now(),
            lastTokenTime: null,
            lastServeTime: null,
        };
        this.rateLimiter = new Map();
        this.isWriting = false;
        this.pendingWrite = false;

        // Load initial state from file
        this.loadFromFile();

        // Set up periodic file sync
        setInterval(() => this.syncToFile(), CONFIG.SYNC_INTERVAL);

        // Set up periodic cleanup
        setInterval(() => this.cleanup(), 10000);

        // Set up rate limiter cleanup
        setInterval(() => this.cleanupRateLimiter(), CONFIG.RATE_LIMIT_WINDOW);

        // Set up stats cleanup
        setInterval(() => this.cleanupStats(), 60000);
    }

    // Load tokens from file (for persistence across restarts)
    loadFromFile() {
        try {
            if (fs.existsSync(TOKEN_EXCHANGE_FILE)) {
                const data = JSON.parse(fs.readFileSync(TOKEN_EXCHANGE_FILE, 'utf8'));

                // Only load non-expired tokens
                const now = Date.now();
                this.tokens = (data.tokens || []).filter(t =>
                    (now - t.createdAt) < CONFIG.TOKEN_EXPIRY
                );
                this.pendingRequest = data.pendingRequest || false;
                this.lastRequest = data.lastRequest || null;

                console.log(`[TokenManager] ✅ Loaded ${this.tokens.length} valid tokens from file`);
            }
        } catch (e) {
            console.error('[TokenManager] ⚠️ Error loading from file:', e.message);
            this.tokens = [];
        }
    }

    // Sync to file with debouncing
    async syncToFile() {
        if (this.isWriting) {
            this.pendingWrite = true;
            return;
        }

        this.isWriting = true;

        try {
            const data = {
                tokens: this.tokens,
                lastRequest: this.lastRequest,
                pendingRequest: this.pendingRequest,
                lastSync: Date.now()
            };

            // Write atomically using temp file
            const tempFile = TOKEN_EXCHANGE_FILE + '.tmp';
            fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
            fs.renameSync(tempFile, TOKEN_EXCHANGE_FILE);
        } catch (e) {
            console.error('[TokenManager] ⚠️ Error syncing to file:', e.message);
        } finally {
            this.isWriting = false;

            if (this.pendingWrite) {
                this.pendingWrite = false;
                setImmediate(() => this.syncToFile());
            }
        }
    }

    // Check rate limit
    checkRateLimit(clientId, endpoint) {
        const key = `${clientId}:${endpoint}`;
        const now = Date.now();
        const windowStart = now - CONFIG.RATE_LIMIT_WINDOW;

        if (!this.rateLimiter.has(key)) {
            this.rateLimiter.set(key, []);
        }

        const requests = this.rateLimiter.get(key);

        // Remove old entries
        while (requests.length > 0 && requests[0] < windowStart) {
            requests.shift();
        }

        // Check limit
        if (requests.length >= CONFIG.RATE_LIMIT_MAX) {
            return false;
        }

        requests.push(now);
        return true;
    }

    cleanupRateLimiter() {
        const now = Date.now();
        const windowStart = now - CONFIG.RATE_LIMIT_WINDOW;

        for (const [key, requests] of this.rateLimiter.entries()) {
            const filtered = requests.filter(t => t > windowStart);
            if (filtered.length === 0) {
                this.rateLimiter.delete(key);
            } else {
                this.rateLimiter.set(key, filtered);
            }
        }
    }

    // Cleanup expired tokens
    cleanup() {
        const now = Date.now();
        const before = this.tokens.length;

        this.tokens = this.tokens.filter(t =>
            (now - t.createdAt) < CONFIG.TOKEN_EXPIRY
        );

        const removed = before - this.tokens.length;
        if (removed > 0) {
            console.log(`[TokenManager] 🧹 Cleaned ${removed} expired tokens`);
        }

        // Also clear stale pending request
        if (this.pendingRequest && this.lastRequest &&
            (now - this.lastRequest) > CONFIG.MAX_WAIT_TIME + 10000) {
            this.pendingRequest = false;
            console.log('[TokenManager] 🧹 Cleared stale pending request');
        }
    }

    // Cleanup old stats
    cleanupStats() {
        const now = Date.now();
        const cutoff = now - CONFIG.STATS_RETENTION;

        this.stats.waitTimes = this.stats.waitTimes.filter(w => w.time > cutoff);
        this.stats.requestsPerMinute = this.stats.requestsPerMinute.filter(r => r > cutoff);
    }

    // Add a new token
    addToken(token, tokenId, createdAt) {
        const now = Date.now();

        // Check for duplicates
        const existing = this.tokens.find(t => t.token === token);
        if (existing) {
            return { added: false, reason: 'duplicate' };
        }

        const newToken = {
            id: tokenId || `bridge_token_${now}_${Math.random().toString(36).substr(2, 9)}`,
            token: token,
            createdAt: createdAt || now,
            used: false,
            reservedBy: null
        };

        this.tokens.push(newToken);

        // Keep only max tokens
        if (this.tokens.length > CONFIG.MAX_TOKENS_IN_POOL) {
            // Remove oldest used tokens first
            const usedTokens = this.tokens.filter(t => t.used);
            const unusedTokens = this.tokens.filter(t => !t.used);

            if (usedTokens.length > 0) {
                this.tokens = [...unusedTokens, ...usedTokens.slice(-10)];
            } else {
                this.tokens = this.tokens.slice(-CONFIG.MAX_TOKENS_IN_POOL);
            }
        }

        // Update stats
        this.stats.totalTokensReceived++;
        this.stats.lastTokenTime = now;

        // Emit event to notify waiting requests
        this.emit('tokenAdded', newToken);

        console.log(`[TokenManager] 🎫 Token added: ${newToken.id} (pool size: ${this.tokens.length})`);

        // Trigger immediate file sync when token is added
        this.syncToFile();

        return { added: true, tokenId: newToken.id };
    }

    // Get a fresh token immediately (no waiting)
    getFreshTokenImmediate() {
        const now = Date.now();

        // Find freshest unused, non-reserved token
        const freshToken = this.tokens.find(t =>
            !t.used &&
            !t.reservedBy &&
            (now - t.createdAt) < CONFIG.TOKEN_EXPIRY
        );

        if (freshToken) {
            freshToken.used = true;
            freshToken.usedAt = now;

            this.stats.totalTokensServed++;
            this.stats.lastServeTime = now;

            return {
                success: true,
                token: freshToken.token,
                tokenId: freshToken.id,
                tokenAge: Math.round((now - freshToken.createdAt) / 1000),
                message: 'Fresh token from pool',
                source: 'pool'
            };
        }

        return null;
    }

    // Signal that we need a new token
    signalTokenRequest() {
        this.pendingRequest = true;
        this.lastRequest = Date.now();
        console.log('[TokenManager] 📢 Token request signaled');
    }

    // Clear pending request
    clearPendingRequest() {
        this.pendingRequest = false;
    }

    // Check if pending
    isPending() {
        if (!this.pendingRequest || !this.lastRequest) {
            return false;
        }
        return (Date.now() - this.lastRequest) < CONFIG.MAX_WAIT_TIME;
    }

    // Get pool info
    getPoolInfo() {
        const now = Date.now();
        const freshTokens = this.tokens.filter(t =>
            !t.used &&
            !t.reservedBy &&
            (now - t.createdAt) < CONFIG.TOKEN_EXPIRY
        ).length;

        return {
            freshTokens,
            totalInPool: this.tokens.length,
            pendingRequest: this.pendingRequest,
            waitingRequests: this.stats.currentConcurrent,
            tokens: this.tokens.map(t => ({
                id: t.id,
                ageSeconds: Math.round((now - t.createdAt) / 1000),
                used: t.used,
                reserved: !!t.reservedBy,
                expired: (now - t.createdAt) >= CONFIG.TOKEN_EXPIRY
            }))
        };
    }

    // Get statistics
    getStats() {
        const now = Date.now();
        const uptimeMs = now - this.stats.serverStartTime;
        const recentRequests = this.stats.requestsPerMinute.filter(r => r > now - 60000).length;

        const avgWait = this.stats.waitTimes.length > 0
            ? this.stats.waitTimes.reduce((a, b) => a + b.duration, 0) / this.stats.waitTimes.length
            : 0;

        return {
            uptime: Math.round(uptimeMs / 1000),
            uptimeFormatted: this.formatUptime(uptimeMs),
            totalTokensReceived: this.stats.totalTokensReceived,
            totalTokensServed: this.stats.totalTokensServed,
            totalRequestsReceived: this.stats.totalRequestsReceived,
            totalTimeouts: this.stats.totalTimeouts,
            totalErrors: this.stats.totalErrors,
            currentWaiting: this.stats.currentConcurrent,
            peakConcurrent: this.stats.peakConcurrent,
            requestsLastMinute: recentRequests,
            averageWaitTimeMs: Math.round(avgWait),
            lastTokenReceived: this.stats.lastTokenTime
                ? new Date(this.stats.lastTokenTime).toISOString()
                : null,
            lastTokenServed: this.stats.lastServeTime
                ? new Date(this.stats.lastServeTime).toISOString()
                : null,
            poolSize: this.tokens.length,
            freshTokensAvailable: this.tokens.filter(t => !t.used && !t.reservedBy).length
        };
    }

    formatUptime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
        if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }

    // Clear all tokens
    clearAll() {
        const count = this.tokens.length;
        this.tokens = [];
        this.pendingRequest = false;
        this.lastRequest = null;
        this.syncToFile();
        return count;
    }

    // Record a request
    recordRequest() {
        this.stats.totalRequestsReceived++;
        this.stats.requestsPerMinute.push(Date.now());
    }

    // Update concurrent count
    updateConcurrent(delta) {
        this.stats.currentConcurrent += delta;
        if (this.stats.currentConcurrent > this.stats.peakConcurrent) {
            this.stats.peakConcurrent = this.stats.currentConcurrent;
        }
    }

    // Record wait time
    recordWaitTime(duration) {
        this.stats.waitTimes.push({
            duration,
            time: Date.now()
        });
    }

    // Record timeout
    recordTimeout() {
        this.stats.totalTimeouts++;
    }

    // Record error
    recordError() {
        this.stats.totalErrors++;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// REQUEST HANDLER CLASS
// ═══════════════════════════════════════════════════════════════════════════
class RequestHandler {
    constructor(tokenManager) {
        this.tokenManager = tokenManager;
    }

    // Wait for a fresh token with queue management
    async waitForFreshToken(requestId, maxWait = CONFIG.MAX_WAIT_TIME) {
        const startTime = Date.now();

        // Check if we already have too many waiting
        if (this.tokenManager.stats.currentConcurrent >= CONFIG.MAX_CONCURRENT_WAIT) {
            return {
                success: false,
                error: 'Server busy',
                message: 'Too many concurrent requests. Please try again later.',
                currentWaiting: this.tokenManager.stats.currentConcurrent
            };
        }

        // Signal that we need a token
        this.tokenManager.signalTokenRequest();
        this.tokenManager.updateConcurrent(1);

        console.log(`[Request:${requestId}] ⏳ Waiting for token (${this.tokenManager.stats.currentConcurrent} in queue)...`);

        return new Promise((resolve) => {
            let resolved = false;
            let timeoutHandle = null;
            let pollHandle = null;

            const cleanup = () => {
                if (timeoutHandle) clearTimeout(timeoutHandle);
                if (pollHandle) clearInterval(pollHandle);
                this.tokenManager.removeListener('tokenAdded', onTokenAdded);
                this.tokenManager.updateConcurrent(-1);
            };

            const finish = (result) => {
                if (resolved) return;
                resolved = true;
                cleanup();

                const elapsed = Date.now() - startTime;
                this.tokenManager.recordWaitTime(elapsed);

                if (result.success) {
                    console.log(`[Request:${requestId}] ✅ Got token after ${elapsed}ms`);
                } else {
                    console.log(`[Request:${requestId}] ❌ ${result.error} after ${elapsed}ms`);
                }

                resolve(result);
            };

            // Event listener for new tokens
            const onTokenAdded = () => {
                const token = this.tokenManager.getFreshTokenImmediate();
                if (token) {
                    this.tokenManager.clearPendingRequest();
                    finish(token);
                }
            };

            this.tokenManager.on('tokenAdded', onTokenAdded);

            // Timeout handler
            timeoutHandle = setTimeout(() => {
                this.tokenManager.recordTimeout();
                finish({
                    success: false,
                    error: 'Timeout waiting for token',
                    message: 'Extension did not generate a token in time. Make sure you have labs.google.com open in Chrome.',
                    waitedMs: Date.now() - startTime
                });
            }, maxWait);

            // Also poll periodically (backup for missed events)
            pollHandle = setInterval(() => {
                const token = this.tokenManager.getFreshTokenImmediate();
                if (token) {
                    this.tokenManager.clearPendingRequest();
                    finish(token);
                }
            }, CONFIG.POLL_INTERVAL);

            // Initial check
            const immediate = this.tokenManager.getFreshTokenImmediate();
            if (immediate) {
                this.tokenManager.clearPendingRequest();
                finish(immediate);
            }
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// HTTP SERVER
// ═══════════════════════════════════════════════════════════════════════════
const tokenManager = new TokenManager();
const requestHandler = new RequestHandler(tokenManager);
const securityManager = new SecurityManager();
const bearerTokenManager = new BearerTokenManager();

// Periodic cleanup for expired bearer tokens
setInterval(() => {
    bearerTokenManager.cleanupExpired();
}, 60000); // Run every 60 seconds

// Generate request ID
let requestCounter = 0;
function generateRequestId() {
    return `req_${++requestCounter}_${Date.now().toString(36)}`;
}

// Get client identifier for rate limiting
function getClientId(req) {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;
    return ip || 'unknown';
}

// Parse JSON body
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                reject(new Error('Invalid JSON'));
            }
        });
        req.on('error', reject);
    });
}

// Send JSON response (idempotent — avoids ERR_HTTP_HEADERS_SENT on double send)
function sendJson(res, statusCode, data) {
    if (res.writableEnded || res.headersSent) {
        console.warn('[sendJson] Skipping — response already sent');
        return;
    }
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(data));
}

// Create server with proper error handling
// On-demand Puppeteer generation can exceed 35s; HTTP timeout must exceed Promise.race.
const GET_FRESH_TOKEN_HTTP_TIMEOUT_MS = 120000;
const GET_FRESH_TOKEN_RACE_MS = 90000;

const server = http.createServer(async (req, res) => {
    const requestId = generateRequestId();
    const clientId = getClientId(req);
    const startTime = Date.now();

    // ✅ TAMBAH INI: Log semua incoming requests
    console.log(`[${requestId}] 📥 ${req.method} ${req.url} from ${clientId}`);

    let pathnameEarly = '/';
    try {
        pathnameEarly = new URL(req.url, `http://localhost:${PORT}`).pathname;
    } catch {
        /* ignore */
    }
    const httpTimeoutMs =
        pathnameEarly === '/get-fresh-token' ? GET_FRESH_TOKEN_HTTP_TIMEOUT_MS : CONFIG.REQUEST_TIMEOUT;

    res.setTimeout(httpTimeoutMs, () => {
        console.log(`[${requestId}] ⚠️ Request timeout (${httpTimeoutMs}ms)`);
        if (!res.headersSent && !res.writableEnded) {
            sendJson(res, 504, { error: 'Request timeout', requestId });
        }
    });

    try {
        // CORS preflight
        if (req.method === 'OPTIONS') {
            console.log(`[${requestId}] ✅ CORS preflight allowed`);
            sendJson(res, 200, { ok: true });
            return;
        }

        const url = new URL(req.url, `http://localhost:${PORT}`);
        const pathname = url.pathname;

        // ─────────────────────────────────────────────────────────────────
        // IP Whitelist Check (skip for whitelist management endpoints)
        // ─────────────────────────────────────────────────────────────────
        const whitelistManagementEndpoints = ['/whitelist', '/security'];
        const skipWhitelistCheck = whitelistManagementEndpoints.includes(pathname);

        if (!skipWhitelistCheck && !securityManager.isAllowed(clientId)) {
            console.log(`[${requestId}] 🚫 IP whitelist check failed: ${clientId}`);
            sendJson(res, 403, {
                error: 'Access denied',
                message: 'Your IP is not whitelisted',
                yourIp: securityManager.normalizeIp(clientId)
            });
            return;
        }

        // Rate limiting for certain endpoints
        if (['/get-fresh-token'].includes(pathname)) {
            if (!tokenManager.checkRateLimit(clientId, pathname)) {
                console.log(`[${requestId}] ⚠️ Rate limited: ${clientId}`);
                sendJson(res, 429, {
                    error: 'Too many requests',
                    message: 'Please slow down your requests'
                });
                return;
            }
        }

        // Record request
        tokenManager.recordRequest();

        // ─────────────────────────────────────────────────────────────────
        // Route: Health check / status
        // ─────────────────────────────────────────────────────────────────
        if (pathname === '/' || pathname === '/status') {
            const poolInfo = tokenManager.getPoolInfo();
            const stats = tokenManager.getStats();

            sendJson(res, 200, {
                service: 'Extension Bridge Server (Professional High-Concurrency)',
                status: 'ready',
                version: '2.0.0',
                freshTokens: poolInfo.freshTokens,
                totalTokens: poolInfo.totalInPool,
                pendingRequest: poolInfo.pendingRequest,
                waitingRequests: poolInfo.waitingRequests,
                uptime: stats.uptimeFormatted,
                requestsLastMinute: stats.requestsLastMinute,
                mode: 'on-demand',
                message: poolInfo.freshTokens > 0
                    ? `${poolInfo.freshTokens} fresh tokens available`
                    : 'Tokens will be generated on-demand when requested'
            });
            return;
        }

        // ─────────────────────────────────────────────────────────────────
        // Route: Get fresh token (with on-demand generation)
        // ─────────────────────────────────────────────────────────────────
        if (pathname === '/get-fresh-token') {
            const url_ = new URL(req.url, `http://localhost:${PORT}`);
            const flowAccountCode = url_.searchParams.get('flowAccountCode');
            const projectId = url_.searchParams.get('projectId');
            const cookieFileName = url_.searchParams.get('cookieFileName');
            const action = url_.searchParams.get('action');
            const freshSessionParam = url_.searchParams.get('freshSession');
            const freshCookiesPerVideo =
                freshSessionParam === '1' ||
                (freshSessionParam !== '0' && action === 'VIDEO_GENERATION');
            const fullLoginParam = url_.searchParams.get('fullLogin');
            const unifiedSession = url_.searchParams.get('unifiedSession') === '1';
            // Unified session: default full Puppeteer login unless fullLogin=0 (use existing cookies only)
            const fullLogin = unifiedSession ? fullLoginParam !== '0' : fullLoginParam === '1';
            
            console.log(`[${requestId}] 🔍 GET /get-fresh-token - Request received:`, {
                flowAccountCode: flowAccountCode || 'none',
                projectId: projectId ? `${projectId.substring(0, 8)}...` : 'none',
                cookieFileName: cookieFileName || 'none',
                action: action || 'none',
                freshCookiesPerVideo: unifiedSession ? false : freshCookiesPerVideo,
                fullLogin,
                unifiedSession,
            });
            
            // If flowAccountCode or projectId provided, generate on-demand (in-process, no second window)
            if (flowAccountCode || projectId) {
                console.log(`[${requestId}] 🎯 Generating token on-demand (in-process)`);
                
                try {
                    const { generateToken } = await import('./auto-generator.js');
                    const token = await Promise.race([
                        generateToken(flowAccountCode, projectId, cookieFileName, action, {
                            freshCookiesPerVideo: unifiedSession ? false : freshCookiesPerVideo,
                            fullLogin,
                            unifiedVideoSession: unifiedSession,
                        }),
                        new Promise((_, reject) =>
                            setTimeout(
                                () => reject(new Error(`Token generation timeout after ${GET_FRESH_TOKEN_RACE_MS / 1000}s`)),
                                GET_FRESH_TOKEN_RACE_MS
                            )
                        )
                    ]);
                    
                    if (token && typeof token === 'object' && token.__unified) {
                        const result = tokenManager.addToken(token.recaptchaToken, `ondemand-${Date.now()}`);
                        console.log(`[${requestId}] ✅ Unified session (OAuth + reCAPTCHA) generated on-demand`);
                        sendJson(res, 200, {
                            success: true,
                            token: token.recaptchaToken,
                            oauthToken: token.oauthToken,
                            cookieFileName: token.cookieFileName,
                            credits: token.credits,
                            tokenId: result.tokenId || `ondemand-${Date.now()}`,
                            requestId,
                            waitedMs: 0,
                            generated: true,
                            unifiedSession: true,
                        });
                        return;
                    }

                    if (token) {
                        const result = tokenManager.addToken(token, `ondemand-${Date.now()}`);
                        console.log(`[${requestId}] ✅ Token generated on-demand successfully`);
                        sendJson(res, 200, {
                            success: true,
                            token,
                            tokenId: result.tokenId || `ondemand-${Date.now()}`,
                            requestId,
                            waitedMs: 0,
                            generated: true
                        });
                        return;
                    }
                    throw new Error('Token generation failed');
                } catch (error) {
                    console.error(`[${requestId}] ❌ On-demand generation error:`, error.message);
                    sendJson(res, 500, {
                        success: false,
                        error: 'On-demand generation failed',
                        message: error.message,
                        requestId
                    });
                    return;
                }
            }
            
            // Fallback: try to get from existing pool (if no specific requirements)
            const existingToken = tokenManager.getFreshTokenImmediate();

            if (existingToken) {
                console.log(`[${requestId}] ✅ Token dispatched from pool: ${existingToken.tokenId}`);
                sendJson(res, 200, {
                    ...existingToken,
                    requestId,
                    waitedMs: 0
                });
                return;
            }

            // No fresh token available - return error
            console.log(`[${requestId}] ❌ No fresh tokens in pool`);
            const poolInfo = tokenManager.getPoolInfo();
            console.log(`[${requestId}] 📋 Current pool status:`, {
                freshTokens: poolInfo.freshTokens,
                totalTokens: poolInfo.totalInPool
            });

            sendJson(res, 503, {
                success: false,
                error: 'No tokens available in pool',
                message: 'Please provide flowAccountCode and projectId for on-demand generation.',
                poolStatus: {
                    freshTokens: poolInfo.freshTokens,
                    totalTokens: poolInfo.totalInPool
                },
                requestId
            });
            return;
        }

        // ─────────────────────────────────────────────────────────────────
        // Route: Check if token request is pending (for extension to poll)
        // ─────────────────────────────────────────────────────────────────
        if (pathname === '/check-pending') {
            const isPending = tokenManager.isPending();
            const waitingCount = tokenManager.stats.currentConcurrent;

            sendJson(res, 200, {
                pendingRequest: isPending,
                waitingRequests: waitingCount,
                lastRequest: tokenManager.lastRequest,
                message: isPending
                    ? `Please generate a token (${waitingCount} waiting)`
                    : 'No pending requests'
            });
            return;
        }

        // ─────────────────────────────────────────────────────────────────
        // Route: Add token - REMOVED (no longer using Chrome Extension)
        // Tokens are now generated on-demand via recaptchaAutoGenerator.js
        // ─────────────────────────────────────────────────────────────────

        // ─────────────────────────────────────────────────────────────────
        // Route: Pool info
        // ─────────────────────────────────────────────────────────────────
        if (pathname === '/pool') {
            const poolInfo = tokenManager.getPoolInfo();
            sendJson(res, 200, poolInfo);
            return;
        }

        // ─────────────────────────────────────────────────────────────────
        // Route: Statistics
        // ─────────────────────────────────────────────────────────────────
        if (pathname === '/stats') {
            const stats = tokenManager.getStats();
            sendJson(res, 200, stats);
            return;
        }

        // ─────────────────────────────────────────────────────────────────
        // Route: Clear pool
        // ─────────────────────────────────────────────────────────────────
        if (pathname === '/clear' && req.method === 'POST') {
            const count = tokenManager.clearAll();
            console.log(`[${requestId}] 🗑️ Pool cleared (${count} tokens removed)`);
            sendJson(res, 200, {
                success: true,
                message: `Pool cleared (${count} tokens removed)`
            });
            return;
        }

        // ─────────────────────────────────────────────────────────────────
        // Route: Whitelist/Security Management
        // ─────────────────────────────────────────────────────────────────
        if (pathname === '/whitelist' || pathname === '/security') {
            // GET - View whitelist status
            if (req.method === 'GET') {
                const status = securityManager.getStatus();
                sendJson(res, 200, {
                    ...status,
                    yourIp: securityManager.normalizeIp(clientId),
                    message: status.enabled
                        ? `IP Whitelist is ENABLED. ${status.whitelistCount} IPs allowed.`
                        : 'IP Whitelist is DISABLED. All IPs are allowed.'
                });
                return;
            }

            // POST - Show config instructions (whitelist is now config-based)
            if (req.method === 'POST') {
                sendJson(res, 200, {
                    success: false,
                    message: 'Whitelist is now managed via config.js (ALLOWED_IPS array)',
                    instructions: [
                        '1. Open config.js in the project root',
                        '2. Find the ALLOWED_IPS setting',
                        '3. Add IPs you want to whitelist: ALLOWED_IPS: [\'192.168.1.100\', \'10.0.0.1\']',
                        '4. Leave empty for open access: ALLOWED_IPS: []',
                        '5. Restart the bridge-server to apply changes'
                    ],
                    currentStatus: securityManager.getStatus(),
                    note: 'Runtime modification removed for simplicity. Edit config.js and restart server.'
                });
                return;
            }
        }

        // ─────────────────────────────────────────────────────────────────
        // Route: Extension Management - REMOVED
        // Chrome Extension endpoints are no longer used
        // On-demand generation is handled by recaptchaAutoGenerator.js (port 6004)
        // ─────────────────────────────────────────────────────────────────

        // ─────────────────────────────────────────────────────────────────
        // Route: Bearer Token Management (Google API Authorization Token)
        // ─────────────────────────────────────────────────────────────────

        // POST /bearer-token - Save bearer token (from extension)
        if (pathname === '/bearer-token' && req.method === 'POST') {
            try {
                const body = await parseBody(req);
                const { token, extensionId, profileName } = body;

                if (!token) {
                    sendJson(res, 400, { error: 'Token is required' });
                    return;
                }

                const result = bearerTokenManager.saveToken(token, extensionId, profileName);
                sendJson(res, 200, result);
            } catch (e) {
                sendJson(res, 400, { error: e.message });
            }
            return;
        }

        // GET /bearer-token - Get current bearer token (freshest from any extension)
        // Query params: ?extensionId=xxx (optional, to get from specific extension)
        // Query params: ?mode=round-robin (optional, to use rotation)
        if (pathname === '/bearer-token' && req.method === 'GET') {
            const url_ = new URL(req.url, `http://localhost:${PORT}`);
            const preferredExtId = url_.searchParams.get('extensionId');
            const mode = url_.searchParams.get('mode');

            let result;
            if (mode === 'round-robin') {
                result = bearerTokenManager.getTokenRoundRobin();
            } else if (preferredExtId) {
                result = bearerTokenManager.getTokenByExtension(preferredExtId);
            } else {
                result = bearerTokenManager.getToken();
            }

            const statusCode = result.success ? 200 : 404;
            sendJson(res, statusCode, result);
            return;
        }

        // GET /bearer-token/status - Get bearer token status/info for all extensions
        if (pathname === '/bearer-token/status') {
            const result = bearerTokenManager.getStatus();
            sendJson(res, 200, result);
            return;
        }

        // GET /bearer-token/all - Get all valid tokens (for UGC Studio bulk fetch)
        if (pathname === '/bearer-token/all') {
            const result = bearerTokenManager.getAllValidTokens();
            sendJson(res, 200, result);
            return;
        }

        // GET /bearer-token/list - List all extensions with bearer tokens
        if (pathname === '/bearer-token/list') {
            const extensions = bearerTokenManager.listExtensions();
            sendJson(res, 200, {
                success: true,
                totalExtensions: extensions.length,
                extensions: extensions
            });
            return;
        }

        // GET /bearer-token/round-robin - Get token with round-robin rotation
        if (pathname === '/bearer-token/round-robin') {
            const result = bearerTokenManager.getTokenRoundRobin();
            const statusCode = result.success ? 200 : 404;
            sendJson(res, statusCode, result);
            return;
        }

        // GET /bearer-token/by-extension/:extensionId - Get token from specific extension
        if (pathname.startsWith('/bearer-token/by-extension/')) {
            const extensionId = pathname.replace('/bearer-token/by-extension/', '');
            if (!extensionId) {
                sendJson(res, 400, { error: 'Extension ID required' });
                return;
            }
            const result = bearerTokenManager.getTokenByExtension(decodeURIComponent(extensionId));
            const statusCode = result.success ? 200 : 404;
            sendJson(res, statusCode, result);
            return;
        }

        // DELETE /bearer-token - Clear bearer token
        // Query params: ?extensionId=xxx (optional, to clear specific extension)
        if (pathname === '/bearer-token' && req.method === 'DELETE') {
            const url_ = new URL(req.url, `http://localhost:${PORT}`);
            const extensionId = url_.searchParams.get('extensionId');

            const result = bearerTokenManager.clearToken(extensionId);
            sendJson(res, 200, result);
            return;
        }

        // Alias: GET /get-bearer-token (for easier access, returns freshest token)
        if (pathname === '/get-bearer-token') {
            const result = bearerTokenManager.getToken();
            const statusCode = result.success ? 200 : 404;
            sendJson(res, statusCode, result);
            return;
        }

        // ─────────────────────────────────────────────────────────────────
        // Route: Not found
        // ─────────────────────────────────────────────────────────────────
        console.log(`[${requestId}] ❌ Route not found: ${req.method} ${pathname}`);
        sendJson(res, 404, { error: 'Not found' });

    } catch (error) {
        console.error(`[${requestId}] ❌ Error processing ${req.method} ${req.url}:`, error.message);
        console.error(`[${requestId}] ❌ Error stack:`, error.stack);
        tokenManager.recordError();

        if (!res.headersSent) {
            sendJson(res, 500, {
                error: 'Internal server error',
                message: error.message
            });
        }
    }
});

// Handle server errors
server.on('error', (error) => {
    console.error('[Server] ❌ Server error:', error);
    if (error.code === 'EADDRINUSE') {
        console.error(`[Server] Port ${PORT} is already in use`);
        process.exit(1);
    }
});

// Handle process signals for graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[Server] 🛑 Shutting down gracefully...');
    tokenManager.syncToFile();
    server.close(() => {
        console.log('[Server] ✅ Server closed');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\n[Server] 🛑 Received SIGTERM, shutting down...');
    tokenManager.syncToFile();
    server.close(() => {
        console.log('[Server] ✅ Server closed');
        process.exit(0);
    });
});

// Start server
server.listen(PORT, HOST, () => {
    const securityStatus = securityManager.getStatus();

    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════════╗');
    console.log('║    🚀 Bridge Server (On-Demand reCAPTCHA Token Generation)       ║');
    console.log('╠═══════════════════════════════════════════════════════════════════╣');
    console.log('║                                                                   ║');
    console.log(`║   Local:    http://localhost:${PORT}                               ║`);
    console.log(`║   Network:  http://${HOST}:${PORT} (accessible from external)       ║`);
    console.log('║                                                                   ║');
    console.log('╠═══════════════════════════════════════════════════════════════════╣');
    console.log('║   Features:                                                       ║');
    console.log('║   • In-memory token pool with file backup                         ║');
    console.log('║   • Request queue with fair distribution                          ║');
    console.log('║   • Handles 100+ concurrent requests                              ║');
    console.log('║   • Rate limiting protection                                      ║');
    console.log('║   • IP Whitelist security (config-based)                          ║');
    console.log('║   • Automatic cleanup & health monitoring                         ║');
    console.log('║   • On-demand token generation via auto generator (port 6004)     ║');
    console.log('║                                                                   ║');
    console.log('╠═══════════════════════════════════════════════════════════════════╣');
    console.log('║   � MULTI-EXTENSION ROTATION:                                    ║');
    // Extension rotation removed - no longer using Chrome Extension
    if (false) {
        console.log('║   ┌─────────────────────────────────────────────────────────────┐ ║');
        console.log('║   │ ✅ ENABLED - Rotating tokens across multiple extensions    │ ║');
        console.log('║   ├─────────────────────────────────────────────────────────────┤ ║');
        console.log(`║   │   Mode: ${extensionStatus.mode.padEnd(50)}│ ║`);
        console.log(`║   │   Cooldown: ${extensionStatus.cooldownPerExtension.padEnd(46)}│ ║`);
        console.log(`║   │   Max Extensions: ${String(extensionManager.config.MAX_EXTENSIONS).padEnd(40)}│ ║`);
        console.log('║   ├─────────────────────────────────────────────────────────────┤ ║');
        console.log('║   │   📋 How to use:                                           │ ║');
        console.log('║   │   1. Create multiple Chrome profiles                       │ ║');
        console.log('║   │   2. Install extension on each profile                     │ ║');
        console.log('║   │   3. Open labs.google.com on each profile                  │ ║');
        console.log('║   │   4. Extensions auto-register & rotate                     │ ║');
        console.log('║   └─────────────────────────────────────────────────────────────┘ ║');
    } else {
        console.log('║   ┌─────────────────────────────────────────────────────────────┐ ║');
        console.log('║   │ ⚠️ DISABLED - Single extension mode                        │ ║');
        console.log('║   │   To enable, edit config.js:                               │ ║');
        console.log('║   │   EXTENSION_ROTATION.ENABLED = true                        │ ║');
        console.log('║   └─────────────────────────────────────────────────────────────┘ ║');
    }
    console.log('║                                                                   ║');
    console.log('╠═══════════════════════════════════════════════════════════════════╣');
    console.log('║   � IP ACCESS CONTROL:                                           ║');
    if (securityStatus.enabled) {
        console.log('║   ┌─────────────────────────────────────────────────────────────┐ ║');
        console.log('║   │ 🔒 WHITELIST MODE - Only these IPs can access:             │ ║');
        console.log('║   ├─────────────────────────────────────────────────────────────┤ ║');
        securityStatus.whitelist.forEach((ip, index) => {
            const ipLine = `   ✓ ${ip}`.padEnd(61);
            console.log(`║   │${ipLine}│ ║`);
        });
        console.log('║   │   + localhost (127.0.0.1, ::1) always allowed              │ ║');
        console.log('║   └─────────────────────────────────────────────────────────────┘ ║');
    } else {
        console.log('║   ┌─────────────────────────────────────────────────────────────┐ ║');
        console.log('║   │ 🔓 OPEN MODE - All IPs can access                          │ ║');
        console.log('║   │   (ALLOWED_IPS in config.js is empty)                      │ ║');
        console.log('║   └─────────────────────────────────────────────────────────────┘ ║');
    }
    console.log('║                                                                   ║');
    console.log('╠═══════════════════════════════════════════════════════════════════╣');
    console.log('║   Endpoints:                                                      ║');
    console.log('║   • GET  /get-fresh-token     - Get reCAPTCHA token (on-demand)  ║');
    console.log('║   • GET  /pool                - View token pool                  ║');
    console.log('║   • GET  /stats               - Detailed statistics              ║');
    console.log('║   • GET  /status              - Server status                    ║');
    console.log('║   • GET  /whitelist           - View whitelist status            ║');
    console.log('║   ─────────────────────────────────────────────────────────────  ║');
    console.log('║   🔐 Bearer Token (Google API Auth):                             ║');
    console.log('║   • GET  /bearer-token        - Get freshest bearer token        ║');
    console.log('║   • GET  /bearer-token/status - Status of all bearer tokens      ║');
    console.log('║   • POST /bearer-token        - Save bearer token                ║');
    console.log('║                                                                   ║');
    console.log('╠═══════════════════════════════════════════════════════════════════╣');
    console.log('║   📌 How it works:                                                 ║');
    console.log('║   1. Request token with flowAccountCode, projectId, cookieFileName║');
    console.log('║   2. Bridge server calls auto generator (port 6004)               ║');
    console.log('║   3. Auto generator uses Puppeteer to generate token              ║');
    console.log('║   4. Token returned and cached in pool                            ║');
    console.log('║                                                                   ║');
    console.log(`║   🌐 External Access: http://<YOUR_IP>:${PORT}                     ║`);
    console.log('╚═══════════════════════════════════════════════════════════════════╝');
    console.log('');
});

