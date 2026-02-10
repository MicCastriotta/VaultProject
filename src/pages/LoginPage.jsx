/**
 * Login Page
 * Unlock con password o biometria
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff, Lock, Fingerprint } from 'lucide-react';

export function LoginPage() {
    const { login, loginWithBiometric, biometricEnabled } = useAuth();
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isBiometricLoading, setIsBiometricLoading] = useState(false);
    const [error, setError] = useState('');
    //const [attemptedBiometric, setAttemptedBiometric] = useState(false);

    // Tenta login biometrico automatico all'avvio
    //useEffect(() => {
    //    if (biometricEnabled && !attemptedBiometric) {
    //        setAttemptedBiometric(true);
    //        handleBiometricLogin();
    //    }
    //}, [biometricEnabled]);

    async function handleBiometricLogin() {
        setIsBiometricLoading(true);
        setError('');

        try {
            const result = await loginWithBiometric();

            if (!result.success) {
                // Non mostrare errore se l'utente cancella - è normale
                if (!result.error.includes('cancelled') && !result.error.includes('denied')) {
                    setError(result.error);
                }
            }
        } catch (err) {
            console.error('Biometric login error:', err);
        } finally {
            setIsBiometricLoading(false);
        }
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');

        if (!password) {
            setError('Required field');
            return;
        }

        setIsLoading(true);

        try {
            const result = await login(password);

            if (!result.success) {
                setError(result.error === 'Wrong password' ? 'Wrong Password' : result.error);
            }
            // Se successo, AuthContext reindirizza automaticamente
        } catch (err) {
            setError('Unexpected error');
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <div className="bg-primary text-white py-8 px-4 text-center">
                <div className="flex items-center justify-center mb-4">
                    <Lock className="w-20 h-20" />
                </div>
                <h1 className="text-3xl font-bold">SafeProfiles</h1>
            </div>

            {/* Content */}
            <div className="flex-1 flex items-center justify-center px-4">
                <div className="max-w-md w-full space-y-6">
                    <div className="text-center">
                        <h2 className="text-xl text-gray-700">Welcome!</h2>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Password Input */}
                        <div className="space-y-2">
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent pr-12"
                                    placeholder="Password"
                                    disabled={isLoading || isBiometricLoading}
                                    autoFocus={!biometricEnabled}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>

                            {error && (
                                <p className="text-red-500 text-sm">{error}</p>
                            )}
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isLoading || isBiometricLoading}
                            className="w-full bg-primary hover:bg-primary-dark text-white py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <div className="flex items-center justify-center">
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                </div>
                            ) : (
                                'Submit'
                            )}
                        </button>

                        {/* Biometric Button */}
                        {biometricEnabled && (
                            <>
                                <div className="relative">
                                    <div className="absolute inset-0 flex items-center">
                                        <div className="w-full border-t border-gray-300"></div>
                                    </div>
                                    <div className="relative flex justify-center text-sm">
                                        <span className="px-2 bg-gray-50 text-gray-500">or</span>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleBiometricLogin}
                                    disabled={isLoading || isBiometricLoading}
                                    className="w-full bg-white border-2 border-blue-500 text-blue-600 hover:bg-blue-50 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isBiometricLoading ? (
                                        <>
                                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                                            <span>Authenticating...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Fingerprint size={20} />
                                            <span>Unlock with Biometrics</span>
                                        </>
                                    )}
                                </button>
                            </>
                        )}
                    </form>
                </div>
            </div>
        </div>
    );
}
