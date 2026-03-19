import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ArrowLeft, UserPlus, Trash2, User, Pencil,
    X, Check, AlertCircle, CreditCard, Globe, Shield, Fingerprint, Paperclip, Link
} from 'lucide-react';
import { contactsService } from '../services/contactsService';
import { useAuth } from '../contexts/AuthContext';

const GUIDE_KEY = 'contacts_guide_seen';

export function ContactsPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useTranslation();
    const { refreshHMAC } = useAuth();
    const [contacts, setContacts] = useState([]);
    const [myFingerprint, setMyFingerprint] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [editingName, setEditingName] = useState(false);
    const [nameInput, setNameInput] = useState('');
    const nameInputRef = useRef(null);

    const [showGuide, setShowGuide] = useState(false);

    // Feedback toast
    const [importStatus, setImportStatus] = useState(null); // { type: 'success'|'error', message }

    // Modal di anteprima prima di importare
    // { type: 'invite', data } | { type: 'profile', data, profileData } | { type: 'loading' } | { type: 'error', message }
    const [preview, setPreview] = useState(null);
    const [isConfirming, setIsConfirming] = useState(false);

    // Modal "imposta nome" richiesto prima di condividere invito
    const [showNameRequired, setShowNameRequired] = useState(false);
    const [isSharing, setIsSharing] = useState(false);

    // Import da link relay (workaround iOS PWA + desktop)
    const [linkInput, setLinkInput] = useState('');

    useEffect(() => {
        loadContacts();
        initIdentity();
        if (!localStorage.getItem(GUIDE_KEY)) {
            setShowGuide(true);
        }
    }, []);

    // Processa payload relay o file pendente (da PendingRelayHandler / LaunchQueueConsumer).
    // Dipende da location.key così si ri-esegue ad ogni navigazione verso /contacts.
    useEffect(() => {
        const pending = sessionStorage.getItem('ov_pending_for_contacts');
        if (!pending) return;
        sessionStorage.removeItem('ov_pending_for_contacts');
        processOwnvText(pending);
    }, [location.key]);

    useEffect(() => {
        if (editingName && nameInputRef.current) {
            nameInputRef.current.focus();
            nameInputRef.current.select();
        }
    }, [editingName]);

    async function loadContacts() {
        const list = await contactsService.getAllContacts();
        setContacts(list);
    }

    async function initIdentity() {
        try {
            const pk = await contactsService.getPublicKey();
            const fp = await contactsService.getFingerprint(pk);
            const name = await contactsService.getDisplayName();
            setMyFingerprint(fp);
            setDisplayName(name);
            setNameInput(name);
        } catch {
            // vault non ancora sbloccato o primo avvio
        }
    }

    async function handleSaveName() {
        const trimmed = nameInput.trim();
        await contactsService.setDisplayName(trimmed);
        setDisplayName(trimmed);
        setEditingName(false);
    }

    function handleNameKeyDown(e) {
        if (e.key === 'Enter') handleSaveName();
        if (e.key === 'Escape') {
            setNameInput(displayName);
            setEditingName(false);
        }
    }

    async function handleShareInvite() {
        if (!displayName.trim()) {
            setShowNameRequired(true);
            return;
        }
        setIsSharing(true);
        try {
            const url = await contactsService.shareInviteViaRelay();
            const result = await contactsService.shareUrl(url, 'OwnVault – Invito');
            if (result === 'copied') {
                setImportStatus({ type: 'success', message: t('contacts.linkCopied') });
                setTimeout(() => setImportStatus(null), 3000);
            }
        } catch {
            // utente ha annullato o relay non raggiungibile
        } finally {
            setIsSharing(false);
        }
    }

    async function handleImportFromLink() {
        const trimmed = linkInput.trim();
        // Accetta sia URL completa che solo l'ID (32 hex)
        const match = trimmed.match(/\/receive\/([0-9a-f]{32})/) || trimmed.match(/^([0-9a-f]{32})$/);
        if (!match) {
            showImportError(t('contacts.invalidLink'));
            return;
        }
        setLinkInput('');
        try {
            const text = await contactsService.fetchFromRelay(match[1]);
            await processOwnvText(text);
        } catch (err) {
            showImportError(
                err.message === 'relay_expired'
                    ? t('contacts.linkExpired')
                    : t('contacts.parseError')
            );
        }
    }

    async function processOwnvText(text) {
        const data = contactsService.parseOwnvFile(text);
        if (!data) {
            showImportError(t('contacts.parseError'));
            return;
        }

        if (data.type === 'invite') {
            try {
                const fp = await contactsService.getFingerprint(data.pk);
                setPreview({ type: 'invite', data, fingerprint: fp });
            } catch {
                setPreview({ type: 'invite', data, fingerprint: '' });
            }
        } else if (data.type === 'profile') {
            setPreview({ type: 'loading' });
            try {
                const profileData = await contactsService.decryptIncomingProfile(data);
                setPreview({ type: 'profile', data, profileData });
            } catch {
                setPreview({ type: 'error', message: t('contacts.previewDecryptError') });
            }
        } else {
            showImportError(t('contacts.parseError'));
        }
    }

    async function handleConfirmInvite() {
        if (!preview || isConfirming) return;
        setIsConfirming(true);
        try {
            await contactsService.addContact({
                name: preview.data.name || 'Unknown',
                publicKey: preview.data.pk
            });
            await loadContacts();
            setPreview(null);
            setImportStatus({ type: 'success', message: t('contacts.added') });
            setTimeout(() => setImportStatus(null), 3000);
        } catch {
            setPreview(null);
            showImportError(t('contacts.addError'));
        } finally {
            setIsConfirming(false);
        }
    }

    async function handleConfirmProfile() {
        if (!preview || isConfirming) return;
        setIsConfirming(true);
        try {
            const { databaseService } = await import('../services/databaseService');
            const { cryptoService } = await import('../services/cryptoService');

            // Separa l'allegato dai dati del profilo prima di cifrare
            const { attachment, ...profileDataClean } = preview.profileData;

            const encrypted = await cryptoService.encryptData(profileDataClean);
            const newId = await databaseService.saveProfile({
                iv: encrypted.iv,
                data: encrypted.data
            });

            // Salva l'allegato se incluso nel payload
            if (attachment?.data) {
                try {
                    const binary = atob(attachment.data);
                    const bytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

                    const encryptedBlob = await cryptoService.encryptBlob(bytes.buffer, newId);
                    const encryptedMeta = await cryptoService.encryptAttachmentMeta({
                        fileName: attachment.fileName,
                        mimeType: attachment.mimeType,
                        size: attachment.size
                    });
                    await databaseService.saveAttachment({
                        profileId: newId,
                        metaIv: encryptedMeta.iv,
                        metaData: encryptedMeta.data,
                        iv: encryptedBlob.iv,
                        encryptedData: encryptedBlob.encryptedData,
                        blobVersion: encryptedBlob.blobVersion
                    });
                } catch (err) {
                    console.error('Failed to save attachment:', err);
                    // Il profilo è comunque importato, solo l'allegato è mancante
                }
            }

            await refreshHMAC();
            setPreview(null);
            setImportStatus({ type: 'success', message: t('share.imported') });
            setTimeout(() => {
                setImportStatus(null);
                navigate(`/profile/${newId}`);
            }, 1200);
        } catch {
            setPreview(null);
            showImportError(t('share.importError'));
        } finally {
            setIsConfirming(false);
        }
    }

    function showImportError(msg) {
        setImportStatus({ type: 'error', message: msg });
        setTimeout(() => setImportStatus(null), 4000);
    }

    async function handleDelete(id) {
        await contactsService.deleteContact(id);
        loadContacts();
    }

    function handleDismissGuide() {
        localStorage.setItem(GUIDE_KEY, '1');
        setShowGuide(false);
    }

    return (
        <div className="h-full flex flex-col">
            <div className="max-w-2xl mx-auto w-full flex flex-col flex-1 min-h-0 p-6">

                {/* Header */}
                <div className="flex items-center gap-3 mb-6">
                    <button
                        onClick={() => navigate('/')}
                        className="p-2 hover:bg-slate-800 rounded-lg transition"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="text-2xl font-semibold text-white flex-1">
                        {t('contacts.title')}
                    </h1>
                    {/* Condividi invito */}
                    <button
                        onClick={handleShareInvite}
                        disabled={isSharing}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition disabled:opacity-50"
                    >
                        {isSharing
                            ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                            : <UserPlus size={16} />
                        }
                        <span className="hidden sm:inline">{t('contacts.shareInvite')}</span>
                    </button>
                </div>

                {/* Import da link relay — workaround per iOS PWA e desktop */}
                <div className="flex gap-2 mb-4">
                    <input
                        type="url"
                        value={linkInput}
                        onChange={e => setLinkInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && linkInput.trim() && handleImportFromLink()}
                        placeholder={t('contacts.linkPlaceholder')}
                        className="flex-1 bg-slate-800/60 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
                    />
                    <button
                        onClick={handleImportFromLink}
                        disabled={!linkInput.trim()}
                        className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm disabled:opacity-40 transition"
                        title={t('contacts.importLink')}
                    >
                        <Link size={16} />
                    </button>
                </div>

                {/* Guida primo accesso */}
                {showGuide && (
                    <div className="mb-5 rounded-2xl bg-blue-900/20 border border-blue-500/30 p-5 relative">
                        <button
                            onClick={handleDismissGuide}
                            className="absolute top-3 right-3 text-gray-400 hover:text-gray-300"
                        >
                            <X size={16} />
                        </button>
                        <h3 className="text-sm font-semibold text-blue-300 mb-3">{t('contacts.guide.title')}</h3>
                        <div className="space-y-3">
                            {[
                                { icon: <UserPlus size={13} />, title: t('contacts.guide.step1Title'), body: t('contacts.guide.step1') },
                                { icon: <Link size={13} />,     title: t('contacts.guide.step2Title'), body: t('contacts.guide.step2') },
                                { icon: <Shield size={13} />,   title: t('contacts.guide.step3Title'), body: t('contacts.guide.step3') }
                            ].map((s, i) => (
                                <div key={i} className="flex gap-3">
                                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center mt-0.5">
                                        {s.icon}
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-white">{s.title}</p>
                                        <p className="text-xs text-gray-400 mt-0.5">{s.body}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={handleDismissGuide}
                            className="mt-4 w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition"
                        >
                            {t('contacts.guide.dismiss')}
                        </button>
                    </div>
                )}

                {/* La mia identità */}
                {myFingerprint && (
                    <div className="mb-5 px-4 py-3 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-2">
                        <div>
                            <p className="text-xs text-gray-500 mb-1">{t('contacts.myName')}</p>
                            {editingName ? (
                                <div className="flex items-center gap-2">
                                    <input
                                        ref={nameInputRef}
                                        value={nameInput}
                                        onChange={e => setNameInput(e.target.value)}
                                        onKeyDown={handleNameKeyDown}
                                        onBlur={handleSaveName}
                                        maxLength={40}
                                        placeholder={t('contacts.namePlaceholder')}
                                        className="flex-1 bg-slate-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            ) : (
                                <button
                                    onClick={() => setEditingName(true)}
                                    className="flex items-center gap-2 group"
                                >
                                    {displayName ? (
                                        <span className="text-sm font-medium text-white">{displayName}</span>
                                    ) : (
                                        <span className="text-sm text-gray-500 italic">{t('contacts.nameNotSet')}</span>
                                    )}
                                    <Pencil size={12} className="text-gray-600 group-hover:text-gray-400 transition" />
                                </button>
                            )}
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 mb-1">{t('contacts.myFingerprint')}</p>
                            <p className="text-xs font-mono text-blue-400 tracking-wide">{myFingerprint}</p>
                        </div>
                    </div>
                )}

                {/* Feedback importazione */}
                {importStatus && (
                    <div className={`mb-4 flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${
                        importStatus.type === 'success'
                            ? 'bg-green-900/30 border border-green-500/30 text-green-300'
                            : 'bg-red-900/30 border border-red-500/30 text-red-300'
                    }`}>
                        {importStatus.type === 'success'
                            ? <Check size={16} />
                            : <AlertCircle size={16} />
                        }
                        {importStatus.message}
                    </div>
                )}

                {/* Lista contatti */}
                <div className="flex-1 overflow-y-auto">
                    {contacts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-16">
                            <div className="p-4 rounded-2xl bg-slate-800/40">
                                <User size={32} className="text-gray-500" />
                            </div>
                            <p className="text-gray-400 text-sm">{t('contacts.empty')}</p>
                            <p className="text-gray-500 text-xs max-w-xs">{t('contacts.emptyHint')}</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {contacts.map(c => (
                                <div
                                    key={c.id}
                                    className="flex items-center gap-3 px-4 py-3 rounded-[14px] bg-slate-800/65"
                                >
                                    <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                                        <User size={18} className="text-blue-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-white">{c.name}</p>
                                        <p className="text-xs font-mono text-gray-500 truncate">{c.fingerprint}</p>
                                    </div>
                                    <button
                                        onClick={() => handleDelete(c.id)}
                                        className="p-2 hover:bg-red-500/10 text-red-400 rounded-lg transition"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ---- MODAL: Nome richiesto prima di condividere ---- */}
            {showNameRequired && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowNameRequired(false)} />
                    <div className="relative w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                                <Pencil size={18} className="text-amber-400" />
                            </div>
                            <h2 className="text-base font-semibold text-white">{t('contacts.nameRequiredTitle')}</h2>
                        </div>
                        <p className="text-sm text-gray-400">{t('contacts.nameRequiredBody')}</p>
                        <button
                            onClick={() => {
                                setShowNameRequired(false);
                                setEditingName(true);
                            }}
                            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition text-sm"
                        >
                            {t('contacts.myName')} →
                        </button>
                        <button
                            onClick={() => setShowNameRequired(false)}
                            className="w-full py-2 text-gray-500 hover:text-gray-400 text-sm transition"
                        >
                            {t('common.cancel')}
                        </button>
                    </div>
                </div>
            )}

            {/* ---- MODAL: Anteprima importazione ---- */}
            {preview && (
                <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={() => !isConfirming && setPreview(null)}
                    />
                    <div className="relative w-full max-w-sm mx-4 mb-6 md:mb-0 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">

                        {/* Header modal */}
                        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-800">
                            <h2 className="text-base font-semibold text-white">
                                {preview.type === 'invite' && t('contacts.previewInviteTitle')}
                                {preview.type === 'profile' && t('contacts.previewProfileTitle')}
                                {preview.type === 'loading' && t('contacts.previewDecrypting')}
                                {preview.type === 'error' && t('common.error')}
                            </h2>
                            {!isConfirming && (
                                <button onClick={() => setPreview(null)} className="text-gray-500 hover:text-white transition">
                                    <X size={18} />
                                </button>
                            )}
                        </div>

                        <div className="p-5 space-y-4">

                            {/* Loading */}
                            {preview.type === 'loading' && (
                                <div className="flex items-center justify-center py-8">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                                </div>
                            )}

                            {/* Errore decifratura */}
                            {preview.type === 'error' && (
                                <>
                                    <div className="flex items-start gap-3 px-4 py-3 bg-red-900/20 border border-red-500/30 rounded-xl">
                                        <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
                                        <p className="text-sm text-red-300">{preview.message}</p>
                                    </div>
                                    <button
                                        onClick={() => setPreview(null)}
                                        className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-medium transition"
                                    >
                                        {t('common.close')}
                                    </button>
                                </>
                            )}

                            {/* Anteprima invite */}
                            {preview.type === 'invite' && (
                                <>
                                    <p className="text-xs text-gray-400">{t('contacts.previewInviteHint')}</p>
                                    <div className="flex items-center gap-4 px-4 py-4 bg-slate-800/60 rounded-xl">
                                        <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                                            <User size={22} className="text-blue-400" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-semibold text-white text-sm">
                                                {preview.data.name || 'Unknown'}
                                            </p>
                                            {preview.fingerprint && (
                                                <div className="flex items-center gap-1.5 mt-1">
                                                    <Fingerprint size={11} className="text-gray-500 shrink-0" />
                                                    <p className="text-xs font-mono text-gray-400 truncate">{preview.fingerprint}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 pt-1">
                                        <button
                                            onClick={() => setPreview(null)}
                                            disabled={isConfirming}
                                            className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-medium transition disabled:opacity-50"
                                        >
                                            {t('common.cancel')}
                                        </button>
                                        <button
                                            onClick={handleConfirmInvite}
                                            disabled={isConfirming}
                                            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition disabled:opacity-50"
                                        >
                                            {isConfirming
                                                ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                                                : <Check size={16} />
                                            }
                                            {t('contacts.confirmAdd')}
                                        </button>
                                    </div>
                                </>
                            )}

                            {/* Anteprima profile */}
                            {preview.type === 'profile' && (
                                <>
                                    <p className="text-xs text-gray-400">{t('contacts.previewProfileHint')}</p>
                                    <div className="flex items-center gap-4 px-4 py-4 bg-slate-800/60 rounded-xl">
                                        <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
                                            {preview.profileData?.category === 'card'
                                                ? <CreditCard size={22} className="text-green-400" />
                                                : <Globe size={22} className="text-green-400" />
                                            }
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-semibold text-white text-sm truncate">
                                                {preview.profileData?.title || t('share.untitled')}
                                            </p>
                                            <p className="text-xs text-gray-400 mt-0.5">
                                                {preview.profileData?.category === 'card'
                                                    ? t('share.card')
                                                    : t('share.web')
                                                }
                                            </p>
                                        </div>
                                        <Shield size={14} className="text-green-500 shrink-0 ml-auto" />
                                    </div>
                                    {preview.profileData?.attachment && (
                                        <div className="flex items-center gap-2 px-3 py-2 bg-slate-800/60 rounded-xl text-xs text-gray-400">
                                            <Paperclip size={12} className="shrink-0 text-blue-400" />
                                            <span className="truncate">{preview.profileData.attachment.fileName}</span>
                                        </div>
                                    )}
                                    <div className="flex gap-2 pt-1">
                                        <button
                                            onClick={() => setPreview(null)}
                                            disabled={isConfirming}
                                            className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-medium transition disabled:opacity-50"
                                        >
                                            {t('common.cancel')}
                                        </button>
                                        <button
                                            onClick={handleConfirmProfile}
                                            disabled={isConfirming}
                                            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-700 hover:bg-green-600 text-white rounded-xl text-sm font-medium transition disabled:opacity-50"
                                        >
                                            {isConfirming
                                                ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                                                : <Check size={16} />
                                            }
                                            {t('contacts.confirmImport')}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
