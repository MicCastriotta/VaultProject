/**
 * Authentication Context
 * Gestisce lo stato di login/unlock globale.
 *
 * INTEGRITY: dopo l'unlock, verifica l'HMAC del database.
 * Se l'HMAC non corrisponde, segnala manomissione.
 *
 * DEVICE SECRET KEY (DSK):
 * Quando abilitata, il vault è cifrato con HKDF(PBKDF2(password), DSK).
 * Senza la DSK (o l'autenticatore biometrico che la avvolge), la master
 * password da sola non è sufficiente a decifrare il vault.
 *
 * Flussi login:
 *   1. DSK non abilitata → login normale con sola password
 *   2. DSK abilitata + DSK disponibile localmente
 *        → autenticazione biometrica con PRF → unwrap DSK → unlock
 *   3. DSK abilitata + DSK NON disponibile localmente (nuovo device / import)
 *        → loginRequiresRecoveryKey = true
 *        → loginWithRecoveryKey(password, recoveryKey) oppure
 *        → loginWithApprovedDSK(password, dskBytes) dopo device approval QR
 */

import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { cryptoService } from '../services/cryptoService';
import { databaseService } from '../services/databaseService';
import { biometricService } from '../services/biometricService';
import { deviceSecretService } from '../services/deviceSecretService';
import { RateLimiter, AutoLockTimer, securityLog } from '../services/securityUtils';
import { hibpService } from '../services/hibpService';
import { healthCache } from '../services/healthCacheService';
import { googleDriveService } from '../services/googledriveService';

const AuthContext = createContext();

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
}

