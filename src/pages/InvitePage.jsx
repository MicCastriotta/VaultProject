/**
 * InvitePage — pagina pubblica per riscattare un invite link.
 * Accessibile senza autenticazione (gestita in AppRoutes come /privacy).
 *
 * URL format: /invite#pk=<base64url>&name=<encoded>
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserPlus, ShieldCheck, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { contactsService } from '../services/contactsService';

const isIosNonStandalone = /iPhone|iPad|iPod/.test(navigator.userAgent)
    && !window.navigator.standalone;

export function InvitePage() {
    const { isUnlocked, userExists } = useAuth();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [payload, setPayload] = useState(null);
    const [status, setStatus] = useState('idle'); // idle | saving | done | error

    useEffect(() => {
        const parsed = contactsService.parseInviteHash(window.location.hash);
        setPayload(parsed);
    }, []);

    async function handleAdd() {
        if (!payload) return;
        setStatus('saving');
        try {
            await contactsService.addContact({ name: payload.name, publicKey: payload.publicKey });
            setStatus('done');
            setTimeout(() => navigate('/contacts'), 1500);
        } catch {
            setStatus('error');
        }
    }

    if (!payload) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
                <div className="text-center">
                    <AlertCircle className="mx-auto mb-4 text-red-400" size={40} />
                    <p className="text-white font-semibold">{t('contacts.inviteInvalid')}</p>
                    <button
                        onClick={() => navigate('/')}
                        className="mt-6 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-gray-300 rounded-xl text-sm transition"
                    >
                        {t('contacts.openVault')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
            <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">

                {/* Logo */}
                <div className="flex items-center justify-center mb-2">
                    <img src="/icons/appicon.png" alt="OwnVault" className="w-12 h-12 object-contain" />
                </div>
                <p className="text-center text-xl font-bold text-white mb-1">OwnVault</p>
                <p className="text-center text-sm text-gray-400 mb-6">{t('contacts.inviteReceived')}</p>

                {/* Mittente */}
                <div className="p-4 bg-slate-800 rounded-xl mb-6 text-center">
                    <ShieldCheck className="mx-auto mb-2 text-blue-400" size={28} />
                    <p className="text-white font-semibold text-lg">{payload.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{t('contacts.wantsToConnect')}</p>
                </div>

                {status === 'done' ? (
                    <div className="flex items-center justify-center gap-2 text-green-400 font-medium py-3">
                        <CheckCircle size={20} />
                        {t('contacts.added')}
                    </div>
                ) : status === 'error' ? (
                    <p className="text-center text-red-400 text-sm py-3">{t('contacts.addError')}</p>
                ) : !isUnlocked ? (
                    <div>
                        {isIosNonStandalone && !userExists ? (
                            <>
                                <p className="text-sm text-gray-400 text-center mb-4">{t('share.iosNotice')}</p>
                                <button
                                    onClick={() => navigator.share({ url: window.location.href })}
                                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition"
                                >
                                    {t('share.openInApp')}
                                </button>
                            </>
                        ) : (
                            <>
                                <p className="text-sm text-gray-400 text-center mb-4">
                                    {t('contacts.loginRequired')}
                                </p>
                                <button
                                    onClick={() => {
                                        sessionStorage.setItem('ov_pending_invite', JSON.stringify(payload));
                                        navigate('/');
                                    }}
                                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition"
                                >
                                    {t('contacts.openVault')}
                                </button>
                            </>
                        )}
                    </div>
                ) : (
                    <button
                        onClick={handleAdd}
                        disabled={status === 'saving'}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-medium transition"
                    >
                        <UserPlus size={18} />
                        {status === 'saving' ? t('contacts.saving') : t('contacts.addContact')}
                    </button>
                )}
            </div>
        </div>
    );
}
