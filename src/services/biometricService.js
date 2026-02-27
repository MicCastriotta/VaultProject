/**
 * Biometric Authentication Service
 * Implementa WebAuthn come secondo fattore di accesso locale (2FA)
 *
 * ARCHITETTURA (v2 - sicura):
 * - La master password è l'UNICO segreto crittografico reale
 * - WebAuthn è un gate di accesso UI, NON un meccanismo di recupero chiavi
 * - Nessuna chiave simmetrica viene salvata nel DB per sblocco biometrico
 *
 * FLUSSO:
 * 1. Utente inserisce master password → KEK → decifra DEK (invariato)
 * 2. Se biometria abilitata → richiedi WebAuthn come 2FA locale
 * 3. Solo se WebAuthn ha successo → isUnlocked = true
 *
 * SICUREZZA:
 * - IndexedDB rubato → inutile senza master password (DEK non recuperabile)
 * - WebAuthn non può essere bypassato offline (richiede device reale)
 * - Nessuna chiave salvata in chiaro o cifrata nel DB
 */

const RP_NAME = 'OwnVault';
const RP_ID = window.location.hostname;
const USER_ID = 'ownvault-user';
const USER_NAME = 'OwnVault User';

class BiometricService {
    constructor() {
        this.isSupported = this.checkSupport();
    }

    // ========================================
    // SUPPORTO E DETECTION
    // ========================================

    checkSupport() {
        return !!(
            window.PublicKeyCredential &&
            navigator.credentials &&
            navigator.credentials.create &&
            navigator.credentials.get
        );
    }

    /**
     * Verifica se il device supporta un authenticator biometrico
     * (FaceID, TouchID, Windows Hello, ecc.)
     */
    async checkBiometricAvailability() {
        if (!this.isSupported) {
            return {
                available: false,
                reason: 'WebAuthn not supported by this browser'
            };
        }

        try {
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
    // REGISTRAZIONE WEBAUTHN
    // ========================================

    /**
     * Registra una credenziale WebAuthn sul device.
     * NON deriva né salva alcuna chiave crittografica.
     * Salva solo il credentialId necessario per l'autenticazione futura.
     */
    async registerBiometric() {
        if (!this.isSupported) {
            throw new Error('WebAuthn not supported');
        }

        try {
            const challenge = new Uint8Array(32);
            crypto.getRandomValues(challenge);

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
                    { type: 'public-key', alg: -7 },   // ES256
                    { type: 'public-key', alg: -257 }  // RS256
                ],
                authenticatorSelection: {
                    authenticatorAttachment: 'platform',
                    userVerification: 'required',
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

            // Salva solo credentialId e timestamp — nessuna chiave
            return {
                version: 2,
                credentialId: this.arrayBufferToBase64(credential.rawId),
                registeredAt: Date.now()
            };
        } catch (error) {
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
     * Verifica la presenza dell'utente tramite WebAuthn.
     * Ritorna { success: true } se l'OS ha confermato la biometria/PIN,
     * { success: false } altrimenti.
     * NON deriva né restituisce alcuna chiave crittografica.
     */
    async authenticateBiometric(biometricConfig) {
        if (!this.isSupported) {
            throw new Error('WebAuthn not supported');
        }

        if (!biometricConfig || !biometricConfig.credentialId) {
            throw new Error('No biometric credentials configured');
        }

        try {
            const challenge = new Uint8Array(32);
            crypto.getRandomValues(challenge);

            const credentialId = this.base64ToArrayBuffer(biometricConfig.credentialId);

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

            return { success: !!assertion };
        } catch (error) {
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

    /**
     * Detect il tipo di biometria disponibile sul device (best effort)
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
