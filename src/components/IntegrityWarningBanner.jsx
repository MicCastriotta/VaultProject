/**
 * Integrity Warning Dialog
 * Mostra una dialog quando viene rilevata manomissione del database.
 * Appare dopo il login se l'HMAC non corrisponde.
 */

import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';

export function IntegrityWarningBanner() {
    const { integrityError, dismissIntegrityError } = useAuth();
    const { t } = useTranslation();

    if (!integrityError) return null;

    return (
        <>
            <div
                className="fixed inset-0 bg-black/70 z-50"
                onClick={dismissIntegrityError}
            />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-11/12 max-w-md glass border border-red-500/40 rounded-2xl shadow-2xl z-50">
                {/* Header */}
                <div className="p-5 border-b border-slate-700 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle size={22} className="text-red-400" />
                    </div>
                    <h3 className="text-base font-bold text-white">{t('integrityWarning.title')}</h3>
                </div>

                {/* Body */}
                <div className="p-5">
                    <p className="text-sm text-gray-300 leading-relaxed">{t('integrityWarning.body')}</p>
                </div>

                {/* Actions */}
                <div className="px-5 pb-5">
                    <button
                        onClick={dismissIntegrityError}
                        className="w-full bg-red-600 hover:bg-red-500 text-white py-3 px-4 rounded-xl font-medium text-sm transition-colors"
                    >
                        {t('integrityWarning.dismiss')}
                    </button>
                </div>
            </div>
        </>
    );
}
