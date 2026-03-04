/**
 * Biometric Settings Section
 * Gestione abilitazione/disabilitazione biometria dalle impostazioni
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Fingerprint, Shield, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { biometricService } from '../services/biometricService';
import { BiometricSetupDialog } from '../components/BiometricSetupDialog';

export function BiometricSettingsSection() {
    const { biometricEnabled, biometricAvailable, enableBiometric, disableBiometric } = useAuth();
    const { t } = useTranslation();
    const [showSetupDialog, setShowSetupDialog] = useState(false);
    const [biometricType, setBiometricType] = useState('Biometric Authentication');
    const [message, setMessage] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        loadBiometricType();
    }, []);

    async function loadBiometricType() {
        const type = await biometricService.getBiometricType();
        setBiometricType(type);
    }

    async function handleEnable() {
        setIsProcessing(true);
        setMessage(null);

        try {
            const result = await enableBiometric();

            if (result.success) {
                setMessage({
                    type: 'success',
                    text: `${biometricType} enabled successfully!`
                });
                setShowSetupDialog(false);
            } else {
                setMessage({
                    type: 'error',
                    text: result.error || t('settings.biometric.enableError')
                });
            }
        } catch (error) {
            setMessage({
                type: 'error',
                text: error.message || 'Unexpected error'
            });
        } finally {
            setIsProcessing(false);
        }

        return { success: false };
    }

    async function handleDisable() {
        if (!confirm(t('settings.biometric.disableConfirm', { type: biometricType }))) {
            return;
        }

        setIsProcessing(true);
        setMessage(null);

        try {
            const result = await disableBiometric();

            if (result.success) {
                setMessage({ type: 'success', text: `${biometricType} disabled` });
            } else {
                setMessage({
                    type: 'error',
                    text: result.error || t('settings.biometric.disableError')
                });
            }
        } catch (error) {
            setMessage({ type: 'error', text: error.message || 'Unexpected error' });
        } finally {
            setIsProcessing(false);
        }
    }

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
                            <p className="text-sm text-gray-300">
                                {t('settings.biometric.notAvailable')}
                            </p>
                            <p className="text-xs text-slate-400 mt-1">
                                {t('settings.biometric.deviceNoSupport')}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-slate-700">
                    <h2 className="font-semibold text-gray-200 flex items-center gap-2">
                        <Fingerprint size={20} />
                        {biometricType}
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
                            {message.type === 'success' ? (
                                <Shield size={18} className="text-green-400 flex-shrink-0 mt-0.5" />
                            ) : (
                                <AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
                            )}
                            <p className={`text-sm ${
                                message.type === 'success' ? 'text-green-400' : 'text-red-400'
                            }`}>
                                {message.text}
                            </p>
                        </div>
                    )}

                    {/* Description */}
                    <div>
                        <p className="text-sm text-gray-400 mb-2">
                            {biometricEnabled
                                ? t('settings.biometric.enabledDescription', { type: biometricType })
                                : t('settings.biometric.disabledDescription', { type: biometricType })
                            }
                        </p>

                        {biometricEnabled && (
                            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 mt-3">
                                <p className="text-xs text-blue-300">
                                    {t('settings.biometric.note')}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    {biometricEnabled ? (
                        <button
                            onClick={handleDisable}
                            disabled={isProcessing}
                            className="w-full bg-red-600 hover:bg-red-700 text-white py-3 px-4 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isProcessing ? (
                                <>
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                    <span>{t('settings.biometric.disabling')}</span>
                                </>
                            ) : (
                                <>
                                    <Fingerprint size={20} />
                                    <span>{t('settings.biometric.disableBtn', { type: biometricType })}</span>
                                </>
                            )}
                        </button>
                    ) : (
                        <button
                            onClick={() => setShowSetupDialog(true)}
                            disabled={isProcessing}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 px-4 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            <Fingerprint size={20} />
                            <span>{t('settings.biometric.enableBtn', { type: biometricType })}</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Setup Dialog */}
            {showSetupDialog && (
                <BiometricSetupDialog
                    onEnable={handleEnable}
                    onSkip={() => setShowSetupDialog(false)}
                    showSkip={true}
                />
            )}
        </>
    );
}
