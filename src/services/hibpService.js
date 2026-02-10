/**
 * HaveIBeenPwned Service
 * Verifica password compromesse usando l'API Pwned Passwords con k-anonymity.
 *
 * PRIVACY:
 * - Non invia MAI la password completa
 * - Calcola SHA-1 della password localmente
 * - Invia solo i primi 5 caratteri dell'hash (k-anonymity)
 * - Confronta il resto dell'hash localmente
 * - Nessuno (nemmeno HIBP) può sapere quale password stai controllando
 *
 * API: https://haveibeenpwned.com/API/v3#PwnedPasswords
 */

const HIBP_API_BASE = 'https://api.pwnedpasswords.com/range/';

class HIBPService {
    constructor() {
        // Cache dei risultati per evitare chiamate ripetute nella stessa sessione
        // Key: SHA-1 hash completo, Value: { pwned: bool, count: number }
        this.cache = new Map();
    }

    /**
     * Calcola SHA-1 di una stringa usando Web Crypto API
     * @param {string} text
     * @returns {Promise<string>} hash esadecimale uppercase
     */
    async sha1(text) {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-1', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    }

    /**
     * Controlla se una password è stata compromessa
     *
     * @param {string} password - La password da verificare
     * @returns {Promise<{ pwned: boolean, count: number }>}
     *   - pwned: true se la password è stata trovata in data breach
     *   - count: quante volte è stata trovata (0 se non compromessa)
     */
    async checkPassword(password) {
        if (!password) {
            return { pwned: false, count: 0 };
        }

        try {
            // 1. Calcola SHA-1 della password
            const hash = await this.sha1(password);

            // 2. Controlla cache
            if (this.cache.has(hash)) {
                return this.cache.get(hash);
            }

            // 3. Estrai prefisso (primi 5 char) e suffisso
            const prefix = hash.substring(0, 5);
            const suffix = hash.substring(5);

            // 4. Chiama API con il solo prefisso (k-anonymity)
            const response = await fetch(`${HIBP_API_BASE}${prefix}`, {
                headers: {
                    // Richiedi padding per mascherare la dimensione della risposta
                    'Add-Padding': 'true'
                }
            });

            if (!response.ok) {
                throw new Error(`HIBP API error: ${response.status}`);
            }

            // 5. Parsa la risposta (formato: SUFFIX:COUNT per riga)
            const text = await response.text();
            const lines = text.split('\n');

            let result = { pwned: false, count: 0 };

            for (const line of lines) {
                const [hashSuffix, countStr] = line.trim().split(':');
                if (hashSuffix === suffix) {
                    const count = parseInt(countStr, 10);
                    result = { pwned: true, count };
                    break;
                }
            }

            // 6. Salva in cache
            this.cache.set(hash, result);

            return result;
        } catch (error) {
            console.error('HIBP check failed:', error);
            // In caso di errore di rete, ritorna unknown (non bloccare il flusso)
            return { pwned: false, count: 0, error: error.message };
        }
    }

    /**
     * Controlla un batch di password con rate limiting
     * Per evitare di sovraccaricare l'API
     *
     * @param {Array<{ id: any, password: string }>} items
     * @param {function} onProgress - Callback (checked, total)
     * @returns {Promise<Map<any, { pwned: boolean, count: number }>>}
     */
    async checkBatch(items, onProgress = null) {
        const results = new Map();
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const result = await this.checkPassword(item.password);
            results.set(item.id, result);

            if (onProgress) {
                onProgress(i + 1, items.length);
            }

            // Rate limit: 100ms tra una richiesta e l'altra
            // (la cache evita richieste per password uguali)
            if (i < items.length - 1) {
                await delay(100);
            }
        }

        return results;
    }

    /**
     * Pulisci la cache (es. al logout)
     */
    clearCache() {
        this.cache.clear();
    }
}

// Singleton
export const hibpService = new HIBPService();