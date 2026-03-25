/**
 * Google Drive Service
 * Gestisce autenticazione OAuth2 e operazioni su Google Drive
 */

import { cryptoService } from './cryptoService';
import { databaseService } from './databaseService';

// IMPORTANTE: Sostituisci con il tuo CLIENT_ID da Google Cloud Console
// https://console.cloud.google.com/apis/credentials
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];
const DRIVE_FOLDER_NAME = 'OwnVault';

class GoogleDriveService {
    constructor() {
        this.isSignedIn = false;
        this.accessToken = null;
        this.gapiLoaded = false;
        this.gisLoaded = false;
        this.codeClient = null;
        this._initPromise = null;      // Guard contro chiamate concorrenti a init()
        this.folderId = null;          // Cache ID cartella OwnVault
        this._pendingCodeCallback = null; // Callback per il flusso authorization code
    }

    /** Salva il token in localStorage con timestamp di scadenza */
    cacheToken(accessToken, expiresIn) {
        const expiresAt = Date.now() + ((expiresIn - 60) * 1000); // 1 min di margine
        localStorage.setItem('ownvault_google_token', accessToken);
        localStorage.setItem('ownvault_google_token_expires', String(expiresAt));
    }

    /** Restituisce il token in cache se ancora valido, null altrimenti */
    loadCachedToken() {
        const token = localStorage.getItem('ownvault_google_token');
        const expires = parseInt(localStorage.getItem('ownvault_google_token_expires') || '0', 10);
        if (token && Date.now() < expires) {
            return token;
        }
        localStorage.removeItem('ownvault_google_token');
        localStorage.removeItem('ownvault_google_token_expires');
        return null;
    }

    /** Rimuove il token dalla cache */
    clearCachedToken() {
        localStorage.removeItem('ownvault_google_token');
        localStorage.removeItem('ownvault_google_token_expires');
    }

