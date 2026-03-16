/**
 * Device Secret Service
 *
 * Gestisce la Device Secret Key (DSK): una chiave casuale a 160 bit che,
 * combinata con la master password, protegge il vault.
 *
 * Schema crittografico (DSK abilitata):
 *   masterKeyMaterial = PBKDF2(masterPassword, salt)
 *   vaultKey = HKDF(masterKeyMaterial, salt=DSK, info="OwnVault-vault-v2")
 *   DEK = AES-GCM.decrypt(vaultKey, encryptedDEK)
 *
 * La DSK è avvolta con l'output PRF del credenziale WebAuthn biometrico:
 *   wrappedDSK = AES-GCM(HKDF(prfOutput), DSK)   → salvata in IndexedDB
 *
 * Non viene mai esportata nei backup.
 *
 * Formato recovery key:  OV-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX
 *   (Crockford Base32, 20 byte = 32 char, 4 gruppi da 8)
 *
 * Device approval via QR (ECDH + PIN, senza server):
 *   1. Nuovo device genera keypair effimero EC P-256, mostra QR
 *   2. Vecchio device scansiona, genera il suo keypair, calcola ECDH,
 *      genera PIN a 6 cifre, cifra DSK con HKDF(sharedSecret, PIN)
 *      mostra: PIN + secondo QR con { pubOld, encryptedDSK, iv }
 *   3. Nuovo device scansiona, utente inserisce PIN → DSK decifrata
 */

// Crockford Base32: esclude I, L, O, U per evitare confusione visiva
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const PRF_EVAL_INPUT = new TextEncoder().encode('OwnVault-device-secret-v1');
const WRAP_INFO      = new TextEncoder().encode('OwnVault-wrap-v1');
const TRANSFER_INFO  = new TextEncoder().encode('OwnVault-transfer-v1');

class DeviceSecretService {

    // ========================================
    // RECOVERY KEY
    // ========================================

    /** Genera una DSK casuale (20 byte = 160 bit). */
    generateDSK() {
        const dsk = new Uint8Array(20);
        crypto.getRandomValues(dsk);
        return dsk;
    }

    /**
     * Codifica la DSK come recovery key leggibile:
     * "OV-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
     */
    formatRecoveryKey(dskBytes) {
        if (dskBytes.length !== 20) throw new Error('DSK must be 20 bytes');
        const encoded = this._base32Encode(dskBytes); // 32 char
        return 'OV-' + [
            encoded.slice(0, 8),
            encoded.slice(8, 16),
            encoded.slice(16, 24),
            encoded.slice(24, 32)
        ].join('-');
    }

    /**
     * Decodifica una recovery key in Uint8Array (20 byte).
     * Ritorna null se il formato non è valido.
     */
    parseRecoveryKey(key) {
        try {
            // Rimuove prefisso "OV", trattini e spazi; accetta maiuscole/minuscole
            const normalized = key
                .toUpperCase()
                .replace(/\s/g, '')
                .replace(/-/g, '')
                .replace(/^OV/, '');
            if (normalized.length !== 32) return null;
            const bytes = this._base32Decode(normalized);
            if (bytes.length !== 20) return null;
            return bytes;
        } catch {
            return null;
        }
    }

    // ========================================
    // PRF SUPPORT
    // ========================================

    /**
     * Input fisso per la PRF extension di WebAuthn.
     * Deterministico: stesso credenziale + stesso input = stesso output.
     */
    get prfEvalInput() {
        return PRF_EVAL_INPUT;
    }

    /**
     * Controlla se il browser supporta l'estensione PRF di WebAuthn.
     *
     * Chrome 132+ espone getClientCapabilities(). La chiave corretta per PRF
     * è "prf" (spec WebAuthn Level 3); versioni precedenti usavano "prfExtension".
     *
     * Se getClientCapabilities non è disponibile o non riporta il flag PRF in
     * modo esplicito, ricade sul check del platform authenticator: Chrome 116+
     * con platform authenticator disponibile supporta PRF nella pratica.
     */
    async checkPRFSupport() {
        if (!window.PublicKeyCredential) return false;
        try {
            if (PublicKeyCredential.getClientCapabilities) {
                const caps = await PublicKeyCredential.getClientCapabilities();
                // Prova sia il nome spec ("prf") sia il nome legacy ("prfExtension")
                if ('prf' in caps) return !!caps.prf;
                if ('prfExtension' in caps) return !!caps.prfExtension;
                // getClientCapabilities esiste ma non elenca PRF esplicitamente:
                // dipende dalla versione del browser/autenticatore.
                // Cade nel fallback sottostante.
            }
            // Fallback ottimistico: qualsiasi browser con platform authenticator
            // disponibile e Chrome 116+ supporta PRF nella pratica.
            return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        } catch {
            return false;
        }
    }

    // ========================================
    // WRAPPING / UNWRAPPING CON PRF
    // ========================================

    /**
     * Avvolge la DSK con l'output PRF del credenziale biometrico.
     * Ritorna { wrappedDSK: base64, wrapIv: base64 }.
     */
    async wrapDSKWithPRF(dskBytes, prfOutput) {
        const wrapKey = await this._deriveWrapKey(prfOutput);
        const iv = new Uint8Array(12);
        crypto.getRandomValues(iv);

        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            wrapKey,
            dskBytes
        );

