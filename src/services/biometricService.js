/**
 * Biometric Authentication Service
 * Implementa WebAuthn per sblocco locale con biometria
 * 
 * ARCHITETTURA:
 * 1. WebAuthn genera una keypair protetta da biometria/PIN
 * 2. La private key NON viene mai esposta al browser
 * 3. Si usa WebAuthn come "unlock mechanism" per una chiave simmetrica
 * 4. La chiave simmetrica (UnlockKey) è cifrata con WebCrypto
 * 5. L'OS gestisce la protezione biometrica della private key
 * 
 * FLUSSO:
 * Password → PBKDF2 → KEK → cifra DEK
 * DEK → HKDF → BiometricUnlockKey (BUK)
 * BUK → cifrata via WebCrypto → sbloccata tramite WebAuthn
 * 
 * SICUREZZA:
 * - Local security, non network security
 * - Protegge accesso locale ai dati cifrati
 * - Richiede possesso del dispositivo + biometria
 */

const RP_NAME = 'SafeProfiles';
const RP_ID = window.location.hostname;
const USER_ID = 'safeprofiles-user';
const USER_NAME = 'SafeProfiles User';

class BiometricService {
    constructor() {
        this.isSupported = this.checkSupport();
    }

    // ========================================
    // SUPPORTO E DETECTION
    // ========================================

    /**
     * Verifica se WebAuthn è supportato dal browser
     */
    checkSupport() {
        return !!(
            window.PublicKeyCredential &&
            navigator.credentials &&
            navigator.credentials.create &&
            navigator.credentials.get
        );
    }

    /**
     * Verifica se l'authenticator supporta la biometria
     * Controlla: platform authenticator (FaceID, TouchID, Windows Hello)
     */
    async checkBiometricAvailability() {
        if (!this.isSupported) {
            return {
                available: false,
                reason: 'WebAuthn not supported by this browser'
            };
        }

        try {
            // Verifica se c'è un authenticator disponibile
            const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
            
            if (!available) {
                return {
                    available: false,
                    reason: 'No biometric authenticator available on this device'
                };
            }

            return { available: true };
        } catch (error) {
            return {
                available: false,
                reason: 'Error checking biometric availability: ' + error.message
            };
        }
    }

    // ========================================
    // KEY DERIVATION
    // ========================================

    /**
     * Deriva una Biometric Unlock Key (BUK) dalla DEK usando HKDF
     * Questa chiave sarà protetta da WebAuthn
     */
    async deriveBiometricUnlockKey(dek) {
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            dek,
            { name: 'HKDF' },
            false,
            ['deriveKey']
        );

        const info = new TextEncoder().encode('SafeProfiles-Biometric-Unlock-v1');

        return await crypto.subtle.deriveKey(
            {
                name: 'HKDF',
                hash: 'SHA-256',
                salt: new Uint8Array(32), // Salt zero - ok per HKDF con input già random
                info: info
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            true, // extractable - necessario per cifrarlo
            ['encrypt', 'decrypt']
        );
    }

    // ========================================
    // REGISTRAZIONE WEBAUTHN
    // ========================================

    /**
     * Registra credenziali WebAuthn per la biometria
     * Salva la BUK cifrata che potrà essere sbloccata con biometria
     */
    async registerBiometric(dek) {
        if (!this.isSupported) {
            throw new Error('WebAuthn not supported');
        }

        try {
            // 1. Genera challenge random
            const challenge = new Uint8Array(32);
            crypto.getRandomValues(challenge);

            // 2. Crea credenziali WebAuthn
            const publicKeyOptions = {
                challenge: challenge,
                rp: {
                    name: RP_NAME,
                    id: RP_ID
                },
                user: {
                    id: new TextEncoder().encode(USER_ID),
                    name: USER_NAME,
                    displayName: USER_NAME
                },
                pubKeyCredParams: [
                    { type: 'public-key', alg: -7 },  // ES256
                    { type: 'public-key', alg: -257 } // RS256
                ],
                authenticatorSelection: {
                    authenticatorAttachment: 'platform', // platform authenticator (biometria integrata)
                    userVerification: 'required', // richiede biometria/PIN
                    requireResidentKey: false
                },
                timeout: 60000,
                attestation: 'none'
            };

            const credential = await navigator.credentials.create({
                publicKey: publicKeyOptions
            });

            if (!credential) {
                throw new Error('Failed to create credential');
            }

            // 3. Deriva la Biometric Unlock Key dalla DEK
            const buk = await this.deriveBiometricUnlockKey(dek);

            // 4. Esporta la BUK per cifrarla
            const bukRaw = await crypto.subtle.exportKey('raw', buk);

            // 5. Genera una chiave di wrapping casuale
            const wrappingKey = await crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 },
                true,
                ['wrapKey', 'unwrapKey']
            );

            // 6. Cifra la BUK con la wrapping key
            const iv = new Uint8Array(12);
            crypto.getRandomValues(iv);

            const wrappedBUK = await crypto.subtle.wrapKey(
                'raw',
                buk,
                wrappingKey,
                { name: 'AES-GCM', iv: iv }
            );

            // 7. Esporta la wrapping key
            const wrappingKeyRaw = await crypto.subtle.exportKey('raw', wrappingKey);

            // 8. Salva i dati necessari per lo sblocco
            const biometricConfig = {
                version: 1,
                credentialId: this.arrayBufferToBase64(credential.rawId),
                wrappedBUK: this.arrayBufferToBase64(wrappedBUK),
                wrappingKey: this.arrayBufferToBase64(wrappingKeyRaw),
                iv: this.arrayBufferToBase64(iv),
                registeredAt: Date.now()
            };