    /**
     * Trova o crea la cartella "OwnVault" su Drive.
     * Il risultato è cachato in this.folderId per la sessione corrente.
     * I file già esistenti in root (versioni precedenti) vengono trovati
     * dalla ricerca normale: questa cartella è usata solo per i nuovi file.
     */
    async ensureFolder() {
        if (this.folderId) return this.folderId;
        await this.ensureSignedIn();

        // Cerca cartella esistente
        const resp = await this.withGapiRefresh(() => window.gapi.client.drive.files.list({
            q: `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id)',
            spaces: 'drive'
        }));
        const files = resp.result.files;
        if (files.length > 0) {
            this.folderId = files[0].id;
            return this.folderId;
        }

        // Crea cartella
        const createResp = await this.fetchWithAuth('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: DRIVE_FOLDER_NAME,
                mimeType: 'application/vnd.google-apps.folder'
            })
        });
        if (!createResp.ok) throw new Error('Failed to create OwnVault folder on Drive');
        const folder = await createResp.json();
        this.folderId = folder.id;
        return this.folderId;
    }

    /**
     * Inizializza Google API.
     * Tutte le chiamate concorrenti condividono la stessa Promise (evita race condition
     * dove il secondo chiamante trova il <script> già in DOM ma window.gapi ancora undefined).
     */
    async init() {
        if (this.gapiLoaded && this.gisLoaded) return;

        // Se c'è già un init in corso, aspetta quello invece di avviarne un altro
        if (this._initPromise) return this._initPromise;

        this._initPromise = this._doInit().finally(() => {
            this._initPromise = null;
        });

        return this._initPromise;
    }

    async _doInit() {
        try {
            // Carica GAPI (Google API)
            await this.loadScript('https://apis.google.com/js/api.js');

            // loadScript può risolvere subito se il <script> esiste già in DOM,
            // ma window.gapi potrebbe non essere ancora pronto: attendiamo esplicitamente.
            if (!window.gapi) {
                await new Promise((resolve, reject) => {
                    const deadline = Date.now() + 10_000;
                    const check = setInterval(() => {
                        if (window.gapi) { clearInterval(check); resolve(); }
                        else if (Date.now() > deadline) { clearInterval(check); reject(new Error('GAPI load timeout')); }
                    }, 50);
                });
            }

            await new Promise((resolve) => {
                window.gapi.load('client', resolve);
            });

            await window.gapi.client.init({
                apiKey: GOOGLE_API_KEY,
                discoveryDocs: DISCOVERY_DOCS,
            });

            this.gapiLoaded = true;

            // Carica GIS (Google Identity Services)
            await this.loadScript('https://accounts.google.com/gsi/client');

            // loadScript può risolvere subito se il tag <script> esiste già in DOM,
            // ma window.google potrebbe non essere ancora pronto: attendiamo esplicitamente.
            if (!window.google) {
                await new Promise((resolve, reject) => {
                    const deadline = Date.now() + 10_000;
                    const check = setInterval(() => {
                        if (window.google) { clearInterval(check); resolve(); }
                        else if (Date.now() > deadline) { clearInterval(check); reject(new Error('GIS load timeout')); }
                    }, 50);
                });
            }

            // Authorization Code flow: il popup restituisce un code (non un token),
            // che viene scambiato server-side tramite /api/gtoken per ottenere
            // access_token + refresh_token. Il refresh token non scade e consente
            // rinnovi silenziosi senza popup.
            // redirect_uri deve essere registrato in Google Cloud Console.
            this.codeClient = window.google.accounts.oauth2.initCodeClient({
                client_id:    GOOGLE_CLIENT_ID,
                scope:        SCOPES,
                ux_mode:      'popup',
                redirect_uri: window.location.origin,
                callback: (response) => {
                    if (this._pendingCodeCallback) {
                        this._pendingCodeCallback(response);
                        this._pendingCodeCallback = null;
                    }
                },
            });

            this.gisLoaded = true;

            console.log('Google Drive Service initialized');
        } catch (error) {
            console.error('Failed to initialize Google Drive Service:', error);
            throw error;
        }
    }

    /**
     * Carica uno script esterno
     */
    loadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.defer = true;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    /**
     * Login con Google (richiede popup)
     */
    /**
     * Scambia un authorization code con access + refresh token
     * tramite la Cloudflare Function /api/gtoken.
     * @returns {{ access_token, refresh_token, expires_in }}
     */
    async _exchangeCodeForTokens(code) {
        const resp = await fetch('/api/gtoken', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ code, redirect_uri: window.location.origin }),
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(`Token exchange failed: ${err.error || resp.status}`);
        }
        return resp.json();
    }

    /**
     * Ottieni un nuovo access token usando il refresh token.
     * Chiamata server-side tramite /api/gtoken — nessun popup.
     * @returns {{ access_token, expires_in }}
     */
    async _refreshAccessToken(refreshToken) {
        const resp = await fetch('/api/gtoken', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(`Token refresh failed: ${err.error || resp.status}`);
        }
        return resp.json();
    }

    /**
     * Login con Google tramite popup (Authorization Code flow).
     * Deve essere chiamato in un contesto user-gesture (click).
     *
     * Ritorna { accessToken, refreshToken } — il chiamante è responsabile
     * di salvare il refreshToken nel modo corretto:
     *   - vault già sbloccato → cifrare con DEK e salvare in IndexedDB
     *   - onboarding (vault non ancora sbloccato) → sessionStorage temporaneo
     */
    async signIn() {
        // init() deve essere già completata (pre-caricata al mount della pagina)
        // in modo che requestCode() venga chiamata nel user-gesture context.
        await this.init();

        return new Promise((resolve, reject) => {
            // Timeout di sicurezza per popup bloccati (es. iOS standalone)
            const timeout = setTimeout(() => {
                this._pendingCodeCallback = null;
                reject(new Error('Google Sign-In timeout: il popup non ha risposto. Riprova dal browser (non dalla PWA installata) oppure usa un dispositivo desktop.'));
            }, 120_000);

            this._pendingCodeCallback = async (response) => {
                clearTimeout(timeout);

                if (response.error) {
                    reject(new Error(response.error));
                    return;
                }

                try {
                    const tokens = await this._exchangeCodeForTokens(response.code);

                    this.accessToken = tokens.access_token;
                    this.isSignedIn  = true;
                    this.cacheToken(tokens.access_token, tokens.expires_in || 3600);
                    window.gapi.client.setToken({ access_token: tokens.access_token });

                    resolve({
                        accessToken:  tokens.access_token,
                        refreshToken: tokens.refresh_token ?? null,
                    });
                } catch (err) {
                    reject(err);
                }
            };

            this.codeClient.requestCode();
        });
    }

    /**
     * Logout: revoca il token in memoria e cancella il refresh token da IndexedDB.
     */
    signOut() {
        if (this.accessToken) {
            window.google.accounts.oauth2.revoke(this.accessToken, () => {});
        }

        this.accessToken = null;
        this.isSignedIn  = false;
        this.folderId    = null;
        this.clearCachedToken();
        // Rimuovi il refresh token persistente — l'utente dovrà riconnettersi
        databaseService.deleteGoogleRefreshToken().catch(() => {});
    }

    /**
     * Ripristina la sessione Drive senza popup.
     * 1. Prova il token in cache (non scaduto).
     * 2. Prova il refresh token cifrato in IndexedDB (vault deve essere sbloccato).
     * 3. Se nessuno dei due è disponibile → lancia errore: l'utente deve riconnettersi.
     *
     * Non apre mai popup: questa funzione è chiamata da contesti background
     * (sync automatico) dove window.open() è bloccato dalle PWA.
     */
    async restoreSession() {
        await this.init();

        // ── 1. Token in cache ancora valido ──────────────────────────────────
        const cached = this.loadCachedToken();
        if (cached) {
            this.accessToken = cached;
            this.isSignedIn  = true;
            window.gapi.client.setToken({ access_token: cached });
            return true;
        }

        // ── 2. Rinnova silenziosamente tramite refresh token in IndexedDB ────
        try {
            const encryptedToken = await databaseService.getGoogleRefreshToken();
            if (encryptedToken) {
                // decryptData lancia se il vault è bloccato → catturato sotto
                const refreshToken = await cryptoService.decryptData(encryptedToken);
                const result = await this._refreshAccessToken(refreshToken);

                this.accessToken = result.access_token;
                this.isSignedIn  = true;
                this.cacheToken(result.access_token, result.expires_in || 3600);
                window.gapi.client.setToken({ access_token: result.access_token });
                return true;
            }
        } catch {
            // Vault bloccato, refresh token revocato o non presente: fall-through
        }

        // ── 3. Nessuna credenziale disponibile ───────────────────────────────
        throw new Error('Not signed in to Google Drive: no_cached_token');
    }

    
    /**
     * Cerca file per nome
     */
    async findFile(fileName) {
        await this.ensureSignedIn();

        try {
            const response = await this.withGapiRefresh(() => window.gapi.client.drive.files.list({
                q: `name='${fileName}' and trashed=false`,
                fields: 'files(id, name, modifiedTime)',
                spaces: 'drive',
            }));

            const files = response.result.files;
            return files.length > 0 ? files[0] : null;
        } catch (error) {
            console.error('Error finding file:', error);
            throw error;
        }
    }

    /**
     * Crea un nuovo file
     */
    async createFile(fileName, content) {
        await this.ensureSignedIn();
        const folderId = await this.ensureFolder();

        const boundary = '-------314159265358979323846';
        const delimiter = "\r\n--" + boundary + "\r\n";
        const close_delim = "\r\n--" + boundary + "--";

        const metadata = {
            name: fileName,
            mimeType: 'application/json',
            parents: [folderId]
        };

        const multipartRequestBody =
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            JSON.stringify(content) +
            close_delim;

        try {
            const response = await this.fetchWithAuth(
                'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
                {
                    method: 'POST',
                    headers: { 'Content-Type': `multipart/related; boundary="${boundary}"` },
                    body: multipartRequestBody,
                }
            );

            if (!response.ok) {
                throw new Error('Failed to create file');
            }

            const file = await response.json();
            return file;
        } catch (error) {
            console.error('Error creating file:', error);
            throw error;
        }
    }

    /**
     * Aggiorna file esistente
     */
    async updateFile(fileId, content) {
        await this.ensureSignedIn();

        try {
            const response = await this.fetchWithAuth(
                `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(content),
                }
            );

            if (!response.ok) {
                throw new Error('Failed to update file');
            }

            return await response.json();
        } catch (error) {
            console.error('Error updating file:', error);
            throw error;
        }
    }