export function AuthProvider({ children }) {
    const rateLimiter = useRef(new RateLimiter(5, 300000));
    const [isUnlocked, setIsUnlocked]             = useState(false);
    const [isLoading, setIsLoading]               = useState(true);
    const [userExists, setUserExists]             = useState(false);
    const [integrityError, setIntegrityError]     = useState(null);
    const [biometricEnabled, setBiometricEnabled] = useState(false);
    const [biometricAvailable, setBiometricAvailable] = useState(false);
    const [showBiometricSetup, setShowBiometricSetup] = useState(false);

    // Device Secret Key
    const [deviceSecretEnabled, setDeviceSecretEnabled]                   = useState(false);
    const [deviceSecretLocallyAvailable, setDeviceSecretLocallyAvailable] = useState(false);
    // true = il login richiede la recovery key (DSK abilitata ma non disponibile localmente)
    const [loginRequiresRecoveryKey, setLoginRequiresRecoveryKey]         = useState(false);
    // Viene impostata dopo enableDeviceSecret() — mostrata UNA sola volta all'utente
    const [pendingRecoveryKey, setPendingRecoveryKey]                     = useState(null);

    // Auto-lock
    const [autoLockTimeout, setAutoLockTimeout] = useState(300000);
    const autoLockTimer   = useRef(null);
    const backgroundSince = useRef(null);

    const performAutoLock = useCallback(() => {
        securityLog('Auto-lock triggered after inactivity');
        cryptoService.lock();
        healthCache.clear();
        setIsUnlocked(false);
        setIntegrityError(null);
    }, []);

    // Auto-lock: timer e listener visibilità
    useEffect(() => {
        if (autoLockTimer.current) {
            autoLockTimer.current.stop();
            autoLockTimer.current = null;
        }
        backgroundSince.current = null;

        if (!isUnlocked || autoLockTimeout <= 0) return;

        const timer = new AutoLockTimer(autoLockTimeout, performAutoLock);
        autoLockTimer.current = timer;
        timer.reset();

        const activityEvents = [
            'mousedown', 'mousemove', 'keydown',
            'scroll', 'touchstart', 'pointerdown', 'click'
        ];
        const handleActivity = () => {
            if (autoLockTimer.current?.isActive) autoLockTimer.current.reset();
        };

        const handleVisibilityChange = () => {
            if (document.hidden) {
                backgroundSince.current = Date.now();
                autoLockTimer.current?.stop();
            } else {
                if (backgroundSince.current) {
                    const elapsed = Date.now() - backgroundSince.current;
                    const bgTimeout = Math.min(autoLockTimeout, 60000);
                    if (elapsed >= bgTimeout) {
                        securityLog('Auto-lock triggered (app was in background)', { elapsedMs: elapsed });
                        performAutoLock();
                        return;
                    }
                }
                backgroundSince.current = null;
                autoLockTimer.current?.reset();
            }
        };

        activityEvents.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            timer.stop();
            activityEvents.forEach(e => window.removeEventListener(e, handleActivity));
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isUnlocked, autoLockTimeout, performAutoLock]);

    useEffect(() => {
        checkUserExists();
        checkBiometricStatus();
        checkDeviceSecretStatus();
    }, []);

    async function checkUserExists() {
        setIsLoading(true);
        try {
            const exists = await databaseService.userExists();
            setUserExists(exists);
        } catch (error) {
            console.error('Error checking user existence:', error);
        } finally {
            setIsLoading(false);
        }
    }

    async function checkBiometricStatus() {
        try {
            const availability = await biometricService.checkBiometricAvailability();
            setBiometricAvailable(availability.available);
            const enabled = await databaseService.isBiometricEnabled();
            setBiometricEnabled(enabled);
        } catch (error) {
            console.error('Error checking biometric status:', error);
            setBiometricAvailable(false);
            setBiometricEnabled(false);
        }
    }

    /**
     * Aggiorna i flag relativi alla device secret key.
     * Chiamato all'avvio e dopo ogni operazione che li modifica.
     */
    async function checkDeviceSecretStatus() {
        try {
            const cryptoConfig = await databaseService.getCryptoConfig();
            const enabled = !!cryptoConfig?.deviceSecretEnabled;
            setDeviceSecretEnabled(enabled);

            if (enabled) {
                const locallyAvailable = await databaseService.isDeviceSecretLocallyAvailable();
                setDeviceSecretLocallyAvailable(locallyAvailable);
                setLoginRequiresRecoveryKey(!locallyAvailable);
            } else {
                setDeviceSecretLocallyAvailable(false);
                setLoginRequiresRecoveryKey(false);
            }
        } catch (error) {
            console.error('Error checking device secret status:', error);
        }
    }

    // ========================================
    // SETUP (prima volta)
    // ========================================

    async function setupMasterPassword(password) {
        try {
            const cryptoConfig = await cryptoService.setupMasterPassword(password);
            await databaseService.saveCryptoConfig(cryptoConfig);

            const profiles    = await databaseService.getAllProfiles();
            const attachments = await databaseService.getAllAttachments();
            const hmac        = await cryptoService.computeHMAC(cryptoConfig, profiles, attachments);
            await databaseService.saveHMAC(hmac);
            securityLog('HMAC initialized on first setup');

            setIsUnlocked(true);
            setUserExists(true);

            return { success: true };
        } catch (error) {
            console.error('Setup error:', error);
            return { success: false, error: error.message };
        }
    }

    // ========================================
    // LOGIN
    // ========================================

    /**
     * Login con sola master password.
     *
     * Se la DSK è abilitata e disponibile localmente, attiva automaticamente
     * il flusso biometrico + PRF. Se la DSK è abilitata ma non disponibile
     * localmente, ritorna { success: false, needsRecoveryKey: true }.
     */
    async function login(password) {
        if (!rateLimiter.current.canAttempt()) {
            const retryAfter = rateLimiter.current.getRetryAfter();
            securityLog('Login blocked - rate limit exceeded', { retryAfter });
            return { success: false, error: `Troppi tentativi. Riprova tra ${retryAfter} secondi` };
        }

        try {
            const cryptoConfig = await databaseService.getCryptoConfig();
            if (!cryptoConfig) return { success: false, error: 'No user found' };

            // === FLUSSO CON DEVICE SECRET KEY ===
            if (cryptoConfig.deviceSecretEnabled) {
                // Sincronizza lo state — potrebbe essere stale dopo import senza reload
                setDeviceSecretEnabled(true);

                const locallyAvailable = await databaseService.isDeviceSecretLocallyAvailable();

                if (!locallyAvailable) {
                    // Nuovo device o dopo import: richiede recovery key
                    setLoginRequiresRecoveryKey(true);
                    return { success: false, needsRecoveryKey: true };
                }

                // DSK disponibile → biometria + PRF
                const biometricConfig = await databaseService.getBiometricConfig();
                if (!biometricConfig?.credentialId) {
                    setLoginRequiresRecoveryKey(true);
                    return { success: false, needsRecoveryKey: true };
                }

                let prfOutput;
                try {
                    const prfResult = await biometricService.authenticateWithPRF(biometricConfig.credentialId, biometricConfig.transports);
                    if (!prfResult.success || !prfResult.prfOutput) {
                        cryptoService.lock();
                        return { success: false, error: 'Biometric authentication failed' };
                    }
                    prfOutput = prfResult.prfOutput;
                } catch (bioError) {
                    cryptoService.lock();
                    const isCancelled = bioError.message.includes('cancelled') || bioError.message.includes('denied');
                    return { success: false, error: isCancelled ? 'Biometric cancelled' : bioError.message };
                }

                // Unwrap DSK
                const deviceSecretRecord = await databaseService.getDeviceSecret();
                let dskBytes;
                try {
                    dskBytes = await deviceSecretService.unwrapDSKWithPRF(
                        deviceSecretRecord.wrappedDSK,
                        deviceSecretRecord.wrapIv,
                        prfOutput
                    );
                } catch {
                    return { success: false, error: 'Device secret decryption failed' };
                }

                // Unlock con DSK
                const unlocked = await cryptoService.unlockWithDSK(password, cryptoConfig, dskBytes);
                dskBytes.fill(0); // zero out

                if (!unlocked) {
                    rateLimiter.current.recordAttempt();
                    return { success: false, error: 'Password errata' };
                }

                rateLimiter.current.reset();
                securityLog('Login successful (DSK path)');
                return await _finalizeLogin();
            }

            // === FLUSSO LEGACY (senza DSK) ===
            const unlocked = await cryptoService.unlock(password, cryptoConfig);

            if (unlocked) {
                rateLimiter.current.reset();
                securityLog('Login successful');

                // 2FA biometrico legacy (solo gate UI, nessuna chiave)
                if (biometricEnabled) {
                    const biometricConfig = await databaseService.getBiometricConfig();
                    // Solo credenziali v2 (non v3 che usano PRF+DSK)
                    if (biometricConfig?.version !== 3) {
                        try {
                            const authResult = await biometricService.authenticateBiometric(biometricConfig);
                            if (!authResult.success) {
                                cryptoService.lock();
                                return { success: false, error: 'Biometric authentication failed' };
                            }
                            securityLog('Biometric 2FA passed');
                        } catch (bioError) {
                            cryptoService.lock();
                            const isCancelled = bioError.message.includes('cancelled') || bioError.message.includes('denied');
                            return { success: false, error: isCancelled ? 'Biometric cancelled' : bioError.message };
                        }
                    }
                }

                return await _finalizeLogin();
            } else {
                rateLimiter.current.recordAttempt();
                securityLog('Login failed - wrong password', {
                    attemptsRemaining: 5 - rateLimiter.current.attempts.length
                });
                return { success: false, error: 'Password errata' };
            }
        } catch (error) {
            rateLimiter.current.recordAttempt();
            securityLog('Login error', { error: error.message });
            return { success: false, error: error.message };
        }
    }

    /**
     * Login con recovery key (nuovo device o dopo import con DSK).
     * Dopo il successo, offre di iscrivere la biometria PRF per i login futuri.
     */
    async function loginWithRecoveryKey(password, recoveryKey) {
        if (!rateLimiter.current.canAttempt()) {
            const retryAfter = rateLimiter.current.getRetryAfter();
            return { success: false, error: `Troppi tentativi. Riprova tra ${retryAfter} secondi` };
        }

        try {
            const dskBytes = deviceSecretService.parseRecoveryKey(recoveryKey);
            if (!dskBytes) {
                return { success: false, error: 'Formato recovery key non valido' };
            }

            const cryptoConfig = await databaseService.getCryptoConfig();
            if (!cryptoConfig) return { success: false, error: 'No user found' };

            const unlocked = await cryptoService.unlockWithDSK(password, cryptoConfig, dskBytes);

            if (!unlocked) {
                rateLimiter.current.recordAttempt();
                return { success: false, error: 'Password o recovery key errata' };
            }

            rateLimiter.current.reset();
            securityLog('Login successful (recovery key path)');
            setDeviceSecretEnabled(true);          // vault ha DSK — sincronizza state stale
            setDeviceSecretLocallyAvailable(false); // DSK non avvolta localmente su questo device
            setLoginRequiresRecoveryKey(false);

            const result = await _finalizeLogin();
            return { ...result, offerBiometricEnrollment: true, dskBytes };
        } catch (error) {
            rateLimiter.current.recordAttempt();
            return { success: false, error: error.message };
        }
    }

    /**
     * Login con DSK ottenuta via QR device approval.
     */
    async function loginWithApprovedDSK(password, dskBytes) {
        if (!rateLimiter.current.canAttempt()) {
            const retryAfter = rateLimiter.current.getRetryAfter();
            return { success: false, error: `Troppi tentativi. Riprova tra ${retryAfter} secondi` };
        }

        try {
            const cryptoConfig = await databaseService.getCryptoConfig();
            if (!cryptoConfig) return { success: false, error: 'No user found' };

            const unlocked = await cryptoService.unlockWithDSK(password, cryptoConfig, dskBytes);

            if (!unlocked) {
                rateLimiter.current.recordAttempt();
                return { success: false, error: 'Password o chiave dispositivo errata' };
            }

            rateLimiter.current.reset();
            securityLog('Login successful (QR approval path)');
            setDeviceSecretEnabled(true);          // vault ha DSK — sincronizza state stale
            setDeviceSecretLocallyAvailable(false); // DSK non avvolta localmente su questo device
            setLoginRequiresRecoveryKey(false);

            const result = await _finalizeLogin();
            return { ...result, offerBiometricEnrollment: true, dskBytes };
        } catch (error) {
            rateLimiter.current.recordAttempt();
            return { success: false, error: error.message };
        }
    }

    /** Passi comuni di finalizzazione dopo un unlock riuscito. */
    async function _finalizeLogin() {
        const integrityResult = await verifyDatabaseIntegrity();

        if (!integrityResult.valid && !integrityResult.firstRun) {
            securityLog('INTEGRITY VIOLATION DETECTED', { reason: integrityResult.reason });
            setIntegrityError(integrityResult.reason);
        }

        if (integrityResult.firstRun) {
            await refreshHMAC();
            securityLog('HMAC generated on first run after update');
        }

        setIsUnlocked(true);
        return { success: true, integrityWarning: integrityResult.valid ? null : integrityResult.reason };
    }

    // ========================================
    // INTEGRITY
    // ========================================

    async function verifyDatabaseIntegrity() {
        try {
            const cryptoConfig = await databaseService.getCryptoConfig();
            const profiles    = await databaseService.getAllProfiles();
            const attachments = await databaseService.getAllAttachments();
            const storedRecord = await databaseService.getHMAC();
            return await cryptoService.verifyHMAC(storedRecord, cryptoConfig, profiles, attachments);
        } catch (error) {
            securityLog('Integrity check error', { error: error.message });
            return { valid: false, reason: `Check failed: ${error.message}` };
        }
    }

    async function refreshHMAC() {
        try {
            const cryptoConfig = await databaseService.getCryptoConfig();
            const profiles    = await databaseService.getAllProfiles();
            const attachments = await databaseService.getAllAttachments();
            const hmac = await cryptoService.computeHMAC(cryptoConfig, profiles, attachments);
            await databaseService.saveHMAC(hmac);
            securityLog('HMAC refreshed');
        } catch (error) {
            securityLog('HMAC refresh failed', { error: error.message });
            console.error('Failed to refresh HMAC:', error);
        }
    }

    // ========================================
    // DEVICE SECRET KEY — abilitazione
    // ========================================

    /**
     * Abilita la Device Secret Key:
     *   1. Registra un nuovo credenziale WebAuthn con estensione PRF
     *   2. Genera la DSK
     *   3. Re-cifra il vault DEK con HKDF(PBKDF2(password), DSK)
     *   4. Salva la DSK avvolta con il PRF output in IndexedDB
     *   5. Rigenera HMAC (encryptedDEK è cambiato)
     *
     * Richiede la master password per re-cifrare il vault.
     * Ritorna { success: true, recoveryKey: string } oppure { success: false, error }.
     */
    async function enableDeviceSecret(password) {
        if (!cryptoService.isUnlocked) {
            return { success: false, error: 'Il vault deve essere sbloccato' };
        }
        if (!biometricAvailable) {
            return { success: false, error: 'Autenticazione biometrica non disponibile su questo dispositivo' };
        }

        try {
            securityLog('Enabling device secret key');

            // 1. Registra credenziale WebAuthn con PRF
            const regResult = await biometricService.registerWithPRF();

            if (!regResult.prfSupported || !regResult.prfOutput) {
                return {
                    success: false,
                    error: 'Il tuo dispositivo non supporta la PRF extension di WebAuthn, necessaria per il Device Secret.'
                };
            }

            // 2. Genera DSK
            const dskBytes = deviceSecretService.generateDSK();
            const recoveryKey = deviceSecretService.formatRecoveryKey(dskBytes);

            // 3. Re-cifra vault DEK con DSK
            const cryptoConfig = await databaseService.getCryptoConfig();
            const { iv: newIv, encryptedDEK: newEncDEK } = await cryptoService.reencryptDEKWithDSK(
                password, cryptoConfig.salt, dskBytes
            );

            // 4. Salva biometric config (v3 con PRF)
            await databaseService.saveBiometricConfig({
                version: 3,
                credentialId: regResult.credentialId,
                transports: regResult.transports,
                registeredAt: regResult.registeredAt
            });

            // 5. Avvolge DSK con PRF output e salva
            const { wrappedDSK, wrapIv } = await deviceSecretService.wrapDSKWithPRF(
                dskBytes, regResult.prfOutput
            );
            dskBytes.fill(0); // zero out immediatamente
            await databaseService.saveDeviceSecret({ wrappedDSK, wrapIv });

            // 6. Aggiorna cryptoConfig con nuovo encryptedDEK + flag
            const updatedConfig = {
                ...cryptoConfig,
                iv: newIv,
                encryptedDEK: newEncDEK,
                deviceSecretEnabled: true
            };
            await databaseService.saveCryptoConfig(updatedConfig);

            // 7. Rigenera HMAC (encryptedDEK è cambiato)
            await refreshHMAC();

            // 8. Aggiorna stato
            setBiometricEnabled(true);
            setDeviceSecretEnabled(true);
            setDeviceSecretLocallyAvailable(true);
            setLoginRequiresRecoveryKey(false);
            setShowBiometricSetup(false);

            // La recovery key viene mostrata UNA sola volta tramite pendingRecoveryKey
            setPendingRecoveryKey(recoveryKey);

            securityLog('Device secret key enabled');
            return { success: true, recoveryKey };
        } catch (error) {
            securityLog('Failed to enable device secret', { error: error.message });
            console.error('Enable device secret error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Disabilita la Device Secret Key:
     *   1. Autentica con biometria PRF → ottieni DSK
     *   2. Re-cifra il vault DEK senza DSK (solo password)
     *   3. Rimuove deviceSecret da IndexedDB
     *   4. Rimuove il flag deviceSecretEnabled da cryptoConfig
     *   5. Rigenera HMAC
     *
     * Richiede la master password.
     */
    async function disableDeviceSecret(password) {
        if (!cryptoService.isUnlocked) {
            return { success: false, error: 'Il vault deve essere sbloccato' };
        }

        try {
            securityLog('Disabling device secret key');

            const cryptoConfig = await databaseService.getCryptoConfig();

            // 1. Re-cifra DEK senza DSK
            const { iv: newIv, encryptedDEK: newEncDEK } = await cryptoService.reencryptDEKWithoutDSK(
                password, cryptoConfig.salt
            );

            // 2. Aggiorna cryptoConfig (rimuove flag DSK)
            const { deviceSecretEnabled: _removed, ...rest } = cryptoConfig;
            const updatedConfig = { ...rest, iv: newIv, encryptedDEK: newEncDEK };
            await databaseService.saveCryptoConfig(updatedConfig);

            // 3. Rimuove device secret da IndexedDB
            await databaseService.deleteDeviceSecret();

            // 4. La biometria torna a essere 2FA legacy (o viene rimossa)
            await databaseService.deleteBiometricConfig();

            // 5. Rigenera HMAC
            await refreshHMAC();

            // 6. Aggiorna stato
            setDeviceSecretEnabled(false);
            setDeviceSecretLocallyAvailable(false);
            setLoginRequiresRecoveryKey(false);
            setBiometricEnabled(false);

            securityLog('Device secret key disabled');
            return { success: true };
        } catch (error) {
            securityLog('Failed to disable device secret', { error: error.message });
            console.error('Disable device secret error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Iscrivi la biometria PRF su un nuovo device dopo recovery key o QR approval.
     * Chiama questa funzione con la DSK già in memoria (ottenuta da loginWithRecoveryKey
     * o loginWithApprovedDSK) per salvare il wrapping locale senza re-cifrare il vault.
     */
    async function enrollBiometricAfterRecovery(dskBytes) {
        if (!biometricAvailable) {
            return { success: false, error: 'Autenticazione biometrica non disponibile' };
        }

        try {
            const regResult = await biometricService.registerWithPRF();

            if (!regResult.prfSupported || !regResult.prfOutput) {
                return { success: false, error: 'Il dispositivo non supporta PRF extension' };
            }

            // Salva credenziale biometrica v3
            await databaseService.saveBiometricConfig({
                version: 3,
                credentialId: regResult.credentialId,
                transports: regResult.transports,
                registeredAt: regResult.registeredAt
            });

            // Avvolge la DSK con il nuovo PRF output di questo dispositivo
            const { wrappedDSK, wrapIv } = await deviceSecretService.wrapDSKWithPRF(
                dskBytes, regResult.prfOutput
            );
            await databaseService.saveDeviceSecret({ wrappedDSK, wrapIv });

            setBiometricEnabled(true);
            setDeviceSecretLocallyAvailable(true);
            setLoginRequiresRecoveryKey(false);
            securityLog('Biometric enrolled after recovery');
            return { success: true };
        } catch (error) {
            console.error('Enroll biometric after recovery error:', error);
            return { success: false, error: error.message };
        }
    }

    /** Chiude il dialog della recovery key (dopo che l'utente ha confermato di averla salvata). */
    function dismissRecoveryKey() {
        setPendingRecoveryKey(null);
    }

    // ========================================
    // BIOMETRIA LEGACY (solo 2FA, senza DSK)
    // ========================================

    async function enableBiometric() {
        if (!cryptoService.isUnlocked) {
            return { success: false, error: 'System must be unlocked first' };
        }
        if (!biometricAvailable) {
            return { success: false, error: 'Biometric authentication not available on this device' };
        }

        try {
            securityLog('Enabling biometric authentication (legacy 2FA)');
            const biometricConfig = await biometricService.registerBiometric();
            await databaseService.saveBiometricConfig(biometricConfig);
            setBiometricEnabled(true);
            setShowBiometricSetup(false);
            securityLog('Biometric authentication enabled');
            return { success: true };
        } catch (error) {
            securityLog('Failed to enable biometric', { error: error.message });
            return { success: false, error: error.message };
        }
    }

    async function disableBiometric() {
        try {
            await databaseService.deleteBiometricConfig();
            setBiometricEnabled(false);
            securityLog('Biometric authentication disabled');
            return { success: true };
        } catch (error) {
            console.error('Disable biometric error:', error);
            return { success: false, error: error.message };
        }
    }

    function skipBiometricSetup() {
        setShowBiometricSetup(false);
    }

    // ========================================
    // LOGOUT / RESET
    // ========================================

    async function logout() {
        if (autoLockTimer.current) autoLockTimer.current.stop();
        cryptoService.lock();
        hibpService.clearCache();
        healthCache.clear();
        setIsUnlocked(false);
        setIntegrityError(null);
        // Rilegge da IndexedDB: garantisce che loginRequiresRecoveryKey e biometricEnabled
        // siano aggiornati dopo qualsiasi operazione (import, re-enroll, disable DSK).
        await checkBiometricStatus();
        await checkDeviceSecretStatus();
    }

    async function resetAll() {
        try {
            await databaseService.deleteAllData();
            cryptoService.lock();
            healthCache.clear();
            hibpService.clearCache();
            googleDriveService.signOut();

            const keysToRemove = [
                'tutorialCompleted',
                'profileSortOrder',
                'ownvault_device_id',
                'ownvault_install_prompt_dismissed',
                '_sp_sec_rl',
                'ownvault_sync_enabled_flag',
            ];
            keysToRemove.forEach(k => localStorage.removeItem(k));

            setIsUnlocked(false);
            setUserExists(false);
            setIntegrityError(null);
            setDeviceSecretEnabled(false);
            setDeviceSecretLocallyAvailable(false);
            setLoginRequiresRecoveryKey(false);
            return { success: true };
        } catch (error) {
            console.error('Reset error:', error);
            return { success: false, error: error.message };
        }
    }

    function dismissIntegrityError() {
        setIntegrityError(null);
    }

    const value = {
        isUnlocked,
        isLoading,
        userExists,
        integrityError,
        biometricEnabled,
        biometricAvailable,
        showBiometricSetup,
        autoLockTimeout,
        setAutoLockTimeout,
        // Device Secret Key
        deviceSecretEnabled,
        deviceSecretLocallyAvailable,
        loginRequiresRecoveryKey,
        pendingRecoveryKey,
        // Funzioni
        setupMasterPassword,
        login,
        loginWithRecoveryKey,
        loginWithApprovedDSK,
        logout,
        resetAll,
        checkUserExists,
        checkBiometricStatus,
        checkDeviceSecretStatus,
        enableBiometric,
        disableBiometric,
        skipBiometricSetup,
        enableDeviceSecret,
        disableDeviceSecret,
        enrollBiometricAfterRecovery,
        dismissRecoveryKey,
        refreshHMAC,
        dismissIntegrityError
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
