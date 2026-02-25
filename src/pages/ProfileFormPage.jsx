/**
 * Profile Form Page
 * Crea o modifica un profilo (WEB o CARD)
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { databaseService } from '../services/databaseService';
import { cryptoService } from '../services/cryptoService';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Save, User, CreditCard, RefreshCw, QrCode, Trash2, Image } from 'lucide-react';
import { syncService } from '../services/syncService';
import { OTPDisplay } from '../components/OTPDisplay';
import { QRScanner } from '../components/QRScanner';
import { IconPicker } from '../components/IconPicker';
import { validators } from '../services/securityUtils';
import { getIconBySlug } from '../icons/brandIcons';
import { IconRenderer } from '../components/IconRenderer';

export function ProfileFormPage() {
    const navigate = useNavigate();
    const { id } = useParams();
    const { refreshHMAC } = useAuth();
    const isNew = !id || id === 'new' || id === 'undefined';


    const [category, setCategory] = useState('WEB');
    const [formData, setFormData] = useState({
        title: '',
        username: '',
        password: '',
        website: '',
        note: '',
        secretKey: '',
        icon: null, // Icon slug (e.g., 'spotify')
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
    const [showQRScanner, setShowQRScanner] = useState(false);
    const [cardType, setCardType] = useState(null);
    const [showIconPicker, setShowIconPicker] = useState(false);

    useEffect(() => {
        if (!isNew && Number.isInteger(Number(id))) {
            loadProfile();
        }
    }, [id]);

    async function loadProfile() {
        const numericId = Number(id);
        if (!Number.isInteger(numericId)) {
            return;
        }

        setIsLoading(true);
        try {
            const encrypted = await databaseService.getProfile(numericId);
            if (!encrypted) {
                setError('Profile not found');
                return;
            }

            const data = await cryptoService.decryptData({
                iv: encrypted.iv,
                data: encrypted.data
            });

            setCategory(data.category || 'WEB');
            setFormData(data);
        } catch (err) {
            console.error('Error loading profile:', err);
            setError('Failed to load profile');
        } finally {
            setIsLoading(false);
        }
    }

    function detectCardType(number) {
        // Rimuovi spazi e trattini
        const cleaned = number.replace(/[\s-]/g, '');

        // Regex per i vari circuiti
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

    function formatCardNumber(value) {
        // Rimuovi tutti i caratteri non numerici
        const cleaned = value.replace(/\D/g, '');

        // Rileva il tipo di carta
        const type = detectCardType(cleaned);
        setCardType(type);

        // Formatta con spazi ogni 4 cifre
        const formatted = cleaned.match(/.{1,4}/g)?.join(' ') || cleaned;

        return formatted;
    }

    function formatExpiration(value) {
        // Rimuovi tutti i caratteri non numerici
        const cleaned = value.replace(/\D/g, '');

        // Aggiungi lo slash dopo i primi 2 caratteri
        if (cleaned.length >= 2) {
            return cleaned.slice(0, 2) + '/' + cleaned.slice(2, 4);
        }

        return cleaned;
    }

    function generateRandomPassword() {
        const lower = 'abcdefghijklmnopqrstuvwxyz';
        const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const digits = '0123456789';
        const symbols = '!@#$%^&*?_~-';
        const allChars = lower + upper + digits + symbols;

        const length = 10;

        // Genera password con crypto.getRandomValues (CSPRNG)
        const randomValues = new Uint32Array(length);
        crypto.getRandomValues(randomValues);

        let password = Array.from(randomValues, (val) => allChars[val % allChars.length]).join('');

        // Garantisci almeno 1 char per ogni categoria
        // Sostituisci le prime 4 posizioni con un char random da ogni gruppo
        const guarantee = [lower, upper, digits, symbols];
        const guaranteeValues = new Uint32Array(guarantee.length);
        crypto.getRandomValues(guaranteeValues);

        const chars = password.split('');
        guarantee.forEach((group, i) => {
            chars[i] = group[guaranteeValues[i] % group.length];
        });

        // Shuffle con Fisher-Yates (crypto-random)
        const shuffleValues = new Uint32Array(chars.length);
        crypto.getRandomValues(shuffleValues);
        for (let i = chars.length - 1; i > 0; i--) {
            const j = shuffleValues[i] % (i + 1);
            [chars[i], chars[j]] = [chars[j], chars[i]];
        }

        password = chars.join('');
        setFormData(prev => ({ ...prev, password }));
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
            setError('Title is required');
            return;
        }

        setIsSaving(true);

        try {
            //// 1. Prepara dati da salvare
            //const profileData = {
            //    ...formData,
            //    category,
            //    lastModified: new Date().toISOString()
            //};

            //// 2. Cifra
            //const encrypted = await cryptoService.encryptData(profileData);

            const sanitizedData = {
                title: validators.title(formData.title),
                category,
                lastModified: new Date().toISOString()
            };

            // Sanitizza campi comuni WEB
            if (category === 'WEB') {
                sanitizedData.username = validators.username(formData.username || '');
                sanitizedData.password = formData.password || ''; // Password non va sanitizzata
                sanitizedData.website = validators.url(formData.website || '');
                sanitizedData.secretKey = validators.text(formData.secretKey || '', 100);
                sanitizedData.note = validators.notes(formData.note || '');
                sanitizedData.icon = formData.icon || null; // Icon slug
            }

            // Sanitizza campi CARD
            if (category === 'CARD') {
                sanitizedData.numberCard = validators.cardNumber(formData.numberCard || '');
                sanitizedData.owner = validators.text(formData.owner || '', 100);
                sanitizedData.deadline = validators.text(formData.deadline || '', 5);
                sanitizedData.cvv = validators.cvv(formData.cvv || '');
                sanitizedData.pin = validators.text(formData.pin || '', 6);
                sanitizedData.note = validators.notes(formData.note || '');
            }

            // 2. Cifra i dati sanitizzati
            const encrypted = await cryptoService.encryptData(sanitizedData);

            // 3. Salva nel DB
            const profileToSave = {
                ...encrypted,
                category,
                ...(isNew ? {} : { id: Number(id) })
            };

            await databaseService.saveProfile(profileToSave);

            // Aggiorna HMAC dopo la scrittura
            await refreshHMAC();

            await syncService.triggerSync();

            // 4. Torna alla lista
            navigate('/');
        } catch (err) {
            console.error('Error saving profile:', err);
            setError('Failed to save profile');
        } finally {
            setIsSaving(false);
        }
    }

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-primary text-white px-4 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/')}
                        className="p-2 hover:bg-primary-dark rounded-lg transition-colors"
                    >
                        <ArrowLeft size={24} />
                    </button>
                    <h1 className="text-xl font-bold">
                        {isNew ? 'New Profile' : 'Edit Profile'}
                    </h1>
                </div>
                <button
                    onClick={handleSubmit}
                    disabled={isSaving}
                    className="p-2 hover:bg-primary-dark rounded-lg transition-colors disabled:opacity-50"
                >
                    {isSaving ? (
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                    ) : (
                        <Save size={24} />
                    )}
                </button>
            </div>

            {/* Category Tabs (only for new) */}
            {isNew && (
                <div className="bg-white border-b flex">
                    <button
                        onClick={() => setCategory('WEB')}
                        className={`flex-1 py-4 px-4 flex items-center justify-center gap-2 border-b-2 transition-colors ${category === 'WEB'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-gray-500'
                            }`}
                    >
                        <User size={20} />
                        <span>Account</span>
                    </button>
                    <button
                        onClick={() => setCategory('CARD')}
                        className={`flex-1 py-4 px-4 flex items-center justify-center gap-2 border-b-2 transition-colors ${category === 'CARD'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-gray-500'
                            }`}
                    >
                        <CreditCard size={20} />
                        <span>Card</span>
                    </button>
                </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-4 space-y-4 max-w-2xl mx-auto pb-20">
                {error && (
                    <div className="bg-red-50 border border-red-300 text-red-800 px-4 py-3 rounded-lg">
                        {error}
                    </div>
                )}

                {/* Icon Picker Section (only for WEB) */}
                {category === 'WEB' && (
                    <div className="bg-white rounded-lg p-4">
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                            <Image size={16} className="inline mr-2" />
                            Brand Icon
                        </label>
                        
                        <div className="flex items-center gap-3">
                            {/* Icon Preview */}
                            {formData.icon ? (
                                <>
                                    <div className="flex-shrink-0 w-16 h-16 bg-gradient-to-br from-primary/10 to-primary/5 rounded-lg flex items-center justify-center border-2 border-primary/20">
                                        {formData.icon && (
                                            <IconRenderer
                                                slug={formData.icon}
                                                size={32}
                                                useHex
                                            />
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm text-gray-600">
                                            {getIconBySlug(formData.icon)?.name || formData.icon}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => setShowIconPicker(!showIconPicker)}
                                            className="text-sm text-primary hover:text-primary-dark font-medium"
                                        >
                                            Change Icon
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, icon: null }))}
                                        className="text-red-600 hover:text-red-700 p-2"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setShowIconPicker(!showIconPicker)}
                                    className="w-full py-3 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors font-medium"
                                >
                                    + Choose Icon
                                </button>
                            )}
                        </div>

                        {/* Icon Picker Modal */}
                        {showIconPicker && (
                            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                                <div className="bg-white rounded-lg w-full max-w-md max-h-96 flex flex-col">
                                    <IconPicker
                                        onSelect={(icon) => {
                                            setFormData(prev => ({ ...prev, icon: icon.slug }));
                                            setShowIconPicker(false);
                                        }}
                                        onClose={() => setShowIconPicker(false)}
                                        selectedSlug={formData.icon}
                                        suggestFromTitle={formData.website || formData.title}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Title (common) */}
                <div className="bg-white rounded-lg p-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Title *
                    </label>
                    <input
                        type="text"
                        value={formData.title}
                        onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                        placeholder="e.g. Facebook, Gmail, Mastercard..."
                    />
                </div>

                {/* WEB Fields */}
                {category === 'WEB' && (
                    <>
                        <div className="bg-white rounded-lg p-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Web Site
                            </label>
                            <input
                                type="text"
                                value={formData.website}
                                onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                                placeholder="https://..."
                            />
                        </div>

                        <div className="bg-white rounded-lg p-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Username / Email
                            </label>
                            <input
                                type="text"
                                value={formData.username}
                                onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                                placeholder="your@email.com"
                            />
                        </div>

                        <div className="bg-white rounded-lg p-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Password
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={formData.password}
                                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                                    placeholder="••••••••"
                                />
                                <button
                                    type="button"
                                    onClick={generateRandomPassword}
                                    className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
                                >
                                    <RefreshCw size={20} />
                                </button>
                            </div>
                        </div>

                        {/* OTP Section */}
                        <div className="bg-white rounded-lg p-4 space-y-4">
                            <div className="flex items-center justify-between">
                                <label className="block text-sm font-medium text-gray-700">
                                    Two-Factor Authentication (2FA)
                                </label>
                                {formData.secretKey && (
                                    <button
                                        type="button"
                                        onClick={clearOTPSecret}
                                        className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1"
                                    >
                                        <Trash2 size={16} />
                                        Remove
                                    </button>
                                )}
                            </div>

                            <p className="text-xs text-gray-500">
                                Add your 2FA secret key manually or scan a QR code
                            </p>

                            {!formData.secretKey ? (
                                <div className="space-y-3">
                                    <input
                                        type="text"
                                        value={formData.secretKey}
                                        onChange={(e) => setFormData(prev => ({ ...prev, secretKey: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent font-mono text-sm"
                                        placeholder="Enter Base32 secret key..."
                                    />

                                    <button
                                        type="button"
                                        onClick={() => setShowQRScanner(true)}
                                        className="w-full py-3 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors flex items-center justify-center gap-2 font-medium"
                                    >
                                        <QrCode size={20} />
                                        Scan QR Code
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {/* Secret Key Display */}
                                    <div className="bg-gray-50 px-3 py-2 rounded border border-gray-200">
                                        <div className="text-xs text-gray-500 mb-1">Secret Key</div>
                                        <div className="font-mono text-sm break-all">{formData.secretKey}</div>
                                    </div>

                                    {/* OTP Code Display */}
                                    <OTPDisplay
                                        secret={formData.secretKey}
                                        title={formData.title || 'Account'}
                                    />
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* CARD Fields */}
                {category === 'CARD' && (
                    <>
                        <div className="bg-white rounded-lg p-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Card Number
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={formData.numberCard}
                                    onChange={(e) => {
                                        const formatted = formatCardNumber(e.target.value);
                                        setFormData(prev => ({ ...prev, numberCard: formatted }));
                                    }}
                                    className="w-full px-3 py-2 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                                    placeholder="1234 5678 9012 3456"
                                    maxLength="19"
                                />
                                {/* Logo carta */}
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
                                            <div className="h-8 w-12 bg-gray-200 rounded flex items-center justify-center">
                                                <CreditCard size={20} className="text-gray-500" />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white rounded-lg p-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Expiration
                                </label>
                                <input
                                    type="text"
                                    value={formData.deadline}
                                    onChange={(e) => {
                                        const formatted = formatExpiration(e.target.value);
                                        setFormData(prev => ({ ...prev, deadline: formatted }));
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                                    placeholder="MM/YY"
                                    maxLength="5"
                                />
                            </div>

                            <div className="bg-white rounded-lg p-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    CVV
                                </label>
                                <input
                                    type="text"
                                    value={formData.cvv}
                                    onChange={(e) => setFormData(prev => ({ ...prev, cvv: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                                    placeholder="123"
                                    maxLength="3"
                                />
                            </div>
                        </div>

                        <div className="bg-white rounded-lg p-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Card Owner
                            </label>
                            <input
                                type="text"
                                value={formData.owner}
                                onChange={(e) => setFormData(prev => ({ ...prev, owner: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                                placeholder="JOHN DOE"
                            />
                        </div>

                        <div className="bg-white rounded-lg p-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                PIN
                            </label>
                            <input
                                type="text"
                                value={formData.pin}
                                onChange={(e) => setFormData(prev => ({ ...prev, pin: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                                placeholder="••••"
                                maxLength="4"
                            />
                        </div>
                    </>
                )}

                {/* Note (common) */}
                <div className="bg-white rounded-lg p-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Comments
                    </label>
                    <textarea
                        value={formData.note}
                        onChange={(e) => setFormData(prev => ({ ...prev, note: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                        rows="4"
                        placeholder="Additional notes..."
                    />
                </div>

                {/* Save Button (mobile) */}
                <button
                    type="submit"
                    disabled={isSaving}
                    className="w-full bg-primary hover:bg-primary-dark text-white py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                    {isSaving ? 'Saving...' : 'Save Profile'}
                </button>
            </form>

            {/* QR Scanner Modal */}
            <QRScanner
                isOpen={showQRScanner}
                onClose={() => setShowQRScanner(false)}
                onScan={handleQRScan}
            />
        </div>
    );
}