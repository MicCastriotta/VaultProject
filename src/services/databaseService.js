/**
 * Database Service
 * Gestisce IndexedDB tramite Dexie.js
 * 
 * INTEGRITY: salva e recupera l'HMAC di integrità nella tabella config.
 * L'HMAC viene aggiornato ad ogni operazione di scrittura (save/delete profile).
 */

import Dexie from 'dexie';

class OwnVaultDB extends Dexie {
    constructor() {
        super('OwnVaultDB');

        this.version(1).stores({
            config: 'id',
            profiles: '++id, category, lastModified, *searchTerms'
        });

        this.version(2).stores({
            config: 'id',
            profiles: '++id, category, lastModified, *searchTerms',
            syncConfig: 'id'
        });

        this.config = this.table('config');
        this.profiles = this.table('profiles');
        this.syncConfig = this.table('syncConfig');
    }
}

export const db = new OwnVaultDB();

/**
 * Service per operazioni DB
 */
class DatabaseService {
    /**
     * Verifica se esiste un utente (configurazione crypto)
     */
    async userExists() {
        const config = await db.config.get('crypto');
        return !!config;
    }

    /**
     * Salva configurazione crypto (prima volta)
     */
    async saveCryptoConfig(cryptoConfig) {
        await db.config.put({
            id: 'crypto',
            ...cryptoConfig,
            createdAt: new Date().toISOString()
        });
    }

    /**
     * Recupera configurazione crypto
     */
    async getCryptoConfig() {
        return await db.config.get('crypto');
    }

    // ========================================
    // HMAC INTEGRITY STORAGE
    // ========================================

    /**
     * Salva l'HMAC di integrità nel DB.
     * Chiamato dopo ogni operazione di scrittura.
     */
    async saveHMAC(hmac) {
        await db.config.put({
            id: 'integrity',
            hmac: hmac,
            updatedAt: new Date().toISOString()
        });
    }

    /**
     * Recupera l'HMAC di integrità salvato.
     * Ritorna null se non esiste (primo avvio o post-aggiornamento).
     */
    async getHMAC() {
        const record = await db.config.get('integrity');
        return record ? record.hmac : null;
    }

    // ========================================
    // BIOMETRIC CONFIGURATION
    // ========================================

    /**
     * Salva la configurazione biometrica
     */
    async saveBiometricConfig(biometricConfig) {
        await db.config.put({
            id: 'biometric',
            ...biometricConfig,
            updatedAt: new Date().toISOString()
        });
    }

    /**
     * Recupera la configurazione biometrica
     */
    async getBiometricConfig() {
        return await db.config.get('biometric');
    }

    /**
     * Elimina la configurazione biometrica
     */
    async deleteBiometricConfig() {
        await db.config.delete('biometric');
    }

    /**
     * Verifica se la biometria è abilitata
     */
    async isBiometricEnabled() {
        const config = await this.getBiometricConfig();
        return !!config;
    }

    // ========================================
    // PROFILE OPERATIONS
    // ========================================

