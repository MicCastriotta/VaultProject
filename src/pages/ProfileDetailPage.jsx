/**
 * Profile Detail Page
 * Visualizzazione profilo con azioni (edit, delete, copy)
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { databaseService } from '../services/databaseService';
import { cryptoService } from '../services/cryptoService';
import { useAuth } from '../contexts/AuthContext';
import { healthCache } from '../services/healthCacheService';
import {
    ArrowLeft,
    Edit2,
    Trash2,
    Copy,
    ExternalLink,
    Check,
    User,
    CreditCard,
    Paperclip,
    FileText,
    Image,
    Send
} from 'lucide-react';
import { OTPDisplay } from '../components/OTPDisplay';
import { IconRenderer } from '../components/IconRenderer';
import { syncService } from '../services/syncService';
import { contactsService } from '../services/contactsService';

export function ProfileDetailPage() {
    const navigate = useNavigate();
    const { id } = useParams();
    const { refreshHMAC } = useAuth();
    const { t } = useTranslation();
    const [profile, setProfile] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [copiedField, setCopiedField] = useState(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [attachmentMeta, setAttachmentMeta] = useState(null);
    const [isOpeningFile, setIsOpeningFile] = useState(false);
    const [showShareSheet, setShowShareSheet] = useState(false);

    useEffect(() => {
        loadProfile();
    }, [id]);

    async function loadProfile() {
        setIsLoading(true);
        try {
            const encrypted = await databaseService.getProfile(parseInt(id));
            if (!encrypted) {
                navigate('/');
                return;
            }

            const data = await cryptoService.decryptData({
                iv: encrypted.iv,
                data: encrypted.data
            });

            setProfile({
                id: encrypted.id,
                ...data,
                updatedAt: encrypted.updatedAt
            });

            // Carica e decifra metadati allegato (lazy: encryptedData viene letto solo su "Apri")
            const attRaw = await databaseService.getAttachmentMetaByProfileId(parseInt(id));
            if (attRaw) {
                let displayMeta;
                if (attRaw.metaIv && attRaw.metaData) {
                    // Formato v2: decifra i metadati
                    const meta = await cryptoService.decryptAttachmentMeta({ iv: attRaw.metaIv, data: attRaw.metaData });
                    displayMeta = { id: attRaw.id, profileId: attRaw.profileId, blobVersion: attRaw.blobVersion, ...meta };
                } else {
                    // Formato v1 legacy: usa i campi in chiaro
                    displayMeta = {
                        id: attRaw.id,
                        profileId: attRaw.profileId,
                        blobVersion: attRaw.blobVersion,
                        fileName: attRaw._legacyFileName,
                        mimeType: attRaw._legacyMimeType,
                        size: attRaw._legacySize
                    };
                }
                setAttachmentMeta(displayMeta);
            }
        } catch (err) {
            console.error('Error loading profile:', err);
            navigate('/');
        } finally {
            setIsLoading(false);
        }
    }

    async function handleCopy(text, fieldName) {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedField(fieldName);
            setTimeout(() => setCopiedField(null), 2000);
        } catch (err) {
            console.error('Copy failed:', err);
        }
    }

    async function handleDelete() {
        try {
            await databaseService.deleteProfile(parseInt(id));
            await refreshHMAC();
            healthCache.clear();
            navigate('/');
        } catch (err) {
            console.error('Delete failed:', err);
        }
    }

    async function handleOpenAttachment() {
        if (!attachmentMeta || isOpeningFile) return;
        setIsOpeningFile(true);
        try {
            let full = await databaseService.getAttachmentById(attachmentMeta.id);
            if (!full) return;

            // Se il contenuto non è locale (allegato sincronizzato da altro dispositivo),
            // scaricalo dal file Drive separato e salvalo in IndexedDB per i prossimi accessi
            if (!full.encryptedData) {
                full = await syncService.ensureAttachmentLocal(full);
            }

            // Decifratura: passa profileId e blobVersion per supportare AAD (v2) e legacy (v1)
            const arrayBuffer = await cryptoService.decryptBlob(
                full.encryptedData,
                full.iv,
                attachmentMeta.profileId,
                full.blobVersion ?? 1
            );

            // Verifica integrità hash post-decifratura (hash è nei metadati cifrati)
            if (attachmentMeta.hash) {
                const actualHash = await cryptoService.computeFileHash(arrayBuffer);
                if (actualHash !== attachmentMeta.hash) {
                    throw new Error('File integrity check failed — hash mismatch');
                }
            }

            const { fileName, mimeType } = attachmentMeta;
            const blob = new Blob([arrayBuffer], { type: mimeType });

            // Scarica il file su tutti i dispositivi.
            // Su Android: notifica download → "APRI" → menu "Apri con" (Adobe, Galleria…)
            // Su iOS: download completato → Safari permette di aprire con app compatibili
            // Su desktop: il browser salva e lascia decidere all'OS
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Error opening attachment:', err);
        } finally {
            setIsOpeningFile(false);
        }
    }

    function openWebsite() {
        if (profile.website) {
            const url = profile.website.startsWith('http')
                ? profile.website
                : `https://${profile.website}`;
            window.open(url, '_blank');
        }
    }

    function detectCardType(number) {
        const cleaned = number.replace(/[\s-]/g, '');

        const patterns = {
            visa: /^4/,
            mastercard: /^(5[1-5]|222[1-9]|22[3-9][0-9]|2[3-6][0-9]{2}|27[01][0-9]|2720)/,
            amex: /^3[47]/,
            discover: /^6(?:011|5)/,
            diners: /^3(?:0[0-5]|[68])/,
            jcb: /^35/
        };

        for (const [type, pattern] of Object.entries(patterns)) {
            if (pattern.test(cleaned)) {
                return type;
            }
        }

        return null;
    }

    if (isLoading) {
        return (
            <div className="p-6 h-full overflow-y-auto flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400"></div>
            </div>
        );
    }

    if (!profile) {
        return null;
    }

    return (
        <>
        <div className="h-full flex flex-col">
                <div className="max-w-2xl mx-auto w-full flex flex-col flex-1 min-h-0 p-6">

                    {/* Page Header - fisso */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => navigate('/')}
                                className="p-2 text-gray-400 hover:bg-slate-700 rounded-lg transition-colors"
                            >
                                <ArrowLeft size={24} />
                            </button>
                            <h1 className="text-2xl font-bold text-white">{t('profiles.details')}</h1>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowShareSheet(true)}
                                className="p-2 text-gray-400 hover:bg-slate-700 rounded-lg transition-colors"
                                title={t('share.send')}
                            >
                                <Send size={20} />
                            </button>
                            <button
                                onClick={() => navigate(`/profile/${id}/edit`)}
                                className="p-2 text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                            >
                                <Edit2 size={20} />
                            </button>
                            <button
                                onClick={() => setShowDeleteConfirm(true)}
                                className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            >
                                <Trash2 size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Contenuto - scorrevole */}
                    <div className="flex-1 overflow-y-auto">
                    <div className="space-y-4 pb-6">

                    {/* Profile Title Card */}
                    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 flex items-start gap-3">
                        <div className="w-12 h-12 flex items-center justify-center bg-blue-500/10 rounded-lg">
                            {profile.category === 'CARD' ? (
                                <CreditCard className="text-blue-400" size={24} />
                            ) : profile.icon ? (
                                <IconRenderer
                                    slug={profile.icon}
                                    size={24}
                                    useHex={true}
                                    fallback="generic"
                                />
                            ) : (
                                <User className="text-blue-400" size={24} />
                            )}
                        </div>
                        <div className="flex-1">
                            <h2 className="text-xl font-bold text-white">{profile.title}</h2>
                            <p className="text-sm text-slate-400 mt-1">
                                {t('profiles.lastModified')} {new Date(profile.lastModified).toLocaleDateString()}
                            </p>
                        </div>
                    </div>

                    {/* WEB Fields */}
                    {profile.category === 'WEB' && (
                        <>
                            {profile.username && (
                                <DetailField
                                    label={t('profiles.fields.usernameEmail')}
                                    value={profile.username}
                                    onCopy={() => handleCopy(profile.username, 'username')}
                                    copied={copiedField === 'username'}
                                />
                            )}

                            {profile.password && (
                                <DetailField
                                    label={t('profiles.fields.password')}
                                    value={profile.password}
                                    onCopy={() => handleCopy(profile.password, 'password')}
                                    copied={copiedField === 'password'}
                                    masked
                                />
                            )}

                            {profile.website && (
                                <DetailField
                                    label={t('profiles.fields.website')}
                                    value={profile.website}
                                    onCopy={() => handleCopy(profile.website, 'website')}
                                    copied={copiedField === 'website'}
                                    action={
                                        <button
                                            onClick={openWebsite}
                                            className="p-2 text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                                        >
                                            <ExternalLink size={20} />
                                        </button>
                                    }
                                />
                            )}

                            {/* OTP Section */}
                            {profile.secretKey && (
                                <div className="space-y-3">
                                    <DetailField
                                        label={t('profiles.fields.otpSecret')}
                                        value={profile.secretKey}
                                        onCopy={() => handleCopy(profile.secretKey, 'secret')}
                                        copied={copiedField === 'secret'}
                                        masked
                                    />

                                    {/* OTP Code Display */}
                                    <OTPDisplay
                                        secret={profile.secretKey}
                                        title={profile.title}
                                    />
                                </div>
                            )}
                        </>
                    )}

                    {/* CARD Fields */}
                    {profile.category === 'CARD' && (
                        <>
                            {profile.numberCard && (
                                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        {t('profiles.fields.cardNumber')}
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 font-mono text-sm bg-slate-900/60 border border-slate-700 px-3 py-2 rounded-lg text-gray-200 flex items-center justify-between">
                                            <span>{profile.numberCard}</span>
                                            {/* Logo carta */}
                                            {detectCardType(profile.numberCard) && (
                                                <div className="ml-2">
                                                    {detectCardType(profile.numberCard) === 'visa' && (
                                                        <svg className="h-6 w-auto" viewBox="0 0 48 32" fill="none">
                                                            <rect width="48" height="32" rx="4" fill="#1434CB" />
                                                            <path d="M17.8 20.4L19.2 11.6H21.5L20.1 20.4H17.8Z" fill="white" />
                                                            <path d="M28.8 11.8C28.3 11.6 27.5 11.4 26.5 11.4C24.2 11.4 22.6 12.6 22.6 14.3C22.6 15.6 23.8 16.3 24.7 16.7C25.6 17.1 26 17.4 26 17.8C26 18.4 25.2 18.7 24.5 18.7C23.5 18.7 23 18.6 22.2 18.2L21.9 18.1L21.6 20C22.2 20.3 23.3 20.5 24.4 20.5C26.9 20.5 28.4 19.3 28.5 17.5C28.5 16.5 27.9 15.7 26.6 15.1C25.8 14.7 25.3 14.4 25.3 14C25.3 13.6 25.7 13.2 26.6 13.2C27.4 13.2 28 13.3 28.5 13.6L28.7 13.7L29 11.8Z" fill="white" />
                                                            <path d="M32.8 11.6H31C30.4 11.6 29.9 11.8 29.7 12.4L26.4 20.4H28.9L29.4 19H32.4L32.7 20.4H35L32.8 11.6ZM30.1 17.2L31.2 14.1L31.8 17.2H30.1Z" fill="white" />
                                                            <path d="M15.9 11.6L13.5 17.8L13.2 16.3C12.7 14.6 11.1 12.7 9.3 11.8L11.4 20.4H13.9L17.4 11.6H15.9Z" fill="white" />
                                                        </svg>
                                                    )}
                                                    {detectCardType(profile.numberCard) === 'mastercard' && (
                                                        <svg className="h-6 w-auto" viewBox="0 0 48 32" fill="none">
                                                            <rect width="48" height="32" rx="4" fill="#EB001B" />
                                                            <circle cx="18" cy="16" r="9" fill="#F79E1B" />
                                                            <circle cx="30" cy="16" r="9" fill="#FF5F00" />
                                                        </svg>
                                                    )}
                                                    {detectCardType(profile.numberCard) === 'amex' && (
                                                        <svg className="h-6 w-auto" viewBox="0 0 48 32" fill="none">
                                                            <rect width="48" height="32" rx="4" fill="#006FCF" />
                                                            <text x="24" y="20" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">AMEX</text>
                                                        </svg>
                                                    )}
                                                    {!['visa', 'mastercard', 'amex'].includes(detectCardType(profile.numberCard)) && (
                                                        <CreditCard size={20} className="text-slate-400" />
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => handleCopy(profile.numberCard, 'number')}
                                            className="p-2 text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                                        >
                                            {copiedField === 'number' ? <Check size={20} /> : <Copy size={20} />}
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {profile.deadline && (
                                    <DetailField
                                        label={t('profiles.fields.expiration')}
                                        value={profile.deadline}
                                        onCopy={() => handleCopy(profile.deadline, 'deadline')}
                                        copied={copiedField === 'deadline'}
                                    />
                                )}

                                {profile.cvv && (
                                    <DetailField
                                        label={t('profiles.fields.cvv')}
                                        value={profile.cvv}
                                        onCopy={() => handleCopy(profile.cvv, 'cvv')}
                                        copied={copiedField === 'cvv'}
                                        masked
                                    />
                                )}
                            </div>

                            {profile.owner && (
                                <DetailField
                                    label={t('profiles.fields.cardOwner')}
                                    value={profile.owner}
                                    onCopy={() => handleCopy(profile.owner, 'owner')}
                                    copied={copiedField === 'owner'}
                                />
                            )}

                            {profile.pin && (
                                <DetailField
                                    label={t('profiles.fields.pin')}
                                    value={profile.pin}
                                    onCopy={() => handleCopy(profile.pin, 'pin')}
                                    copied={copiedField === 'pin'}
                                    masked
                                />
                            )}
                        </>
                    )}

                    {/* Note */}
                    {profile.note && (
                        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                {t('profiles.fields.comments')}
                            </label>
                            <p className="text-gray-200 whitespace-pre-wrap">{profile.note}</p>
                        </div>
                    )}

                    {/* Allegato */}
                    {attachmentMeta && (
                        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                            <label className="block text-sm font-medium text-gray-300 mb-3">
                                <Paperclip size={14} className="inline mr-2" />
                                {t('attachment.label')}
                            </label>
                            <div className="flex items-center gap-3 bg-slate-900/60 border border-slate-700 px-3 py-2 rounded-lg">
                                {attachmentMeta.mimeType === 'application/pdf'
                                    ? <FileText size={18} className="text-blue-400 shrink-0" />
                                    : <Image size={18} className="text-blue-400 shrink-0" />
                                }
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-gray-200 truncate">{attachmentMeta.fileName}</p>
                                    <p className="text-xs text-gray-500">{(attachmentMeta.size / (1024 * 1024)).toFixed(1)} MB</p>
                                </div>
                                <button
                                    onClick={handleOpenAttachment}
                                    disabled={isOpeningFile}
                                    className="px-3 py-1.5 text-sm bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors disabled:opacity-50 shrink-0"
                                >
                                    {isOpeningFile
                                        ? <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                                        : t('attachment.open')
                                    }
                                </button>
                            </div>
                        </div>
                    )}

                    </div>{/* fine space-y-4 */}
                    </div>{/* fine flex-1 overflow-y-auto */}

                </div>{/* fine max-w-2xl */}
            </div>{/* fine h-full flex flex-col */}

            {/* Share Sheet */}
            {showShareSheet && (
                <ShareContactSheet
                    profile={profile}
                    attachmentMeta={attachmentMeta}
                    onClose={() => setShowShareSheet(false)}
                />
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-sm w-full">
                        <h3 className="text-lg font-bold text-white mb-2">{t('profiles.deleteTitle')}</h3>
                        <p className="text-gray-400 mb-4">
                            {t('profiles.deleteMessage')}
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="flex-1 px-4 py-2 border border-slate-600 text-gray-300 rounded-lg hover:bg-slate-700 transition-colors"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={handleDelete}
                                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                            >
                                {t('common.delete')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

// ========================================
// SHARE CONTACT SHEET
// ========================================

function ShareContactSheet({ profile, attachmentMeta, onClose }) {
    const { t } = useTranslation();
    const [contacts, setContacts] = useState([]);
    const [generatingId, setGeneratingId] = useState(null);

    useEffect(() => {
        contactsService.getAllContacts().then(setContacts);
    }, []);

    async function handleSelectContact(contact) {
        if (generatingId) return;
        setGeneratingId(contact.id);
        try {
            const { title, category, username, password, website, note, secretKey, icon, lastModified,
                    cardNumber, expiration, cvv, cardOwner, pin } = profile;

            let attachment = null;
            if (attachmentMeta) {
                try {
                    const { databaseService } = await import('../services/databaseService');
                    const { cryptoService } = await import('../services/cryptoService');

                    let full = await databaseService.getAttachmentById(attachmentMeta.id);
                    if (full && !full.encryptedData) {
                        full = await syncService.ensureAttachmentLocal(full); // usa import statico in cima al file
                    }
                    if (full?.encryptedData) {
                        const arrayBuffer = await cryptoService.decryptBlob(
                            full.encryptedData, full.iv,
                            attachmentMeta.profileId, full.blobVersion ?? 1
                        );
                        const bytes = new Uint8Array(arrayBuffer);
                        let binary = '';
                        for (const b of bytes) binary += String.fromCharCode(b);
                        attachment = {
                            fileName: attachmentMeta.fileName,
                            mimeType: attachmentMeta.mimeType,
                            size: attachmentMeta.size,
                            data: btoa(binary)
                        };
                    }
                } catch (err) {
                    console.error('Failed to include attachment:', err);
                    // Continua senza allegato
                }
            }

            const url = await contactsService.shareProfileViaRelay(
                { title, category, username, password, website, note, secretKey, icon, lastModified,
                  cardNumber, expiration, cvv, cardOwner, pin, attachment },
                contact.publicKey
            );
            await contactsService.shareUrl(url, profile.title || 'OwnVault');
            onClose();
        } catch {
            // utente ha annullato la condivisione
        } finally {
            setGeneratingId(null);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-sm mx-4 mb-6 md:mb-0 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-800">
                    <h2 className="text-base font-semibold text-white">{t('share.chooseContact')}</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-white transition text-sm">✕</button>
                </div>

                <div className="p-5">
                    {attachmentMeta && (
                        <div className="flex items-center gap-2 mb-4 px-3 py-2.5 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                            <Paperclip size={14} className="text-blue-400 shrink-0" />
                            <p className="text-xs text-blue-300 truncate">{attachmentMeta.fileName}</p>
                        </div>
                    )}
                    {contacts.length === 0 ? (
                        <div className="text-center py-8">
                            <User size={32} className="mx-auto mb-3 text-gray-600" />
                            <p className="text-gray-400 text-sm">{t('share.noContacts')}</p>
                            <p className="text-gray-500 text-xs mt-1">{t('share.noContactsHint')}</p>
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {contacts.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => handleSelectContact(c)}
                                    disabled={!!generatingId}
                                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-800/60 hover:bg-slate-700/60 transition disabled:opacity-50"
                                >
                                    <div className="w-9 h-9 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                                        <User size={16} className="text-blue-400" />
                                    </div>
                                    <div className="flex-1 min-w-0 text-left">
                                        <p className="text-sm font-medium text-white truncate">{c.name}</p>
                                        <p className="text-xs font-mono text-gray-500 truncate">{c.fingerprint}</p>
                                    </div>
                                    {generatingId === c.id
                                        ? <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                                        : <Send size={15} className="text-gray-500 flex-shrink-0" />
                                    }
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Helper component
function DetailField({ label, value, onCopy, copied, masked = false, action }) {
    const [showValue, setShowValue] = useState(!masked);
    const { t } = useTranslation();

    return (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
                {label}
            </label>
            <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0 font-mono text-sm bg-slate-900/60 border border-slate-700 px-3 py-2 rounded-lg text-gray-200 break-all">
                    {showValue ? value : '••••••••'}
                </div>
                {masked && (
                    <button
                        onClick={() => setShowValue(!showValue)}
                        className="p-2 text-slate-400 hover:bg-slate-700 rounded-lg transition-colors text-sm"
                    >
                        {showValue ? t('profiles.hide') : t('profiles.show')}
                    </button>
                )}
                <button
                    onClick={onCopy}
                    className="p-2 text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                >
                    {copied ? <Check size={20} /> : <Copy size={20} />}
                </button>
                {action}
            </div>
        </div>
    );
}
