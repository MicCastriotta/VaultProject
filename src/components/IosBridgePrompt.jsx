/**
 * IosBridgePrompt — clipboard bridge per iOS.
 *
 * Usato su ReceivePage e InvitePage quando il link viene aperto in Safari
 * su iOS (non-standalone). Copia l'URL corrente nella clipboard dell'utente;
 * dopo aver aperto la PWA dalla Home Screen e sbloccato il vault, LoginPage
 * legge la clipboard (durante il gesto sul bottone di login) e naviga
 * automaticamente alla route corretta.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, Copy } from 'lucide-react';

export function IosBridgePrompt() {
    const { t } = useTranslation();
    const [done, setDone] = useState(false);

    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(window.location.href);
        } catch {
            // fallback silenzioso: l'utente può copiare manualmente dalla barra URL
        }
        setDone(true);
    }

    if (done) {
        return (
            <div className="text-center py-2">
                <CheckCircle className="mx-auto mb-3 text-green-400" size={28} />
                <p className="text-sm text-gray-300 font-medium">{t('share.iosCopied')}</p>
            </div>
        );
    }

    return (
        <>
            <p className="text-sm text-gray-400 text-center mb-4">{t('share.iosNotice')}</p>
            <button
                onClick={handleCopy}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition flex items-center justify-center gap-2"
            >
                <Copy size={18} />
                {t('share.copyLink')}
            </button>
        </>
    );
}
