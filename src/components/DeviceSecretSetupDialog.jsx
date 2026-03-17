/**
 * DeviceSecretSetupDialog
 *
 * Dialog per l'abilitazione della Device Secret Key.
 * Mostra la recovery key dopo l'abilitazione e richiede conferma
 * che l'utente l'abbia salvata in un posto sicuro.
 *
 * Flussi:
 *   - step 'intro'      : spiega cos'è il device secret, chiede password
 *   - step 'activating' : operazioni in corso
 *   - step 'key'        : mostra la recovery key
 *   - step 'confirm'    : chiede conferma che l'utente l'abbia salvata
 */

import { useState } from 'react';
import { Shield, Copy, Check, Eye, EyeOff, AlertTriangle, KeyRound, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';

export function DeviceSecretSetupDialog({ onClose }) {
    const { enableDeviceSecret, dismissRecoveryKey } = useAuth();
    const { t } = useTranslation();

    const [step, setStep] = useState('intro'); // intro | activating | key | confirm
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [recoveryKey, setRecoveryKey] = useState('');
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);
    const [confirmed, setConfirmed] = useState(false);

    async function handleActivate() {
        if (!password) {
            setError(t('auth.requiredField'));
            return;
        }
        setError('');
        setStep('activating');

        const result = await enableDeviceSecret(password);

        if (!result.success) {
            setError(result.error);
            setStep('intro');
            return;
        }

        setRecoveryKey(result.recoveryKey);
        setStep('key');
    }

    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(recoveryKey);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } catch {
            // fallback silenzioso
        }
    }

    function handleDone() {
        dismissRecoveryKey();
        onClose();
    }

    // ---- RENDER ----

    if (step === 'intro' || step === 'activating') {
        return (
            <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
                <div className="bg-slate-800 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md">
                    {/* Header */}
                    <div className="flex items-center justify-between p-5 border-b border-slate-700">
                        <div className="flex items-center gap-2">
                            <KeyRound size={20} className="text-blue-400" />
                            <h2 className="text-lg font-bold text-white">
                                {t('deviceSecret.setup.title')}
                            </h2>
                        </div>
                        {step !== 'activating' && (
                            <button onClick={onClose} className="text-gray-400 hover:text-white">
                                <X size={20} />
                            </button>
                        )}
                    </div>

                    <div className="p-5 space-y-4">
                        {/* Spiegazione */}
                        <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4 space-y-2">
                            <p className="text-sm text-blue-300 font-medium">
                                {t('deviceSecret.setup.whatIsIt')}
                            </p>
                            <p className="text-xs text-slate-500">
                                {t('deviceSecret.setup.description')}
                            </p>
                        </div>

                        {/* Warning */}
                        <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-3 flex items-start gap-2">
                            <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-600">
                                {t('deviceSecret.setup.warning')}
                            </p>
                        </div>

                        {/* Password */}
                        <div className="space-y-1.5">
                            <label className="text-xs text-gray-400 font-medium">
                                {t('deviceSecret.setup.passwordLabel')}
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleActivate()}
                                    disabled={step === 'activating'}
                                    className="w-full px-4 py-3 bg-slate-900/70 text-gray-200 border border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-12 placeholder-gray-500 disabled:opacity-50"
                                    placeholder={t('login.enterPassword')}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                            {error && (
                                <p className="text-red-400 text-xs flex items-center gap-1">
                                    <AlertTriangle size={12} /> {error}
                                </p>
                            )}
                        </div>

                        {/* Buttons */}
                        <div className="flex gap-3 pt-1">
                            <button
                                onClick={onClose}
                                disabled={step === 'activating'}
                                className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-gray-300 rounded-xl font-medium transition-colors disabled:opacity-50"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={handleActivate}
                                disabled={step === 'activating' || !password}
                                className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {step === 'activating' ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                                        <span>{t('deviceSecret.setup.activating')}</span>
                                    </>
                                ) : (
                                    <>
                                        <Shield size={16} />
                                        <span>{t('deviceSecret.setup.activateBtn')}</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (step === 'key') {
        return (
            <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
                <div className="bg-slate-800 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md">
                    <div className="flex items-center gap-2 p-5 border-b border-slate-700">
                        <KeyRound size={20} className="text-green-400" />
                        <h2 className="text-lg font-bold text-white">
                            {t('deviceSecret.key.title')}
                        </h2>
                    </div>

                    <div className="p-5 space-y-4">
                        <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-3">
                            <p className="text-xs text-green-300">
                                {t('deviceSecret.key.successHint')}
                            </p>
                        </div>

                        {/* Recovery key box */}
                        <div className="bg-slate-900 border border-slate-600 rounded-xl p-4">
                            <p className="text-xs text-gray-400 mb-3 font-medium uppercase tracking-wide">
                                {t('deviceSecret.key.recoveryKeyLabel')}
                            </p>
                            <div className="flex items-center gap-3">
                                <code className="flex-1 text-sm font-mono text-green-300 tracking-wider break-all select-all">
                                    {recoveryKey}
                                </code>
                                <button
                                    onClick={handleCopy}
                                    className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors flex-shrink-0"
                                    title={t('deviceSecret.key.copy')}
                                >
                                    {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} className="text-gray-400" />}
                                </button>
                            </div>
                        </div>

                        {/* Warning */}
                        <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-3 flex items-start gap-2">
                            <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-xs text-red-300 font-medium">
                                    {t('deviceSecret.key.saveWarningTitle')}
                                </p>
                                <p className="text-xs text-slate-400">
                                    {t('deviceSecret.key.saveWarningBody')}
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={() => setStep('confirm')}
                            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors"
                        >
                            {t('deviceSecret.key.savedBtn')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // step === 'confirm'
    return (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <div className="bg-slate-800 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md">
                <div className="flex items-center gap-2 p-5 border-b border-slate-700">
                    <Shield size={20} className="text-blue-400" />
                    <h2 className="text-lg font-bold text-white">
                        {t('deviceSecret.confirm.title')}
                    </h2>
                </div>

                <div className="p-5 space-y-4">
                    <p className="text-sm text-gray-300">
                        {t('deviceSecret.confirm.description')}
                    </p>

                    {/* Mostra la chiave una seconda volta per sicurezza */}
                    <div className="bg-slate-900 border border-slate-600 rounded-xl p-3">
                        <code className="text-xs font-mono text-green-300 tracking-wider break-all">
                            {recoveryKey}
                        </code>
                    </div>

                    <label className="flex items-start gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={confirmed}
                            onChange={e => setConfirmed(e.target.checked)}
                            className="mt-1 w-4 h-4 accent-blue-500 flex-shrink-0"
                        />
                        <span className="text-sm text-gray-300">
                            {t('deviceSecret.confirm.checkboxLabel')}
                        </span>
                    </label>

                    <button
                        onClick={handleDone}
                        disabled={!confirmed}
                        className="w-full py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {t('deviceSecret.confirm.doneBtn')}
                    </button>
                </div>
            </div>
        </div>
    );
}