    /**
     * Scarica file
     */
    async downloadFile(fileId) {
        await this.ensureSignedIn();

        try {
            const response = await this.fetchWithAuth(
                `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
            );

            if (!response.ok) {
                throw new Error('Failed to download file');
            }

            return await response.json();
        } catch (error) {
            console.error('Error downloading file:', error);
            throw error;
        }
    }

    // ========================================
    // ATTACHMENT BINARY FILES
    // ========================================

    /**
     * Carica un allegato come file binario separato su Drive.
     * Più efficiente dell'inline base64 nel JSON: risparmia ~33% di spazio
     * e permette upload/download indipendenti dal file JSON principale.
     *
     * existingDriveId: se fornito → PATCH (aggiorna), altrimenti → POST (crea)
     * base64Data: stringa base64 dell'encryptedData
     * returns: driveFileId (string)
     */
    async uploadAttachmentBinary(existingDriveId, base64Data) {
        await this.ensureSignedIn();

        // Decodifica base64 → Uint8Array per upload binario
        const binary = atob(base64Data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }

        if (existingDriveId) {
            // PATCH: aggiorna contenuto file esistente
            const response = await this.fetchWithAuth(
                `https://www.googleapis.com/upload/drive/v3/files/${existingDriveId}?uploadType=media`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/octet-stream' },
                    body: bytes,
                }
            );
            if (!response.ok) throw new Error('Failed to update attachment file');
            const file = await response.json();
            return file.id;
        }

        // POST: crea nuovo file binario con multipart (metadata + contenuto)
        const folderId = await this.ensureFolder();
        const boundary = '-------ownvault314159265';
        const delimiter = `\r\n--${boundary}\r\n`;
        const closeDelim = `\r\n--${boundary}--`;
        const fileName = `ownvault-att-${Date.now()}.bin`;

