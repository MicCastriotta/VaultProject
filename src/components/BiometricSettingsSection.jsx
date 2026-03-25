/**
 * Biometric Settings Section
 * Gestione biometria + Device Secret Key (v3 WebAuthn PRF).
 *
 * Se il device supporta WebAuthn PRF:
 *   - Il pulsante "Abilita" avvia il flusso Device Secret (registerWithPRF + DSK)
 *   - La sezione mostra lo stato DSK e il link per l'approvazione dispositivo
 *
 * Se il device NON supporta PRF:
 *   - La biometria non può essere attivata (il flusso legacy v2 è stato rimosso)
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Fingerprint, Shield, AlertTriangle, KeyRound, Smartphone } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { biometricService } from '../services/biometricService';
import { deviceSecretService } from '../services/deviceSecretService';
import { DeviceSecretSetupDialog } from '../components/DeviceSecretSetupDialog';
import { DeviceApprovalSender, DeviceApprovalReceiver } from '../components/DeviceApprovalDialog';

export function BiometricSettingsSection() {
    const {
        biometricEnabled,
        biometricAvailable,
        deviceSecretEnabled,
        deviceSecretLocallyAvailable,
        disableBiometric,
        disableDeviceSecret,
        enrollBiometricAfterRecovery
    } = useAuth();
    const { t } = useTranslation();

    const [biometricType, setBiometricType]       = useState('Biometric Authentication');
    // prfSupported: null = in attesa del check, false = non supportato, true = supportato
    const [prfSupported, setPrfSupported]         = useState(null);
    const [message, setMessage]                   = useState(null);
    const [isProcessing, setIsProcessing]       = useState(false);
    const [showDSKSetup, setShowDSKSetup]       = useState(false);
    const [showApprovalSender, setShowApprovalSender] = useState(false);
    const [showDisableConfirm, setShowDisableConfirm] = useState(false);
    const [disablePassword, setDisablePassword] = useState('');
    // Re-enroll: per dispositivi dove la DSK esiste ma la biometria non è registrata localmente
    const [showReEnroll, setShowReEnroll]       = useState(false);
    const [reEnrollKey, setReEnrollKey]         = useState('');
    const [reEnrollError, setReEnrollError]     = useState('');
    const [showReEnrollQR, setShowReEnrollQR]   = useState(false);

    useEffect(() => {
        loadBiometricType();
        checkPRF();
    }, []);

    async function loadBiometricType() {
        const type = await biometricService.getBiometricType();
        setBiometricType(type);
    }

    async function checkPRF() {
        const supported = await deviceSecretService.checkPRFSupport();
        setPrfSupported(supported);
    }

    // ---- Abilitazione ----

    function handleEnable() {
        setMessage(null);
        if (prfSupported === false) {
            // PRF non supportato → biometria non attivabile (flusso legacy v2 rimosso)
            setMessage({ type: 'error', text: t('deviceSecret.settings.prfNotSupported') });
            return;
        } else if (deviceSecretEnabled && !deviceSecretLocallyAvailable) {
            // DSK già presente nel vault ma non registrata localmente (es. dopo login con recovery key)
            // → re-enroll: avvolgi la DSK esistente con la biometria di questo dispositivo
            setReEnrollKey('');
            setReEnrollError('');
            setShowReEnroll(true);
        } else {
            // Nessuna DSK → crea nuova DSK
            setShowDSKSetup(true);
        }
    }

    async function handleReEnroll() {
        const key = reEnrollKey.trim();
        if (!key) {
            setReEnrollError(t('deviceSecret.login.recoveryKeyRequired'));
            return;
        }
        const dskBytes = deviceSecretService.parseRecoveryKey(key);
        if (!dskBytes) {
            setReEnrollError(t('deviceSecret.login.recoveryKeyHint'));
            return;
        }
        setIsProcessing(true);
        setReEnrollError('');
        try {
            const result = await enrollBiometricAfterRecovery(dskBytes);
            dskBytes.fill(0);
            if (result.success) {
                setMessage({ type: 'success', text: t('settings.biometric.enabledOk', { type: biometricType }) });
                setShowReEnroll(false);
            } else {
                setReEnrollError(result.error || t('settings.biometric.enableError'));
            }
        } catch (err) {
            setReEnrollError(err.message || 'Unexpected error');
        } finally {
            setIsProcessing(false);
        }
    }

    async function handleReEnrollQRApproved(dskBytes) {
        setShowReEnrollQR(false);
        setIsProcessing(true);
        try {
            const result = await enrollBiometricAfterRecovery(dskBytes);
            if (result.success) {
                setMessage({ type: 'success', text: t('settings.biometric.enabledOk', { type: biometricType }) });
            } else {
                setMessage({ type: 'error', text: result.error || t('settings.biometric.enableError') });
            }
        } catch (err) {
            setMessage({ type: 'error', text: err.message || 'Unexpected error' });
        } finally {
            setIsProcessing(false);
        }
    }

    // ---- Disabilitazione ----

    async function handleDisableConfirmed() {
        setIsProcessing(true);
        setMessage(null);
        try {
            let result;
            if (deviceSecretEnabled) {
                result = await disableDeviceSecret(disablePassword);
            } else {
                result = await disableBiometric();
            }

            if (result.success) {
                setMessage({ type: 'success', text: t('settings.biometric.disabledOk') });
                setShowDisableConfirm(false);
                setDisablePassword('');
            } else {
                setMessage({ type: 'error', text: result.error || t('settings.biometric.disableError') });
            }
        } catch (err) {
            setMessage({ type: 'error', text: err.message || 'Unexpected error' });
        } finally {
            setIsProcessing(false);
        }
    }

    // ---- UI: non disponibile ----

    if (!biometricAvailable) {
        return (
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-slate-700">
                    <h2 className="font-semibold text-gray-200 flex items-center gap-2">
                        <Fingerprint size={20} />
                        {t('settings.biometric.title')}
                    </h2>
                </div>
                <div className="p-4">
                    <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-4 flex items-start gap-3">
                        <Shield size={20} className="text-slate-400 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm text-gray-300">{t('settings.biometric.notAvailable')}</p>
                            <p className="text-xs text-slate-400 mt-1">{t('settings.biometric.deviceNoSupport')}</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ---- UI: disponibile ----

    return (
        <>
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-slate-700">
                    <h2 className="font-semibold text-gray-200 flex items-center gap-2">
                        <Fingerprint size={20} />
                        {biometricType}
                        {deviceSecretEnabled && (
                            <span className="ml-1 px-2 py-0.5 bg-green-900/40 border border-green-500/30 text-green-400 text-xs rounded-full flex items-center gap-1">
                                <KeyRound size={10} /> {t('deviceSecret.badge')}
                            </span>
                        )}
                    </h2>
                </div>

                <div className="p-4 space-y-4">
                    {/* Message */}
                    {message && (
                        <div className={`border rounded-lg p-3 flex items-start gap-2 ${
                            message.type === 'success'
                                ? 'bg-green-900/20 border-green-500/30'
                                : 'bg-red-900/20 border-red-500/30'
                        }`}>
                            {message.type === 'success'
                                ? <Shield size={18} className="text-green-400 flex-shrink-0 mt-0.5" />
                                : <AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
                            }
                            <p className={`text-sm ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                                {message.text}
                            </p>
                        </div>
                    )}

                    {/* Descrizione stato */}
                    <div>
                        {biometricEnabled ? (
                            deviceSecretEnabled ? (
                                <div className="space-y-2">
                                    <p className="text-sm text-gray-400">
                                        {t('deviceSecret.settings.enabledDescription')}
                                    </p>
                                    <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-3">
                                        <p className="text-xs text-green-300">
                                            {t('deviceSecret.settings.protectionActive')}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <p className="text-sm text-gray-400">
                                        {t('settings.biometric.enabledDescription', { type: biometricType })}
                                    </p>
                                    <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3">
                                        <p className="text-xs text-blue-300">{t('settings.biometric.note')}</p>
                                    </div>
                                    {prfSupported !== false && (
                                        <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3">
                                            <p className="text-xs text-amber-300">
                                                {t('deviceSecret.settings.upgradeHint')}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )
                        ) : (
                            <div className="space-y-2">
                                <p className="text-sm text-gray-400">
                                    {t('settings.biometric.disabledDescription', { type: biometricType })}
                                </p>
                                {prfSupported !== false && (
                                    <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 flex items-start gap-2">
                                        <KeyRound size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
                                        <p className="text-xs text-blue-300">
                                            {t('deviceSecret.settings.prfAvailable')}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Azioni */}
                    {biometricEnabled ? (
                        <div className="space-y-2">
                            {/* Approva nuovo dispositivo (solo con DSK) */}
                            {deviceSecretEnabled && (
                                <button
                                    onClick={() => setShowApprovalSender(true)}
                                    className="w-full bg-slate-700 hover:bg-slate-600 text-gray-200 py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                                >
                                    <Smartphone size={18} />
                                    <span>{t('deviceSecret.settings.approveDeviceBtn')}</span>
                                </button>
                            )}

                            {/* Disabilita */}
                            <button
                                onClick={() => setShowDisableConfirm(true)}
                                disabled={isProcessing}
                                className="w-full bg-red-600 hover:bg-red-700 text-white py-3 px-4 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isProcessing ? (
                                    <><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" /><span>{t('settings.biometric.disabling')}</span></>
                                ) : (
                                    <><Fingerprint size={20} /><span>{deviceSecretEnabled ? t('deviceSecret.settings.disableBtn') : t('settings.biometric.disableBtn', { type: biometricType })}</span></>
                                )}
                            </button>
                        </div>
                    ) : prfSupported === false ? (
                        <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-4 flex items-start gap-3">
                            <Shield size={20} className="text-slate-400 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-gray-400">{t('deviceSecret.settings.prfNotSupported')}</p>
                        </div>
                    ) : (
                        <button
                            onClick={handleEnable}
                            disabled={isProcessing || prfSupported === null}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 px-4 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            <Fingerprint size={20} />
                            <span>{t('deviceSecret.settings.enableWithDSKBtn')}</span>
                        </button>
                    )}
                </div>
            </div>

            {/* ---- DIALOGS ---- */}

            {/* Device Secret setup */}
            {showDSKSetup && (
                <DeviceSecretSetupDialog onClose={() => setShowDSKSetup(false)} />
            )}

            {/* Re-enroll biometria (DSK esiste, ma non registrata su questo device) */}
            {showReEnroll && (
                <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
                    <div className="bg-slate-800 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5 space-y-4">
                        <div className="flex items-center gap-2">
                            <Fingerprint size={20} className="text-blue-400" />
                            <h3 className="font-bold text-white">{t('deviceSecret.settings.reEnrollTitle')}</h3>
                        </div>
                        <p className="text-sm text-gray-400">{t('deviceSecret.settings.reEnrollDescription')}</p>
                        <div className="space-y-1.5">
                            <label className="text-xs text-gray-400">{t('deviceSecret.login.recoveryKeyLabel')}</label>
                            <input
                                type="text"
                                value={reEnrollKey}
                                onChange={e => setReEnrollKey(e.target.value)}
                                className="w-full px-4 py-3 bg-slate-900/70 text-gray-200 border border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 font-mono text-sm tracking-wider placeholder-gray-600"
                                placeholder="OV-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
                                spellCheck={false}
                                autoComplete="off"
                                disabled={isProcessing}
                            />
                            {reEnrollError && (
                                <p className="text-xs text-red-400 flex items-center gap-1">
                                    <AlertTriangle size={12} /> {reEnrollError}
                                </p>
                            )}
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowReEnroll(false)}
                                className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-gray-300 rounded-xl font-medium"
                                disabled={isProcessing}
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={handleReEnroll}
                                disabled={isProcessing || !reEnrollKey.trim()}
                                className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isProcessing
                                    ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /><span>{t('deviceSecret.settings.reEnrollEnrolling')}</span></>
                                    : t('deviceSecret.settings.reEnrollBtn')
                                }
                            </button>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex-1 h-px bg-slate-700" />
                            <span className="text-xs text-slate-500">{t('auth.or')}</span>
                            <div className="flex-1 h-px bg-slate-700" />
                        </div>
                        <button
                            onClick={() => { setShowReEnroll(false); setShowReEnrollQR(true); }}
                            disabled={isProcessing}
                            className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-gray-300 rounded-xl font-medium flex items-center justify-center gap-2"
                        >
                            <Smartphone size={16} />
                            {t('deviceSecret.settings.reEnrollViaQR')}
                        </button>
                    </div>
                </div>
            )}

            {/* Re-enroll tramite QR (DeviceApprovalReceiver) */}
            {showReEnrollQR && (
                <DeviceApprovalReceiver
                    onApproved={handleReEnrollQRApproved}
                    onClose={() => setShowReEnrollQR(false)}
                />
            )}

            {/* Device Approval (sender) */}
            {showApprovalSender && (
                <DeviceApprovalSender onClose={() => setShowApprovalSender(false)} />
            )}

            {/* Conferma disabilitazione */}
            {showDisableConfirm && (
                <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
                    <div className="bg-slate-800 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5 space-y-4">
                        <div className="flex items-center gap-2">
                            <AlertTriangle size={20} className="text-red-400" />
                            <h3 className="font-bold text-white">
                                {deviceSecretEnabled ? t('deviceSecret.settings.disableConfirmTitle') : t('settings.biometric.disableConfirmTitle')}
                            </h3>
                        </div>
                        <p className="text-sm text-gray-400">
                            {deviceSecretEnabled ? t('deviceSecret.settings.disableConfirmBody') : t('settings.biometric.disableConfirm', { type: biometricType })}
                        </p>

                        {deviceSecretEnabled && (
                            <div className="space-y-1.5">
                                <label className="text-xs text-gray-400">{t('deviceSecret.settings.disablePasswordLabel')}</label>
                                <input
                                    type="password"
                                    value={disablePassword}
                                    onChange={e => setDisablePassword(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-900/70 text-gray-200 border border-slate-600 rounded-xl focus:ring-2 focus:ring-red-500 placeholder-gray-600"
                                    placeholder={t('login.enterPassword')}
                                />
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button
                                onClick={() => { setShowDisableConfirm(false); setDisablePassword(''); }}
                                className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-gray-300 rounded-xl font-medium"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={handleDisableConfirmed}
                                disabled={isProcessing || (deviceSecretEnabled && !disablePassword)}
                                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium disabled:opacity-50"
                            >
                                {isProcessing
                                    ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto" />
                                    : t('common.confirm')
                                }
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
