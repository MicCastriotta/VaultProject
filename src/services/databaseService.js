/**
 * Database Service
 * Gestisce IndexedDB tramite Dexie.js
 * 
 * INTEGRITY: salva e recupera l'HMAC di integrità nella tabella config.
 * L'HMAC viene aggiornato ad ogni operazione di scrittura (save/delete profile).
 */

import Dexie from 'dexie';

class SafeProfilesDB extends Dexie {
    constructor() {
        super('SafeProfilesDB');

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

export const db = new SafeProfilesDB();

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
     */
    async importData(data) {
        // Verifica versione
        if (data.version !== 1) {
            throw new Error('Unsupported backup version');
        }

        // Pulisci DB
        await this.deleteAllData();

        // Importa config
        if (data.crypto) {
            await db.config.put(data.crypto);
        }

        // Importa profiles
        if (data.profiles && data.profiles.length > 0) {
            await db.profiles.bulkAdd(data.profiles);
        }

        return {
            configImported: !!data.crypto,
            profilesImported: data.profiles?.length || 0
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
     * Recupera configurazione sync
     */
    async getSyncConfig() {
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