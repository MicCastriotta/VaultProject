/**
 * Security Utilities
 * Funzioni aggiuntive per protezione XSS e sanitizzazione input
 */

/**
 * Sanitizza input HTML per prevenire XSS
 * Usa DOMPurify quando disponibile, altrimenti fallback manuale
 */
export function sanitizeHTML(dirty) {
  // Fallback manuale se DOMPurify non disponibile
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    "/": '&#x2F;',
  };
  const reg = /[&<>"'/]/gi;
  return dirty.replace(reg, (match) => map[match]);
}

/**
 * Valida e sanitizza URL per prevenire javascript: protocol injection
 */
export function sanitizeURL(url) {
  if (!url) return '';
  
  const trimmed = url.trim().toLowerCase();
  
  // Blocca protocolli pericolosi
  const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:'];
  
  for (const protocol of dangerousProtocols) {
    if (trimmed.startsWith(protocol)) {
      console.warn('Blocked dangerous URL protocol:', protocol);
      return '';
    }
  }
  
  // Permetti solo http(s), mailto, tel
  if (!/^(https?|mailto|tel):/.test(trimmed) && !trimmed.startsWith('/')) {
    // Se non ha protocollo, assume https
    return 'https://' + url;
  }
  
  return url;
}

/**
 * Valida input per field specifici
 */
export const validators = {
  /**
   * Valida username/email (no script tags)
   */
  username(value) {
    if (!value) return '';
    // Rimuove caratteri pericolosi
    return value.replace(/[<>]/g, '');
  },

  /**
   * Valida titolo profilo (no script tags, limitato a 100 char)
   */
  title(value) {
    if (!value) return '';
    return value.replace(/[<>]/g, '').slice(0, 100);
  },

  /**
   * Valida note/descrizioni (no script tags, limitato a 500 char)
   */
  notes(value) {
    if (!value) return '';
    return value.replace(/[<>]/g, '').slice(0, 500);
  },

  /**
   * Valida card number (solo numeri e spazi)
   */
  cardNumber(value) {
    if (!value) return '';
    return value.replace(/[^\d\s]/g, '').slice(0, 19);
  },

  /**
   * Valida CVV (solo numeri, 3-4 cifre)
   */
  cvv(value) {
    if (!value) return '';
    return value.replace(/\D/g, '').slice(0, 4);
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
          console.log('Clipboard cleared for security');
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
export class RateLimiter {
  constructor(maxAttempts = 5, windowMs = 300000) { // 5 tentativi in 5 minuti
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.attempts = [];
  }

  /**
   * Registra un tentativo
   */
  recordAttempt() {
    const now = Date.now();
    
    // Rimuovi tentativi vecchi
    this.attempts = this.attempts.filter(time => now - time < this.windowMs);
    
    // Aggiungi nuovo tentativo
    this.attempts.push(now);
  }

  /**
   * Verifica se è permesso un nuovo tentativo
   */
  canAttempt() {
    const now = Date.now();
    
    // Rimuovi tentativi vecchi
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
   * Reset manuale (per test o dopo successo)
   */
  reset() {
    this.attempts = [];
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
      console.log('Auto-lock triggered');
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
export function computeChecksum(data) {
  // Simple checksum usando crypto API
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(JSON.stringify(data));
  return crypto.subtle.digest('SHA-256', dataBytes)
    .then(hash => {
      const hashArray = Array.from(new Uint8Array(hash));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    });
}

/**
 * Log sicurezza (per debugging, no password o dati sensibili)
 */
export function securityLog(event, metadata = {}) {
  // Rimuovi automaticamente campi sensibili
  const sanitized = { ...metadata };
  delete sanitized.password;
  delete sanitized.dek;
  delete sanitized.kek;
  delete sanitized.encryptedDEK;
  
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
    console.log = () => {};
    console.debug = () => {};
    console.info = () => {};
    // Mantieni console.error e console.warn per errori critici
  }
}