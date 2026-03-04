/**
 * InstallPrompt
 * Mostra il banner di installazione PWA su Android (prompt nativo)
 * e le istruzioni manuali su iOS.
 * Non appare se la PWA è già installata in modalità standalone.
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Share, Plus, Download } from 'lucide-react';

const DISMISS_KEY = 'installPromptDismissedAt';
const DISMISS_DAYS = 7;

function isStandalone() {
    return (
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true
    );
}

function isIOS() {
    return (
        /iphone|ipad|ipod/i.test(navigator.userAgent) &&
        !/crios|fxios|opios/i.test(navigator.userAgent) // esclude Chrome/Firefox su iOS
    );
}

function wasDismissedRecently() {
    const ts = localStorage.getItem(DISMISS_KEY);
    if (!ts) return false;
    return Date.now() - Number(ts) < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

export function InstallPrompt() {
    const { t } = useTranslation();
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [mode, setMode] = useState(null); // 'android' | 'ios' | null

    useEffect(() => {
        if (isStandalone() || wasDismissedRecently()) return;

        if (isIOS()) {
            setMode('ios');
            return;
        }

        function onBeforeInstall(e) {
            e.preventDefault();
            setDeferredPrompt(e);
            setMode('android');
        }

        window.addEventListener('beforeinstallprompt', onBeforeInstall);
        return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
    }, []);

    function dismiss() {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
        setMode(null);
        setDeferredPrompt(null);
    }

    async function handleInstall() {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') setMode(null);
        setDeferredPrompt(null);
    }

    if (!mode) return null;

    return (
        <div className="fixed bottom-24 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-80 z-[9998] bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl overflow-hidden">

            {/* Android */}
            {mode === 'android' && (
                <div className="p-4 flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-500/15 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Download size={20} className="text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white text-sm">{t('install.title')}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{t('install.subtitle')}</p>
                    </div>
                    <button
                        onClick={handleInstall}
                        className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-3 py-2 rounded-xl transition-colors flex-shrink-0"
                    >
                        {t('install.button')}
                    </button>
                    <button onClick={dismiss} className="p-1 text-gray-500 hover:text-gray-300 flex-shrink-0">
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* iOS */}
            {mode === 'ios' && (
                <div className="p-4">
                    <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-blue-500/15 rounded-lg flex items-center justify-center flex-shrink-0">
                                <Download size={16} className="text-blue-400" />
                            </div>
                            <p className="font-semibold text-white text-sm">{t('install.title')}</p>
                        </div>
                        <button onClick={dismiss} className="p-1 text-gray-500 hover:text-gray-300">
                            <X size={16} />
                        </button>
                    </div>

                    <ol className="space-y-2.5">
                        <li className="flex items-center gap-2.5 text-sm text-gray-300">
                            <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center flex-shrink-0 font-bold">1</span>
                            <span>
                                {t('install.iosStep1Prefix')}{' '}
                                <span className="inline-flex items-center gap-1 text-blue-400 font-medium">
                                    <Share size={13} />
                                    {t('install.iosStep1Share')}
                                </span>
                                {' '}{t('install.iosStep1Suffix')}
                            </span>
                        </li>
                        <li className="flex items-center gap-2.5 text-sm text-gray-300">
                            <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center flex-shrink-0 font-bold">2</span>
                            <span>
                                {t('install.iosStep2Prefix')}{' '}
                                <span className="inline-flex items-center gap-1 text-blue-400 font-medium">
                                    <Plus size={13} />
                                    {t('install.iosStep2AddHome')}
                                </span>
                            </span>
                        </li>
                    </ol>

                    {/* Freccia verso il basso che indica la barra del browser */}
                    <div className="mt-3 flex justify-center">
                        <span className="text-gray-500 text-xs">{t('install.iosBrowserHint')}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
