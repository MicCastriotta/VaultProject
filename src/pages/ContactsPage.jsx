import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ArrowLeft, Trash2, User, Pencil,
    X, Check, AlertCircle, CreditCard, Globe, Shield, Fingerprint, Paperclip, Copy, Search, Inbox
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

    // Rename contatto
    const [editingContactId, setEditingContactId] = useState(null);
    const [editingContactName, setEditingContactName] = useState('');
    const editingContactRef = useRef(null);

    const [showGuide, setShowGuide] = useState(false);

    // Feedback toast
    const [importStatus, setImportStatus] = useState(null); // { type: 'success'|'error', message }

    // Modal di anteprima prima di importare
    // { type: 'invite', data } | { type: 'profile', data, profileData } | { type: 'loading' } | { type: 'error', message }
    const [preview, setPreview] = useState(null);
    const [isConfirming, setIsConfirming] = useState(false);


    // Relay id pendente (da ReceivePage/PendingRelayHandler) — usato per delete-after-confirm
    const [pendingRelayId, setPendingRelayId] = useState(null);

    // Ricerca contatto per fingerprint
    const [fingerprintInput, setFingerprintInput] = useState('');
    const [isLookingUp, setIsLookingUp] = useState(false);

    // Copia fingerprint
    const [fingerprintCopied, setFingerprintCopied] = useState(false);

    // Inbox pull
    const [isPulling, setIsPulling] = useState(false);
    const inboxQueueRef = useRef([]); // [{ id, text }] — profili in attesa dalla coda inbox

    useEffect(() => {
        loadContacts();
        initIdentity();
        if (!localStorage.getItem(GUIDE_KEY)) {
            setShowGuide(true);
        }
    }, []);

    // Processa payload relay o file pendente (da PendingRelayHandler / ReceivePage).
    // Dipende da location.key così si ri-esegue ad ogni navigazione verso /contacts.
    useEffect(() => {
        const raw = sessionStorage.getItem('ov_pending_for_contacts');
        if (!raw) return;
        sessionStorage.removeItem('ov_pending_for_contacts');
        try {
            const { relayId, payload } = JSON.parse(raw);
            if (relayId) setPendingRelayId(relayId);
            processOwnvText(payload);
        } catch {
            // fallback per vecchio formato plain text
            processOwnvText(raw);
        }
    }, [location.key]);

    useEffect(() => {
        if (editingContactId && editingContactRef.current) {
            editingContactRef.current.focus();
            editingContactRef.current.select();
        }
    }, [editingContactId]);

    async function loadContacts() {
        const list = await contactsService.getAllContacts();
        setContacts(list);
    }

    async function initIdentity() {
        try {
            const pk = await contactsService.getPublicKey();
            const fp = await contactsService.getFingerprint(pk);
            setMyFingerprint(fp);
        } catch {
            // vault non ancora sbloccato o primo avvio
        }
    }

    async function handleSaveContactName() {
        if (!editingContactId) return;
        await contactsService.updateContactName(editingContactId, editingContactName);
        setEditingContactId(null);
        setEditingContactName('');
        loadContacts();
    }

    function handleContactNameKeyDown(e) {
        if (e.key === 'Enter') handleSaveContactName();
        if (e.key === 'Escape') {
            setEditingContactId(null);
            setEditingContactName('');
        }
    }

    async function handleFingerprintLookup() {
        const trimmed = fingerprintInput.trim();
        if (!trimmed) return;
        setIsLookingUp(true);
        try {
            const result = await contactsService.lookupByFingerprint(trimmed);
            if (!result) {
                showImportError(t('contacts.fingerprintNotFound'));
                return;
            }
            // Mostra preview "aggiungi contatto" con fingerprint verificato
            setPreview({ type: 'invite', data: { name: '', pk: result.pk }, fingerprint: result.fingerprint });
        } catch (err) {
            if (err.message === 'fingerprint_mismatch') {
                showSecurityWarning(t('contacts.fingerprintMismatch'));
            } else {
                showImportError(
                    err.message === 'fingerprint_invalid'
                        ? t('contacts.fingerprintInvalid')
                        : t('contacts.fingerprintNotFound')
                );
            }
        } finally {
            setFingerprintInput('');
            setIsLookingUp(false);
        }
    }

    async function handleCopyFingerprint() {
        if (!myFingerprint) return;
        try {
            await navigator.clipboard.writeText(myFingerprint);
            setFingerprintCopied(true);
            setTimeout(() => setFingerprintCopied(false), 2000);
        } catch {
            // fallback silenzioso
        }
    }

    /** Processa il prossimo profilo dalla coda inbox. Chiamato dopo confirm/dismiss. */
    function processNextInQueue() {
        if (inboxQueueRef.current.length === 0) return;
        const [next, ...rest] = inboxQueueRef.current;
        inboxQueueRef.current = rest;
        setPendingRelayId(next.id);
        processOwnvText(next.text);
    }

    /** Chiude il modal preview e avvia il prossimo item dalla coda inbox se presente. */
    function dismissPreview() {
        setPreview(null);
        processNextInQueue();
    }

    async function handlePullInbox() {
        if (isPulling) return;
        setIsPulling(true);
        try {
            const ids = await contactsService.fetchInbox();
            if (ids.length === 0) {
                setImportStatus({ type: 'success', message: t('contacts.inboxEmpty') });
                setTimeout(() => setImportStatus(null), 3000);
                return;
            }
            // Scarica tutti i payload (salta quelli scaduti)
            const items = [];
            for (const id of ids) {
                try {
                    const text = await contactsService.fetchFromRelay(id);
                    items.push({ id, text });
                } catch {
                    // entry scaduta o rimossa — la ignoriamo
                }
            }
            if (items.length === 0) {
                setImportStatus({ type: 'success', message: t('contacts.inboxEmpty') });
                setTimeout(() => setImportStatus(null), 3000);
                return;
            }
            // Processa il primo, metti il resto in coda
            const [first, ...rest] = items;
            inboxQueueRef.current = rest;
            setPendingRelayId(first.id);
            await processOwnvText(first.text);
        } catch {
            showImportError(t('contacts.inboxError'));
        } finally {
            setIsPulling(false);
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
            if (pendingRelayId) {
                contactsService.deleteFromRelay(pendingRelayId).catch(() => {});
                setPendingRelayId(null);
            }
            setPreview(null);
            processNextInQueue();
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

            // Separa _wt (write token relay) e attachment dai dati del profilo prima di cifrare
            const { attachment, _wt: relayWriteToken, ...profileDataClean } = preview.profileData;

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
            if (pendingRelayId) {
                contactsService.deleteFromRelay(pendingRelayId, relayWriteToken).catch(() => {});
                setPendingRelayId(null);
            }
            setPreview(null);
            processNextInQueue();
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

    function showSecurityWarning(msg) {
        // Non auto-dismiss: l'utente deve chiuderlo esplicitamente
        setImportStatus({ type: 'security', message: msg });
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
                    <button
                        onClick={handlePullInbox}
                        disabled={isPulling}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-medium transition disabled:opacity-50"
                        title={t('contacts.pullInboxTitle')}
                    >
                        {isPulling
                            ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                            : <Inbox size={16} />
                        }
                        <span className="hidden sm:inline">{t('contacts.pullInbox')}</span>
                    </button>
                </div>

                {/* Cerca contatto per fingerprint */}
                <div className="flex gap-2 mb-4">
                    <input
                        type="text"
                        value={fingerprintInput}
                        onChange={e => setFingerprintInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && fingerprintInput.trim() && handleFingerprintLookup()}
                        placeholder={t('contacts.fingerprintPlaceholder')}
                        className="flex-1 bg-slate-800/60 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500 font-mono"
                    />
                    <button
                        onClick={handleFingerprintLookup}
                        disabled={!fingerprintInput.trim() || isLookingUp}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm disabled:opacity-40 transition"
                        title={t('contacts.lookupFingerprint')}
                    >
                        {isLookingUp
                            ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                            : <Search size={16} />
                        }
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
                                { icon: <Fingerprint size={13} />, title: t('contacts.guide.step1Title'), body: t('contacts.guide.step1') },
                                { icon: <Search size={13} />,      title: t('contacts.guide.step2Title'), body: t('contacts.guide.step2') },
                                { icon: <Shield size={13} />,      title: t('contacts.guide.step3Title'), body: t('contacts.guide.step3') }
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
                    <div className="mb-5 px-4 py-3 rounded-xl bg-slate-800/40 border border-slate-700/50">
                        <p className="text-xs text-gray-500 mb-1">{t('contacts.myFingerprint')}</p>
                        <div className="flex items-center gap-2">
                            <p className="text-xs font-mono text-blue-400 tracking-wide flex-1">{myFingerprint}</p>
                            <button
                                onClick={handleCopyFingerprint}
                                className="p-1 text-gray-500 hover:text-blue-400 transition flex-shrink-0"
                                title={t('contacts.copyFingerprint')}
                            >
                                {fingerprintCopied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                            </button>
                        </div>
                    </div>
                )}

                {/* Feedback importazione */}
                {importStatus && (
                    importStatus.type === 'security' ? (
                        <div className="mb-4 px-4 py-3 rounded-xl text-sm bg-amber-900/30 border border-amber-500/50 text-amber-200">
                            <div className="flex items-start gap-2">
                                <Shield size={16} className="text-amber-400 mt-0.5 shrink-0" />
                                <div className="flex-1">
                                    <p className="font-semibold text-amber-300 mb-0.5">{t('contacts.securityWarning')}</p>
                                    <p>{importStatus.message}</p>
                                </div>
                                <button onClick={() => setImportStatus(null)} className="text-amber-500 hover:text-amber-300 shrink-0">
                                    <X size={14} />
                                </button>
                            </div>
                        </div>
                    ) : (
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
                    )
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
                                        {editingContactId === c.id ? (
                                            <input
                                                ref={editingContactRef}
                                                value={editingContactName}
                                                onChange={e => setEditingContactName(e.target.value)}
                                                onKeyDown={handleContactNameKeyDown}
                                                onBlur={handleSaveContactName}
                                                maxLength={40}
                                                className="w-full bg-slate-700 text-white text-sm font-medium rounded-lg px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        ) : (
                                            <button
                                                onClick={() => { setEditingContactId(c.id); setEditingContactName(c.name); }}
                                                className="flex items-center gap-1.5 group max-w-full"
                                            >
                                                <span className="font-medium text-white truncate">{c.name}</span>
                                                <Pencil size={11} className="text-gray-600 group-hover:text-gray-400 transition flex-shrink-0" />
                                            </button>
                                        )}
                                        <p className="text-xs font-mono text-gray-500 truncate">{c.fingerprint}</p>
                                    </div>
                                    <button
                                        onClick={() => handleDelete(c.id)}
                                        className="p-2 hover:bg-red-500/10 text-red-400 rounded-lg transition flex-shrink-0"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ---- MODAL: Anteprima importazione ---- */}
            {preview && (
                <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={() => !isConfirming && dismissPreview()}
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
                                <button onClick={dismissPreview} className="text-gray-500 hover:text-white transition">
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
                                            onClick={dismissPreview}
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
                                            onClick={dismissPreview}
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
