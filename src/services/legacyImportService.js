/**
 * Legacy Import Service
 * Decifra i dati dal vecchio database SQLite (Xamarin app)
 * 
 * SCHEMA LEGACY (C#):
 * 1. Password UTF8 → resize a 32 byte (chiave AES)
 * 2. IV fisso recuperato da AesData table
 * 3. AES-CBC con PKCS7 padding
 * 4. Base64 encoding per storage
 * 
 * SECURITY:
 * - Dati mai salvati in chiaro
 * - Memoria pulita dopo decifratura
 * - Zero logging di dati sensibili
 */

class LegacyImportService {
    constructor() {
        this.db = null;
        this.SQL = null;
    }

    /**
     * Inizializza sql.js (lazy loading)
     */
    async initSqlJs() {
        if (this.SQL) return;

        const initSqlJs = (await import('sql.js')).default;
        this.SQL = await initSqlJs({
            locateFile: file => `/${file}`  // servito da public/ nel build
        });
    }

    /**
     * Carica il file database SQLite
     */
    async loadDatabase(file) {
        await this.initSqlJs();

        const buffer = await file.arrayBuffer();
        this.db = new this.SQL.Database(new Uint8Array(buffer));

        // Verifica struttura database
        const tables = this.db.exec(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND (name='Profile' OR name='ProfileData' OR name='AesData')
        `);

        if (!tables.length || !tables[0].values.length) {
            throw new Error('Invalid database: missing required tables');
        }

        return true;
    }

    /**
     * Recupera l'IV fisso dalla tabella AesData
     */
    getAesIV() {
        if (!this.db) throw new Error('Database not loaded');

        try {
            const result = this.db.exec('SELECT Alg FROM AesData LIMIT 1');

            if (!result.length || !result[0].values.length) {
                throw new Error('AES configuration not found in database');
            }

            // L'IV è salvato come BLOB, convertiamolo in base64 poi in Uint8Array
            const ivBlob = result[0].values[0][0];
            return this.blobToUint8Array(ivBlob);
        } catch (error) {
            throw new Error(`Failed to retrieve AES IV: ${error.message}`);
        }
    }

    /**
     * Conta i profili disponibili
     */
    async getProfileCount() {
        if (!this.db) throw new Error('Database not loaded');

        try {
            // Prova prima ProfileData (schema più recente)
            let result = this.db.exec('SELECT COUNT(*) as count FROM ProfileData');
            if (result.length && result[0].values[0][0] > 0) {
                return {
                    count: result[0].values[0][0],
                    table: 'ProfileData'
                };
            }

            // Fallback a Profile (schema vecchio)
            result = this.db.exec('SELECT COUNT(*) as count FROM Profile');
            return {
                count: result.length ? result[0].values[0][0] : 0,
                table: 'Profile'
            };
        } catch (error) {
            throw new Error(`Failed to count profiles: ${error.message}`);
        }
    }

    /**
     * Deriva la chiave AES dal password (replica logica C#)
     * 
     * LEGACY SCHEMA:
     * - Password → UTF8 bytes
     * - Resize a 32 byte (riempie con 0x00 se più corto)
     * - Usato direttamente come chiave AES (no KDF! vulnerabile a brute force)
     */
    deriveLegacyKey(password) {
        const encoder = new TextEncoder();
        const passwordBytes = encoder.encode(password);

        // Resize a 32 byte come nel C#: Array.Resize(ref result, 32)
        const key = new Uint8Array(32);
        key.set(passwordBytes.slice(0, 32));

        return key;
    }

    /**
     * Decifra una stringa usando AES-CBC (replica C# Aes.Create default)
     * 
     * IMPORTANTE: Il C# usa AES-CBC con PKCS7 padding per default
     */
    async decryptLegacyString(encryptedBase64, password, iv) {
        try {
            const key = this.deriveLegacyKey(password);
            const ciphertext = this.base64ToArrayBuffer(encryptedBase64);

            const cryptoKey = await crypto.subtle.importKey(
                'raw',
                key,
                { name: 'AES-CBC' },
                false,
                ['decrypt']
            );

            const plaintextBuffer = await crypto.subtle.decrypt(
                { name: 'AES-CBC', iv: iv },
                cryptoKey,
                ciphertext
            );

            const plaintext = new TextDecoder().decode(plaintextBuffer);

            // Pulisci la chiave dalla memoria
            key.fill(0);

            return plaintext;
        } catch (error) {
            throw new Error('Decryption failed: wrong password or corrupted data');
        }
    }

    /**
     * Importa tutti i profili dalla tabella ProfileData (schema JSON)
     */
    async importFromProfileData(password) {
        if (!this.db) throw new Error('Database not loaded');

        const iv = this.getAesIV();
        const profiles = [];
        const errors = [];

        try {
            const result = this.db.exec('SELECT Id, Data FROM ProfileData');

            if (!result.length || !result[0].values.length) {
                return { profiles: [], errors: [] };
            }

            for (const row of result[0].values) {
                const [id, encryptedData] = row;

                try {
                    // Decifra il JSON
                    const decryptedJson = await this.decryptLegacyString(
                        this.blobToBase64(encryptedData),
                        password,
                        iv
                    );

                    const profile = JSON.parse(decryptedJson);

                    // Normalizza il profilo
                    profiles.push(this.normalizeProfile(profile));
                } catch (error) {
                    errors.push({
                        id,
                        error: `Profile ${id}: ${error.message}`
                    });
                }
            }

            return { profiles, errors };
        } finally {
            // Pulisci IV dalla memoria
            iv.fill(0);
        }
    }

    /**
     * Importa dalla tabella Profile (schema legacy con campi separati)
     */
    async importFromProfile(password) {
        if (!this.db) throw new Error('Database not loaded');

        const iv = this.getAesIV();
        const profiles = [];
        const errors = [];

        try {
            const result = this.db.exec(
                'SELECT Id, Title, Username, Password, Note FROM Profile'
            );

            if (!result.length || !result[0].values.length) {
                return { profiles: [], errors: [] };
            }

            for (const row of result[0].values) {
                const [id, title, encUsername, encPassword, encNote] = row;

                try {
                    const username = await this.decryptLegacyString(
                        this.blobToBase64(encUsername),
                        password,
                        iv
                    );

                    const profilePassword = await this.decryptLegacyString(
                        this.blobToBase64(encPassword),
                        password,
                        iv
                    );

                    const note = encNote ? await this.decryptLegacyString(
                        this.blobToBase64(encNote),
                        password,
                        iv
                    ) : '';

                    profiles.push({
                        title: title || 'Untitled',
                        username,
                        password: profilePassword,
                        note,
                        url: '',
                        category: 'WEB',
                        favorite: false,
                        tags: []
                    });
                } catch (error) {
                    errors.push({
                        id,
                        error: `Profile ${id}: ${error.message}`
                    });
                }
            }

            return { profiles, errors };
        } finally {
            iv.fill(0);
        }
    }

    /**
     * Importa tutti i profili (auto-detect schema)
     */
    async importAllProfiles(password) {
        const countInfo = await this.getProfileCount();

        if (countInfo.count === 0) {
            return { profiles: [], errors: [], count: 0 };
        }

        let result;
        if (countInfo.table === 'ProfileData') {
            result = await this.importFromProfileData(password);
        } else {
            result = await this.importFromProfile(password);
        }

        return {
            ...result,
            count: countInfo.count,
            table: countInfo.table
        };
    }

    /**
     * Normalizza un profilo dal formato legacy al nuovo formato
     */
    normalizeProfile(legacyProfile) {
        return {
            title: legacyProfile.Title || legacyProfile.title || 'Untitled',
            username: legacyProfile.Username || legacyProfile.username || '',
            password: legacyProfile.Password || legacyProfile.password || '',
            website: legacyProfile.Website || legacyProfile.website || legacyProfile.Url || legacyProfile.url || '',
            note: legacyProfile.Note || legacyProfile.note || '',
            secretKey: legacyProfile.SecretKey || legacyProfile.secretKey || legacyProfile.TotpSecret || legacyProfile.totpSecret || '', // ← TOTP
            numberCard: legacyProfile.NumberCard || legacyProfile.CardNumber || legacyProfile.cardNumber || '', // ← Card
            owner: legacyProfile.Owner || legacyProfile.owner || legacyProfile.CardHolder || legacyProfile.cardHolder || '',
            deadline: legacyProfile.Deadline || legacyProfile.deadline || legacyProfile.ExpiryDate || legacyProfile.expiryDate || '',
            cvv: legacyProfile.Cvv || legacyProfile.CVV || legacyProfile.cvv || '',
            pin: legacyProfile.Pin || legacyProfile.PIN || legacyProfile.pin || '',
            category: this.mapCategory(legacyProfile.Category),
            lastModified: new Date(legacyProfile.Lastmodified || legacyProfile.lastmodified).toISOString()
        };
    }

    /**
     * Mappa le categorie legacy alle nuove
     */
    mapCategory(legacyCategory) {
        
        const categoryMap = {
            'WEB': 'WEB',
            'CARD': 'CARD',
            '0': 'WEB',
            '1': 'CARD'
        };

        return categoryMap[legacyCategory] || 'WEB';
    }

    /**
     * Chiude il database e pulisce la memoria
     */
    cleanup() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }

    // ========================================
    // UTILITY FUNCTIONS
    // ========================================

    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    blobToBase64(blob) {
        // SQLite restituisce i BLOB come Uint8Array
        if (blob instanceof Uint8Array) {
            let binary = '';
            for (let i = 0; i < blob.length; i++) {
                binary += String.fromCharCode(blob[i]);
            }
            return btoa(binary);
        }
        return blob; // Già base64
    }

    blobToUint8Array(blob) {
        if (blob instanceof Uint8Array) {
            return blob;
        }
        // Se è base64, decodifica
        return this.base64ToArrayBuffer(blob);
    }
}

export const legacyImportService = new LegacyImportService();