    /**
     * Salva un profilo cifrato
     */
    async saveProfile(encryptedProfile) {
        const profile = {
            ...encryptedProfile,
            createdAt: encryptedProfile.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        let profileId;

        if (typeof profile.id === 'number' && Number.isInteger(profile.id)) {
            await db.profiles.update(profile.id, profile);
            profileId = profile.id;
        } else {
            delete profile.id;
            profileId = await db.profiles.add(profile);
        }

        await this.touchLocalModification();

        return profileId;
    }

    /**
     * Recupera tutti i profili cifrati
     */
    async getAllProfiles() {
        return await db.profiles.toArray();
    }

    /**
     * Recupera un profilo per ID
     */
    async getProfile(id) {
        return await db.profiles.get(id);
    }

    /**
     * Elimina un profilo
     */
    async deleteProfile(id) {
        await db.profiles.delete(id);

        await this.touchLocalModification();
    }

    /**
     * Cerca profili (sui termini di ricerca cifrati)
     */
    async searchProfiles(searchTerm) {
        if (!searchTerm) {
            return await this.getAllProfiles();
        }

        return await db.profiles
            .where('searchTerms')
            .startsWithIgnoreCase(searchTerm.toLowerCase())
            .toArray();
    }

    /**
     * Elimina tutto (reset completo)
     */
    async deleteAllData() {
        await db.config.clear();
        await db.profiles.clear();
        await db.syncConfig.clear();
    }

    /**
     * Esporta tutto (per backup)
     */
    async exportData() {
        const config = await db.config.get('crypto');
        const profiles = await db.profiles.toArray();

        return {
            version: 1,
            exportDate: new Date().toISOString(),
            crypto: config,
            profiles: profiles
        };
    }

    /**
     * Importa dati (da backup)
     * Validazione rigorosa della struttura prima di importare.
     */
    async importData(data) {
        // ===== VALIDAZIONE STRUTTURA =====

        if (!data || typeof data !== 'object') {
            throw new Error('Invalid backup: not a valid JSON object');
        }

        // Verifica versione
        if (data.version !== 1 && data.version !== 2) {
            throw new Error('Unsupported backup version: ' + data.version);
        }

        // Valida crypto config
        if (!data.crypto || typeof data.crypto !== 'object') {
            throw new Error('Invalid backup: missing crypto configuration');
        }

        const requiredCryptoFields = ['version', 'kdf', 'iterations', 'salt', 'iv', 'encryptedDEK'];
        for (const field of requiredCryptoFields) {
            if (data.crypto[field] === undefined || data.crypto[field] === null) {
                throw new Error(`Invalid backup: missing crypto field "${field}"`);
            }
        }

        // Verifica che salt, iv, encryptedDEK siano stringhe base64 valide
        const base64Fields = ['salt', 'iv', 'encryptedDEK'];
        const base64Regex = /^[A-Za-z0-9+/]+=*$/;
        for (const field of base64Fields) {
            const value = data.crypto[field];
            if (typeof value !== 'string' || !base64Regex.test(value)) {
                throw new Error(`Invalid backup: crypto field "${field}" is not valid base64`);
            }
        }

        if (typeof data.crypto.iterations !== 'number' || data.crypto.iterations < 1) {
            throw new Error('Invalid backup: iterations must be a positive number');
        }

        // Valida profiles (opzionale, può essere vuoto)
        if (data.profiles !== undefined && data.profiles !== null) {
            if (!Array.isArray(data.profiles)) {
                throw new Error('Invalid backup: profiles must be an array');
            }

            const requiredProfileFields = ['iv', 'data', 'category'];
            const allowedCategories = ['WEB', 'CARD'];

            for (let i = 0; i < data.profiles.length; i++) {
                const profile = data.profiles[i];

                if (!profile || typeof profile !== 'object') {
                    throw new Error(`Invalid backup: profile at index ${i} is not a valid object`);
                }

                for (const field of requiredProfileFields) {
                    if (profile[field] === undefined || profile[field] === null) {
                        throw new Error(`Invalid backup: profile at index ${i} missing field "${field}"`);
                    }
                }

                // iv e data devono essere stringhe base64
                for (const field of ['iv', 'data']) {
                    if (typeof profile[field] !== 'string' || !base64Regex.test(profile[field])) {
                        throw new Error(`Invalid backup: profile at index ${i} field "${field}" is not valid base64`);
                    }
                }

                if (!allowedCategories.includes(profile.category)) {
                    throw new Error(`Invalid backup: profile at index ${i} has invalid category "${profile.category}"`);
                }
            }
        }

        // ===== IMPORT (struttura validata) =====

        // Pulisci DB
        await this.deleteAllData();

        // Importa config — solo i campi attesi, niente extra
        const cleanCrypto = {
            id: 'crypto',
            version: data.crypto.version,
            kdf: data.crypto.kdf,
            iterations: data.crypto.iterations,
            salt: data.crypto.salt,
            iv: data.crypto.iv,
            encryptedDEK: data.crypto.encryptedDEK,
            createdAt: data.crypto.createdAt || new Date().toISOString()
        };
        await db.config.put(cleanCrypto);

        // Importa profiles — solo i campi attesi
        let profilesImported = 0;
        if (data.profiles && data.profiles.length > 0) {
            const cleanProfiles = data.profiles.map(p => ({
                // Non importare l'id originale: lascia che Dexie generi nuovi auto-increment
                iv: p.iv,
                data: p.data,
                category: p.category,
                version: p.version || 1,
                createdAt: p.createdAt || new Date().toISOString(),
                updatedAt: p.updatedAt || new Date().toISOString()
            }));
            await db.profiles.bulkAdd(cleanProfiles);
            profilesImported = cleanProfiles.length;
        }

        return {
            configImported: true,
            profilesImported
        };
    }

    /**
     * Conta profili per categoria
     */
    async countByCategory() {
        const profiles = await db.profiles.toArray();
        const counts = { WEB: 0, CARD: 0 };

        profiles.forEach(p => {
            if (p.category === 'WEB') counts.WEB++;
            if (p.category === 'CARD') counts.CARD++;
        });

        return counts;
    }
    /**
     * ==========================================
     * SYNC METHODS
     * ==========================================
     */

    /**
     * Salva configurazione sync
     */
    async saveSyncConfig(syncConfig) {
        await db.syncConfig.put({
            id: 'sync',
            ...syncConfig,
            updatedAt: new Date().toISOString()
        });
    }

    /**
     * Recupera configurazione sync.
     * Apre esplicitamente la connessione al DB prima di leggere:
     * evita race condition in cui Dexie non ha ancora completato
     * l'apertura/upgrade del DB al momento della lettura.
     */
    async getSyncConfig() {
        if (!db.isOpen()) {
            await db.open();
        }
        return await db.syncConfig.get('sync');
    }

    /**
     * Aggiorna solo alcuni campi della sync config
     */
    async updateSyncConfig(updates) {
        const current = await this.getSyncConfig() || {};
        await this.saveSyncConfig({
            ...current,
            ...updates
        });
    }

    /**
     * Elimina configurazione sync
     */
    async deleteSyncConfig() {
        await db.syncConfig.delete('sync');
    }

    /**
     * Aggiorna timestamp ultima modifica locale
     * (chiamato dopo ogni create/update/delete)
     */
    async touchLocalModification() {
        const syncConfig = await this.getSyncConfig();
        if (syncConfig?.enabled) {
            await this.updateSyncConfig({
                lastLocalModification: Date.now()
            });
        }
    }
}

export const databaseService = new DatabaseService();