        return {
            wrappedDSK: this._toBase64(new Uint8Array(ciphertext)),
            wrapIv: this._toBase64(iv)
        };
    }

    /**
     * Estrae la DSK dal blob cifrato usando l'output PRF.
     * Ritorna Uint8Array.
     */
    async unwrapDSKWithPRF(wrappedDSK, wrapIv, prfOutput) {
        const wrapKey = await this._deriveWrapKey(prfOutput);
        const iv = this._fromBase64(wrapIv);
        const ciphertext = this._fromBase64(wrappedDSK);

        const plaintext = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            wrapKey,
            ciphertext
        );
        return new Uint8Array(plaintext);
    }

    // ========================================
    // QR DEVICE APPROVAL (ECDH + PIN)
    // ========================================

    /**
     * Genera una coppia di chiavi EC P-256 effimera.
     * Ritorna { privateKey, publicKeyBase64 }.
     * La chiave privata rimane in memoria (non esportabile dal browser).
     */
    async generateEphemeralKeypair() {
        const keypair = await crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-256' },
            false, // non estraibile — rimane in memoria
            ['deriveKey', 'deriveBits']
        );
        const spki = await crypto.subtle.exportKey('spki', keypair.publicKey);
        return {
            privateKey: keypair.privateKey,
            publicKeyBase64: this._toBase64(new Uint8Array(spki))
        };
    }

    /**
     * Importa una chiave pubblica EC P-256 da formato base64 SPKI.
     */
    async importPublicKey(base64) {
        const spki = this._fromBase64(base64);
        return await crypto.subtle.importKey(
            'spki',
            spki,
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            []
        );
    }

    /**
     * Genera un PIN numerico a 6 cifre come stringa.
     */
    generatePIN() {
        const buf = new Uint32Array(1);
        crypto.getRandomValues(buf);
        return String(buf[0] % 1000000).padStart(6, '0');
    }

    /**
     * Cifra la DSK per il trasferimento via QR (lato mittente — vecchio device).
     * Usa ECDH tra la chiave privata del mittente e la pubkey del ricevente,
     * poi HKDF(sharedSecret, salt=PIN) come chiave AES-GCM.
     * Ritorna { encryptedDSK: base64, transferIv: base64 }.
     */
    async encryptDSKForTransfer(dskBytes, senderPrivKey, recipientPubKey, pin) {
        const sharedBits = await crypto.subtle.deriveBits(
            { name: 'ECDH', public: recipientPubKey },
            senderPrivKey,
            256
        );
        const transferKey = await this._deriveTransferKey(new Uint8Array(sharedBits), pin);
        const iv = new Uint8Array(12);
        crypto.getRandomValues(iv);

        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            transferKey,
            dskBytes
        );

        return {
            encryptedDSK: this._toBase64(new Uint8Array(ciphertext)),
            transferIv: this._toBase64(iv)
        };
    }

    /**
     * Decifra la DSK ricevuta via QR (lato ricevente — nuovo device).
     * Ritorna Uint8Array | null se il PIN o i dati sono errati.
     */
    async decryptDSKFromTransfer(encryptedDSK, transferIv, recipientPrivKey, senderPubKey, pin) {
        try {
            const sharedBits = await crypto.subtle.deriveBits(
                { name: 'ECDH', public: senderPubKey },
                recipientPrivKey,
                256
            );
            const transferKey = await this._deriveTransferKey(new Uint8Array(sharedBits), pin);
            const iv = this._fromBase64(transferIv);
            const ciphertext = this._fromBase64(encryptedDSK);

            const plaintext = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                transferKey,
                ciphertext
            );
            return new Uint8Array(plaintext);
        } catch {
            return null; // PIN errato o dati corrotti
        }
    }

    // ========================================
    // PRIVATE HELPERS
    // ========================================

    async _deriveWrapKey(prfOutput) {
        const km = await crypto.subtle.importKey(
            'raw', prfOutput, { name: 'HKDF' }, false, ['deriveKey']
        );
        return await crypto.subtle.deriveKey(
            { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: WRAP_INFO },
            km,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async _deriveTransferKey(sharedSecret, pin) {
        const pinBytes = new TextEncoder().encode(String(pin).padStart(6, '0'));
        const km = await crypto.subtle.importKey(
            'raw', sharedSecret, { name: 'HKDF' }, false, ['deriveKey']
        );
        return await crypto.subtle.deriveKey(
            { name: 'HKDF', hash: 'SHA-256', salt: pinBytes, info: TRANSFER_INFO },
            km,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    _base32Encode(bytes) {
        let result = '';
        let bits = 0;
        let bitsCount = 0;
        for (const byte of bytes) {
            bits = (bits << 8) | byte;
            bitsCount += 8;
            while (bitsCount >= 5) {
                bitsCount -= 5;
                result += CROCKFORD[(bits >> bitsCount) & 0x1f];
            }
        }
        if (bitsCount > 0) {
            result += CROCKFORD[(bits << (5 - bitsCount)) & 0x1f];
        }
        return result;
    }

    _base32Decode(str) {
        const lookup = {};
        for (let i = 0; i < CROCKFORD.length; i++) lookup[CROCKFORD[i]] = i;
        let bits = 0, bitsCount = 0;
        const result = [];
        for (const char of str) {
            if (!(char in lookup)) throw new Error('Invalid base32 char: ' + char);
            bits = (bits << 5) | lookup[char];
            bitsCount += 5;
            if (bitsCount >= 8) {
                bitsCount -= 8;
                result.push((bits >> bitsCount) & 0xff);
            }
        }
        return new Uint8Array(result);
    }

    _toBase64(bytes) {
        let binary = '';
        for (const b of bytes) binary += String.fromCharCode(b);
        return btoa(binary);
    }

    _fromBase64(b64) {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }
}

export const deviceSecretService = new DeviceSecretService();
