/**
 * Login Page
 * Unlock con password o biometria
 */

import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { Eye, EyeOff, AlertTriangle } from 'lucide-react';

export function LoginPage() {
    const { login, biometricEnabled } = useAuth();
    const { t } = useTranslation();
    const { theme } = useTheme();

    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const isLight = theme === 'light';
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
        <div
            className={`min-h-screen flex items-center justify-center px-4 ${
                isLight
                    ? 'bg-gradient-to-br from-slate-100 via-white to-slate-100'
                    : 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950'
            }`}
        >
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
                    <h1
                        className={`text-3xl font-bold mb-2 tracking-wide ${
                            isLight ? 'text-slate-900' : 'text-white'
                        }`}
                    >
                        OwnVault
                    </h1>
                    <p className={isLight ? 'text-slate-500 text-sm' : 'text-gray-400 text-sm'}>
                        {t('login.welcomeBack')}
                    </p>
                </div>

                {/* Form Glass Card */}
                <div
                    className={`rounded-3xl p-8 shadow-2xl border ${
                        isLight
                            ? 'bg-white/90 backdrop-blur-xl border-slate-200 shadow-slate-200/60'
                            : 'glass border-slate-800'
                    }`}
                >
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Password Input */}
                        <div className="space-y-2">
                            <label
                                className={`text-xs font-medium ${
                                    isLight ? 'text-slate-600' : 'text-gray-400'
                                }`}
                            >
                                {t('auth.masterPassword')}
                            </label>

                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className={`w-full px-4 py-3 rounded-xl pr-12 focus:ring-2 focus:ring-brand focus:border-transparent ${
                                        isLight
                                            ? 'bg-white text-slate-900 border border-slate-300 placeholder-slate-400'
                                            : 'bg-slate-800/70 text-gray-200 border border-slate-700 placeholder-gray-500'
                                    }`}
                                    placeholder={t('login.enterPassword')}
                                    disabled={isLoading}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors ${
                                        isLight
                                            ? 'text-slate-500 hover:text-slate-700'
                                            : 'text-gray-400 hover:text-gray-300'
                                    }`}
                                >
                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>

                            {error && (
                                <div
                                    className={`mt-2 flex items-start gap-2 rounded-xl px-3 py-2.5 border ${
                                        isLight
                                            ? 'bg-red-50 border-red-200'
                                            : 'bg-red-900/20 border-red-500/30'
                                    }`}
                                >
                                    <AlertTriangle
                                        size={16}
                                        className={`mt-0.5 flex-shrink-0 ${
                                            isLight ? 'text-red-500' : 'text-red-400'
                                        }`}
                                    />
                                    <p
                                        className={`text-sm ${
                                            isLight ? 'text-red-600' : 'text-red-400'
                                        }`}
                                    >
                                        {error}
                                    </p>
                                </div>
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
                            <p
                                className={`text-xs text-center ${
                                    isLight ? 'text-slate-500' : 'text-gray-500'
                                }`}
                            >
                                {t('login.biometricHint')}
                            </p>
                        )}
                    </form>
                </div>

                {/* Avviso storage browser */}
                <div
                    className={`mt-4 flex items-start gap-2 rounded-xl px-4 py-3 border ${
                        isLight
                            ? 'bg-amber-50 border-amber-200'
                            : 'bg-slate-800/50 border-slate-700'
                    }`}
                >
                    <AlertTriangle
                        size={14}
                        className={`mt-0.5 flex-shrink-0 ${
                            isLight ? 'text-amber-500' : 'text-amber-400'
                        }`}
                    />
                    <p
                        className={`text-xs leading-relaxed ${
                            isLight ? 'text-slate-600' : 'text-gray-400'
                        }`}
                    >
                        {t('login.storageWarning')}
                    </p>
                </div>

                {/* Footer */}
                <div
                    className={`mt-4 text-center text-xs ${
                        isLight ? 'text-slate-500' : 'text-gray-500'
                    }`}
                >
                    {t('login.e2eEncryption')} • v{version}
                    <span className="mx-2">•</span>
                    <a
                        href="/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`underline underline-offset-2 transition-colors ${
                            isLight ? 'hover:text-slate-700' : 'hover:text-gray-300'
                        }`}
                    >
                        {t('privacy.link')}
                    </a>
                </div>
            </div>
        </div>
    );
}