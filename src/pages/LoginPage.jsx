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
                // Non mostrare errore se l'utente cancella - � normale
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
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4">
            {/* Glass Container */}
            <div className="w-full max-w-md">
                {/* Header con icona */}
                <div className="text-center mb-10">
                    <div className="flex items-center justify-center mb-6">
                        <div className="w-20 h-20 bg-gradient-to-br from-brand to-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-900/40">
                            <Lock className="w-12 h-12 text-white" />
                        </div>
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2 tracking-wide">🔐 OwnVault</h1>
                    <p className="text-gray-400 text-sm">Welcome Back!</p>
                </div>

                {/* Form Glass Card */}
                <div className="glass rounded-3xl p-8 border border-slate-800 shadow-2xl">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Password Input */}
                        <div className="space-y-2">
                            <label className="text-xs text-gray-400 font-medium">Master Password</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-800/70 text-gray-200 border border-slate-700 rounded-xl focus:ring-2 focus:ring-brand focus:border-transparent pr-12 placeholder-gray-500"
                                    placeholder="Enter your password"
                                    disabled={isLoading || isBiometricLoading}
                                    autoFocus={!biometricEnabled}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                                >
                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>

                            {error && (
                                <p className="text-red-400 text-sm flex items-center gap-1">
                                    <span className="text-xs">⚠️</span> {error}
                                </p>
                            )}
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isLoading || isBiometricLoading}
                            className="w-full bg-gradient-to-r from-brand to-blue-500 hover:from-brand/90 hover:to-blue-500/90 text-white py-3 rounded-xl font-semibold transition-all shadow-lg shadow-blue-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <div className="flex items-center justify-center gap-2">
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                    <span>Unlocking...</span>
                                </div>
                            ) : (
                                'Unlock Vault'
                            )}
                        </button>

                        {/* Biometric Button */}
                        {biometricEnabled && (
                            <>
                                <div className="relative">
                                    <div className="absolute inset-0 flex items-center">
                                        <div className="w-full border-t border-slate-700"></div>
                                    </div>
                                    <div className="relative flex justify-center text-sm">
                                        <span className="px-3 bg-slate-900/60 text-gray-400">or</span>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleBiometricLogin}
                                    disabled={isLoading || isBiometricLoading}
                                    className="w-full bg-slate-800/50 border border-slate-700 text-gray-300 hover:bg-slate-800/70 hover:border-brand py-3 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isBiometricLoading ? (
                                        <>
                                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-brand"></div>
                                            <span>Authenticating...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Fingerprint size={20} className="text-brand" />
                                            <span>Unlock with Biometrics</span>
                                        </>
                                    )}
                                </button>
                            </>
                        )}
                    </form>
                </div>

                {/* Footer */}
                <div className="mt-6 text-center text-xs text-gray-500">
                    PWA Ready • End-to-End Encryption
                </div>
            </div>
        </div>
    );
}
