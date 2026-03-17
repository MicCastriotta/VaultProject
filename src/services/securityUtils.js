/**
 * Security Utilities - VERSIONE AGGIORNATA CON DOMPurify
 * Funzioni per protezione XSS e sanitizzazione input
 */

import DOMPurify from 'dompurify';

/**
 * Sanitizza input HTML per prevenire XSS usando DOMPurify
 * @param {string} dirty - Input non sicuro da sanitizzare
 * @param {object} config - Configurazione opzionale DOMPurify
 * @returns {string} - Input sanitizzato
 */
export function sanitizeHTML(dirty, config = {}) {
    if (!dirty) return '';

    // Configurazione di default più restrittiva per password manager
    const defaultConfig = {
        ALLOWED_TAGS: [], // Di default non permette tag HTML
        ALLOWED_ATTR: [],
        KEEP_CONTENT: true, // Mantiene il contenuto testuale anche se rimuove i tag
        ...config
    };

    return DOMPurify.sanitize(dirty, defaultConfig);
}

/**
 * Sanitizza HTML permettendo alcuni tag sicuri (per note/descrizioni)
 * @param {string} dirty - Input non sicuro
 * @returns {string} - HTML sanitizzato con tag sicuri
 */
export function sanitizeRichText(dirty) {
    if (!dirty) return '';

    return DOMPurify.sanitize(dirty, {
        ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
        ALLOWED_ATTR: ['href', 'target'],
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):)/i,
    });
}

/**
 * Valida e sanitizza URL per prevenire javascript: protocol injection
 * @param {string} url - URL da validare
 * @returns {string} - URL sicuro o stringa vuota
 */
export function sanitizeURL(url) {
    if (!url) return '';

    const trimmed = url.trim();

    // Usa DOMPurify per sanitizzare l'URL
    const sanitized = DOMPurify.sanitize(trimmed, {
        ALLOWED_TAGS: [],
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):)/i
    });

    // Verifica che non contenga protocolli pericolosi
    const lowerUrl = sanitized.toLowerCase();
    const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:'];

    for (const protocol of dangerousProtocols) {
        if (lowerUrl.includes(protocol)) {
            console.warn('🚫 Blocked dangerous URL protocol:', protocol);
            return '';
        }
    }

    // Se non ha protocollo e non inizia con /, assume https
    if (!/^(https?|mailto|tel):/.test(lowerUrl) && !sanitized.startsWith('/')) {
        return 'https://' + sanitized;
    }

    return sanitized;
}

/**
 * Valida input per field specifici
 */
export const validators = {
    /**
     * Valida username/email
     */
    username(value) {
        if (!value) return '';
        // Sanitizza con DOMPurify rimuovendo qualsiasi HTML
        return sanitizeHTML(value).slice(0, 100);
    },

    /**
     * Valida titolo profilo (limitato a 100 char)
     */
    title(value) {
        if (!value) return '';
        return sanitizeHTML(value).slice(0, 100);
    },

    /**
     * Valida note/descrizioni (limitato a 5000 char, permette alcuni tag)
     */
    notes(value) {
        if (!value) return '';
        // Usa sanitizeRichText per permettere formattazione base
        return sanitizeRichText(value).slice(0, 5000);
    },

    /**
     * Valida email
     */
    email(value) {
        if (!value) return '';
        const sanitized = sanitizeHTML(value).trim().toLowerCase();
        // Validazione base email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(sanitized) ? sanitized : '';
    },

    /**
     * Valida URL
     */
    url(value) {
        if (!value) return '';
        return sanitizeURL(value);
    },

    /**
     * Valida card number (solo numeri e spazi)
     */
    cardNumber(value) {
        if (!value) return '';
        // Prima sanitizza HTML, poi filtra solo numeri e spazi
        const sanitized = sanitizeHTML(value);
        return sanitized.replace(/[^\d\s]/g, '').slice(0, 19);
    },

    /**
     * Valida CVV (solo numeri, 3-4 cifre)
     */
    cvv(value) {
        if (!value) return '';
        const sanitized = sanitizeHTML(value);
        return sanitized.replace(/\D/g, '').slice(0, 4);
    },

    /**
     * Valida campo generico testuale
     */
    text(value, maxLength = 500) {
        if (!value) return '';
        return sanitizeHTML(value).slice(0, maxLength);
    }
};

/**
 * Copia in clipboard con auto-clear dopo 30 secondi
 */
export async function secureCopyToClipboard(text, clearAfterMs = 30000) {
    try {
        await navigator.clipboard.writeText(text);

        // Auto-clear dopo timeout
        setTimeout(async () => {
            try {
                // Verifica che il clipboard contenga ancora lo stesso testo
                const current = await navigator.clipboard.readText();
                if (current === text) {
                    await navigator.clipboard.writeText('');
                    console.log('🔒 Clipboard cleared for security');
                }
            } catch (err) {
                // Ignora errori di permission (es. tab non attivo)
            }
        }, clearAfterMs);

        return true;
    } catch (err) {
        console.error('❌ Copy failed:', err);
        return false;
    }
}

/**
 * Rate limiter per prevenire brute-force
 */
// Chiave localStorage per persistenza rate limiting (offuscata)
const RL_STORAGE_KEY = '_sp_sec_rl';

export class RateLimiter {
    constructor(maxAttempts = 5, windowMs = 300000) { // 5 tentativi in 5 minuti
        this.maxAttempts = maxAttempts;
        this.windowMs = windowMs;
        // Carica tentativi precedenti da localStorage (sopravvive ai reload)
        this.attempts = this._load();
    }

