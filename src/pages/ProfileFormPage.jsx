/**
 * Profile Form Page
 * Crea o modifica un profilo (WEB o CARD)
 */

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { databaseService } from '../services/databaseService';
import { cryptoService } from '../services/cryptoService';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Save, User, CreditCard, RefreshCw, QrCode, Trash2 } from 'lucide-react';
import { syncService } from '../services/syncService';
import { OTPDisplay } from '../components/OTPDisplay';
import { QRScanner } from '../components/QRScanner';
import { validators } from '../services/securityUtils';

export function ProfileFormPage() {
    const navigate = useNavigate();
    const { id } = useParams();
    const { refreshHMAC } = useAuth();
    const isNew = id === 'new';

    const [category, setCategory] = useState('WEB');
    const [formData, setFormData] = useState({
        title: '',
        username: '',
        password: '',
        website: '',
        note: '',
        secretKey: '',
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
                            <input
                                type="text"
                                value={formData.numberCard}
                                onChange={(e) => setFormData(prev => ({ ...prev, numberCard: e.target.value }))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                                placeholder="1234 5678 9012 3456"
                                maxLength="19"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white rounded-lg p-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Expiration
                                </label>
                                <input
                                    type="text"
                                    value={formData.deadline}
                                    onChange={(e) => setFormData(prev => ({ ...prev, deadline: e.target.value }))}
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