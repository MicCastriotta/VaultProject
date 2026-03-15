import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, UserPlus, Copy, Check, Trash2, User, Pencil, Share2 } from 'lucide-react';
import { contactsService } from '../services/contactsService';

export function ContactsPage() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [contacts, setContacts] = useState([]);
    const [myFingerprint, setMyFingerprint] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [editingName, setEditingName] = useState(false);
    const [nameInput, setNameInput] = useState('');
    const nameInputRef = useRef(null);

    const [showInviteDialog, setShowInviteDialog] = useState(false);
    const [inviteLink, setInviteLink] = useState('');
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        loadContacts();
        initIdentity();
    }, []);

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

    async function handleGenerateLink() {
        if (!displayName) {
            // Apri subito la modifica del nome prima di generare il link
            setEditingName(true);
            return;
        }
        const link = await contactsService.generateInviteLink();
        setInviteLink(link);
        setCopied(false);
        setShowInviteDialog(true);
    }

    async function handleCopy() {
        await navigator.clipboard.writeText(inviteLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    async function handleShare() {
        try {
            await navigator.share({ url: inviteLink });
        } catch {
            // utente ha annullato o share non disponibile
        }
    }

    async function handleDelete(id) {
        await contactsService.deleteContact(id);
        loadContacts();
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
                        onClick={handleGenerateLink}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition"
                    >
                        <UserPlus size={16} />
                        <span className="hidden sm:inline">{t('contacts.myLink')}</span>
                    </button>
                </div>

                {/* La mia identità */}
                {myFingerprint && (
                    <div className="mb-5 px-4 py-3 rounded-xl bg-slate-800/40 border border-slate-700/50 space-y-2">

                        {/* Nome display */}
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

                        {/* Fingerprint */}
                        <div>
                            <p className="text-xs text-gray-500 mb-1">{t('contacts.myFingerprint')}</p>
                            <p className="text-xs font-mono text-blue-400 tracking-wide">{myFingerprint}</p>
                        </div>
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

            {/* Dialog invite link */}
            {showInviteDialog && (
                <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => setShowInviteDialog(false)}
                    />
                    <div className="relative w-full max-w-sm mx-4 mb-6 md:mb-0 bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
                        <h2 className="text-lg font-semibold text-white mb-1">
                            {t('contacts.inviteTitle')}
                        </h2>
                        <p className="text-sm text-gray-400 mb-4">
                            {t('contacts.inviteDescription')}
                        </p>
                        <div className="p-3 bg-slate-800 rounded-xl mb-4 break-all">
                            <p className="text-xs text-gray-300 font-mono">{inviteLink}</p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleCopy}
                                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition ${
                                    copied
                                        ? 'bg-green-600 text-white'
                                        : 'bg-blue-600 hover:bg-blue-500 text-white'
                                }`}
                            >
                                {copied ? <Check size={18} /> : <Copy size={18} />}
                                {copied ? t('contacts.copied') : t('contacts.copyLink')}
                            </button>
                            {navigator.share && (
                                <button
                                    onClick={handleShare}
                                    className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition"
                                >
                                    <Share2 size={18} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
