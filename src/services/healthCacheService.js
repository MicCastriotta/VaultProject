/**
 * Health Cache Service
 * Cache in-memory dei risultati dell'analisi Password Health.
 * I dati (inclusi profili decriptati) vengono cancellati al lock/logout del vault.
 */

let _cache = null;

export const healthCache = {
    /** Restituisce i risultati cached, o null se non presenti. */
    get() {
        return _cache;
    },

    /** Salva i risultati con timestamp corrente. */
    set(data) {
        _cache = { ...data, timestamp: Date.now() };
    },

    /** Cancella la cache (chiamato al lock/logout per sicurezza). */
    clear() {
        _cache = null;
    },

    /** True se esiste una cache salvata. */
    isValid() {
        return _cache !== null;
    }
};
