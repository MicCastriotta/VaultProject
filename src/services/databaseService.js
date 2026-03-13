/**
 * Database Service
 * Gestisce IndexedDB tramite Dexie.js
 * 
 * INTEGRITY: salva e recupera l'HMAC di integrità nella tabella config.
 * L'HMAC viene aggiornato ad ogni operazione di scrittura (save/delete profile).
 */

import Dexie from 'dexie';
import { HMAC_VERSION } from './cryptoService';

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

        this.version(3).stores({
            config: 'id',
            profiles: '++id, category, lastModified, *searchTerms',
            syncConfig: 'id',
            attachments: '++id, profileId'
        });

        this.version(4).stores({
            config: 'id',
            profiles: '++id, category, lastModified, *searchTerms',
            syncConfig: 'id',
            attachments: '++id, profileId',
            contacts: '++id, fingerprint'
        });

        this.config = this.table('config');
        this.profiles = this.table('profiles');
        this.syncConfig = this.table('syncConfig');
        this.attachments = this.table('attachments');
        this.contacts = this.table('contacts');
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
     * Salva l'HMAC di integrità nel DB insieme alla versione dell'algoritmo.
     * La versione permette di rilevare aggiornamenti dell'algoritmo HMAC
     * e rigenerare senza falsi positivi di tamper.
     */
    async saveHMAC(hmac) {
        await db.config.put({
            id: 'integrity',
            hmac,
            version: HMAC_VERSION,
            updatedAt: new Date().toISOString()
        });
    }

    /**
     * Recupera l'HMAC di integrità salvato.
     * Ritorna { hmac, version } — o { hmac: null, version: 0 } se non esiste.
     */
    async getHMAC() {
        const record = await db.config.get('integrity');
        if (!record) return { hmac: null, version: 0 };
        return { hmac: record.hmac, version: record.version ?? 1 };
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
     * Elimina un profilo (e il relativo allegato se presente)
     */
    async deleteProfile(id) {
        await db.profiles.delete(id);
        await this.deleteAttachmentByProfileId(id);
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
        await db.attachments.clear();
        await db.contacts.clear();
    }

    /**
     * Esporta tutto (per backup)
     * v3: aggiunge identity (keypair ECDH cifrato) e contacts
     */
    async exportData() {
        const config = await db.config.get('crypto');
        const identity = await db.config.get('identity');
        const profiles = await db.profiles.toArray();
        const attachments = await db.attachments.toArray();
        const contacts = await db.contacts.toArray();

        return {
            version: 3,
            exportDate: new Date().toISOString(),
            crypto: config,
            identity: identity || null,
            profiles,
            attachments,
            contacts
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
        if (data.version !== 1 && data.version !== 2 && data.version !== 3) {
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

        // Prima di cancellare, salva i binari già presenti localmente.
        // Chiave: profileId → { iv, encryptedData }
        // Se dopo l'import l'allegato importato ha lo stesso iv (= stesso contenuto cifrato),
        // ripristiniamo encryptedData locale invece di lasciarlo null e costringere
        // un lazy-download inutile su un device che ha già il file.
        const existingAtts = await db.attachments.toArray();
        const localBinaryMap = new Map(
            existingAtts
                .filter(a => a.encryptedData && a.iv)
                .map(a => [a.profileId, { iv: a.iv, encryptedData: a.encryptedData }])
        );

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

        // Importa identity (keypair ECDH) — presente solo nei backup v3+
        // La private key è già cifrata con la DEK: sicura da ripristinare così com'è.
        if (
            data.identity &&
            typeof data.identity.publicKey === 'string' &&
            data.identity.encryptedPrivateKey?.iv &&
            data.identity.encryptedPrivateKey?.data
        ) {
            await db.config.put({
                id: 'identity',
                publicKey: data.identity.publicKey,
                encryptedPrivateKey: data.identity.encryptedPrivateKey,
                createdAt: data.identity.createdAt || new Date().toISOString()
            });
        }

        // Importa profiles — preserva gli ID originali per le FK degli allegati
        let profilesImported = 0;
        if (data.profiles && data.profiles.length > 0) {
            const cleanProfiles = data.profiles.map(p => ({
                ...(p.id != null ? { id: p.id } : {}),
                iv: p.iv,
                data: p.data,
                category: p.category,
                version: p.version || 1,
                createdAt: p.createdAt || new Date().toISOString(),
                updatedAt: p.updatedAt || new Date().toISOString()
            }));
            await db.profiles.bulkPut(cleanProfiles);
            profilesImported = cleanProfiles.length;
        }

        // Importa allegati (validazione rigorosa, ignora voci malformate)
        // MAX_ATTACHMENT_ENCODED_SIZE: base64 di 15 MB ≈ 20 MB; aggiungiamo margine
        const MAX_ATTACHMENT_ENCODED_SIZE = 22 * 1024 * 1024; // 22 MB in chars base64
        const importedProfileIds = new Set(
            (data.profiles || []).map(p => p.id).filter(id => id != null)
        );

        let attachmentsImported = 0;
        if (data.attachments && Array.isArray(data.attachments) && data.attachments.length > 0) {
            const cleanAttachments = data.attachments
                .filter(a => {
                    if (!a || a.profileId == null) return false;
                    if (!a.iv || !base64Regex.test(a.iv)) return false;
                    // encryptedData può essere assente se l'allegato è solo su Drive (sync)
                    if (a.encryptedData != null) {
                        if (!base64Regex.test(a.encryptedData)) return false;
                        if (a.encryptedData.length > MAX_ATTACHMENT_ENCODED_SIZE) return false;
                    }
                    // Formato v2: metadati cifrati
                    const hasEncryptedMeta = a.metaIv && a.metaData
                        && base64Regex.test(a.metaIv) && base64Regex.test(a.metaData);
                    // Formato v1 legacy: metadati in chiaro (backup vecchio)
                    const hasLegacyMeta = a.fileName && a.mimeType;
                    if (!hasEncryptedMeta && !hasLegacyMeta) return false;
                    // Il profileId deve corrispondere a un profilo importato
                    if (importedProfileIds.size > 0 && !importedProfileIds.has(a.profileId)) return false;
                    return true;
                })
                .map(a => {
                    const isV2 = a.metaIv && a.metaData;
                    if (isV2) {
                        return {
                            profileId: a.profileId,
                            metaIv: a.metaIv,
                            metaData: a.metaData,
                            iv: a.iv,
                            encryptedData: a.encryptedData ?? null,
                            blobVersion: a.blobVersion ?? 2,
                            driveFileId: a.driveFileId ?? null,
                            createdAt: a.createdAt || new Date().toISOString()
                        };
                    }
                    // Formato v1 legacy: mantieni i campi in chiaro per retrocompatibilità
                    return {
                        profileId: a.profileId,
                        fileName: a.fileName,
                        mimeType: a.mimeType,
                        size: a.size || 0,
                        iv: a.iv,
                        encryptedData: a.encryptedData ?? null,
                        hash: a.hash || '',
                        blobVersion: 1,
                        driveFileId: a.driveFileId ?? null,
                        createdAt: a.createdAt || new Date().toISOString()
                    };
                });
            if (cleanAttachments.length > 0) {
                await db.attachments.bulkPut(cleanAttachments);
                attachmentsImported = cleanAttachments.length;
            }
        }

        // Ripristina encryptedData per gli allegati già presenti localmente:
        // se l'iv coincide (= stesso contenuto cifrato), il device ha già il binario
        // e non serve un lazy-download da Drive.
        if (localBinaryMap.size > 0) {
            const importedAtts = await db.attachments.toArray();
            for (const att of importedAtts) {
                if (att.encryptedData) continue; // già popolato
                const local = localBinaryMap.get(att.profileId);
                if (local && local.iv === att.iv) {
                    await db.attachments.update(att.id, { encryptedData: local.encryptedData });
                }
            }
        }

        // Importa contatti — presenti solo nei backup v3+
        let contactsImported = 0;
        if (data.contacts && Array.isArray(data.contacts) && data.contacts.length > 0) {
            const cleanContacts = data.contacts
                .filter(c => c && typeof c.name === 'string' && typeof c.publicKey === 'string' && typeof c.fingerprint === 'string')
                .map(c => ({
                    name: c.name,
                    publicKey: c.publicKey,
                    fingerprint: c.fingerprint,
                    createdAt: c.createdAt || new Date().toISOString()
                }));
            if (cleanContacts.length > 0) {
                await db.contacts.bulkPut(cleanContacts);
                contactsImported = cleanContacts.length;
            }
        }

        // Notifica i widget storage (Sidebar, MainPage) di aggiornare la stima
        window.dispatchEvent(new Event('storageChanged'));

        return {
            configImported: true,
            profilesImported,
            attachmentsImported,
            contactsImported
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
     * Aggiorna solo alcuni campi della sync config.
     * NON chiamare dopo importData (che svuota la tabella): usare saveSyncConfig direttamente.
     */
    async updateSyncConfig(updates) {
        const current = await this.getSyncConfig();
        if (!current) {
            console.warn('updateSyncConfig: nessun record sync esistente, skip');
            return;
        }
        await this.saveSyncConfig({ ...current, ...updates });
    }

    /**
     * Elimina configurazione sync
     */
    async deleteSyncConfig() {
        await db.syncConfig.delete('sync');
    }

    // ========================================
    // ATTACHMENT OPERATIONS
    // ========================================

    /**
     * Salva un allegato cifrato. Sovrascrive eventuale allegato precedente dello stesso profilo.
     *
     * Schema v2 (nessun campo in chiaro):
     *   metaIv / metaData  — metadati cifrati {fileName, mimeType, size, hash}
     *   iv / encryptedData — contenuto file cifrato (AES-GCM + AAD profileId)
     *   blobVersion        — 1 = legacy (no AAD), 2 = con AAD profileId
     */
    async saveAttachment({ profileId, metaIv, metaData, iv, encryptedData, blobVersion, driveFileId }) {
        await this.deleteAttachmentByProfileId(profileId);
        return await db.attachments.add({
            profileId,
            metaIv,
            metaData,
            iv,
            encryptedData: encryptedData ?? null,
            blobVersion: blobVersion ?? 2,
            driveFileId: driveFileId ?? null,
            createdAt: new Date().toISOString()
        });
    }

    /**
     * Aggiorna il driveFileId di un allegato dopo l'upload su Drive.
     */
    async updateAttachmentDriveId(attachmentId, driveFileId) {
        await db.attachments.update(attachmentId, { driveFileId });
    }

    /**
     * Salva l'encryptedData scaricato da Drive per un allegato già presente (metadati noti).
     * Usato per il lazy download alla prima apertura su un nuovo dispositivo.
     */
    async saveAttachmentContent(attachmentId, encryptedData) {
        await db.attachments.update(attachmentId, { encryptedData });
    }

    /**
     * Recupera i metadati cifrati dell'allegato (senza encryptedData) per la visualizzazione.
     * Il chiamante deve decifrare metaIv/metaData tramite cryptoService.decryptAttachmentMeta().
     */
    async getAttachmentMetaByProfileId(profileId) {
        const att = await db.attachments.where('profileId').equals(profileId).first();
        if (!att) return null;
        return {
            id: att.id,
            profileId: att.profileId,
            metaIv: att.metaIv,
            metaData: att.metaData,
            blobVersion: att.blobVersion ?? 1,
            driveFileId: att.driveFileId ?? null,
            hasLocalContent: !!att.encryptedData,
            // Retrocompatibilità: allegati salvati prima della v2 hanno ancora i campi in chiaro
            _legacyFileName: att.fileName,
            _legacyMimeType: att.mimeType,
            _legacySize: att.size
        };
    }

    /**
     * Recupera l'allegato completo (incluso encryptedData) per l'apertura.
     */
    async getAttachmentById(id) {
        return await db.attachments.get(id);
    }

    /**
     * Recupera tutti gli allegati (senza encryptedData) per il calcolo HMAC.
     */
    async getAllAttachments() {
        const all = await db.attachments.toArray();
        return all.map(a => ({
            id: a.id,
            profileId: a.profileId,
            iv: a.iv,
            metaIv: a.metaIv || null,
            metaData: a.metaData || null,
            blobVersion: a.blobVersion ?? 1,
            driveFileId: a.driveFileId ?? null,
            hasLocalContent: !!a.encryptedData
        }));
    }

    /**
     * Elimina allegato per ID.
     */
    async deleteAttachment(id) {
        await db.attachments.delete(id);
    }

    /**
     * Elimina allegato per profileId (cascata delete profilo).
     */
    async deleteAttachmentByProfileId(profileId) {
        await db.attachments.where('profileId').equals(profileId).delete();
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