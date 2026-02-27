/**
 * Biometric Settings Section
 * Gestione abilitazione/disabilitazione biometria dalle impostazioni
 */

import { useState, useEffect } from 'react';
import { Fingerprint, Shield, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { biometricService } from '../services/biometricService';
import { BiometricSetupDialog } from '../components/BiometricSetupDialog';

export function BiometricSettingsSection() {
    const { biometricEnabled, biometricAvailable, enableBiometric, disableBiometric } = useAuth();
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
                    text: result.error || 'Failed to enable biometric authentication'
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
        if (!confirm(`Are you sure you want to disable ${biometricType}? You'll need to use your password to unlock.`)) {
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
                    text: result.error || 'Failed to disable biometric authentication'
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
                        Biometric Authentication
                    </h2>
                </div>
                <div className="p-4">
                    <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-4 flex items-start gap-3">
                        <Shield size={20} className="text-slate-400 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm text-gray-300">
                                Biometric authentication is not available on this device.
                            </p>
                            <p className="text-xs text-slate-400 mt-1">
                                Your device doesn't support Face ID, Touch ID, Windows Hello, or fingerprint authentication.
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
                                ? `Quick unlock is enabled using ${biometricType}. You can still use your password anytime.`
                                : `Enable ${biometricType} for quick and secure access without typing your password.`
                            }
                        </p>

                        {biometricEnabled && (
                            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 mt-3">
                                <p className="text-xs text-blue-300">
                                    <strong>Note:</strong> Your encrypted data remains protected by your master password.
                                    Biometric authentication provides convenient access on this device only.
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
                                    <span>Disabling...</span>
                                </>
                            ) : (
                                <>
                                    <Fingerprint size={20} />
                                    <span>Disable {biometricType}</span>
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
                            <span>Enable {biometricType}</span>
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
