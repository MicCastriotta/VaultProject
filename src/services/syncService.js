/**
 * Sync Service
 * Gestisce sincronizzazione automatica con Google Drive
 */

import { googleDriveService } from './googledriveService';
import { databaseService } from './databaseService';
import { cryptoService } from './cryptoService';

const SYNC_FILE_NAME = 'ownvault-sync.json';
const SYNC_DEBOUNCE_MS = 2000; // Aspetta 2s dopo ultima modifica

/**
 * Trasforma gli allegati per il payload JSON del sync:
 * rimuove encryptedData (contenuto binario, fino a 15 MB) e lascia solo
 * il riferimento driveFileId. Il contenuto viaggia in file Drive separati.
 * Gli allegati senza driveFileId (non ancora caricati) vengono saltati.
 */
function buildAttachmentSyncRefs(attachments) {
    return attachments
        .filter(a => a.driveFileId) // includi solo quelli già su Drive
        .map(({ profileId, metaIv, metaData, iv, blobVersion, driveFileId,
                 fileName, mimeType, size, hash }) => ({
            profileId,
            metaIv: metaIv ?? null,
            metaData: metaData ?? null,
            iv,
            blobVersion: blobVersion ?? 2,
            driveFileId,
            // Campi legacy v1 se presenti
            ...(fileName != null ? { fileName, mimeType, size, hash } : {})
        }));
}

class SyncService {
    constructor() {
        this.syncTimer = null;
        this.isSyncing = false;
        this.syncListeners = [];
        this.deviceId = this.getOrCreateDeviceId();
        this.deviceName = this.getDeviceName();
    }

    /**
     * Genera o recupera Device ID univoco
     */
    getOrCreateDeviceId() {
        let deviceId = localStorage.getItem('ownvault_device_id');
        if (!deviceId) {
            deviceId = 'device_' + Math.random().toString(36).substr(2, 9) + Date.now();
            localStorage.setItem('ownvault_device_id', deviceId);
        }
        return deviceId;
    }

