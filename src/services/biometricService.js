/**
 * Biometric Authentication Service
 * Implementa WebAuthn come secondo fattore di accesso locale (2FA)
 * e come fonte dell'output PRF per la Device Secret Key.
 *
 * ARCHITETTURA:
 *   v2 (legacy): WebAuthn è solo un gate UI — nessuna chiave derivata
 *   v3 (PRF):    WebAuthn partecipa alla crittografia tramite l'estensione PRF
 *                L'output PRF avvolge la DSK conservata in IndexedDB.
 *
 * FLUSSO v3 (PRF abilitato):
 * 1. Utente inserisce master password
 * 2. authenticateWithPRF() → output PRF deterministico dall'autenticatore
 * 3. PRF output → unwrap DSK da IndexedDB
 * 4. HKDF(PBKDF2(password), DSK) → vault key → decrypt DEK
 *
 * SICUREZZA:
 * - IndexedDB rubato → inutile senza master password + autenticatore fisico
 * - PRF output non è estraibile dall'autenticatore
 * - La DSK in IndexedDB è cifrata con il PRF output: inutilizzabile senza il device
 */

const RP_NAME = 'OwnVault';
const RP_ID = window.location.hostname;
const USER_ID = 'ownvault-user';
const USER_NAME = 'OwnVault User';

// Input fisso per la PRF extension — deterministico per lo stesso credenziale
const PRF_EVAL_INPUT = new TextEncoder().encode('OwnVault-device-secret-v1');

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

    // ========================================
    // REGISTRAZIONE E AUTENTICAZIONE CON PRF
    // ========================================

    /**
     * Registra una credenziale WebAuthn con l'estensione PRF abilitata,
     * poi ottiene subito il PRF output tramite una authenticate().
     *
     * Perché due chiamate:
     *   - create() può restituire prf.results.first ma molte implementazioni
     *     (Chrome su Windows Hello, macOS) lo omettono e ritornano solo prf.enabled=true.
     *   - L'output PRF reale è garantito solo da get() (authentication).
     *   Quindi dopo la registrazione eseguiamo subito un'autenticazione per
     *   ottenere l'output PRF deterministico.
     *
     * L'utente vedrà due richieste biometriche consecutive:
     *   1. Registrazione (create)
     *   2. Autenticazione per ottenere l'output PRF (get)
     *
     * Ritorna:
     *   { credentialId, prfOutput: Uint8Array, prfSupported: bool, registeredAt, version: 3 }
     */
    async registerWithPRF() {
        if (!this.isSupported) throw new Error('WebAuthn not supported');

        try {
            // ---- Step 1: crea il credenziale con PRF extension ----
            const challenge = new Uint8Array(32);
            crypto.getRandomValues(challenge);

            const credential = await navigator.credentials.create({
                publicKey: {
                    challenge,
                    rp: { name: RP_NAME, id: RP_ID },
                    user: {
                        id: new TextEncoder().encode(USER_ID),
                        name: USER_NAME,
                        displayName: USER_NAME
                    },
                    pubKeyCredParams: [
                        { type: 'public-key', alg: -7 },
                        { type: 'public-key', alg: -257 }
                    ],
                    authenticatorSelection: {
                        authenticatorAttachment: 'platform',
                        userVerification: 'required',
                        // residentKey: 'required' forza un credential residente sul dispositivo.
                        // È il prerequisito per PRF su Android: i passkey cloud (Google Password
                        // Manager) non supportano l'estensione PRF. Con 'required' il passkey
                        // viene sempre salvato localmente e PRF funziona correttamente.
                        residentKey: 'required'
                    },
                    timeout: 60000,
                    attestation: 'none',
                    extensions: {
                        prf: { eval: { first: PRF_EVAL_INPUT } }
                    }
                }
            });

            if (!credential) throw new Error('Failed to create credential');

            const credentialId = this.arrayBufferToBase64(credential.rawId);
            const transports = credential.response.getTransports?.() ?? ['internal'];

            // ---- Verifica PRF dopo create() ----
            // Se prf.enabled non è true, il credential non supporta PRF:
            // saltiamo il secondo prompt biometrico e segnaliamo il fallback.
            const createPrfResult = credential.getClientExtensionResults?.()?.prf;
            if (!createPrfResult?.enabled) {
                return {
                    version: 3,
                    credentialId,
                    transports,
                    prfOutput: null,
                    prfSupported: false,
                    registeredAt: Date.now()
                };
            }

            // ---- Step 2: ottieni l'output PRF tramite get() ----
            // create() non restituisce prf.results.first (solo prf.enabled=true).
            // L'output deterministico è disponibile solo durante l'autenticazione.
            const authResult = await this.authenticateWithPRF(credentialId, ['internal']);

            return {
                version: 3,
                credentialId,
                transports,
                prfOutput: authResult.prfOutput,
                prfSupported: !!authResult.prfOutput,
                registeredAt: Date.now()
            };
        } catch (error) {
            if (error.name === 'NotAllowedError') throw new Error('Biometric registration cancelled or denied');
            if (error.name === 'NotSupportedError') throw new Error('Biometric authentication not supported on this device');
            throw new Error('Failed to register biometric: ' + error.message);
        }
    }

    /**
     * Autentica l'utente e ottiene l'output PRF del credenziale.
     * L'output PRF serve per sbloccare la DSK conservata in IndexedDB.
     *
     * Ritorna:
     *   { success: true, prfOutput: Uint8Array }
     *   { success: false, prfOutput: null }  — se PRF non supportata dal device
     */
    async authenticateWithPRF(credentialId) {
        if (!this.isSupported) throw new Error('WebAuthn not supported');
        if (!credentialId) throw new Error('No biometric credentials configured');

        try {
            const challenge = new Uint8Array(32);
            crypto.getRandomValues(challenge);

            const credentialDescriptor = {
                type: 'public-key',
                id: this.base64ToArrayBuffer(credentialId),
                // I credential PRF sono sempre platform/internal (residentKey: 'required').
                // Forzare ['internal'] evita il picker cross-device di Chrome su Windows/Android.
                transports: ['internal']
            };

            const assertion = await navigator.credentials.get({
                publicKey: {
                    challenge,
                    rpId: RP_ID,
                    allowCredentials: [credentialDescriptor],
                    userVerification: 'required',
                    timeout: 60000,
                    extensions: {
                        prf: { eval: { first: PRF_EVAL_INPUT } }
                    }
                }
            });

            const prfResult = assertion.getClientExtensionResults()?.prf;
            const prfOutput = prfResult?.results?.first
                ? new Uint8Array(prfResult.results.first)
                : null;

            return { success: !!assertion, prfOutput };
        } catch (error) {
            if (error.name === 'NotAllowedError') throw new Error('Biometric authentication cancelled or denied');
            if (error.name === 'InvalidStateError') throw new Error('Biometric credential not found. Please re-enable biometrics.');
            throw new Error('Biometric authentication failed: ' + error.message);
        }
    }

    // ========================================
    // REGISTRAZIONE WEBAUTHN (legacy 2FA)
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
