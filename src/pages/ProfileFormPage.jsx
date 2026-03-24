/**
 * Profile Form Page
 * Crea o modifica un profilo (WEB o CARD)
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { databaseService } from '../services/databaseService';
import { cryptoService } from '../services/cryptoService';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Save, User, CreditCard, RefreshCw, QrCode, Trash2, Image, Paperclip, X, FileText } from 'lucide-react';
import { syncService } from '../services/syncService';
import { OTPDisplay } from '../components/OTPDisplay';
import { QRScanner } from '../components/QRScanner';
import { IconPicker } from '../components/IconPicker';
import { validators } from '../services/securityUtils';
import { getIconBySlug, suggestIconFromTitle } from '../icons/brandIcons';
import { BrandIconBox } from '../components/BrandIconBox';
import { healthCache } from '../services/healthCacheService';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function ProfileFormPage() {
    const navigate = useNavigate();
    const { id } = useParams();
    const { refreshHMAC } = useAuth();
    const isNew = !id || id === 'new' || id === 'undefined';
    const { t } = useTranslation();
    const fileInputRef = useRef(null);

    const [category, setCategory] = useState('WEB');
    const [iconName, setIconName] = useState('');
    const [formData, setFormData] = useState({
        title: '',
        username: '',
        password: '',
        website: '',
        note: '',
        secretKey: '',
        icon: null,
        // CARD fields
        numberCard: '',
        owner: '',
        deadline: '',
        cvv: '',
        pin: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const [fileError, setFileError] = useState('');
    const [showQRScanner, setShowQRScanner] = useState(false);
    const [cardType, setCardType] = useState(null);
    const [showIconPicker, setShowIconPicker] = useState(false);
    const [isIconAutoSet, setIsIconAutoSet] = useState(false);

    // Storico password
    const [passwordHistory, setPasswordHistory] = useState([]);
    const [originalPassword, setOriginalPassword] = useState('');

    // Allegato
    const [pendingFile, setPendingFile] = useState(null);           // File da caricare
    const [existingAttachment, setExistingAttachment] = useState(null); // Metadati allegato già salvato
    const [removeAttachment, setRemoveAttachment] = useState(false); // Flag rimozione

    useEffect(() => {
        if (!formData.icon) { setIconName(''); return; }
        getIconBySlug(formData.icon).then(icon => setIconName(icon?.name || formData.icon));
    }, [formData.icon]);

    useEffect(() => {
        if (!isNew && Number.isInteger(Number(id))) {
            loadProfile();
        }
    }, [id]);

    async function loadProfile() {
        const numericId = Number(id);
        if (!Number.isInteger(numericId)) return;

        setIsLoading(true);
        try {
            const encrypted = await databaseService.getProfile(numericId);
            if (!encrypted) {
                setError(t('profileForm.profileNotFound'));
                return;
            }

            const data = await cryptoService.decryptData({
                iv: encrypted.iv,
                data: encrypted.data
            });

            setCategory(data.category || 'WEB');
            setFormData(data);
            setPasswordHistory(data.passwordHistory || []);
            setOriginalPassword(data.password || '');

            // Carica e decifra metadati allegato esistente
            const attRaw = await databaseService.getAttachmentMetaByProfileId(numericId);
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
                setExistingAttachment(displayMeta);
            }
        } catch (err) {
            console.error('Error loading profile:', err);
            setError(t('profileForm.failedToLoad'));
        } finally {
            setIsLoading(false);
        }
    }

    function handleFileChange(e) {
        const file = e.target.files[0];
        if (!file) return;
        // Reset input value per permettere ri-selezione dello stesso file
        e.target.value = '';

        if (!ALLOWED_MIME.includes(file.type)) {
            setFileError(t('attachment.invalidType'));
            setTimeout(() => setFileError(''), 4000);
            return;
        }
        if (file.size > MAX_FILE_SIZE) {
            setFileError(t('attachment.fileTooLarge'));
            setTimeout(() => setFileError(''), 4000);
            return;
        }
        setFileError('');
        setPendingFile(file);
        setRemoveAttachment(false);
    }

    function handleRemoveFile() {
        setPendingFile(null);
        if (existingAttachment) setRemoveAttachment(true);
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
            if (pattern.test(cleaned)) return type;
        }
        return null;
    }

    function formatCardNumber(value) {
        const cleaned = value.replace(/\D/g, '');
        const type = detectCardType(cleaned);
        setCardType(type);
        return cleaned.match(/.{1,4}/g)?.join(' ') || cleaned;
    }

    function formatExpiration(value) {
        const cleaned = value.replace(/\D/g, '');
        if (cleaned.length >= 2) return cleaned.slice(0, 2) + '/' + cleaned.slice(2, 4);
        return cleaned;
    }

    function generateRandomPassword() {
        const lower = 'abcdefghijklmnopqrstuvwxyz';
        const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const digits = '0123456789';
        const symbols = '!@#$%^&*?_~-';
        const allChars = lower + upper + digits + symbols;
        const length = 10;

        const randomValues = new Uint32Array(length);
        crypto.getRandomValues(randomValues);
        let password = Array.from(randomValues, (val) => allChars[val % allChars.length]).join('');

        const guarantee = [lower, upper, digits, symbols];
        const guaranteeValues = new Uint32Array(guarantee.length);
        crypto.getRandomValues(guaranteeValues);
        const chars = password.split('');
        guarantee.forEach((group, i) => { chars[i] = group[guaranteeValues[i] % group.length]; });

        const shuffleValues = new Uint32Array(chars.length);
        crypto.getRandomValues(shuffleValues);
        for (let i = chars.length - 1; i > 0; i--) {
            const j = shuffleValues[i] % (i + 1);
            [chars[i], chars[j]] = [chars[j], chars[i]];
        }

        setFormData(prev => ({ ...prev, password: chars.join('') }));
    }

    function handleQRScan(secret) {
        setFormData(prev => ({ ...prev, secretKey: secret }));
    }

    function clearOTPSecret() {
        setFormData(prev => ({ ...prev, secretKey: '' }));
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');

        if (!formData.title) {
            setError(t('profileForm.titleRequired'));
            return;
        }

        setIsSaving(true);

        try {
            const sanitizedData = {
                title: validators.title(formData.title),
                category,
                lastModified: new Date().toISOString()
            };

            if (category === 'WEB') {
                sanitizedData.username = validators.username(formData.username || '');
                sanitizedData.password = formData.password || '';
                sanitizedData.website = validators.url(formData.website || '');
                sanitizedData.secretKey = validators.text(formData.secretKey || '', 100);
                sanitizedData.note = validators.notes(formData.note || '');
                sanitizedData.icon = formData.icon || null;

                // Storico password: se modifica e password cambiata, salva la vecchia
                const newPassword = formData.password || '';
                if (!isNew && originalPassword && newPassword !== originalPassword) {
                    const entry = { value: originalPassword, changedAt: sanitizedData.lastModified };
                    sanitizedData.passwordHistory = [entry, ...passwordHistory].slice(0, 5);
                    sanitizedData.lastPasswordChange = sanitizedData.lastModified;
                } else {
                    sanitizedData.passwordHistory = passwordHistory;
                    sanitizedData.lastPasswordChange = formData.lastPasswordChange || null;
                }
            }

            if (category === 'CARD') {
                sanitizedData.numberCard = validators.cardNumber(formData.numberCard || '');
                sanitizedData.owner = validators.text(formData.owner || '', 100);
                sanitizedData.deadline = validators.text(formData.deadline || '', 5);
                sanitizedData.cvv = validators.cvv(formData.cvv || '');
                sanitizedData.pin = validators.text(formData.pin || '', 6);
                sanitizedData.note = validators.notes(formData.note || '');
            }

            const encrypted = await cryptoService.encryptData(sanitizedData);

            const profileToSave = {
                ...encrypted,
                category,
                ...(isNew ? {} : { id: Number(id) })
            };

            const savedProfileId = await databaseService.saveProfile(profileToSave);

            // Gestione allegato
            if (pendingFile) {
                const arrayBuffer = await pendingFile.arrayBuffer();
                const hash = await cryptoService.computeFileHash(arrayBuffer);
                const { iv, encryptedData, blobVersion } = await cryptoService.encryptBlob(arrayBuffer, savedProfileId);
                // Cifra i metadati: fileName, mimeType, size e hash non escono mai in chiaro
                const encryptedMeta = await cryptoService.encryptAttachmentMeta({
                    fileName: pendingFile.name,
                    mimeType: pendingFile.type,
                    size: pendingFile.size,
                    hash
                });
                await databaseService.saveAttachment({
                    profileId: savedProfileId,
                    metaIv: encryptedMeta.iv,
                    metaData: encryptedMeta.data,
                    iv,
                    encryptedData,
                    blobVersion
                });
                window.dispatchEvent(new CustomEvent('storageChanged'));
            } else if (removeAttachment && existingAttachment) {
                await databaseService.deleteAttachment(existingAttachment.id);
                window.dispatchEvent(new CustomEvent('storageChanged'));
            }

            await refreshHMAC();
            healthCache.clear();
            await syncService.triggerSync();

            navigate(`/profile/${savedProfileId}`);
        } catch (err) {
            console.error('Error saving profile:', err);
            setError(t('profileForm.failedToSave'));
        } finally {
            setIsSaving(false);
        }
    }

    if (isLoading) {
        return (
            <div className="p-6 h-full overflow-y-auto flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400"></div>
            </div>
        );
    }

    // Determina stato visualizzazione allegato
    const showExisting = existingAttachment && !removeAttachment && !pendingFile;
    const showPending = !!pendingFile;
    const showPicker = !showExisting && !showPending;

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
                            <h1 className="text-2xl font-bold text-white">
                                {isNew ? t('profileForm.newProfile') : t('profileForm.editProfile')}
                            </h1>
                        </div>
                        <button
                            onClick={handleSubmit}
                            disabled={isSaving}
                            className="p-2 text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors disabled:opacity-50"
                        >
                            {isSaving ? (
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400"></div>
                            ) : (
                                <Save size={24} />
                            )}
                        </button>
                    </div>

                    {/* Category Tabs - fisse (only for new) */}
                    {isNew && (
                        <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden flex mb-4">
                            <button
                                onClick={() => setCategory('WEB')}
                                className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${category === 'WEB'
                                    ? 'bg-blue-600 text-white'
                                    : 'text-slate-400 hover:bg-slate-700'
                                    }`}
                            >
                                <User size={20} />
                                <span>{t('profileForm.account')}</span>
                            </button>
                            <button
                                onClick={() => setCategory('CARD')}
                                className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${category === 'CARD'
                                    ? 'bg-blue-600 text-white'
                                    : 'text-slate-400 hover:bg-slate-700'
                                    }`}
                            >
                                <CreditCard size={20} />
                                <span>{t('profileForm.card')}</span>
                            </button>
                        </div>
                    )}

                    {/* Form - scorrevole */}
                    <div className="flex-1 overflow-y-auto">
                    <form onSubmit={handleSubmit} className="space-y-4 pb-6">
                        {error && (
                            <div className="bg-red-900/20 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl">
                                {error}
                            </div>
                        )}

                        {/* Title (common) */}
                        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                {t('profileForm.titleLabel')} *
                            </label>
                            <input
                                type="text"
                                value={formData.title}
                                onChange={(e) => {
                                    const title = e.target.value;
                                    setFormData(prev => ({ ...prev, title }));
                                    if (category === 'WEB' && (!formData.icon || isIconAutoSet)) {
                                        suggestIconFromTitle(title).then(icon => {
                                            if (icon) {
                                                setFormData(prev => ({ ...prev, icon: icon.slug }));
                                                setIsIconAutoSet(true);
                                            }
                                        });
                                    }
                                }}
                                className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-500"
                                placeholder="e.g. Facebook, Gmail, Netflix..."
                            />
                        </div>

                        {/* Icon Picker Section (only for WEB) */}
                        {category === 'WEB' && (
                            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                                <label className="block text-sm font-medium text-gray-300 mb-3">
                                    <Image size={16} className="inline mr-2" />
                                    {t('profileForm.brandIcon')}
                                </label>

                                <div className="flex items-center gap-3">
                                    {formData.icon ? (
                                        <>
                                            <BrandIconBox
                                                slug={formData.icon}
                                                iconSize={32}
                                                className="flex-shrink-0 w-16 h-16 rounded-lg flex items-center justify-center"
                                            />
                                            <div className="flex-1">
                                                <p className="text-sm text-gray-400">{iconName || formData.icon}</p>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowIconPicker(!showIconPicker)}
                                                    className="text-sm text-blue-400 hover:text-blue-300 font-medium"
                                                >
                                                    {t('profileForm.changeIcon')}
                                                </button>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => { setFormData(prev => ({ ...prev, icon: null })); setIsIconAutoSet(false); }}
                                                className="text-red-400 hover:text-red-300 p-2"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => setShowIconPicker(!showIconPicker)}
                                            className="w-full py-3 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 transition-colors font-medium"
                                        >
                                            {t('profileForm.chooseIcon')}
                                        </button>
                                    )}
                                </div>

                                {showIconPicker && (
                                    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                                        <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md max-h-96 flex flex-col">
                                            <IconPicker
                                                onSelect={(icon) => {
                                                    setFormData(prev => ({ ...prev, icon: icon.slug }));
                                                    setIsIconAutoSet(false);
                                                    setShowIconPicker(false);
                                                }}
                                                onClose={() => setShowIconPicker(false)}
                                                selectedSlug={formData.icon}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* WEB Fields */}
                        {category === 'WEB' && (
                            <>
                                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        {t('profiles.fields.usernameEmail')}
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.username}
                                        onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                                        className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-500"
                                        placeholder="your@email.com"
                                    />
                                </div>

                                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        {t('profiles.fields.password')}
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={formData.password}
                                            onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                                            className="flex-1 px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-500"
                                            placeholder="••••••••"
                                        />
                                        <button
                                            type="button"
                                            onClick={generateRandomPassword}
                                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                                        >
                                            <RefreshCw size={20} />
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        {t('profiles.fields.website')}
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.website}
                                        onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
                                        className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-500"
                                        placeholder="https://..."
                                    />
                                </div>

                                {/* OTP Section */}
                                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <label className="block text-sm font-medium text-gray-300">
                                            {t('profileForm.twoFactor')}
                                        </label>
                                        {formData.secretKey && (
                                            <button
                                                type="button"
                                                onClick={clearOTPSecret}
                                                className="text-sm text-red-400 hover:text-red-300 flex items-center gap-1"
                                            >
                                                <Trash2 size={16} />
                                                {t('profileForm.remove2fa')}
                                            </button>
                                        )}
                                    </div>

                                    <p className="text-xs text-slate-500">{t('profileForm.twoFactorHint')}</p>

                                    {!formData.secretKey ? (
                                        <div className="space-y-3">
                                            <input
                                                type="text"
                                                value={formData.secretKey}
                                                onChange={(e) => setFormData(prev => ({ ...prev, secretKey: e.target.value }))}
                                                className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm placeholder-slate-500"
                                                placeholder={t('profileForm.base32Placeholder')}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowQRScanner(true)}
                                                className="w-full py-3 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 transition-colors flex items-center justify-center gap-2 font-medium"
                                            >
                                                <QrCode size={20} />
                                                {t('profileForm.scanQR')}
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="bg-slate-900/60 border border-slate-700 px-3 py-2 rounded-lg">
                                                <div className="text-xs text-slate-500 mb-1">{t('profileForm.secretKey')}</div>
                                                <div className="font-mono text-sm break-all text-gray-200">{formData.secretKey}</div>
                                            </div>
                                            <OTPDisplay secret={formData.secretKey} title={formData.title || 'Account'} />
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {/* CARD Fields */}
                        {category === 'CARD' && (
                            <>
                                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        {t('profiles.fields.cardNumber')}
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={formData.numberCard}
                                            onChange={(e) => {
                                                const formatted = formatCardNumber(e.target.value);
                                                setFormData(prev => ({ ...prev, numberCard: formatted }));
                                            }}
                                            className="w-full px-3 py-2 pr-12 bg-slate-900/60 border border-slate-700 rounded-lg text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-500"
                                            placeholder="1234 5678 9012 3456"
                                            maxLength="19"
                                        />
                                        {cardType && (
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                {cardType === 'visa' && (
                                                    <svg className="h-8 w-auto" viewBox="0 0 48 32" fill="none">
                                                        <rect width="48" height="32" rx="4" fill="#1434CB" />
                                                        <path d="M17.8 20.4L19.2 11.6H21.5L20.1 20.4H17.8Z" fill="white" />
                                                        <path d="M28.8 11.8C28.3 11.6 27.5 11.4 26.5 11.4C24.2 11.4 22.6 12.6 22.6 14.3C22.6 15.6 23.8 16.3 24.7 16.7C25.6 17.1 26 17.4 26 17.8C26 18.4 25.2 18.7 24.5 18.7C23.5 18.7 23 18.6 22.2 18.2L21.9 18.1L21.6 20C22.2 20.3 23.3 20.5 24.4 20.5C26.9 20.5 28.4 19.3 28.5 17.5C28.5 16.5 27.9 15.7 26.6 15.1C25.8 14.7 25.3 14.4 25.3 14C25.3 13.6 25.7 13.2 26.6 13.2C27.4 13.2 28 13.3 28.5 13.6L28.7 13.7L29 11.8Z" fill="white" />
                                                        <path d="M32.8 11.6H31C30.4 11.6 29.9 11.8 29.7 12.4L26.4 20.4H28.9L29.4 19H32.4L32.7 20.4H35L32.8 11.6ZM30.1 17.2L31.2 14.1L31.8 17.2H30.1Z" fill="white" />
                                                        <path d="M15.9 11.6L13.5 17.8L13.2 16.3C12.7 14.6 11.1 12.7 9.3 11.8L11.4 20.4H13.9L17.4 11.6H15.9Z" fill="white" />
                                                    </svg>
                                                )}
                                                {cardType === 'mastercard' && (
                                                    <svg className="h-8 w-auto" viewBox="0 0 48 32" fill="none">
                                                        <rect width="48" height="32" rx="4" fill="#EB001B" />
                                                        <circle cx="18" cy="16" r="9" fill="#F79E1B" />
                                                        <circle cx="30" cy="16" r="9" fill="#FF5F00" />
                                                    </svg>
                                                )}
                                                {cardType === 'amex' && (
                                                    <svg className="h-8 w-auto" viewBox="0 0 48 32" fill="none">
                                                        <rect width="48" height="32" rx="4" fill="#006FCF" />
                                                        <text x="24" y="20" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">AMEX</text>
                                                    </svg>
                                                )}
                                                {!['visa', 'mastercard', 'amex'].includes(cardType) && (
                                                    <div className="h-8 w-12 bg-slate-700 rounded flex items-center justify-center">
                                                        <CreditCard size={20} className="text-slate-400" />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                                        <label className="block text-sm font-medium text-gray-300 mb-2">
                                            {t('profiles.fields.expiration')}
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.deadline}
                                            onChange={(e) => {
                                                const formatted = formatExpiration(e.target.value);
                                                setFormData(prev => ({ ...prev, deadline: formatted }));
                                            }}
                                            className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-500"
                                            placeholder="MM/YY"
                                            maxLength="5"
                                        />
                                    </div>

                                    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                                        <label className="block text-sm font-medium text-gray-300 mb-2">
                                            {t('profiles.fields.cvv')}
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.cvv}
                                            onChange={(e) => setFormData(prev => ({ ...prev, cvv: e.target.value }))}
                                            className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-500"
                                            placeholder="123"
                                            maxLength="3"
                                        />
                                    </div>
                                </div>

                                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        {t('profiles.fields.cardOwner')}
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.owner}
                                        onChange={(e) => setFormData(prev => ({ ...prev, owner: e.target.value }))}
                                        className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-500"
                                        placeholder="JOHN DOE"
                                    />
                                </div>

                                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        {t('profiles.fields.pin')}
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.pin}
                                        onChange={(e) => setFormData(prev => ({ ...prev, pin: e.target.value }))}
                                        className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-500"
                                        placeholder="••••"
                                        maxLength="6"
                                    />
                                </div>
                            </>
                        )}

                        {/* Note (common) */}
                        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                {t('profiles.fields.comments')}
                            </label>
                            <textarea
                                value={formData.note}
                                onChange={(e) => setFormData(prev => ({ ...prev, note: e.target.value }))}
                                className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700 rounded-lg text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-500"
                                rows="4"
                                placeholder={t('profileForm.additionalNotes')}
                            />
                        </div>

                        {/* Allegato */}
                        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                            <label className="block text-sm font-medium text-gray-300 mb-3">
                                <Paperclip size={14} className="inline mr-2" />
                                {t('attachment.label')}
                            </label>

                            {/* File pending (appena selezionato) */}
                            {showPending && (
                                <div className="flex items-center gap-3 bg-slate-900/60 border border-slate-700 px-3 py-2 rounded-lg">
                                    {pendingFile.type === 'application/pdf'
                                        ? <FileText size={18} className="text-blue-400 shrink-0" />
                                        : <Image size={18} className="text-blue-400 shrink-0" />
                                    }
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-gray-200 truncate">{pendingFile.name}</p>
                                        <p className="text-xs text-gray-500">{formatBytes(pendingFile.size)}</p>
                                    </div>
                                    <button type="button" onClick={handleRemoveFile} className="p-1 text-red-400 hover:text-red-300">
                                        <X size={16} />
                                    </button>
                                </div>
                            )}

                            {/* Allegato esistente (modalità edit) */}
                            {showExisting && (
                                <div className="flex items-center gap-3 bg-slate-900/60 border border-slate-700 px-3 py-2 rounded-lg">
                                    {existingAttachment.mimeType === 'application/pdf'
                                        ? <FileText size={18} className="text-blue-400 shrink-0" />
                                        : <Image size={18} className="text-blue-400 shrink-0" />
                                    }
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-gray-200 truncate">{existingAttachment.fileName}</p>
                                        <p className="text-xs text-gray-500">{formatBytes(existingAttachment.size)}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1"
                                    >
                                        {t('attachment.changeFile')}
                                    </button>
                                    <button type="button" onClick={handleRemoveFile} className="p-1 text-red-400 hover:text-red-300">
                                        <X size={16} />
                                    </button>
                                </div>
                            )}

                            {/* Nessun file — mostra picker */}
                            {showPicker && (
                                <label className="flex items-center justify-center w-full py-3 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 transition-colors cursor-pointer font-medium gap-2">
                                    <Paperclip size={18} />
                                    {t('attachment.chooseFile')}
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.jpg,.jpeg,.png,.webp,.gif,.pdf"
                                        className="hidden"
                                        onChange={handleFileChange}
                                    />
                                </label>
                            )}

                            {/* Input nascosto per "Cambia file" sull'allegato esistente */}
                            {showExisting && (
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.jpg,.jpeg,.png,.webp,.gif,.pdf"
                                    className="hidden"
                                    onChange={handleFileChange}
                                />
                            )}

                            {/* Errore file (dimensione o tipo non valido) */}
                            {fileError && (
                                <p className="mt-2 text-xs text-red-400 flex items-center gap-1.5">
                                    <span className="shrink-0">⚠</span>
                                    {fileError}
                                </p>
                            )}
                        </div>

                        {/* Save Button */}
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isSaving ? t('profileForm.saving') : t('profileForm.saveProfile')}
                        </button>
                    </form>
                    </div>{/* fine flex-1 overflow-y-auto */}

                </div>{/* fine max-w-2xl */}
            </div>{/* fine h-full flex flex-col */}

            {/* QR Scanner Modal */}
            <QRScanner
                isOpen={showQRScanner}
                onClose={() => setShowQRScanner(false)}
                onScan={handleQRScan}
            />
        </>
    );
}