    /**
     * Ottieni nome device human-readable
     */
    getDeviceName() {
        const ua = navigator.userAgent;

        // iOS
        if (/iPhone/.test(ua)) return 'iPhone';
        if (/iPad/.test(ua)) return 'iPad';

        // Android
        if (/Android/.test(ua)) {
            const match = ua.match(/Android.*; ([^)]+)\)/);
            return match ? match[1] : 'Android Device';
        }

        // Desktop
        if (/Mac/.test(ua)) return 'Mac';
        if (/Windows/.test(ua)) return 'Windows PC';
        if (/Linux/.test(ua)) return 'Linux PC';

        return 'Unknown Device';
    }

    /**
     * Carica su Drive i file binari degli allegati che non hanno ancora un driveFileId.
     * Aggiorna IndexedDB con il driveFileId ottenuto.
     * Chiamato dopo ogni sync riuscito e dopo enableSync.
     *
     * Elimina anche i file Drive orfani (non più referenziati da nessun allegato locale).
     */
    async syncAttachmentFiles() {
        const allAttachments = await databaseService.getAllAttachments();

        // Upload allegati nuovi/senza driveFileId
        for (const att of allAttachments) {
            if (att.driveFileId) continue; // già su Drive
            if (!att.hasLocalContent) continue; // niente da caricare

            try {
                const full = await databaseService.getAttachmentById(att.id);
                if (!full?.encryptedData) continue;

                const driveFileId = await googleDriveService.uploadAttachmentBinary(null, full.encryptedData);
                await databaseService.updateAttachmentDriveId(att.id, driveFileId);
                att.driveFileId = driveFileId; // aggiorna riferimento locale per il cleanup
            } catch (err) {
                console.error(`Attachment upload failed for id=${att.id}:`, err);
                // Non blocca il sync: l'allegato sarà ricaricato al prossimo tentativo
            }
        }

        // Cleanup: elimina file Drive orfani (allegati cancellati localmente)
        try {
            const activeDriveIds = new Set(
                allAttachments.map(a => a.driveFileId).filter(Boolean)
            );
            const driveFiles = await googleDriveService.listAttachmentFiles();
            for (const f of driveFiles) {
                if (!activeDriveIds.has(f.id)) {
                    await googleDriveService.deleteFile(f.id).catch(() => {});
                }
            }
        } catch (err) {
            console.error('Attachment cleanup error:', err);
        }
    }

    /**
     * Garantisce che il contenuto binario di un allegato sia disponibile localmente.
     * Se encryptedData è null (allegato scaricato solo come riferimento dal sync),
     * lo scarica da Drive e lo salva in IndexedDB.
     * Ritorna il record completo con encryptedData.
     */
    async ensureAttachmentLocal(attachmentRecord) {
        if (attachmentRecord.encryptedData) return attachmentRecord;
        if (!attachmentRecord.driveFileId) {
            throw new Error('Attachment content not available locally and no Drive reference found');
        }

        const encryptedData = await googleDriveService.downloadAttachmentBinary(attachmentRecord.driveFileId);
        await databaseService.saveAttachmentContent(attachmentRecord.id, encryptedData);
        return { ...attachmentRecord, encryptedData };
    }

    /**
     * Costruisce syncData pronto per l'upload (dopo syncAttachmentFiles).
     */
    async _buildSyncPayload(now) {
        const rawLocalData = await databaseService.exportData();
        const localData = {
            ...rawLocalData,
            attachments: buildAttachmentSyncRefs(await databaseService.getAllAttachments())
        };
        return {
            version: 2,
            lastModified: new Date().toISOString(),
            deviceId: this.deviceId,
            deviceName: this.deviceName,
            syncTimestamp: now,
            ...localData
        };
    }

    /**
     * Abilita sync e fa primo upload.
     * IMPORTANTE: syncAttachmentFiles() (che include il cleanup dei file orfani su Drive)
     * viene chiamato SOLO nei rami in cui si carica locale → cloud.
     * Nei rami in cui si scarica cloud → locale non va toccato nulla su Drive.
     */
    async enableSync() {
        try {
            // 1. Login con Google (Authorization Code flow)
            const userInfo = await googleDriveService.signIn();

            // Salva il refresh token cifrato con la DEK (vault già sbloccato qui)
            if (userInfo.refreshToken) {
                try {
                    const encrypted = await cryptoService.encryptData(userInfo.refreshToken);
                    await databaseService.saveGoogleRefreshToken(encrypted);
                } catch (err) {
                    console.warn('Failed to save Google refresh token:', err);
                }
            }

            // 2. Cerca file esistente
            let file = await googleDriveService.findFile(SYNC_FILE_NAME);

            const now = Date.now();
            let fileId;
            let cryptoChanged = false;

            if (file) {
                // File esiste già → leggi cloud e decidi direzione
                const cloudData = await googleDriveService.downloadFile(file.id);
                const rawLocalData = await databaseService.exportData();
                const hasLocalProfiles = rawLocalData.profiles.length > 0;
                const hasCloudProfiles = (cloudData.profiles?.length || 0) > 0;

                if (!hasLocalProfiles) {
                    // Locale vuoto → importa cloud (NON chiamare syncAttachmentFiles:
                    // i file Drive sono del cloud e non devono essere toccati)
                    await databaseService.importData(cloudData);
                    fileId = file.id;
                    cryptoChanged = true;
                    this.notifyListeners('synced', { direction: 'download', conflict: false });

                } else if (!hasCloudProfiles) {
                    // Cloud vuoto → upload locale
                    await this.syncAttachmentFiles();
                    const syncData = await this._buildSyncPayload(now);
                    await googleDriveService.updateFile(file.id, syncData);
                    fileId = file.id;

                } else {
                    // Entrambi hanno dati → chiedi all'utente
                    const shouldImport = await this.askConflictResolution(cloudData, rawLocalData);
                    if (shouldImport) {
                        // Importa cloud → NON chiamare syncAttachmentFiles
                        await databaseService.importData(cloudData);
                        fileId = file.id;
                        cryptoChanged = true;
                    } else {
                        // Mantieni locale → upload
                        await this.syncAttachmentFiles();
                        const syncData = await this._buildSyncPayload(now);
                        await googleDriveService.updateFile(file.id, syncData);
                        fileId = file.id;
                    }
                }
            } else {
                // Nessun file esistente → crea nuovo con dati locali
                await this.syncAttachmentFiles();
                const syncData = await this._buildSyncPayload(now);
                file = await googleDriveService.createFile(SYNC_FILE_NAME, syncData);
                fileId = file.id;
            }

            // Salva flag localStorage (persiste anche se IndexedDB viene svuotato)
            localStorage.setItem('ownvault_sync_enabled_flag', 'true');

            // Salva config sync
            await databaseService.saveSyncConfig({
                enabled: true,
                googleDriveFileId: fileId,
                lastSyncTimestamp: now,
                lastLocalModification: now,
                deviceId: this.deviceId,
                deviceName: this.deviceName,
                conflictStrategy: 'ask'
            });

            this.notifyListeners('enabled');

            return { success: true, userInfo, cryptoChanged };
        } catch (error) {
            console.error('Error enabling sync:', error);
            throw error;
        }
    }

    /**
     * Disabilita sync
     */
    async disableSync() {
        try {
            // Logout da Google
            googleDriveService.signOut();

            // Disabilita config
            await databaseService.saveSyncConfig({
                enabled: false
            });

            // Rimuovi flag localStorage
            localStorage.removeItem('ownvault_sync_enabled_flag');

            // Notifica listeners
            this.notifyListeners('disabled');

            return { success: true };
        } catch (error) {
            console.error('Error disabling sync:', error);
            throw error;
        }
    }

    /**
     * Trigger sync dopo modifica locale
     */
    async triggerSync() {
        // Debounce: aspetta che l'utente finisca di modificare
        if (this.syncTimer) {
            clearTimeout(this.syncTimer);
        }

        this.syncTimer = setTimeout(async () => {
            await this.sync();
        }, SYNC_DEBOUNCE_MS);
    }

    /**
     * Esegui sincronizzazione
     */
    async sync() {
        // Verifica precondizioni
        const syncConfig = await databaseService.getSyncConfig();

        if (!syncConfig?.enabled) {
            return; // Sync disabilitato
        }

        if (!googleDriveService.isOnline()) {
            console.log('Offline - sync queued');
            return; // Offline, riprova dopo
        }

        if (this.isSyncing) {
            return; // Sync già in corso
        }

        this.isSyncing = true;
        this.notifyListeners('syncing');

        try {
            // 1. Upload allegati nuovi su Drive (ottieni driveFileId) + cleanup orfani
            await this.syncAttachmentFiles();

            // 2. Costruisci payload locale: allegati senza encryptedData inline
            const rawLocalData = await databaseService.exportData();
            const localTimestamp = syncConfig.lastLocalModification || Date.now();
            const localData = {
                ...rawLocalData,
                exportDate: new Date(localTimestamp).toISOString(),
                attachments: buildAttachmentSyncRefs(await databaseService.getAllAttachments())
            };

            // 3. Download da cloud
            const cloudData = await googleDriveService.downloadFile(
                syncConfig.googleDriveFileId
            );
            const cloudTimestamp = cloudData.syncTimestamp || 0;

            // 4. Compare timestamps
            if (localTimestamp > cloudTimestamp) {
                // LOCAL PIÙ RECENTE → Upload JSON (allegati già su Drive)
                await googleDriveService.updateFile(
                    syncConfig.googleDriveFileId,
                    { version: 2, lastModified: new Date().toISOString(),
                      deviceId: this.deviceId, deviceName: this.deviceName,
                      syncTimestamp: Date.now(), ...localData }
                );
                await databaseService.updateSyncConfig({ lastSyncTimestamp: Date.now() });
                this.notifyListeners('synced', { direction: 'upload' });

            } else if (cloudTimestamp > localTimestamp) {
                // CLOUD PIÙ RECENTE → Conflict
                const strategy = syncConfig.conflictStrategy || 'ask';
                let shouldImport = strategy === 'cloud-wins'
                    ? true
                    : strategy === 'local-wins'
                        ? false
                        : await this.askConflictResolution(cloudData, localData);

                if (shouldImport) {
                    await databaseService.importData(cloudData);
                    await databaseService.saveSyncConfig({
                        ...syncConfig,
                        lastSyncTimestamp: cloudTimestamp,
                        lastLocalModification: cloudTimestamp
                    });
                    this.notifyListeners('synced', { direction: 'download', conflict: true });
                } else {
                    await googleDriveService.updateFile(
                        syncConfig.googleDriveFileId,
                        { version: 2, lastModified: new Date().toISOString(),
                          deviceId: this.deviceId, deviceName: this.deviceName,
                          syncTimestamp: Date.now(), ...localData }
                    );
                    await databaseService.updateSyncConfig({ lastSyncTimestamp: Date.now() });
                    this.notifyListeners('synced', { direction: 'upload', conflict: true });
                }

            } else {
                // STESSO TIMESTAMP → Già sincronizzato
                this.notifyListeners('synced', { direction: 'none' });
            }

        } catch (error) {
            console.error('Sync error:', error);
            this.notifyListeners('error', { error: error.message });
            throw error;
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Chiedi all'utente come risolvere il conflitto
     */
    async askConflictResolution(cloudData, localData) {
        return new Promise((resolve) => {
            // Emetti evento per mostrare dialog
            this.notifyListeners('conflict', {
                cloudData,
                localData,
                resolve
            });
        });
    }

    /**
     * Check sync all'avvio dell'app (dopo login).
     * Se il cloud è più recente del dispositivo, chiede all'utente
     * quale versione mantenere e agisce di conseguenza.
     */
    async checkSyncOnLaunch() {
        const syncConfig = await databaseService.getSyncConfig();

        if (!syncConfig?.enabled) return;
        if (!googleDriveService.isOnline()) {
            // Offline ma sync configurato: notifica comunque che è abilitato
            this.notifyListeners('enabled');
            return;
        }

        try {
            const cloudData = await googleDriveService.downloadFile(
                syncConfig.googleDriveFileId
            );

            const localTimestamp = syncConfig.lastLocalModification || 0;
            const cloudTimestamp = cloudData.syncTimestamp || 0;

            // Nessuna differenza → già sincronizzato, notifica stato attivo
            if (cloudTimestamp <= localTimestamp) {
                this.notifyListeners('enabled');
                return;
            }

            // Cloud più recente → confronta contenuto
            const rawLocalData = await databaseService.exportData();
            const localData = {
                ...rawLocalData,
                exportDate: localTimestamp ? new Date(localTimestamp).toISOString() : rawLocalData.exportDate,
                attachments: buildAttachmentSyncRefs(await databaseService.getAllAttachments())
            };

            const hasLocalProfiles = (localData.profiles?.length || 0) > 0;
            const hasCloudProfiles = (cloudData.profiles?.length || 0) > 0;

            if (!hasLocalProfiles && hasCloudProfiles) {
                // Locale vuoto → auto-import senza chiedere
                await databaseService.importData(cloudData);
                // importData svuota la tabella syncConfig: re-salva il config completo con i nuovi timestamp
                await databaseService.saveSyncConfig({
                    ...syncConfig,
                    lastSyncTimestamp: cloudTimestamp,
                    lastLocalModification: cloudTimestamp
                });
                this.notifyListeners('synced', { direction: 'download', conflict: false });
                return;
            }

            // Entrambi hanno dati → chiedi all'utente
            const shouldImport = await this.askConflictResolution(cloudData, localData);

            if (shouldImport) {
                await databaseService.importData(cloudData);
                // importData svuota la tabella syncConfig: re-salva il config completo con i nuovi timestamp
                await databaseService.saveSyncConfig({
                    ...syncConfig,
                    lastSyncTimestamp: cloudTimestamp,
                    lastLocalModification: cloudTimestamp
                });
                this.notifyListeners('synced', { direction: 'download', conflict: true });
            } else {
                // Mantieni locale → upload allegati + re-upload JSON
                await this.syncAttachmentFiles();
                const freshRefs = buildAttachmentSyncRefs(await databaseService.getAllAttachments());
                await googleDriveService.updateFile(syncConfig.googleDriveFileId, {
                    version: 2, lastModified: new Date().toISOString(),
                    deviceId: this.deviceId, deviceName: this.deviceName,
                    syncTimestamp: Date.now(), ...localData, attachments: freshRefs
                });
                await databaseService.updateSyncConfig({ lastSyncTimestamp: Date.now() });
                this.notifyListeners('synced', { direction: 'upload', conflict: true });
            }
        } catch (error) {
            console.error('Error checking sync on launch:', error);
            // Se l'errore è di autenticazione (token scaduto/revocato), notifica l'utente
            const msg = error?.message || '';
            if (msg.includes('Not signed in') || msg.includes('auth') || error?.error === 'access_denied') {
                this.notifyListeners('reauth_needed');
            }
        }
    }

    /**
     * Listener per modifiche (online/offline)
     */
    setupNetworkListeners() {
        window.addEventListener('online', async () => {
            console.log('Network online - checking sync');
            const syncConfig = await databaseService.getSyncConfig();

            if (syncConfig?.enabled) {
                // Verifica se ci sono modifiche pending
                if (syncConfig.lastLocalModification > syncConfig.lastSyncTimestamp) {
                    await this.sync();
                }
            }
        });

        window.addEventListener('offline', () => {
            console.log('Network offline - sync paused');
        });
    }

    /**
     * Aggiungi listener per eventi sync
     */
    addListener(callback) {
        this.syncListeners.push(callback);
    }

    /**
     * Rimuovi listener
     */
    removeListener(callback) {
        this.syncListeners = this.syncListeners.filter(l => l !== callback);
    }

    /**
     * Notifica tutti i listeners
     */
    notifyListeners(event, data = {}) {
        this.syncListeners.forEach(listener => {
            try {
                listener(event, data);
            } catch (error) {
                console.error('Error in sync listener:', error);
            }
        });
    }

    /**
     * Ottieni stato sync corrente
     */
    async getSyncStatus() {
        const syncConfig = await databaseService.getSyncConfig();

        if (!syncConfig?.enabled) {
            return {
                enabled: false,
                status: 'disabled',
                wasEnabled: localStorage.getItem('ownvault_sync_enabled_flag') === 'true'
            };
        }

        const isOnline = googleDriveService.isOnline();
        const lastSync = syncConfig.lastSyncTimestamp || 0;
        const lastLocal = syncConfig.lastLocalModification || 0;
        const needsSync = lastLocal > lastSync;

        // Controlla se il refresh token è disponibile (assente per utenti migrati dal vecchio flow implicito)
        const hasCachedToken = !!googleDriveService.loadCachedToken();
        const hasRefreshToken = !!(await databaseService.getGoogleRefreshToken());
        const needsReauth = !hasCachedToken && !hasRefreshToken;

        let status = 'synced';
        if (this.isSyncing) {
            status = 'syncing';
        } else if (!isOnline) {
            status = 'offline';
        } else if (needsSync) {
            status = 'pending';
        }

        return {
            enabled: true,
            needsReauth,
            status,
            lastSyncTimestamp: lastSync,
            lastLocalModification: lastLocal,
            userEmail: syncConfig.userEmail,
            userName: syncConfig.userName,
            deviceId: this.deviceId,
            deviceName: this.deviceName,
            isOnline
        };
    }
}

export const syncService = new SyncService();