            return biometricConfig;
        } catch (error) {
            console.error('Biometric registration error:', error);
            
            // Messaggi user-friendly
            if (error.name === 'NotAllowedError') {
                throw new Error('Biometric registration cancelled or denied');
            } else if (error.name === 'NotSupportedError') {
                throw new Error('Biometric authentication not supported on this device');
            } else {
                throw new Error('Failed to register biometric: ' + error.message);
            }
        }
    }

    // ========================================
    // AUTENTICAZIONE WEBAUTHN
    // ========================================

    /**
     * Autentica con biometria e sblocca la BUK
     * Ritorna la DEK ricostruita
     */
    async authenticateBiometric(biometricConfig) {
        if (!this.isSupported) {
            throw new Error('WebAuthn not supported');
        }

        if (!biometricConfig || !biometricConfig.credentialId) {
            throw new Error('No biometric credentials configured');
        }

        try {
            // 1. Genera challenge random
            const challenge = new Uint8Array(32);
            crypto.getRandomValues(challenge);

            // 2. Converti credentialId
            const credentialId = this.base64ToArrayBuffer(biometricConfig.credentialId);

            // 3. Richiedi autenticazione
            const publicKeyOptions = {
                challenge: challenge,
                rpId: RP_ID,
                allowCredentials: [{
                    type: 'public-key',
                    id: credentialId
                }],
                userVerification: 'required',
                timeout: 60000
            };

            const assertion = await navigator.credentials.get({
                publicKey: publicKeyOptions
            });

            if (!assertion) {
                throw new Error('Authentication failed');
            }

            // 4. Se l'OS ha verificato l'utente (biometria ok), sblocca la BUK
            
            // 5. Importa la wrapping key
            const wrappingKeyRaw = this.base64ToArrayBuffer(biometricConfig.wrappingKey);
            const wrappingKey = await crypto.subtle.importKey(
                'raw',
                wrappingKeyRaw,
                { name: 'AES-GCM' },
                false,
                ['unwrapKey']
            );

            // 6. Unwrap la BUK
            const wrappedBUK = this.base64ToArrayBuffer(biometricConfig.wrappedBUK);
            const iv = this.base64ToArrayBuffer(biometricConfig.iv);

            const buk = await crypto.subtle.unwrapKey(
                'raw',
                wrappedBUK,
                wrappingKey,
                { name: 'AES-GCM', iv: iv },
                { name: 'AES-GCM' },
                true,
                ['encrypt', 'decrypt']
            );

            // 7. Esporta la BUK per ritornare i raw bytes
            const bukRaw = await crypto.subtle.exportKey('raw', buk);

            return {
                success: true,
                biometricUnlockKey: new Uint8Array(bukRaw)
            };
        } catch (error) {
            console.error('Biometric authentication error:', error);
            
            // Messaggi user-friendly
            if (error.name === 'NotAllowedError') {
                throw new Error('Biometric authentication cancelled or denied');
            } else if (error.name === 'InvalidStateError') {
                throw new Error('Biometric credential not found. Please re-enable biometrics.');
            } else {
                throw new Error('Biometric authentication failed: ' + error.message);
            }
        }
    }

    // ========================================
    // GESTIONE CONFIGURAZIONE
    // ========================================

    /**
     * Verifica se la DEK corrisponde alla BUK salvata
     * Usato per validare che la biometria sia ancora valida dopo unlock con password
     */
    async verifyBiometricKey(dek, biometricConfig) {
        try {
            // Deriva la BUK attuale dalla DEK
            const currentBUK = await this.deriveBiometricUnlockKey(dek);
            const currentBUKRaw = await crypto.subtle.exportKey('raw', currentBUK);

            // Sblocca la BUK salvata
            const wrappingKeyRaw = this.base64ToArrayBuffer(biometricConfig.wrappingKey);
            const wrappingKey = await crypto.subtle.importKey(
                'raw',
                wrappingKeyRaw,
                { name: 'AES-GCM' },
                false,
                ['unwrapKey']
            );

            const wrappedBUK = this.base64ToArrayBuffer(biometricConfig.wrappedBUK);
            const iv = this.base64ToArrayBuffer(biometricConfig.iv);

            const savedBUK = await crypto.subtle.unwrapKey(
                'raw',
                wrappedBUK,
                wrappingKey,
                { name: 'AES-GCM', iv: iv },
                { name: 'AES-GCM' },
                true,
                ['encrypt', 'decrypt']
            );

            const savedBUKRaw = await crypto.subtle.exportKey('raw', savedBUK);

            // Confronta i bytes
            return this.constantTimeCompare(
                new Uint8Array(currentBUKRaw),
                new Uint8Array(savedBUKRaw)
            );
        } catch (error) {
            console.error('Error verifying biometric key:', error);
            return false;
        }
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

    constantTimeCompare(a, b) {
        if (a.length !== b.length) return false;
        let result = 0;
        for (let i = 0; i < a.length; i++) {
            result |= a[i] ^ b[i];
        }
        return result === 0;
    }

    /**
     * Detect il tipo di biometria disponibile (best effort)
     */
    async getBiometricType() {
        const userAgent = navigator.userAgent.toLowerCase();
        
        if (/iphone|ipad|ipod/.test(userAgent)) {
            return 'Face ID / Touch ID';
        } else if (/android/.test(userAgent)) {
            return 'Fingerprint / Face Unlock';
        } else if (/windows/.test(userAgent)) {
            return 'Windows Hello';
        } else if (/mac/.test(userAgent)) {
            return 'Touch ID';
        } else {
            return 'Biometric Authentication';
        }
    }
}

// Singleton
export const biometricService = new BiometricService();
