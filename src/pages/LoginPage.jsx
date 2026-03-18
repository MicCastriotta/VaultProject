/**
 * Login Page
 * Unlock con password o biometria.
 *
 * Gestisce tre flussi di login:
 *   1. Standard      : solo master password
 *   2. Recovery Key  : master password + recovery key OV-XXXX (DSK abilitata, nuovo device)
 *   3. Device QR     : approvazione da vecchio device via QR+PIN
 */

import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, AlertTriangle, KeyRound, QrCode, Fingerprint } from 'lucide-react';
import { DeviceApprovalReceiver } from '../components/DeviceApprovalDialog';

export function LoginPage() {
    const {
        login,
        loginWithRecoveryKey,
        loginWithApprovedDSK,
        enrollBiometricAfterRecovery,
        biometricEnabled,
        biometricAvailable,
        loginRequiresRecoveryKey,
        deviceSecretEnabled
    } = useAuth();
    const { t } = useTranslation();

    const [password, setPassword]     = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [recoveryKey, setRecoveryKey]   = useState('');
    const [isLoading, setIsLoading]       = useState(false);
    const [error, setError]               = useState('');

    // Dopo recovery/QR: offrire iscrizione biometria
    const [offerBiometric, setOfferBiometric]       = useState(false);
    const [pendingDSKBytes, setPendingDSKBytes]      = useState(null);
    const [isEnrolling, setIsEnrolling]             = useState(false);

    // QR device approval (receiver)
    const [showQRApproval, setShowQRApproval]       = useState(false);

    const version = __APP_VERSION__;

    // Determina se mostrare il campo recovery key:
    // - se il server ci ha detto che serve (loginRequiresRecoveryKey)
    // - oppure se l'utente ha già scelto di usarla
    const showRecoveryKeyField = loginRequiresRecoveryKey || (deviceSecretEnabled && recoveryKey.length > 0);

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');

        if (!password) {
            setError(t('auth.requiredField'));
            return;
        }

        setIsLoading(true);

        try {
            let result;

            if (loginRequiresRecoveryKey || recoveryKey.trim()) {
                if (!recoveryKey.trim()) {
                    setError(t('deviceSecret.login.recoveryKeyRequired'));
                    return;
                }
                result = await loginWithRecoveryKey(password, recoveryKey.trim());
            } else {
                result = await login(password);
            }

            if (result?.needsRecoveryKey) {
                // login() ci ha detto che serve la recovery key
                setError(t('deviceSecret.login.recoveryKeyNeeded'));
                return;
            }

            if (!result.success) {
                setError(result.error === 'Wrong password' ? t('auth.wrongPassword') : result.error);
                return;
            }

            // Se il login ha restituito dskBytes (da recovery o QR), offri iscrizione biometria
            if (result.offerBiometricEnrollment && result.dskBytes && biometricAvailable) {
                setPendingDSKBytes(result.dskBytes);
                setOfferBiometric(true);
                return;
            }
        } catch {
            setError(t('auth.unexpectedError'));
        } finally {
            setIsLoading(false);
        }
    }

    /** Chiamata dopo approvazione QR: ha la DSK in chiaro. */
    async function handleQRApproved(dskBytes) {
        setShowQRApproval(false);
        if (!password) {
            setError(t('auth.requiredField'));
            return;
        }
        setIsLoading(true);
        try {
            const result = await loginWithApprovedDSK(password, dskBytes);
            if (!result.success) {
                setError(result.error);
                return;
            }
            if (result.offerBiometricEnrollment && biometricAvailable) {
                setPendingDSKBytes(dskBytes);
                setOfferBiometric(true);
                return;
            }
            // auth state change drives navigation automatically
        } catch {
            setError(t('auth.unexpectedError'));
        } finally {
            setIsLoading(false);
        }
    }

    async function handleEnrollBiometric() {
        setIsEnrolling(true);
        try {
            await enrollBiometricAfterRecovery(pendingDSKBytes);
        } finally {
            if (pendingDSKBytes) pendingDSKBytes.fill(0);
            setPendingDSKBytes(null);
            setIsEnrolling(false);
            setOfferBiometric(false);
        }
    }

    function handleSkipEnroll() {
        if (pendingDSKBytes) pendingDSKBytes.fill(0);
        setPendingDSKBytes(null);
        setOfferBiometric(false);
    }

    // ---- OFFER BIOMETRIC ENROLLMENT ----

    if (offerBiometric) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4">
                <div className="w-full max-w-md">
                    <div className="glass rounded-3xl p-8 border border-slate-800 shadow-2xl space-y-5 text-center">
                        <Fingerprint size={40} className="text-blue-400 mx-auto" />
                        <h2 className="text-xl font-bold text-white">
                            {t('deviceSecret.enrollBiometric.title')}
                        </h2>
                        <p className="text-sm text-gray-400">
                            {t('deviceSecret.enrollBiometric.description')}
                        </p>
                        <button
                            onClick={handleEnrollBiometric}
                            disabled={isEnrolling}
                            className="w-full bg-gradient-to-r from-brand to-blue-500 text-white py-3 rounded-xl font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isEnrolling
                                ? <><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" /><span>{t('deviceSecret.enrollBiometric.enrolling')}</span></>
                                : <><Fingerprint size={18} /><span>{t('deviceSecret.enrollBiometric.enrollBtn')}</span></>
                            }
                        </button>
                        <button
                            onClick={handleSkipEnroll}
                            className="w-full text-gray-400 text-sm hover:text-gray-300 py-2"
                        >
                            {t('deviceSecret.enrollBiometric.skipBtn')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ---- MAIN LOGIN ----

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4">
            <div className="w-full max-w-md">
                {/* Header */}
                <div className="text-center mb-10">
                    <div className="flex items-center justify-center mb-6">
                        <img src="/icons/appicon.png" alt="OwnVault" className="w-24 h-24 object-contain drop-shadow-lg" />
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2 tracking-wide">OwnVault</h1>
                    <p className="text-gray-400 text-sm">{t('login.welcomeBack')}</p>
                </div>

                {/* Form */}
                <div className="glass rounded-3xl p-8 border border-slate-800 shadow-2xl">
                    <form onSubmit={handleSubmit} className="space-y-5">

                        {/* Master password */}
                        <div className="space-y-2">
                            <label className="text-xs text-gray-400 font-medium">{t('auth.masterPassword')}</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-800/70 text-gray-200 border border-slate-700 rounded-xl focus:ring-2 focus:ring-brand focus:border-transparent pr-12 placeholder-gray-500"
                                    placeholder={t('login.enterPassword')}
                                    disabled={isLoading}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                                >
                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>
                        </div>

                        {/* Recovery key (mostrato se DSK richiesta) */}
                        {(loginRequiresRecoveryKey || showRecoveryKeyField) && (
                            <div className="space-y-2">
                                <label className="text-xs text-gray-400 font-medium flex items-center gap-1.5">
                                    <KeyRound size={12} className="text-blue-400" />
                                    {t('deviceSecret.login.recoveryKeyLabel')}
                                </label>
                                <input
                                    type="text"
                                    value={recoveryKey}
                                    onChange={e => setRecoveryKey(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-800/70 text-gray-200 border border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 placeholder-gray-500 font-mono text-sm tracking-wider"
                                    placeholder="OV-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
                                    disabled={isLoading}
                                    spellCheck={false}
                                    autoComplete="off"
                                />
                                {loginRequiresRecoveryKey && (
                                    <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-2.5">
                                        <p className="text-xs text-blue-300">
                                            {t('deviceSecret.login.recoveryKeyHint')}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Error */}
                        {error && (
                            <p className="text-red-400 text-sm flex items-center gap-1">
                                <span className="text-xs">⚠️</span> {error}
                            </p>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-gradient-to-r from-brand to-blue-500 hover:from-brand/90 hover:to-blue-500/90 text-white py-3 rounded-xl font-semibold transition-all shadow-lg shadow-blue-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <div className="flex items-center justify-center gap-2">
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                                    <span>{t('login.unlocking')}</span>
                                </div>
                            ) : (
                                t('login.unlockVault')
                            )}
                        </button>

                        {/* Hint biometria (solo standard, non recovery e non manual recovery) */}
                        {biometricEnabled && !loginRequiresRecoveryKey && !showRecoveryKeyField && (
                            <p className="text-xs text-center text-gray-500">
                                {t('login.biometricHint')}
                            </p>
                        )}

                        {/* Annulla recovery key manuale (al posto dell'hint biometrico) */}
                        {showRecoveryKeyField && !loginRequiresRecoveryKey && (
                            <button
                                type="button"
                                onClick={() => { setRecoveryKey(''); setError(null); }}
                                className="w-full text-xs text-gray-500 hover:text-gray-400 py-1 transition-colors flex items-center justify-center gap-1"
                            >
                                <span>{t('deviceSecret.login.cancelRecoveryKey')}</span>
                            </button>
                        )}

                        {/* Alternativa QR approval (quando DSK richiesta) */}
                        {loginRequiresRecoveryKey && (
                            <button
                                type="button"
                                onClick={() => setShowQRApproval(true)}
                                className="w-full py-2.5 bg-slate-700/60 hover:bg-slate-700 text-gray-300 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 border border-slate-600"
                            >
                                <QrCode size={16} />
                                <span>{t('deviceSecret.login.approvalQRBtn')}</span>
                            </button>
                        )}

                        {/* Link per inserire recovery key manualmente (se DSK abilitata ma non necessaria) */}
                        {deviceSecretEnabled && !loginRequiresRecoveryKey && !recoveryKey && (
                            <button
                                type="button"
                                onClick={() => setRecoveryKey(' ')}
                                className="w-full text-xs text-gray-500 hover:text-gray-400 py-1 transition-colors flex items-center justify-center gap-1"
                            >
                                <KeyRound size={11} />
                                <span>{t('deviceSecret.login.useRecoveryKeyLink')}</span>
                            </button>
                        )}
                    </form>
                </div>

                {/* Storage warning */}
                <div className="mt-4 flex items-start gap-2 bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3">
                    <AlertTriangle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-gray-400 leading-relaxed">{t('login.storageWarning')}</p>
                </div>

                {/* Footer */}
                <div className="mt-4 text-center text-xs text-gray-500">
                    {t('login.e2eEncryption')} • v{version}
                    <span className="mx-2">•</span>
                    <a href="/privacy" target="_blank" rel="noopener noreferrer"
                        className="hover:text-gray-300 underline underline-offset-2 transition-colors">
                        {t('privacy.link')}
                    </a>
                </div>
            </div>

            {/* QR Device Approval (receiver mode) */}
            {showQRApproval && (
                <DeviceApprovalReceiver
                    onApproved={handleQRApproved}
                    onClose={() => setShowQRApproval(false)}
                />
            )}
        </div>
    );
}
