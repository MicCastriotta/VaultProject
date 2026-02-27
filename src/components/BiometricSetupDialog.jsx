/**
 * Biometric Setup Dialog
 * Mostra un prompt per abilitare l'autenticazione biometrica
 * dopo il primo setup della password o dalle impostazioni
 */

import { Fingerprint, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { biometricService } from '../services/biometricService';

export function BiometricSetupDialog({ onEnable, onSkip, showSkip = true }) {
    const [biometricType, setBiometricType] = useState('Biometric Authentication');
    const [isEnabling, setIsEnabling] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        loadBiometricType();
    }, []);

    async function loadBiometricType() {
        const type = await biometricService.getBiometricType();
        setBiometricType(type);
    }

    async function handleEnable() {
        setIsEnabling(true);
        setError('');

        try {
            const result = await onEnable();
            
            if (!result.success) {
                setError(result.error || 'Failed to enable biometric authentication');
            }
        } catch (err) {
            setError(err.message || 'Unexpected error');
        } finally {
            setIsEnabling(false);
        }
    }

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" />

            {/* Dialog */}
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-11/12 max-w-md bg-white rounded-2xl shadow-2xl z-50 overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-6 text-white relative">
                    {showSkip && (
                        <button
                            onClick={onSkip}
                            className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-full transition-colors"
                            disabled={isEnabling}
                        >
                            <X size={20} />
                        </button>
                    )}
                    
                    <div className="flex flex-col items-center">
                        <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mb-4">
                            <Fingerprint size={40} />
                        </div>
                        <h2 className="text-2xl font-bold text-center">
                            Enable {biometricType}
                        </h2>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    <div className="space-y-3">
                        <p className="text-gray-700 leading-relaxed">
                            Add biometric verification as a second factor when unlocking OwnVault.
                        </p>

                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                            <h3 className="font-semibold text-blue-900 text-sm">How it works:</h3>
                            <ul className="text-sm text-blue-800 space-y-1">
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-500 mt-0.5">•</span>
                                    <span>Enter your master password as usual</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-500 mt-0.5">•</span>
                                    <span>Biometric confirmation is requested automatically after</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-500 mt-0.5">•</span>
                                    <span>Your master password remains the only cryptographic secret</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-500 mt-0.5">•</span>
                                    <span>No keys are stored — biometrics only confirms your presence</span>
                                </li>
                            </ul>
                        </div>

                        <p className="text-xs text-gray-500">
                            You can disable biometric verification anytime in Settings.
                        </p>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="space-y-2 pt-2">
                        <button
                            onClick={handleEnable}
                            disabled={isEnabling}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isEnabling ? (
                                <>
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                    <span>Enabling...</span>
                                </>
                            ) : (
                                <>
                                    <Fingerprint size={20} />
                                    <span>Enable {biometricType}</span>
                                </>
                            )}
                        </button>

                        {showSkip && (
                            <button
                                onClick={onSkip}
                                disabled={isEnabling}
                                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 px-4 rounded-lg font-medium transition-colors disabled:opacity-50"
                            >
                                Maybe Later
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