    /**
     * Carica tentativi persistiti, scartando quelli scaduti
     */
    _load() {
        try {
            const stored = localStorage.getItem(RL_STORAGE_KEY);
            if (!stored) return [];
            const parsed = JSON.parse(stored);
            if (!Array.isArray(parsed)) return [];
            const now = Date.now();
            // Filtra solo timestamp validi e non scaduti
            return parsed.filter(t => typeof t === 'number' && t > 0 && now - t < this.windowMs);
        } catch {
            return [];
        }
    }

    /**
     * Persiste lo stato corrente in localStorage
     */
    _save() {
        try {
            localStorage.setItem(RL_STORAGE_KEY, JSON.stringify(this.attempts));
        } catch {
            // localStorage non disponibile (es. Safari private mode) — degrada silenziosamente
        }
    }

    /**
     * Registra un tentativo fallito e lo persiste
     */
    recordAttempt() {
        const now = Date.now();
        this.attempts = this.attempts.filter(time => now - time < this.windowMs);
        this.attempts.push(now);
        this._save();
    }

    /**
     * Verifica se è permesso un nuovo tentativo
     */
    canAttempt() {
        const now = Date.now();
        this.attempts = this.attempts.filter(time => now - time < this.windowMs);
        return this.attempts.length < this.maxAttempts;
    }

    /**
     * Ottieni tempo rimanente prima di poter riprovare (in secondi)
     */
    getRetryAfter() {
        if (this.attempts.length < this.maxAttempts) return 0;

        const oldestAttempt = Math.min(...this.attempts);
        const resetTime = oldestAttempt + this.windowMs;
        const remainingMs = resetTime - Date.now();

        return Math.ceil(remainingMs / 1000);
    }

    /**
     * Reset dopo login riuscito — rimuove anche la persistenza
     */
    reset() {
        this.attempts = [];
        try {
            localStorage.removeItem(RL_STORAGE_KEY);
        } catch { /* ignore */ }
    }
}

/**
 * Auto-lock timer per sicurezza
 */
export class AutoLockTimer {
    constructor(timeoutMs = 300000, onLock) { // 5 minuti default
        this.timeoutMs = timeoutMs;
        this.onLock = onLock;
        this.timer = null;
        this.isActive = false;
    }

    /**
     * Avvia o resetta il timer
     */
    reset() {
        this.stop();
        this.timer = setTimeout(() => {
            console.log('🔒 Auto-lock triggered');
            if (this.onLock) this.onLock();
        }, this.timeoutMs);
        this.isActive = true;
    }

    /**
     * Ferma il timer
     */
    stop() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.isActive = false;
    }

    /**
     * Cambia il timeout
     */
    setTimeout(timeoutMs) {
        this.timeoutMs = timeoutMs;
        if (this.isActive) {
            this.reset();
        }
    }
}

/**
 * Verifica integrità IndexedDB (anti-tampering)
 */
export async function computeChecksum(data) {
    try {
        const encoder = new TextEncoder();
        const dataBytes = encoder.encode(JSON.stringify(data));
        const hash = await crypto.subtle.digest('SHA-256', dataBytes);
        const hashArray = Array.from(new Uint8Array(hash));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (err) {
        console.error('❌ Checksum computation failed:', err);
        return null;
    }
}

/**
 * Log sicurezza (per debugging, no password o dati sensibili)
 */
export function securityLog(event, metadata = {}) {
    // Rimuovi automaticamente campi sensibili
    const sanitized = { ...metadata };
    const sensitiveFields = [
        'password', 'dek', 'kek', 'encryptedDEK',
        'masterPassword', 'secret', 'privateKey',
        'token', 'apiKey', 'sessionKey'
    ];

    sensitiveFields.forEach(field => delete sanitized[field]);

    console.log(`[Security] ${event}`, sanitized);
}

/**
 * Verifica se l'app è in contesto sicuro (HTTPS o localhost)
 */
export function isSecureContext() {
    return window.isSecureContext;
}

/**
 * Previene debug console in produzione
 */
export function disableConsoleInProduction() {
    if (import.meta.env.PROD) {
        console.log = () => { };
        console.debug = () => { };
        console.info = () => { };
        // Mantieni console.error e console.warn per errori critici
    }
}

/**
 * Content Security Policy helper
 * Verifica se CSP è configurato correttamente
 */
export function checkCSP() {
    const metaCSP = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    if (!metaCSP) {
        console.warn('⚠️ Content-Security-Policy non configurato');
    }
    return !!metaCSP;
}

/**
 * Configura DOMPurify con hooks personalizzati
 * Da chiamare all'avvio dell'app
 */
export function configureDOMPurify() {
    // Hook per logging dei tentativi di XSS
    DOMPurify.addHook('uponSanitizeElement', (node, data) => {
        // 'body' e 'head' sono tag interni che DOMPurify crea durante il parsing
        // (es. sanitizzazione di SVG inner HTML): non sono veri tentativi XSS
        const internalTags = new Set(['body', 'head', 'html']);
        if (data.allowedTags && !data.allowedTags[data.tagName] && !internalTags.has(data.tagName)) {
            console.warn('🚫 XSS attempt blocked:', data.tagName);
        }
    });

    // Hook per attributi pericolosi
    DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
        const dangerousAttrs = ['onerror', 'onload', 'onclick', 'onmouseover'];
        if (dangerousAttrs.includes(data.attrName.toLowerCase())) {
            console.warn('🚫 Dangerous attribute blocked:', data.attrName);
        }
    });

    console.log('✅ DOMPurify configured with security hooks');
}
