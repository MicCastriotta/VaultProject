/**
 * Sync Conflict Dialog
 * Mostra dialog quando ci sono dati sia in locale che in cloud al momento
 * della prima connessione. L'utente sceglie quale versione mantenere.
 */

import { AlertTriangle, Cloud, Smartphone, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function SyncConflictDialog({ cloudData, localData, onResolve }) {
    const { t } = useTranslation();

    const cloudTimestamp = cloudData.lastModified || cloudData.syncTimestamp;
    const localTimestamp = localData.exportDate || null;

    const cloudProfilesCount = cloudData.profiles?.length || 0;
    const localProfilesCount = localData.profiles?.length || 0;

    function handleUseCloud() {
        onResolve(true);
    }

    function handleKeepLocal() {
        onResolve(false);
    }

    return (
        <>
            {/* Overlay — click = mantieni locale */}
            <div
                className="fixed inset-0 bg-black/70 z-50"
                onClick={handleKeepLocal}
            />

            {/* Dialog */}
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-11/12 max-w-md glass border border-slate-700 rounded-2xl shadow-2xl z-50">
                {/* Header */}
                <div className="p-5 border-b border-slate-700 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle size={22} className="text-yellow-400" />
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-white">{t('syncConflict.title')}</h3>
                        <p className="text-xs text-gray-400 mt-0.5">{t('syncConflict.subtitle')}</p>
                    </div>
                </div>

                {/* Content */}
                <div className="p-5 space-y-3">
                    {/* Cloud */}
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                        <div className="flex items-start gap-3">
                            <Cloud size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-blue-300 text-sm mb-1.5">{t('syncConflict.cloudVersion')}</h4>
                                <div className="space-y-1 text-xs text-blue-200/80">
                                    {cloudTimestamp && (
                                        <div className="flex items-center gap-1.5">
                                            <Calendar size={12} />
                                            <span>{new Date(cloudTimestamp).toLocaleString()}</span>
                                        </div>
                                    )}
                                    <div>
                                        <strong>{cloudProfilesCount}</strong> {t('syncConflict.profiles')}
                                    </div>
                                    {cloudData.deviceName && (
                                        <div className="text-blue-300/60">
                                            {t('syncConflict.lastModifiedFrom', { device: cloudData.deviceName })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Local */}
                    <div className="bg-slate-700/40 border border-slate-600/50 rounded-xl p-4">
                        <div className="flex items-start gap-3">
                            <Smartphone size={20} className="text-gray-400 flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-gray-300 text-sm mb-1.5">{t('syncConflict.localVersion')}</h4>
                                <div className="space-y-1 text-xs text-gray-400">
                                    {localTimestamp && (
                                        <div className="flex items-center gap-1.5">
                                            <Calendar size={12} />
                                            <span>{new Date(localTimestamp).toLocaleString()}</span>
                                        </div>
                                    )}
                                    <div>
                                        <strong>{localProfilesCount}</strong> {t('syncConflict.profiles')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Warning */}
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                        <p className="text-xs text-red-300">{t('syncConflict.warning')}</p>
                    </div>
                </div>

                {/* Actions */}
                <div className="p-5 border-t border-slate-700 space-y-2">
                    <button
                        onClick={handleUseCloud}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 px-4 rounded-xl font-medium text-sm transition-colors flex items-center justify-center gap-2"
                    >
                        <Cloud size={18} />
                        {t('syncConflict.useCloud')}
                    </button>
                    <button
                        onClick={handleKeepLocal}
                        className="w-full bg-slate-700 hover:bg-slate-600 text-gray-200 py-3 px-4 rounded-xl font-medium text-sm transition-colors flex items-center justify-center gap-2"
                    >
                        <Smartphone size={18} />
                        {t('syncConflict.keepLocal')}
                    </button>
                </div>
            </div>
        </>
    );
}
