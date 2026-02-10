/**
 * Google Drive Service
 * Gestisce autenticazione OAuth2 e operazioni su Google Drive
 */

// IMPORTANTE: Sostituisci con il tuo CLIENT_ID da Google Cloud Console
// https://console.cloud.google.com/apis/credentials
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];

class GoogleDriveService {
    constructor() {
        this.isSignedIn = false;
        this.accessToken = null;
        this.gapiLoaded = false;
        this.gisLoaded = false;
        this.tokenClient = null;
    }

    /**
     * Inizializza Google API
     */
    async init() {
        if (this.gapiLoaded && this.gisLoaded) {
            return; // Già inizializzato
        }

        try {
            // Carica GAPI (Google API)
            await this.loadScript('https://apis.google.com/js/api.js');
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

            this.tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CLIENT_ID,
                scope: SCOPES,
                callback: '', // Impostato dinamicamente
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
    async signIn() {
        await this.init();

        return new Promise((resolve, reject) => {
            try {
                this.tokenClient.callback = async (response) => {
                    if (response.error !== undefined) {
                        reject(response);
                        return;
                    }

                    this.accessToken = response.access_token;
                    this.isSignedIn = true;
                                        
                    resolve({
                        accessToken: this.accessToken
                    });
                };

                // Richiedi token
                if (this.accessToken === null) {
                    // Prompt per consent screen
                    this.tokenClient.requestAccessToken({ prompt: 'consent' });
                } else {
                    // Skip consent se già autorizzato
                    this.tokenClient.requestAccessToken({ prompt: '' });
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Logout
     */
    signOut() {
        if (this.accessToken) {
            window.google.accounts.oauth2.revoke(this.accessToken, () => {
                console.log('Access token revoked');
            });
        }

        this.accessToken = null;
        this.isSignedIn = false;
    }

    async restoreSession() {
        await this.init();

        return new Promise((resolve, reject) => {
            this.tokenClient.callback = (response) => {
                if (response.error) {
                    this.isSignedIn = false;
                    this.accessToken = null;
                    reject(response);
                    return;
                }

                this.accessToken = response.access_token;
                this.isSignedIn = true;
                resolve(true);
            };

            // Richiesta silenziosa (NO popup)
            this.tokenClient.requestAccessToken({
                prompt: ''
            });
        });
    }

    
    /**
     * Cerca file per nome
     */
    async findFile(fileName) {
        await this.ensureSignedIn();

        try {
            const response = await window.gapi.client.drive.files.list({
                q: `name='${fileName}' and trashed=false`,
                fields: 'files(id, name, modifiedTime)',
                spaces: 'drive',
            });

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

        const boundary = '-------314159265358979323846';
        const delimiter = "\r\n--" + boundary + "\r\n";
        const close_delim = "\r\n--" + boundary + "--";

        const metadata = {
            name: fileName,
            mimeType: 'application/json',
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
            const response = await fetch(
                'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${this.accessToken}`,
                        'Content-Type': `multipart/related; boundary="${boundary}"`,
                    },
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
            const response = await fetch(
                `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
                {
                    method: 'PATCH',
                    headers: {
                        Authorization: `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json',
                    },
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
            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
                {
                    headers: {
                        Authorization: `Bearer ${this.accessToken}`,
                    },
                }
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

    /**
     * Elimina file
     */
    async deleteFile(fileId) {
        await this.ensureSignedIn();

        try {
            const response = await window.gapi.client.drive.files.delete({
                fileId: fileId,
            });

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
            const response = await window.gapi.client.drive.files.get({
                fileId: fileId,
                fields: 'id, name, modifiedTime, size',
            });

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
        if (this.isSignedIn && this.accessToken) return;

        try {
            await this.restoreSession();
        } catch {
            throw new Error('Not signed in to Google Drive');
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