/**
 * Login Page
 * Unlock con password o biometria
 */

import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, AlertTriangle } from 'lucide-react';

export function LoginPage() {
    const { login, biometricEnabled } = useAuth();
    const { t } = useTranslation();
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const version = __APP_VERSION__;

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');

        if (!password) {
            setError(t('auth.requiredField'));
            return;
        }

        setIsLoading(true);

        try {
            const result = await login(password);

            if (!result.success) {
                setError(result.error === 'Wrong password' ? t('auth.wrongPassword') : result.error);
            }
            // Se successo, AuthContext reindirizza automaticamente
        } catch (err) {
            setError(t('auth.unexpectedError'));
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
                        <img
                            src="/icons/appicon.png"
                            alt="OwnVault"
                            className="w-24 h-24 object-contain drop-shadow-lg"
                        />
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2 tracking-wide">OwnVault</h1>
                    <p className="text-gray-400 text-sm">{t('login.welcomeBack')}</p>
                </div>

                {/* Form Glass Card */}
                <div className="glass rounded-3xl p-8 border border-slate-800 shadow-2xl">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Password Input */}
                        <div className="space-y-2">
                            <label className="text-xs text-gray-400 font-medium">{t('auth.masterPassword')}</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-800/70 text-gray-200 border border-slate-700 rounded-xl focus:ring-2 focus:ring-brand focus:border-transparent pr-12 placeholder-gray-500"
                                    placeholder={t('login.enterPassword')}
                                    disabled={isLoading}
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
                            disabled={isLoading}
                            className="w-full bg-gradient-to-r from-brand to-blue-500 hover:from-brand/90 hover:to-blue-500/90 text-white py-3 rounded-xl font-semibold transition-all shadow-lg shadow-blue-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <div className="flex items-center justify-center gap-2">
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                    <span>{t('login.unlocking')}</span>
                                </div>
                            ) : (
                                t('login.unlockVault')
                            )}
                        </button>

                        {/* Hint biometria */}
                        {biometricEnabled && (
                            <p className="text-xs text-center text-gray-500">
                                {t('login.biometricHint')}
                            </p>
                        )}
                    </form>
                </div>

                {/* Avviso storage browser */}
                <div className="mt-4 flex items-start gap-2 bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3">
                    <AlertTriangle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-gray-400 leading-relaxed">
                        {t('login.storageWarning')}
                    </p>
                </div>

                {/* Footer */}
                <div className="mt-4 text-center text-xs text-gray-500">
                    {t('login.e2eEncryption')} • v{version}
                    <span className="mx-2">•</span>
                    <a
                        href="/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-gray-300 underline underline-offset-2 transition-colors"
                    >
                        {t('privacy.link')}
                    </a>
                </div>
            </div>
        </div>
    );
}
