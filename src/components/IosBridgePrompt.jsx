/**
 * IosBridgePrompt — cookie bridge per iOS.
 *
 * Usato su ReceivePage e InvitePage quando la PWA è installata ma l'utente
 * ha aperto il link in Safari (storage isolato, userExists = false).
 *
 * Al click scrive un cookie first-party con il hash dell'URL corrente;
 * CookieBridgeHandler in App.jsx lo legge all'avvio della PWA
 * e naviga alla route corretta.
 *
 * cookieName: 'ov_cb_receive' | 'ov_cb_invite'
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle } from 'lucide-react';

export function IosBridgePrompt({ cookieName }) {
    const { t } = useTranslation();
    const [done, setDone] = useState(false);

    function handlePress() {
        const hash = encodeURIComponent(window.location.hash);
        document.cookie = `${cookieName}=${hash}; path=/; max-age=3600; SameSite=Lax`;
        setDone(true);
    }

    if (done) {
        return (
            <div className="text-center py-2">
                <CheckCircle className="mx-auto mb-3 text-green-400" size={28} />
                <p className="text-sm text-gray-300 font-medium">{t('share.iosCookieSet')}</p>
            </div>
        );
    }

    return (
        <>
            <p className="text-sm text-gray-400 text-center mb-4">{t('share.iosNotice')}</p>
            <button
                onClick={handlePress}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition"
            >
                {t('share.openInApp')}
            </button>
        </>
    );
}
