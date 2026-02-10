/**
 * Cryptographic Service
 * Implements the secure schema:
 * Password -> KDF (PBKDF2) -> KEK -> unlocks -> DEK (random) -> AES-256-GCM -> encrypted data
 * 
 * INTEGRITY PROTECTION (anti-tampering IndexedDB):
 * DEK -> HKDF -> Integrity Key (IK) -> HMAC-SHA256 su cryptoConfig + profili
 * L'HMAC viene ricalcolato ad ogni scrittura e verificato ad ogni lettura.
 */

import { pbkdf2, createSHA512 } from 'hash-wasm';

const PBKDF2_ITERATIONS = 600000;
const KEY_LENGTH = 32; // 256 bit
const IV_LENGTH = 12; // 96 bit per GCM
const SALT_LENGTH = 32; // 256 bit
const HMAC_CONTEXT = 'SafeProfiles-Integrity-v1'; // Domain separation per HKDF

class CryptoService {
    constructor() {
        this.dek = null;
        this.integrityKey = null; // Chiave HMAC derivata dalla DEK via HKDF
        this.isUnlocked = false;
    }

    // ========================================
    // GENERATORI RANDOM
    // ========================================

    generateSalt() {
        const salt = new Uint8Array(SALT_LENGTH);
        crypto.getRandomValues(salt);
        return salt;
    }

    generateIV() {
        const iv = new Uint8Array(IV_LENGTH);
        crypto.getRandomValues(iv);
        return iv;
    }

    generateDEK() {
        const dek = new Uint8Array(KEY_LENGTH);
        crypto.getRandomValues(dek);
        return dek;
    }

    // ========================================
    // KEY DERIVATION
    // ========================================

    async deriveKEK(password, salt) {
        const passwordBytes = new TextEncoder().encode(password);

        const kekBytes = await pbkdf2({
            password: passwordBytes,
            salt,
            iterations: PBKDF2_ITERATIONS,
            hashLength: KEY_LENGTH,
            hashFunction: createSHA512(),
            outputType: 'binary'
        });

        return await crypto.subtle.importKey(
            'raw',
            kekBytes,
            { name: 'AES-GCM' },
            false,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Deriva una Integrity Key (IK) dalla DEK usando HKDF.
     * Chiave separata usata SOLO per HMAC — mai per cifrare.
     * Garantisce domain separation: DEK cifra, IK autentica.
     */
    async deriveIntegrityKey(dek) {
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            dek,
            { name: 'HKDF' },
            false,
            ['deriveKey']
        );

        const info = new TextEncoder().encode(HMAC_CONTEXT);

        return await crypto.subtle.deriveKey(
            {
                name: 'HKDF',
                hash: 'SHA-256',
                salt: new Uint8Array(32), // Salt zero — ok per HKDF con input già random
                info: info
            },
            keyMaterial,
            { name: 'HMAC', hash: 'SHA-256', length: 256 },
            false,
            ['sign', 'verify']
        );
    }

    // ========================================
    // SETUP & UNLOCK
    // ========================================

    async setupMasterPassword(password) {
        const salt = this.generateSalt();
        const dek = this.generateDEK();
        const kek = await this.deriveKEK(password, salt);

        const iv = this.generateIV();
        const encryptedDEK = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            kek,
            dek
        );

        this.dek = dek;
        this.integrityKey = await this.deriveIntegrityKey(dek);
        this.isUnlocked = true;

        return {
            version: 1,
            kdf: 'PBKDF2',
            iterations: PBKDF2_ITERATIONS,
            salt: this.arrayBufferToBase64(salt),
            iv: this.arrayBufferToBase64(iv),
            encryptedDEK: this.arrayBufferToBase64(encryptedDEK)
        };
    }

