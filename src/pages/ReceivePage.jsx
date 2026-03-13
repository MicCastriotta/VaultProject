/**
 * ReceivePage — pagina pubblica per ricevere un profilo cifrato da un contatto.
 * Accessibile senza autenticazione (stessa gestione di /invite e /privacy).
 *
 * URL format: /receive#<base64url(JSON ECDH payload)>
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, AlertCircle, CheckCircle, User, CreditCard } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { contactsService } from '../services/contactsService';
import { cryptoService } from '../services/cryptoService';
import { databaseService } from '../services/databaseService';

function parseReceiveHash(hash) {
    const raw = hash.startsWith('#') ? hash.slice(1) : hash;
    if (!raw) return null;
    try {
        // Il payload è il JSON ECDH base64url-encoded
        const padded = raw.replace(/-/g, '+').replace(/_/g, '/');
        const pad = (4 - (padded.length % 4)) % 4;
        const json = atob(padded + '='.repeat(pad));
        return JSON.parse(json);
    } catch {
        return null;
    }
}

const isIosNonStandalone = /iPhone|iPad|iPod/.test(navigator.userAgent)
    && !window.navigator.standalone;

export function ReceivePage() {
    const { isUnlocked, userExists, refreshHMAC } = useAuth();
    const navigate = useNavigate();
    const { t } = useTranslation();

    const [payload, setPayload] = useState(null);       // ECDH payload raw
    const [profile, setProfile] = useState(null);       // profilo decifrato (preview)
    const [status, setStatus] = useState('idle');        // idle | decrypting | importing | done | error

    useEffect(() => {
        const parsed = parseReceiveHash(window.location.hash);
        if (!parsed) {
            setStatus('invalid');
            return;
        }
        setPayload(parsed);

        // Se il vault è già sbloccato, decifra subito per mostrare la preview
        if (isUnlocked) {
            decryptPreview(parsed);
        }
    }, [isUnlocked]);

    async function decryptPreview(p) {
        setStatus('decrypting');
        try {
            const data = await contactsService.decryptIncomingProfile(p);
            setProfile(data);
            setStatus('idle');
        } catch {
            setStatus('decryptError');
        }
    }

    async function handleImport() {
        if (!profile) return;
        setStatus('importing');
        try {
            const { title, category, username, password, website, note, secretKey, icon, attachment } = profile;
            const encrypted = await cryptoService.encryptData({
                title, category, username, password, website, note, secretKey, icon,
                lastModified: new Date().toISOString()
            });
            const newProfileId = await databaseService.saveProfile({ ...encrypted, category: category || 'WEB' });

            // Se il payload include un allegato, salvalo ri-cifrandolo con il nuovo profileId
            if (attachment?.data && attachment?.fileName) {
                const binaryStr = atob(attachment.data);
                const bytes = new Uint8Array(binaryStr.length);
                for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
                const arrayBuffer = bytes.buffer;

                const { iv, encryptedData, blobVersion } = await cryptoService.encryptBlob(arrayBuffer, newProfileId);
                const hash = await cryptoService.computeFileHash(arrayBuffer);
                const encMeta = await cryptoService.encryptAttachmentMeta({
                    fileName: attachment.fileName,
                    mimeType: attachment.mimeType || 'application/octet-stream',
                    size: arrayBuffer.byteLength,
                    hash
                });
                await databaseService.saveAttachment({
                    profileId: newProfileId,
                    metaIv: encMeta.iv,
                    metaData: encMeta.data,
                    iv,
                    encryptedData,
                    blobVersion
                });
            }

            await refreshHMAC();
            setStatus('done');
            setTimeout(() => navigate('/'), 1500);
        } catch {
            setStatus('error');
        }
    }

    // Vault bloccato: salva in sessionStorage, rimanda al login
    function handleOpenVault() {
        sessionStorage.setItem('ov_pending_receive', window.location.hash);
        navigate('/');
    }

    if (status === 'invalid') {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
                <div className="text-center">
                    <AlertCircle className="mx-auto mb-4 text-red-400" size={40} />
                    <p className="text-white font-semibold">{t('share.invalidLink')}</p>
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
                <p className="text-center text-sm text-gray-400 mb-6">{t('share.receivedTitle')}</p>

                {/* Preview profilo (se decifrato) */}
                {profile ? (
                    <div className="p-4 bg-slate-800 rounded-xl mb-6 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                            {profile.category === 'CARD'
                                ? <CreditCard size={20} className="text-blue-400" />
                                : <User size={20} className="text-blue-400" />
                            }
                        </div>
                        <div className="min-w-0">
                            <p className="text-white font-semibold truncate">{profile.title || t('share.untitled')}</p>
                            <p className="text-xs text-gray-500">{profile.category === 'CARD' ? t('share.card') : t('share.web')}</p>
                        </div>
                        <ShieldCheck size={18} className="text-green-400 flex-shrink-0 ml-auto" />
                    </div>
                ) : (
                    <div className="p-4 bg-slate-800 rounded-xl mb-6 text-center">
                        <ShieldCheck className="mx-auto mb-2 text-blue-400" size={28} />
                        <p className="text-white font-semibold">{t('share.encryptedProfile')}</p>
                        <p className="text-xs text-gray-500 mt-1">{t('share.encryptedProfileHint')}</p>
                    </div>
                )}

                {/* Azioni */}
                {status === 'done' ? (
                    <div className="flex items-center justify-center gap-2 text-green-400 font-medium py-3">
                        <CheckCircle size={20} />
                        {t('share.imported')}
                    </div>
                ) : status === 'error' ? (
                    <p className="text-center text-red-400 text-sm py-3">{t('share.importError')}</p>
                ) : status === 'decryptError' ? (
                    <p className="text-center text-red-400 text-sm py-3">{t('share.decryptError')}</p>
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
                                <p className="text-sm text-gray-400 text-center mb-4">{t('contacts.loginRequired')}</p>
                                <button
                                    onClick={handleOpenVault}
                                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition"
                                >
                                    {t('contacts.openVault')}
                                </button>
                            </>
                        )}
                    </div>
                ) : status === 'decrypting' ? (
                    <div className="flex justify-center py-4">
                        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : (
                    <button
                        onClick={handleImport}
                        disabled={status === 'importing'}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-medium transition"
                    >
                        {status === 'importing'
                            ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            : <ShieldCheck size={18} />
                        }
                        {status === 'importing' ? t('share.importing') : t('share.importButton')}
                    </button>
                )}
            </div>
        </div>
    );
}
