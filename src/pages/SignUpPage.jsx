/**
 * SignUp Page
 * Prima volta: crea password master
 */

import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { cryptoService } from '../services/cryptoService';
import { Eye, EyeOff, Lock } from 'lucide-react';

export function SignUpPage() {
    const { setupMasterPassword } = useAuth();
    const { t } = useTranslation();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const strength = cryptoService.checkPasswordStrength(password);

    const version = __APP_VERSION__;

    const strengthConfig = {
        Blank: { progress: 0, color: 'bg-gray-300', textKey: '' },
        VeryWeak: { progress: 25, color: 'bg-red-500', textKey: 'signup.strength.veryWeak' },
        Weak: { progress: 25, color: 'bg-orange-500', textKey: 'signup.strength.weak' },
        Medium: { progress: 50, color: 'bg-orange-400', textKey: 'signup.strength.medium' },
        Strong: { progress: 75, color: 'bg-blue-500', textKey: 'signup.strength.strong' },
        VeryStrong: { progress: 100, color: 'bg-green-500', textKey: 'signup.strength.veryStrong' }
    };

    const currentStrength = strengthConfig[strength] || strengthConfig.Blank;

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');

        if (!password || !confirmPassword) {
            setError(t('auth.requiredField'));
            return;
        }

        if (password !== confirmPassword) {
            setError(t('auth.passwordMismatch'));
            return;
        }

        if (password.length < 5) {
            setError(t('signup.passwordTooShort'));
            return;
        }

        setIsLoading(true);

        try {
            const result = await setupMasterPassword(password);

            if (!result.success) {
                setError(result.error || t('signup.setupFailed'));
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
                        <div className="w-20 h-20 bg-gradient-to-br from-brand to-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-900/40">
                            <Lock className="w-12 h-12 text-white" />
                        </div>
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2 tracking-wide">🔐 OwnVault</h1>
                    <p className="text-gray-400 text-sm">{t('signup.letsBegin')}</p>
                </div>

                {/* Form Glass Card */}
                <div className="glass rounded-3xl p-8 border border-slate-800 shadow-2xl">
                    <div className="mb-6">
                        <p className="text-gray-300 text-sm text-center">
                            {t('signup.choosePasswordHint')}
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Password Strength */}
                        {password && (
                            <div className="space-y-2">
                                <label className="text-xs text-gray-400 font-medium">{t('signup.passwordStrength')}</label>
                                <div className="flex gap-2">
                                    <div className="flex-1 bg-slate-800/50 rounded-full h-2.5 overflow-hidden border border-slate-700">
                                        <div
                                            className={`h-full rounded-full transition-all ${currentStrength.color}`}
                                            style={{ width: `${currentStrength.progress}%` }}
                                        />
                                    </div>
                                </div>
                                <p className={`text-sm font-semibold ${currentStrength.progress < 50 ? 'text-red-400' :
                                        currentStrength.progress < 75 ? 'text-orange-400' :
                                            'text-accent'
                                    }`}>
                                    {currentStrength.textKey ? t(currentStrength.textKey) : ''}
                                </p>
                            </div>
                        )}

                        {/* Password Input */}
                        <div className="space-y-2">
                            <label className="text-xs text-gray-400 font-medium">
                                {t('auth.masterPassword')}
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-800/70 text-gray-200 border border-slate-700 rounded-xl focus:ring-2 focus:ring-brand focus:border-transparent placeholder-gray-500"
                                    placeholder={t('signup.enterPasswordPlaceholder')}
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
                        </div>

                        {/* Confirm Password */}
                        <div className="space-y-2">
                            <label className="text-xs text-gray-400 font-medium">
                                {t('auth.confirmPassword')}
                            </label>
                            <div className="relative">
                                <input
                                    type={showConfirm ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-800/70 text-gray-200 border border-slate-700 rounded-xl focus:ring-2 focus:ring-brand focus:border-transparent placeholder-gray-500"
                                    placeholder={t('signup.confirmPasswordPlaceholder')}
                                    disabled={isLoading}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirm(!showConfirm)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                                >
                                    {showConfirm ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="bg-red-900/30 border border-red-700/50 text-red-400 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                                <span className="text-xs">⚠️</span>
                                {error}
                            </div>
                        )}

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-gradient-to-r from-brand to-blue-500 hover:from-brand/90 hover:to-blue-500/90 text-white py-3 rounded-xl font-semibold transition-all shadow-lg shadow-blue-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <div className="flex items-center justify-center gap-2">
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                    <span>{t('signup.creating')}</span>
                                </div>
                            ) : (
                                t('signup.start')
                            )}
                        </button>
                    </form>
                </div>

                {/* Footer */}
                <div className="mt-6 text-center text-xs text-gray-500">
                    {t('login.e2eEncryption')} • v{version}
                </div>
            </div>
        </div>
    );
}
