/**
 * Sync Service
 * Gestisce sincronizzazione automatica con Google Drive
 */

import { googleDriveService } from './googledriveService';
import { databaseService } from './databaseService';

const SYNC_FILE_NAME = 'ownvault-sync.json';
const SYNC_DEBOUNCE_MS = 2000; // Aspetta 2s dopo ultima modifica

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
     * Abilita sync e fa primo upload
     */
    async enableSync() {
        try {
            // 1. Login con Google
            const userInfo = await googleDriveService.signIn();

            // 2. Cerca file esistente
            let file = await googleDriveService.findFile(SYNC_FILE_NAME);

            // 3. Export dati locali
            const localData = await databaseService.exportData();

            const now = Date.now();

            // 4. Prepara payload sync
            const syncData = {
                version: 2,
                lastModified: new Date().toISOString(),
                deviceId: this.deviceId,
                deviceName: this.deviceName,
                syncTimestamp: now,
                ...localData
            };

            let fileId;
            let cryptoChanged = false;

            if (file) {
                // File esiste già → confronta contenuto (non timestamp: syncData è appena creato)
                const cloudData = await googleDriveService.downloadFile(file.id);

                const hasLocalProfiles = localData.profiles.length > 0;
                const hasCloudProfiles = (cloudData.profiles?.length || 0) > 0;

                if (!hasLocalProfiles) {
                    // Locale vuoto → scarica cloud senza chiedere
                    await databaseService.importData(cloudData);
                    fileId = file.id;
                    cryptoChanged = true; // importData ha sostituito la cryptoConfig: serve re-login
                    this.notifyListeners('synced', { direction: 'download', conflict: false });
                } else if (!hasCloudProfiles) {
                    // Cloud vuoto → upload locale senza chiedere
                    await googleDriveService.updateFile(file.id, syncData);
                    fileId = file.id;
                } else {
                    // Entrambi hanno dati → chiedi all'utente
                    const shouldImport = await this.askConflictResolution(cloudData, localData);
                    if (shouldImport) {
                        await databaseService.importData(cloudData);
                        fileId = file.id;
                        cryptoChanged = true; // importData ha sostituito la cryptoConfig: serve re-login
                    } else {
                        await googleDriveService.updateFile(file.id, syncData);
                        fileId = file.id;
                    }
                }
            } else {
                // Nessun file esistente → crea nuovo
                file = await googleDriveService.createFile(SYNC_FILE_NAME, syncData);
                fileId = file.id;
            }

            // 5. Salva flag localStorage (persiste anche se IndexedDB viene svuotato)
            localStorage.setItem('ownvault_sync_enabled_flag', 'true');

            // 6. Salva config sync
            await databaseService.saveSyncConfig({
                enabled: true,
                googleDriveFileId: fileId,
                lastSyncTimestamp: now,
                lastLocalModification: now,
                deviceId: this.deviceId,
                deviceName: this.deviceName,
                conflictStrategy: 'ask' // 'ask', 'local-wins', 'cloud-wins'
            });

            // 6. Notifica listeners
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
            // 1. Export dati locali
            const localData = await databaseService.exportData();
            const localTimestamp = syncConfig.lastLocalModification || Date.now();
            // Correggi exportDate: usa lastLocalModification, non l'ora corrente
            localData.exportDate = new Date(localTimestamp).toISOString();

            // 2. Download da cloud
            const cloudData = await googleDriveService.downloadFile(
                syncConfig.googleDriveFileId
            );
            const cloudTimestamp = cloudData.syncTimestamp || 0;

            // 3. Compare timestamps
            if (localTimestamp > cloudTimestamp) {
                // LOCAL PIÙ RECENTE → Upload
                const syncData = {
                    version: 2,
                    lastModified: new Date().toISOString(),
                    deviceId: this.deviceId,
                    deviceName: this.deviceName,
                    syncTimestamp: Date.now(),
                    ...localData
                };

                await googleDriveService.updateFile(
                    syncConfig.googleDriveFileId,
                    syncData
                );

                // Aggiorna lastSyncTimestamp
                await databaseService.updateSyncConfig({
                    lastSyncTimestamp: Date.now()
                });

                this.notifyListeners('synced', { direction: 'upload' });

            } else if (cloudTimestamp > localTimestamp) {
                // CLOUD PIÙ RECENTE → Conflict!
                const strategy = syncConfig.conflictStrategy || 'ask';

                let shouldImport = false;

                if (strategy === 'ask') {
                    shouldImport = await this.askConflictResolution(cloudData, localData);
                } else if (strategy === 'cloud-wins') {
                    shouldImport = true;
                } else if (strategy === 'local-wins') {
                    shouldImport = false;
                }

                if (shouldImport) {
                    // Importa da cloud
                    await databaseService.importData(cloudData);

                    // importData svuota la tabella syncConfig: re-salva il config completo con i nuovi timestamp
                    await databaseService.saveSyncConfig({
                        ...syncConfig,
                        lastSyncTimestamp: cloudTimestamp,
                        lastLocalModification: cloudTimestamp
                    });

                    this.notifyListeners('synced', { direction: 'download', conflict: true });
                } else {
                    // Mantieni locale e sovrascrivi cloud
                    const syncData = {
                        version: 2,
                        lastModified: new Date().toISOString(),
                        deviceId: this.deviceId,
                        deviceName: this.deviceName,
                        syncTimestamp: Date.now(),
                        ...localData
                    };

                    await googleDriveService.updateFile(
                        syncConfig.googleDriveFileId,
                        syncData
                    );

                    await databaseService.updateSyncConfig({
                        lastSyncTimestamp: Date.now()
                    });

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
            const localData = await databaseService.exportData();
            // Correggi exportDate: usa lastLocalModification, non l'ora corrente
            localData.exportDate = localTimestamp
                ? new Date(localTimestamp).toISOString()
                : localData.exportDate;

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
                // Mantieni locale → re-upload per allineare il cloud
                const syncData = {
                    version: 2,
                    lastModified: new Date().toISOString(),
                    deviceId: this.deviceId,
                    deviceName: this.deviceName,
                    syncTimestamp: Date.now(),
                    ...localData
                };
                await googleDriveService.updateFile(syncConfig.googleDriveFileId, syncData);
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