        const metadataStr = JSON.stringify({ name: fileName, mimeType: 'application/octet-stream', parents: [folderId] });

        // Costruisci il body multipart: metadata JSON + binario
        const metaPart = `${delimiter}Content-Type: application/json\r\n\r\n${metadataStr}${delimiter}Content-Type: application/octet-stream\r\n\r\n`;
        const metaBytes = new TextEncoder().encode(metaPart);
        const closeBytes = new TextEncoder().encode(closeDelim);

        const body = new Uint8Array(metaBytes.length + bytes.length + closeBytes.length);
        body.set(metaBytes, 0);
        body.set(bytes, metaBytes.length);
        body.set(closeBytes, metaBytes.length + bytes.length);

        const response = await this.fetchWithAuth(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
            {
                method: 'POST',
                headers: { 'Content-Type': `multipart/related; boundary="${boundary}"` },
                body,
            }
        );
        if (!response.ok) throw new Error('Failed to create attachment file');
        const file = await response.json();
        return file.id;
    }

    /**
     * Scarica un allegato binario da Drive.
     * Ritorna la stringa base64 dell'encryptedData.
     */
    async downloadAttachmentBinary(driveFileId) {
        await this.ensureSignedIn();

        const response = await this.fetchWithAuth(
            `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`
        );
        if (!response.ok) throw new Error('Failed to download attachment binary');

        // Converti ArrayBuffer → base64
        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    /**
     * Lista tutti i file allegati su Drive (nome inizia con "ownvault-att-").
     * Usato per cleanup di file orfani.
     * Ritorna array di { id, name }.
     */
    async listAttachmentFiles() {
        await this.ensureSignedIn();

        const response = await this.withGapiRefresh(() => window.gapi.client.drive.files.list({
            q: `name contains 'ownvault-att-' and trashed=false`,
            fields: 'files(id, name)',
            spaces: 'drive',
        }));
        return response.result.files || [];
    }

    /**
     * Elimina file
     */
    async deleteFile(fileId) {
        await this.ensureSignedIn();

        try {
            const response = await this.withGapiRefresh(() => window.gapi.client.drive.files.delete({
                fileId: fileId,
            }));

            return response;
        } catch (error) {
            console.error('Error deleting file:', error);
            throw error;
        }
    }

    /**
     * Ottieni metadata del file
     */
    async getFileMetadata(fileId) {
        await this.ensureSignedIn();

        try {
            const response = await this.withGapiRefresh(() => window.gapi.client.drive.files.get({
                fileId: fileId,
                fields: 'id, name, modifiedTime, size',
            }));

            return response.result;
        } catch (error) {
            console.error('Error getting file metadata:', error);
            throw error;
        }
    }

    /**
     * Verifica se l'utente è autenticato
     */
    async ensureSignedIn() {
        if (this.isSignedIn && this.accessToken) {
            // Verifica che il token in cache non sia scaduto
            const cached = this.loadCachedToken();
            if (cached) return;
            // Token scaduto: resetta lo stato e rinnova silenziosamente
            this.accessToken = null;
            this.isSignedIn = false;
            window.gapi.client.setToken(null);
        }

        try {
            await this.restoreSession();
        } catch {
            throw new Error('Not signed in to Google Drive');
        }
    }

    /**
     * Rinnova il token silenziosamente (bypass cache, forza nuova richiesta a Google).
     * Chiamato automaticamente su risposta 401.
     * Non apre popup: usa direttamente il refresh token in IndexedDB.
     */
    async refreshToken() {
        this.accessToken = null;
        this.isSignedIn  = false;
        this.clearCachedToken();
        window.gapi.client.setToken(null);
        await this.restoreSession();
    }

    /**
     * fetch con Authorization header automatico + retry una volta su 401.
     * Elimina la necessità di passare Authorization manualmente in ogni chiamata.
     */
    async fetchWithAuth(url, options = {}) {
        const run = () => fetch(url, {
            ...options,
            headers: { ...options.headers, Authorization: `Bearer ${this.accessToken}` }
        });

        let response = await run();
        if (response.status === 401) {
            await this.refreshToken();
            response = await run();
        }
        return response;
    }

    /**
     * Esegue una chiamata gapi.client con retry una volta su 401.
     */
    async withGapiRefresh(fn) {
        try {
            return await fn();
        } catch (e) {
            if (e?.status === 401 || e?.result?.error?.code === 401) {
                await this.refreshToken();
                return await fn();
            }
            throw e;
        }
    }

    /**
     * Verifica se l'utente è online
     */
    isOnline() {
        return navigator.onLine;
    }
}

export const googleDriveService = new GoogleDriveService();