    async unlock(password, cryptoConfig) {
        try {
            const salt = this.base64ToArrayBuffer(cryptoConfig.salt);
            const iv = this.base64ToArrayBuffer(cryptoConfig.iv);
            const encryptedDEK = this.base64ToArrayBuffer(cryptoConfig.encryptedDEK);

            const kek = await this.deriveKEK(password, salt);

            const dekBytes = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                kek,
                encryptedDEK
            );

            this.dek = new Uint8Array(dekBytes);
            this.integrityKey = await this.deriveIntegrityKey(this.dek);
            this.isUnlocked = true;

            return true;
        } catch (error) {
            this.isUnlocked = false;
            return false;
        }
    }

    lock() {
        // Sovrascrive i byte prima di rilasciare il riferimento
        if (this.dek) {
            this.dek.fill(0);
        }
        this.dek = null;
        this.integrityKey = null;
        this.isUnlocked = false;
    }

    // ========================================
    // ENCRYPT / DECRYPT
    // ========================================

    async encryptData(data) {
        if (!this.isUnlocked || !this.dek) {
            throw new Error('System locked. Please unlock first.');
        }

        const plaintext = JSON.stringify(data);
        const plaintextBytes = new TextEncoder().encode(plaintext);
        const iv = this.generateIV();

        const key = await crypto.subtle.importKey(
            'raw',
            this.dek,
            { name: 'AES-GCM' },
            false,
            ['encrypt']
        );

        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            plaintextBytes
        );

        return {
            iv: this.arrayBufferToBase64(iv),
            data: this.arrayBufferToBase64(ciphertext),
            version: 1
        };
    }

    async decryptData(encryptedData) {
        if (!this.isUnlocked || !this.dek) {
            throw new Error('System locked. Please unlock first.');
        }

        try {
            const iv = this.base64ToArrayBuffer(encryptedData.iv);
            const ciphertext = this.base64ToArrayBuffer(encryptedData.data);

            const key = await crypto.subtle.importKey(
                'raw',
                this.dek,
                { name: 'AES-GCM' },
                false,
                ['decrypt']
            );

            const plaintextBytes = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                key,
                ciphertext
            );

            const plaintext = new TextDecoder().decode(plaintextBytes);
            return JSON.parse(plaintext);
        } catch (error) {
            throw new Error('Decryption failed. Data corrupted or wrong key.');
        }
    }

    // ========================================
    // HMAC INTEGRITY (anti-tampering IndexedDB)
    // ========================================

    /**
     * Calcola HMAC-SHA256 sull'intero stato del database.
     * 
     * Payload canonicalizzato:
     * - cryptoConfig (solo campi crittografici, esclusi timestamps)
     * - profili ordinati per ID (solo campi cifrati, esclusi timestamps)
     * - conteggio profili (protegge contro cancellazioni)
     * 
     * L'ordinamento per ID garantisce determinismo:
     * lo stesso set di dati produce sempre lo stesso HMAC.
     */
    async computeHMAC(cryptoConfig, profiles) {
        if (!this.integrityKey) {
            throw new Error('Integrity key not available. Unlock first.');
        }

        const sortedProfiles = [...profiles].sort((a, b) => a.id - b.id);

        const payload = {
            v: 1,
            crypto: {
                version: cryptoConfig.version,
                kdf: cryptoConfig.kdf,
                iterations: cryptoConfig.iterations,
                salt: cryptoConfig.salt,
                iv: cryptoConfig.iv,
                encryptedDEK: cryptoConfig.encryptedDEK
            },
            profiles: sortedProfiles.map(p => ({
                id: p.id,
                iv: p.iv,
                data: p.data,
                category: p.category,
                version: p.version
            })),
            profileCount: sortedProfiles.length
        };

        const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));

        const signature = await crypto.subtle.sign(
            'HMAC',
            this.integrityKey,
            payloadBytes
        );

        return this.arrayBufferToBase64(new Uint8Array(signature));
    }

    /**
     * Verifica HMAC salvato contro lo stato attuale del database.
     * 
     * Ritorna:
     *   { valid: true }                              — integrità verificata
     *   { valid: true, firstRun: true }              — primo avvio, HMAC non ancora presente
     *   { valid: false, reason: 'HMAC mismatch...' } — MANOMISSIONE RILEVATA
     */
    async verifyHMAC(storedHmac, cryptoConfig, profiles) {
        if (!this.integrityKey) {
            return { valid: false, reason: 'Integrity key not available' };
        }

        // Primo avvio dopo aggiornamento: HMAC non esiste ancora
        if (!storedHmac) {
            return { valid: true, firstRun: true };
        }

        try {
            const expectedHmac = await this.computeHMAC(cryptoConfig, profiles);
            const isValid = this.constantTimeCompare(storedHmac, expectedHmac);

            if (isValid) {
                return { valid: true };
            } else {
                return { valid: false, reason: 'HMAC mismatch — database may have been tampered with!' };
            }
        } catch (error) {
            return { valid: false, reason: `Verification error: ${error.message}` };
        }
    }

    /**
     * Confronto a tempo costante — previene timing attacks
     * sull'HMAC (un attaccante non può dedurre quanti byte coincidono).
     */
    constantTimeCompare(a, b) {
        if (a.length !== b.length) return false;
        let result = 0;
        for (let i = 0; i < a.length; i++) {
            result |= a.charCodeAt(i) ^ b.charCodeAt(i);
        }
        return result === 0;
    }

    // ========================================
    // UTILITIES
    // ========================================

    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    checkPasswordStrength(password) {
        if (!password || password.trim().length === 0) return 'Blank';
        if (password.length < 5) return 'VeryWeak';

        let score = 0;
        if (password.length >= 5) score++;
        if (password.length >= 8) score++;
        if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
        if (/\d/.test(password)) score++;
        if (/[!@#$%^&*?_~\-£().,]/.test(password)) score++;

        const levels = ['Blank', 'VeryWeak', 'Weak', 'Medium', 'Strong', 'VeryStrong'];
        return levels[score] || 'VeryWeak';
    }
}

// Singleton
export const cryptoService = new CryptoService();
