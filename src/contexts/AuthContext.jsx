/**
 * Authentication Context
 * Gestisce lo stato di login/unlock globale
 * 
 * INTEGRITY: dopo l'unlock, verifica l'HMAC del database.
 * Se l'HMAC non corrisponde, segnala manomissione.
 */

import { createContext, useContext, useState, useEffect } from 'react';
import { cryptoService } from '../services/cryptoService';
import { databaseService } from '../services/databaseService';
import { biometricService } from '../services/biometricService';
import { RateLimiter, AutoLockTimer, securityLog } from '../services/securityUtils';
import { useRef, useCallback } from 'react';

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
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [userExists, setUserExists] = useState(false);
    const [integrityError, setIntegrityError] = useState(null);
    const [biometricEnabled, setBiometricEnabled] = useState(false);
    const [biometricAvailable, setBiometricAvailable] = useState(false);
    const [showBiometricSetup, setShowBiometricSetup] = useState(false);

    // Auto-lock: timeout in ms (default 5 minuti, 0 = disabilitato)
    const [autoLockTimeout, setAutoLockTimeout] = useState(300000);
    const autoLockTimer = useRef(null);
    const backgroundSince = useRef(null); // Timestamp di quando l'app è andata in background

    // Funzione di lock stabile (non ricreata ad ogni render)
    const performAutoLock = useCallback(() => {
        securityLog('Auto-lock triggered after inactivity');
        cryptoService.lock();
        setIsUnlocked(false);
        setIntegrityError(null);
    }, []);

    // Gestione auto-lock: avvia/ferma timer e listener su interazione utente
    useEffect(() => {
        // Pulisci timer precedente se esiste
        if (autoLockTimer.current) {
            autoLockTimer.current.stop();
            autoLockTimer.current = null;
        }
        backgroundSince.current = null;

        // Attiva solo se sbloccato e timeout > 0
        if (!isUnlocked || autoLockTimeout <= 0) {
            return;
        }

        // Crea nuovo timer
        const timer = new AutoLockTimer(autoLockTimeout, performAutoLock);
        autoLockTimer.current = timer;
        timer.reset();

        // Eventi che indicano attività dell'utente
        const activityEvents = [
            'mousedown', 'mousemove', 'keydown',
            'scroll', 'touchstart', 'pointerdown', 'click'
        ];

        const handleActivity = () => {
            if (autoLockTimer.current?.isActive) {
                autoLockTimer.current.reset();
            }
        };

        // Visibilità della pagina: approccio basato su timestamp
        // Funziona anche su iOS/Android dove i timer JS vengono sospesi in background
        const handleVisibilityChange = () => {
            if (document.hidden) {
                // App va in background → salva il timestamp
                backgroundSince.current = Date.now();
                // Ferma il timer (tanto verrebbe sospeso dal browser)
                if (autoLockTimer.current) {
                    autoLockTimer.current.stop();
                }
            } else {
                // App torna in foreground → controlla quanto tempo è passato
                if (backgroundSince.current) {
                    const elapsed = Date.now() - backgroundSince.current;
                    const bgTimeout = Math.min(autoLockTimeout, 60000); // max 60s in background

                    if (elapsed >= bgTimeout) {
                        // Tempo scaduto in background → lock immediato
                        securityLog('Auto-lock triggered (app was in background)', {
                            elapsedMs: elapsed,
                            bgTimeoutMs: bgTimeout
                        });
                        performAutoLock();
                        return;
                    }
                }
                backgroundSince.current = null;

                // Non ancora scaduto → riavvia il timer normale
                if (autoLockTimer.current) {
                    autoLockTimer.current.reset();
                }
            }
        };

        activityEvents.forEach(event => {
            window.addEventListener(event, handleActivity, { passive: true });
        });
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Cleanup
        return () => {
            timer.stop();
            activityEvents.forEach(event => {
                window.removeEventListener(event, handleActivity);
            });
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isUnlocked, autoLockTimeout, performAutoLock]);

    useEffect(() => {
        checkUserExists();
        checkBiometricStatus();
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
            // Verifica se il device supporta la biometria
            const availability = await biometricService.checkBiometricAvailability();
            setBiometricAvailable(availability.available);

            // Verifica se l'utente ha già abilitato la biometria
            const enabled = await databaseService.isBiometricEnabled();
            setBiometricEnabled(enabled);
        } catch (error) {
            console.error('Error checking biometric status:', error);
            setBiometricAvailable(false);
            setBiometricEnabled(false);
        }
    }

    /**
     * Login con biometria
     */
    async function loginWithBiometric() {
        try {
            const biometricConfig = await databaseService.getBiometricConfig();
            if (!biometricConfig) {
                return { success: false, error: 'Biometric not configured' };
            }

            securityLog('Biometric login attempt');

            // Autentica con biometria e ottieni la BUK
            const authResult = await biometricService.authenticateBiometric(biometricConfig);

            if (!authResult.success) {
                return { success: false, error: 'Biometric authentication failed' };
            }

            // La BUK deve corrispondere alla DEK derivata
            // Dobbiamo ricostruire la DEK usando la BUK come riferimento
            // In realtà la BUK è derivata dalla DEK, quindi dobbiamo:
            // 1. Usare la BUK per verificare che corrisponda
            // 2. Caricare la DEK cifrata e decifrarla usando il KEK derivato dalla password

            // IMPORTANTE: Per il login biometrico, dobbiamo salvare la DEK cifrata
            // con una chiave derivata dalla BUK stessa durante l'abilitazione
            // Questo è il passo mancante - lo implementeremo nella funzione di abilitazione

            // Per ora, verifichiamo che la biometria funzioni e decifriamo la DEK
            const cryptoConfig = await databaseService.getCryptoConfig();

            // Recuperiamo la DEK cifrata con la BUK
            if (!biometricConfig.encryptedDEK || !biometricConfig.dekIV) {
                return { success: false, error: 'Invalid biometric configuration' };
            }

            // Importa la BUK come chiave AES
            const bukKey = await crypto.subtle.importKey(
                'raw',
                authResult.biometricUnlockKey,
                { name: 'AES-GCM' },
                false,
                ['decrypt']
            );

            // Decifra la DEK
            const encryptedDEK = biometricService.base64ToArrayBuffer(biometricConfig.encryptedDEK);
            const dekIV = biometricService.base64ToArrayBuffer(biometricConfig.dekIV);

            const dekBytes = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: dekIV },
                bukKey,
                encryptedDEK
            );

            // Imposta la DEK nel cryptoService
            cryptoService.dek = new Uint8Array(dekBytes);
            cryptoService.integrityKey = await cryptoService.deriveIntegrityKey(cryptoService.dek);
            cryptoService.isUnlocked = true;

            securityLog('Biometric login successful');

            // Verifica integrità
            const integrityResult = await verifyDatabaseIntegrity();

            if (!integrityResult.valid && !integrityResult.firstRun) {
                securityLog('INTEGRITY VIOLATION DETECTED', {
                    reason: integrityResult.reason
                });
                setIntegrityError(integrityResult.reason);
            }

            if (integrityResult.firstRun) {
                await refreshHMAC();
                securityLog('HMAC generated on first run after update');
            }

            setIsUnlocked(true);
            return { success: true, integrityWarning: integrityResult.valid ? null : integrityResult.reason };
        } catch (error) {
            securityLog('Biometric login error', { error: error.message });
            console.error('Biometric login error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Setup: prima volta, crea password master
     */
    async function setupMasterPassword(password) {
        try {
            const cryptoConfig = await cryptoService.setupMasterPassword(password);
            await databaseService.saveCryptoConfig(cryptoConfig);

            // Calcola e salva HMAC iniziale (DB vuoto, 0 profili)
            const profiles = await databaseService.getAllProfiles();
            const hmac = await cryptoService.computeHMAC(cryptoConfig, profiles);
            await databaseService.saveHMAC(hmac);
            securityLog('HMAC initialized on first setup');

            setIsUnlocked(true);
            setUserExists(true);

            // Mostra prompt per abilitare biometria se disponibile
            if (biometricAvailable) {
                setShowBiometricSetup(true);
            }

            return { success: true };
        } catch (error) {
            console.error('Setup error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Login: sblocca con password + verifica integrità
     */
    async function login(password) {
        if (!rateLimiter.current.canAttempt()) {
            const retryAfter = rateLimiter.current.getRetryAfter();
            securityLog('Login blocked - rate limit exceeded', { retryAfter });
            return {
                success: false,
                error: `Troppi tentativi. Riprova tra ${retryAfter} secondi`
            };
        }

        try {
            const cryptoConfig = await databaseService.getCryptoConfig();
            if (!cryptoConfig) {
                return { success: false, error: 'No user found' };
            }

            const unlocked = await cryptoService.unlock(password, cryptoConfig);

            if (unlocked) {
                rateLimiter.current.reset();
                securityLog('Login successful');

                // ===== VERIFICA INTEGRITÀ =====
                const integrityResult = await verifyDatabaseIntegrity();

                if (!integrityResult.valid && !integrityResult.firstRun) {
                    // MANOMISSIONE RILEVATA
                    securityLog('INTEGRITY VIOLATION DETECTED', {
                        reason: integrityResult.reason
                    });
                    setIntegrityError(integrityResult.reason);
                    // Sblocca comunque — l'utente deve poter accedere ai dati
                    // ma viene avvisato del tampering
                }

                if (integrityResult.firstRun) {
                    // Primo avvio dopo aggiornamento: genera HMAC
                    await refreshHMAC();
                    securityLog('HMAC generated on first run after update');
                }

                setIsUnlocked(true);
                return { success: true, integrityWarning: integrityResult.valid ? null : integrityResult.reason };
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
     * Verifica integrità del database.
     * Confronta l'HMAC salvato con quello calcolato sullo stato attuale.
     */
    async function verifyDatabaseIntegrity() {
        try {
            const cryptoConfig = await databaseService.getCryptoConfig();
            const profiles = await databaseService.getAllProfiles();
            const storedHmac = await databaseService.getHMAC();

            return await cryptoService.verifyHMAC(storedHmac, cryptoConfig, profiles);
        } catch (error) {
            securityLog('Integrity check error', { error: error.message });
            return { valid: false, reason: `Check failed: ${error.message}` };
        }
    }

    /**
     * Ricalcola e salva l'HMAC.
     * DA CHIAMARE dopo ogni operazione che modifica il DB:
     * - saveProfile, deleteProfile, importData
     */
    async function refreshHMAC() {
        try {
            const cryptoConfig = await databaseService.getCryptoConfig();
            const profiles = await databaseService.getAllProfiles();
            const hmac = await cryptoService.computeHMAC(cryptoConfig, profiles);
            await databaseService.saveHMAC(hmac);
            securityLog('HMAC refreshed');
        } catch (error) {
            securityLog('HMAC refresh failed', { error: error.message });
            console.error('Failed to refresh HMAC:', error);
        }
    }

    /**
     * Logout: lock del sistema
     */
    function logout() {
        if (autoLockTimer.current) {
            autoLockTimer.current.stop();
        }
        cryptoService.lock();
        setIsUnlocked(false);
        setIntegrityError(null);
    }

    /**
     * Reset completo (elimina tutto)
     */
    async function resetAll() {
        try {
            await databaseService.deleteAllData();
            cryptoService.lock();
            setIsUnlocked(false);
            setUserExists(false);
            setIntegrityError(null);
            return { success: true };
        } catch (error) {
            console.error('Reset error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Dismissa l'avviso di integrità (l'utente ha preso atto)
     */
    function dismissIntegrityError() {
        setIntegrityError(null);
    }

    /**
     * Abilita autenticazione biometrica
     * Deve essere chiamata quando il sistema è sbloccato (DEK disponibile)
     */
    async function enableBiometric() {
        if (!cryptoService.isUnlocked || !cryptoService.dek) {
            return { success: false, error: 'System must be unlocked first' };
        }

        if (!biometricAvailable) {
            return { success: false, error: 'Biometric authentication not available on this device' };
        }

        try {
            securityLog('Enabling biometric authentication');

            // 1. Registra credenziali WebAuthn e ottieni la configurazione base
            const biometricConfig = await biometricService.registerBiometric(cryptoService.dek);

            // 2. Cifra la DEK con la BUK per il login futuro
            // Deriva la BUK dalla DEK
            const buk = await biometricService.deriveBiometricUnlockKey(cryptoService.dek);

            // Esporta la DEK
            const dekRaw = cryptoService.dek;

            // Genera IV per cifrare la DEK
            const dekIV = new Uint8Array(12);
            crypto.getRandomValues(dekIV);

            // Cifra la DEK con la BUK
            const encryptedDEK = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: dekIV },
                buk,
                dekRaw
            );

            // 3. Salva la configurazione completa
            const completeBiometricConfig = {
                ...biometricConfig,
                encryptedDEK: biometricService.arrayBufferToBase64(encryptedDEK),
                dekIV: biometricService.arrayBufferToBase64(dekIV)
            };

            await databaseService.saveBiometricConfig(completeBiometricConfig);
            setBiometricEnabled(true);
            setShowBiometricSetup(false);

            securityLog('Biometric authentication enabled');

            return { success: true };
        } catch (error) {
            securityLog('Failed to enable biometric', { error: error.message });
            console.error('Enable biometric error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Disabilita autenticazione biometrica
     */
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

    /**
     * Chiude il dialog di setup biometrico senza abilitare
     */
    function skipBiometricSetup() {
        setShowBiometricSetup(false);
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
        setupMasterPassword,
        login,
        loginWithBiometric,
        logout,
        resetAll,
        checkUserExists,
        checkBiometricStatus,
        enableBiometric,
        disableBiometric,
        skipBiometricSetup,
        refreshHMAC,
        dismissIntegrityError
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}