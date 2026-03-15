/**
 * Settings Page
 * Export/Import database e gestione dati
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { databaseService } from '../services/databaseService';
import { useAuth } from '../contexts/AuthContext';
import {
    ArrowLeft,
    Download,
    Upload,
    Trash2,
    Shield,
    AlertTriangle,
    CheckCircle,
    XCircle,
    Cloud,
    RefreshCw,
    LogOut,
    Database,
    Sun,
    Moon,
    ChevronDown,
    Monitor,
    HardDrive,
    Heart,
    Mail,
    Copy,
    Check,
    CreditCard,
    Coffee
} from 'lucide-react';
import { syncService } from '../services/syncService';
import { googleDriveService } from '../services/googledriveService';
import { BiometricSettingsSection } from '../components/BiometricSettingsSection';
import { LanguageSelector } from '../components/LanguageSelector';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';

function AccordionSection({ icon, title, sectionKey, openSections, onToggle, children }) {
    const isOpen = openSections.has(sectionKey);
    const { theme } = useTheme();
    const isLight = theme === 'light';

    return (
        <div
            className={`rounded-xl overflow-hidden border transition-colors ${
                isLight
                    ? 'border-slate-200 bg-white shadow-sm'
                    : 'border-slate-700'
            }`}
        >
            <button
                onClick={() => onToggle(sectionKey)}
                className={`w-full px-4 py-3.5 flex items-center justify-between text-left transition-colors ${
                    isLight
                        ? 'bg-slate-50 hover:bg-slate-100'
                        : 'bg-slate-800/60 hover:bg-slate-700/50'
                }`}
            >
                <span
                    className={`font-semibold flex items-center gap-2 ${
                        isLight ? 'text-slate-800' : 'text-gray-200'
                    }`}
                >
                    {icon}
                    {title}
                </span>
                <ChevronDown
                    size={18}
                    className={`transition-transform duration-200 flex-shrink-0 ${
                        isLight ? 'text-slate-500' : 'text-gray-400'
                    } ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>
            {isOpen && (
                <div
                    className={`border-t divide-y ${
                        isLight
                            ? 'border-slate-200 divide-slate-200 bg-white'
                            : 'border-slate-700 divide-slate-700'
                    }`}
                >
                    {children}
                </div>
            )}
        </div>
    );
}

const PAYPAL_ME = 'https://paypal.me/MicheleCastriotta';
const BANK_INFO = {
    beneficiary: 'Michele Castriotta',
    iban: 'IT49N0366901600264292569202',
    ibanRaw: 'IT49N0366901600264292569202',
    bic: 'REVOITM2',
};
const PRESET_AMOUNTS = [1, 3, 5];

function DonationModal({ onClose }) {
    const { t } = useTranslation();
    const { theme } = useTheme();
    const isLight = theme === 'light';

    const [selectedAmount, setSelectedAmount] = useState(3);
    const [customAmount, setCustomAmount] = useState('');
    const [amountError, setAmountError] = useState(false);
    const [showBank, setShowBank] = useState(false);
    const [copiedField, setCopiedField] = useState(null);

    function getAmount() {
        if (customAmount !== '') {
            const val = parseFloat(customAmount.replace(',', '.'));
            return isNaN(val) || val < 1 ? null : val;
        }
        return selectedAmount;
    }

    function handlePayPal() {
        const amount = getAmount();
        if (!amount) { setAmountError(true); return; }
        setAmountError(false);
        window.open(`${PAYPAL_ME}/${amount}`, '_blank', 'noopener,noreferrer');
    }

    async function copyToClipboard(text, field) {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedField(field);
            setTimeout(() => setCopiedField(null), 2000);
        } catch {
            // fallback silenzioso
        }
    }

    return (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <div
                className={`rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto border ${
                    isLight
                        ? 'bg-white border-slate-200'
                        : 'bg-slate-800 border-slate-700'
                }`}
            >
                {/* Header modale */}
                <div
                    className={`flex items-center justify-between p-5 border-b ${
                        isLight ? 'border-slate-200' : 'border-slate-700'
                    }`}
                >
                    <div className="flex items-center gap-2">
                        <Coffee size={20} className="text-amber-400" />
                        <h2 className={`text-lg font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                            {t('support.modal.title')}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className={`p-1.5 rounded-lg transition-colors ${
                            isLight
                                ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                                : 'text-gray-400 hover:text-white hover:bg-slate-700'
                        }`}
                    >
                        <XCircle size={20} />
                    </button>
                </div>

                <div className="p-5 space-y-5">
                    <p className={`text-sm ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>
                        {t('support.modal.subtitle')}
                    </p>

                    {/* Selettore importo */}
                    <div>
                        <p className={`text-sm font-medium mb-2 ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>
                            {t('support.modal.chooseAmount')}
                        </p>
                        <div className="flex gap-2 mb-2">
                            {PRESET_AMOUNTS.map(amt => (
                                <button
                                    key={amt}
                                    onClick={() => { setSelectedAmount(amt); setCustomAmount(''); setAmountError(false); }}
                                    className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition-all border-2 ${
                                        selectedAmount === amt && customAmount === ''
                                            ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                                            : isLight
                                                ? 'border-slate-300 text-slate-700 hover:border-slate-400'
                                                : 'border-slate-600 text-gray-300 hover:border-slate-500'
                                    }`}
                                >
                                    {amt}€
                                </button>
                            ))}
                        </div>
                        <input
                            type="number"
                            min="1"
                            step="0.5"
                            value={customAmount}
                            onChange={e => { setCustomAmount(e.target.value); setSelectedAmount(null); setAmountError(false); }}
                            placeholder={t('support.modal.customPlaceholder')}
                            className={`w-full px-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors ${
                                amountError
                                    ? 'border-red-500'
                                    : isLight
                                        ? 'border-slate-300'
                                        : 'border-slate-600'
                            } ${
                                isLight
                                    ? 'bg-white text-slate-900 placeholder-slate-400'
                                    : 'bg-slate-900/60 text-gray-200 placeholder-gray-500'
                            }`}
                        />
                        {amountError && (
                            <p className="text-xs text-red-400 mt-1">{t('support.modal.invalidAmount')}</p>
                        )}
                    </div>

                    {/* PayPal */}
                    <div
                        className={`rounded-xl p-4 space-y-3 ${
                            isLight
                                ? 'bg-slate-50 border border-slate-200'
                                : 'bg-slate-900/50 border border-slate-700'
                        }`}
                    >
                        <p className={`text-sm font-semibold flex items-center gap-2 ${
                            isLight ? 'text-slate-800' : 'text-gray-200'
                        }`}>
                            <span className="text-blue-400 font-bold text-base">P</span>
                            {t('support.modal.paypalTitle')}
                        </p>
                        <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                            {t('support.modal.paypalNote')}
                        </p>
                        <button
                            onClick={handlePayPal}
                            className="w-full bg-[#0070ba] hover:bg-[#003087] text-white py-3 px-4 rounded-lg font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                        >
                            <span className="font-bold text-base leading-none">P</span>
                            {t('support.modal.paypalButton')}
                        </button>
                    </div>

                    {/* Bonifico */}
                    <div
                        className={`rounded-xl overflow-hidden ${
                            isLight
                                ? 'bg-slate-50 border border-slate-200'
                                : 'bg-slate-900/50 border border-slate-700'
                        }`}
                    >
                        <button
                            onClick={() => setShowBank(v => !v)}
                            className={`w-full px-4 py-3.5 flex items-center justify-between text-left transition-colors ${
                                isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-700/30'
                            }`}
                        >
                            <span className={`text-sm font-semibold flex items-center gap-2 ${
                                isLight ? 'text-slate-800' : 'text-gray-200'
                            }`}>
                                <CreditCard size={16} className="text-green-400" />
                                {t('support.modal.bankTitle')}
                            </span>
                            <ChevronDown
                                size={16}
                                className={`transition-transform duration-200 ${
                                    isLight ? 'text-slate-500' : 'text-gray-400'
                                } ${showBank ? 'rotate-180' : ''}`}
                            />
                        </button>
                        {showBank && (
                            <div
                                className={`px-4 pb-4 space-y-3 border-t pt-3 ${
                                    isLight ? 'border-slate-200' : 'border-slate-700'
                                }`}
                            >
                                {[
                                    { label: t('support.modal.beneficiary'), value: BANK_INFO.beneficiary, copyVal: BANK_INFO.beneficiary, field: 'name' },
                                    { label: t('support.modal.iban'), value: BANK_INFO.iban, copyVal: BANK_INFO.ibanRaw, field: 'iban' },
                                    { label: t('support.modal.bic'), value: BANK_INFO.bic, copyVal: BANK_INFO.bic, field: 'bic' },
                                ].map(({ label, value, copyVal, field }) => (
                                    <div
                                        key={field}
                                        className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 ${
                                            isLight ? 'bg-white border border-slate-200' : 'bg-slate-800/60'
                                        }`}
                                    >
                                        <div className="min-w-0">
                                            <p className={`text-xs mb-0.5 ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>
                                                {label}
                                            </p>
                                            <p className={`text-sm font-mono break-all ${
                                                isLight ? 'text-slate-800' : 'text-gray-200'
                                            }`}>
                                                {value}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => copyToClipboard(copyVal, field)}
                                            className={`flex-shrink-0 p-1.5 rounded-md transition-colors ${
                                                isLight
                                                    ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                                                    : 'text-gray-400 hover:text-white hover:bg-slate-700'
                                            }`}
                                            title={t('support.modal.copy')}
                                        >
                                            {copiedField === field
                                                ? <Check size={15} className="text-green-400" />
                                                : <Copy size={15} />
                                            }
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function SettingsPage() {
    const navigate = useNavigate();
    const { logout, resetAll, autoLockTimeout, setAutoLockTimeout } = useAuth();
    const { t } = useTranslation();
    const { theme, setTheme } = useTheme();
    const isLight = theme === 'light';

    const [openSections, setOpenSections] = useState(new Set());
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [message, setMessage] = useState(null);
    const [syncStatus, setSyncStatus] = useState(null);
    const [isSyncEnabled, setIsSyncEnabled] = useState(false);
    const [syncStatusLoaded, setSyncStatusLoaded] = useState(false);
    const [showDonation, setShowDonation] = useState(false);

    function toggleSection(key) {
        setOpenSections(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }

    // Pre-carica GIS in background: quando l'utente cliccherà "Connetti",
    // init() sarà già completata e requestAccessToken verrà chiamata
    // all'interno del user-gesture context (fix freeze su mobile).
    useEffect(() => {
        googleDriveService.init().catch(() => {});
    }, []);

    useEffect(() => {
        loadSyncStatus();

        // Ascolta tutti gli eventi che potrebbero cambiare lo stato del sync
        const handleSyncEvent = (event) => {
            if (['synced', 'enabled', 'disabled', 'reauth_needed', 'error'].includes(event)) {
                loadSyncStatus();
            }
        };

        syncService.addListener(handleSyncEvent);
        return () => syncService.removeListener(handleSyncEvent);
    }, []);

    async function loadSyncStatus() {
        try {
            const status = await syncService.getSyncStatus();
            setSyncStatus(status);
            setIsSyncEnabled(status.enabled);
            setSyncStatusLoaded(true);
        } catch (error) {
            console.error('Error loading sync status:', error);
            // Retry dopo 800ms: gestisce race condition all'apertura del DB
            setTimeout(async () => {
                try {
                    const status = await syncService.getSyncStatus();
                    setSyncStatus(status);
                    setIsSyncEnabled(status.enabled);
                } catch (retryErr) {
                    console.error('Sync status retry failed:', retryErr);
                } finally {
                    setSyncStatusLoaded(true);
                }
            }, 800);
        }
    }

    async function handleEnableSync() {
        try {
            const result = await syncService.enableSync();
            await loadSyncStatus();
            if (result.cryptoChanged) {
                // importData ha sostituito la cryptoConfig in DB: la DEK in memoria è
                // ora obsoleta. Forziamo il re-login così login() ri-deriva la chiave
                // corretta dalla nuova config cloud.
                setMessage({ type: 'success', text: t('settings.sync.reloginRequired') });
                setTimeout(() => logout(), 3000);
            } else {
                setMessage({ type: 'success', text: t('settings.sync.enableSuccess') });
            }
        } catch (error) {
            console.error('Error enabling sync:', error);
            setMessage({ type: 'error', text: 'Failed to enable sync: ' + error.message });
        }
    }

    async function handleDisableSync() {
        try {
            await syncService.disableSync();
            await loadSyncStatus();
            setMessage({ type: 'success', text: t('settings.sync.disableSuccess') });
        } catch (error) {
            console.error('Error disabling sync:', error);
            setMessage({ type: 'error', text: 'Failed to disable sync: ' + error.message });
        }
    }

    async function handleSyncNow() {
        try {
            await syncService.sync();
        } catch (error) {
            console.error('Error syncing:', error);
        }
    }

    async function handleExport() {
        setIsExporting(true);
        setMessage(null);
        try {
            const data = await databaseService.exportData();
            const jsonString = JSON.stringify(data, null, 2);
            const fileName = `OwnVault-backup-${new Date().toISOString().split('T')[0]}.json`;
            const blob = new Blob([jsonString], { type: 'application/json' });

            if (navigator.share && navigator.canShare) {
                try {
                    const file = new File([blob], fileName, { type: 'application/json' });
                    if (navigator.canShare({ files: [file] })) {
                        await navigator.share({ files: [file], title: 'OwnVault Backup', text: 'Encrypted backup of OwnVault database' });
                        setMessage({ type: 'success', text: t('settings.export.success') });
                        return;
                    }
                } catch (shareError) {
                    if (shareError.name !== 'AbortError') {
                        console.log('Share failed, trying download...', shareError);
                    } else {
                        setIsExporting(false);
                        return;
                    }
                }
            }

            try {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                setMessage({ type: 'success', text: t('settings.export.successDownload') });
                return;
            } catch (downloadError) {
                console.log('Download failed, trying clipboard...', downloadError);
            }

            try {
                await navigator.clipboard.writeText(jsonString);
                setMessage({ type: 'success', text: t('settings.export.successClipboard') });
            } catch {
                throw new Error(t('settings.export.allMethodsFailed'));
            }
        } catch (error) {
            console.error('Export error:', error);
            setMessage({ type: 'error', text: 'Export failed: ' + error.message });
        } finally {
            setIsExporting(false);
        }
    }

    async function handleImport(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        setIsImporting(true);
        setMessage(null);
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            const result = await databaseService.importData(data);
            setMessage({
                type: 'success',
                text: t('settings.import.successFull', { config: result.configImported ? '✓' : '✗', profiles: result.profilesImported })
            });
            setTimeout(() => { logout(); }, 2000);
        } catch (error) {
            console.error('Import error:', error);
            setMessage({ type: 'error', text: 'Import failed: ' + error.message });
        } finally {
            setIsImporting(false);
            event.target.value = '';
        }
    }

    async function handleDeleteAll() {
        try {
            setShowDeleteConfirm(false);
            const result = await resetAll();
            if (!result.success) {
                setMessage({ type: 'error', text: 'Delete failed: ' + result.error });
            } else {
                navigate('/');
            }
        } catch (error) {
            console.error('Delete error:', error);
            setMessage({ type: 'error', text: 'Delete failed: ' + error.message });
        }
    }

    return (
        <>
            <div className="h-full flex flex-col">
                <div className="max-w-2xl mx-auto w-full flex flex-col flex-1 min-h-0 p-6">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-6">
                        <button
                            onClick={() => navigate('/')}
                            className={`p-2 rounded-lg transition-colors ${
                                isLight
                                    ? 'text-slate-500 hover:bg-slate-100'
                                    : 'text-gray-400 hover:bg-slate-700'
                            }`}
                        >
                            <ArrowLeft size={24} />
                        </button>
                        <h1 className={`text-2xl font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                            {t('settings.title')}
                        </h1>
                    </div>

                    {/* Contenuto scorrevole */}
                    <div className="flex-1 overflow-y-auto">
                        <div className="space-y-3 pb-6">
                            {/* Message */}
                            {message && (
                                <div
                                    className={`p-4 rounded-xl flex items-start gap-3 ${
                                        message.type === 'success'
                                            ? isLight
                                                ? 'bg-green-50 border border-green-200 text-green-700'
                                                : 'bg-green-900/20 border border-green-500/30 text-green-400'
                                            : isLight
                                                ? 'bg-red-50 border border-red-200 text-red-700'
                                                : 'bg-red-900/20 border border-red-500/30 text-red-400'
                                    }`}
                                >
                                    {message.type === 'success'
                                        ? <CheckCircle size={20} className="flex-shrink-0 mt-0.5" />
                                        : <XCircle size={20} className="flex-shrink-0 mt-0.5" />
                                    }
                                    <p className="text-sm flex-1">{message.text}</p>
                                </div>
                            )}

                            {/* ── Interfaccia ── */}
                            <AccordionSection
                                icon={<Monitor size={18} />}
                                title={t('settings.interface')}
                                sectionKey="interface"
                                openSections={openSections}
                                onToggle={toggleSection}
                            >
                                {/* Lingua */}
                                <div className="p-4">
                                    <LanguageSelector />
                                </div>

                                {/* Tema */}
                                <div className="p-4">
                                    <p className={`text-sm font-medium mb-3 flex items-center gap-2 ${
                                        isLight ? 'text-slate-700' : 'text-gray-300'
                                    }`}>
                                        {theme === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
                                        {t('settings.theme')}
                                    </p>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => setTheme('dark')}
                                            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                                                theme === 'dark'
                                                    ? 'border-blue-500 bg-blue-500/10'
                                                    : isLight
                                                        ? 'border-slate-300 hover:border-slate-400'
                                                        : 'border-slate-700 hover:border-slate-500'
                                            }`}
                                        >
                                            <Moon size={22} className={theme === 'dark' ? 'text-blue-400' : isLight ? 'text-slate-500' : 'text-gray-400'} />
                                            <span className={`text-sm font-medium ${
                                                theme === 'dark'
                                                    ? 'text-blue-300'
                                                    : isLight
                                                        ? 'text-slate-600'
                                                        : 'text-gray-400'
                                            }`}>
                                                {t('settings.dark')}
                                            </span>
                                        </button>
                                        <button
                                            onClick={() => setTheme('light')}
                                            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                                                theme === 'light'
                                                    ? 'border-blue-500 bg-blue-500/10'
                                                    : isLight
                                                        ? 'border-slate-300 hover:border-slate-400'
                                                        : 'border-slate-700 hover:border-slate-500'
                                            }`}
                                        >
                                            <Sun size={22} className={theme === 'light' ? 'text-blue-400' : isLight ? 'text-slate-500' : 'text-gray-400'} />
                                            <span className={`text-sm font-medium ${
                                                theme === 'light'
                                                    ? 'text-blue-300'
                                                    : isLight
                                                        ? 'text-slate-600'
                                                        : 'text-gray-400'
                                            }`}>
                                                {t('settings.light')}
                                            </span>
                                        </button>
                                    </div>
                                </div>
                            </AccordionSection>

                            {/* ── Sicurezza ── */}
                            <AccordionSection
                                icon={<Shield size={18} />}
                                title={t('settings.securitySection')}
                                sectionKey="security"
                                openSections={openSections}
                                onToggle={toggleSection}
                            >
                                {/* Biometrico */}
                                <div className="p-4">
                                    <BiometricSettingsSection />
                                </div>

                                {/* Auto-Lock */}
                                <div className="p-4 space-y-3">
                                    <p className={`text-sm font-medium ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>
                                        {t('settings.autoLock')}
                                    </p>
                                    <p className={`text-sm ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>
                                        {t('settings.autoLockDescription')}
                                    </p>
                                    <select
                                        value={autoLockTimeout}
                                        onChange={(e) => setAutoLockTimeout(Number(e.target.value))}
                                        className={`w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                                            isLight
                                                ? 'bg-white border-slate-300 text-slate-900'
                                                : 'bg-slate-900/60 border-slate-700 text-gray-200'
                                        }`}
                                    >
                                        <option value={60000}>{t('settings.autoLockOptions.1min')}</option>
                                        <option value={120000}>{t('settings.autoLockOptions.2min')}</option>
                                        <option value={300000}>{t('settings.autoLockOptions.5min')}</option>
                                        <option value={600000}>{t('settings.autoLockOptions.10min')}</option>
                                        <option value={900000}>{t('settings.autoLockOptions.15min')}</option>
                                        <option value={1800000}>{t('settings.autoLockOptions.30min')}</option>
                                        <option value={0}>{t('settings.autoLockOptions.never')}</option>
                                    </select>
                                    {autoLockTimeout === 0 && (
                                        <div className={`rounded-lg p-3 flex items-start gap-2 ${
                                            isLight
                                                ? 'bg-yellow-50 border border-yellow-200'
                                                : 'bg-yellow-900/20 border border-yellow-500/30'
                                        }`}>
                                            <AlertTriangle size={18} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                                            <p className={`text-sm ${isLight ? 'text-yellow-700' : 'text-yellow-300'}`}>
                                                {t('settings.autoLockDisabledWarning')}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </AccordionSection>

                            {/* ── Cloud Sync ── */}
                            <AccordionSection
                                icon={<Cloud size={18} />}
                                title={t('settings.sync.title')}
                                sectionKey="sync"
                                openSections={openSections}
                                onToggle={toggleSection}
                            >
                                <div className="p-4">
                                    {!syncStatusLoaded ? (
                                        <div className="flex items-center justify-center py-4">
                                            <RefreshCw size={20} className={isLight ? 'text-slate-400 animate-spin' : 'text-gray-500 animate-spin'} />
                                        </div>
                                    ) : !isSyncEnabled ? (
                                        <>
                                            <p className={`text-sm mb-4 ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>
                                                {syncStatus?.wasEnabled
                                                    ? t('settings.sync.sessionLost')
                                                    : t('settings.sync.syncAutomatically')}
                                            </p>
                                            <button
                                                onClick={handleEnableSync}
                                                className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                                            >
                                                <Cloud size={20} />
                                                <span>{syncStatus?.wasEnabled
                                                    ? t('settings.sync.reconnectDrive')
                                                    : t('settings.sync.connectDrive')}
                                                </span>
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <div className="space-y-3 mb-4">
                                                <div className={`flex items-center justify-between p-3 rounded-lg border ${
                                                    isLight
                                                        ? 'bg-slate-50 border-slate-200'
                                                        : 'bg-slate-900/60 border-slate-700'
                                                }`}>
                                                    <span className={`text-sm font-medium ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>
                                                        {t('settings.sync.statusLabel')}
                                                    </span>
                                                    <span className="flex items-center gap-2">
                                                        {syncStatus?.status === 'synced' && (
                                                            <><CheckCircle size={16} className="text-green-500" /><span className="text-sm text-green-400">{t('settings.sync.synced')}</span></>
                                                        )}
                                                        {syncStatus?.status === 'syncing' && (
                                                            <><RefreshCw size={16} className="text-blue-400 animate-spin" /><span className="text-sm text-blue-400">{t('settings.sync.status.syncing')}</span></>
                                                        )}
                                                        {syncStatus?.status === 'pending' && (
                                                            <><AlertTriangle size={16} className="text-yellow-400" /><span className="text-sm text-yellow-400">{t('settings.sync.pending')}</span></>
                                                        )}
                                                        {syncStatus?.status === 'offline' && (
                                                            <><XCircle size={16} className="text-slate-400" /><span className="text-sm text-slate-400">{t('settings.sync.offline')}</span></>
                                                        )}
                                                    </span>
                                                </div>
                                                {syncStatus?.lastSyncTimestamp > 0 && (
                                                    <div className={`flex items-center justify-between p-3 rounded-lg border ${
                                                        isLight
                                                            ? 'bg-slate-50 border-slate-200'
                                                            : 'bg-slate-900/60 border-slate-700'
                                                    }`}>
                                                        <span className={`text-sm font-medium ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>
                                                            {t('settings.sync.lastSyncLabel')}
                                                        </span>
                                                        <span className={`text-sm ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                                                            {new Date(syncStatus.lastSyncTimestamp).toLocaleString()}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="space-y-2">
                                                <button
                                                    onClick={handleSyncNow}
                                                    disabled={syncStatus?.status === 'syncing' || !syncStatus?.isOnline}
                                                    className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 px-4 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                                >
                                                    <RefreshCw size={20} />
                                                    <span>{t('settings.sync.syncNowBtn')}</span>
                                                </button>
                                                <button
                                                    onClick={handleDisableSync}
                                                    className={`w-full py-2 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                                                        isLight
                                                            ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                                            : 'bg-slate-700 hover:bg-slate-600 text-gray-300'
                                                    }`}
                                                >
                                                    <LogOut size={20} />
                                                    <span>{t('settings.sync.disconnectBtn')}</span>
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </AccordionSection>

                            {/* ── Dati ── */}
                            <AccordionSection
                                icon={<HardDrive size={18} />}
                                title={t('settings.dataSection')}
                                sectionKey="data"
                                openSections={openSections}
                                onToggle={toggleSection}
                            >
                                {/* Export */}
                                <div className="p-4 space-y-3">
                                    <p className={`text-sm font-medium flex items-center gap-2 ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>
                                        <Download size={15} /> {t('settings.export.title')}
                                    </p>
                                    <p className={`text-sm ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>
                                        {t('settings.export.shortDescription')}
                                    </p>
                                    <button
                                        onClick={handleExport}
                                        disabled={isExporting}
                                        className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 px-4 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {isExporting ? (
                                            <><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div><span>{t('settings.export.exporting')}</span></>
                                        ) : (
                                            <><Download size={20} /><span>{t('settings.export.button')}</span></>
                                        )}
                                    </button>
                                </div>

                                {/* Import */}
                                <div className="p-4 space-y-3">
                                    <p className={`text-sm font-medium flex items-center gap-2 ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>
                                        <Upload size={15} /> {t('settings.import.title')}
                                    </p>
                                    <div className={`rounded-lg p-3 flex items-start gap-2 ${
                                        isLight
                                            ? 'bg-yellow-50 border border-yellow-200'
                                            : 'bg-yellow-900/20 border border-yellow-500/30'
                                    }`}>
                                        <AlertTriangle size={18} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                                        <p className={`text-sm ${isLight ? 'text-yellow-700' : 'text-yellow-300'}`}>
                                            {t('settings.import.warningShort')}
                                        </p>
                                    </div>
                                    <label className="block">
                                        <input type="file" accept=".json" onChange={handleImport} disabled={isImporting} className="hidden" />
                                        <div className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 px-4 rounded-lg font-medium transition-colors cursor-pointer flex items-center justify-center gap-2">
                                            {isImporting ? (
                                                <><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div><span>{t('settings.import.importing')}</span></>
                                            ) : (
                                                <><Upload size={20} /><span>{t('settings.import.button')}</span></>
                                            )}
                                        </div>
                                    </label>
                                </div>

                                {/* Import Legacy */}
                                <div className="p-4 space-y-3">
                                    <p className={`text-sm font-medium flex items-center gap-2 ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>
                                        <Database size={15} className="text-blue-400" />
                                        {t('import.menuTitle')}
                                        <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded">NEW</span>
                                    </p>
                                    <p className={`text-sm ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>
                                        {t('import.step1.description')}
                                    </p>
                                    <button
                                        onClick={() => navigate('/import')}
                                        className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Upload size={20} />
                                        <span>{t('import.menuTitle')}</span>
                                    </button>
                                </div>

                                {/* Delete All */}
                                <div className="p-4 space-y-3">
                                    <p className={`text-sm font-medium flex items-center gap-2 ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>
                                        <Trash2 size={15} /> {t('settings.deleteAll.title')}
                                    </p>
                                    <p className={`text-sm ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>
                                        {t('settings.deleteAll.description')}
                                    </p>
                                    <button
                                        onClick={() => setShowDeleteConfirm(true)}
                                        className="w-full bg-red-600 hover:bg-red-700 text-white py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Trash2 size={20} />
                                        <span>{t('settings.deleteAll.button')}</span>
                                    </button>
                                </div>

                                {/* Security Note */}
                                <div className="p-4">
                                    <div className={`rounded-xl p-4 flex items-start gap-3 ${
                                        isLight
                                            ? 'bg-blue-50 border border-blue-200'
                                            : 'bg-blue-900/20 border border-blue-500/30'
                                    }`}>
                                        <Shield size={18} className="text-blue-400 flex-shrink-0 mt-0.5" />
                                        <div className="flex-1">
                                            <h3 className={`font-semibold mb-1 text-sm ${isLight ? 'text-blue-700' : 'text-blue-200'}`}>
                                                {t('settings.security.title')}
                                            </h3>
                                            <p className={`text-sm ${isLight ? 'text-blue-600' : 'text-blue-300'}`}>
                                                {t('settings.security.shortDescription')}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </AccordionSection>

                            {/* ── Supporta il progetto ── */}
                            <AccordionSection
                                icon={<Heart size={18} className="text-rose-400" />}
                                title={t('support.title')}
                                sectionKey="support"
                                openSections={openSections}
                                onToggle={toggleSection}
                            >
                                {/* Banner gratuito */}
                                <div className="p-4">
                                    <div className={`rounded-xl p-4 space-y-1.5 ${
                                        isLight
                                            ? 'bg-gradient-to-br from-rose-50 to-amber-50 border border-rose-200'
                                            : 'bg-gradient-to-br from-rose-900/25 to-amber-900/20 border border-rose-500/25'
                                    }`}>
                                        <p className={`font-semibold text-sm ${isLight ? 'text-rose-700' : 'text-rose-200'}`}>
                                            {t('support.sectionSubtitle')}
                                        </p>
                                        <p className={`text-sm leading-relaxed ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>
                                            {t('support.sectionDescription')}
                                        </p>
                                    </div>
                                </div>

                                {/* Contatti */}
                                <div className="p-4 space-y-3">
                                    <p className={`text-sm font-medium flex items-center gap-2 ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>
                                        <Mail size={15} className="text-blue-400" />
                                        {t('support.contactTitle')}
                                    </p>
                                    <p className={`text-sm ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>
                                        {t('support.contactDescription')}
                                    </p>
                                    <a
                                        href="mailto:ingegnere.castriotta@gmail.com"
                                        className={`w-full py-3 px-4 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2 ${
                                            isLight
                                                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                                : 'bg-slate-700 hover:bg-slate-600 text-gray-200'
                                        }`}
                                    >
                                        <Mail size={16} />
                                        {t('support.contactButton')}
                                    </a>
                                </div>

                                {/* Donazione */}
                                <div className="p-4 space-y-3">
                                    <p className={`text-sm font-medium flex items-center gap-2 ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>
                                        <Coffee size={15} className="text-amber-400" />
                                        {t('support.donateTitle')}
                                    </p>
                                    <p className={`text-sm ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>
                                        {t('support.donateDescription')}
                                    </p>
                                    <button
                                        onClick={() => setShowDonation(true)}
                                        className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white py-3 px-4 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-900/30"
                                    >
                                        <Heart size={16} />
                                        {t('support.donateButton')}
                                    </button>
                                </div>
                            </AccordionSection>
                        </div>
                    </div>
                </div>
            </div>

            {/* Donation Modal */}
            {showDonation && <DonationModal onClose={() => setShowDonation(false)} />}

            {/* Conflict Dialog */}
            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div
                        className={`rounded-xl p-6 max-w-md w-full border ${
                            isLight
                                ? 'bg-white border-slate-200'
                                : 'bg-slate-800 border-slate-700'
                        }`}
                    >
                        <div className="flex items-center gap-3 mb-4 text-red-400">
                            <AlertTriangle size={24} />
                            <h3 className={`text-lg font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                                {t('settings.deleteAll.confirmTitle')}
                            </h3>
                        </div>
                        <p className={`mb-6 ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>
                            {t('settings.deleteAll.confirmMessage')}
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors border ${
                                    isLight
                                        ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                                        : 'border-slate-600 text-gray-300 hover:bg-slate-700'
                                }`}
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={handleDeleteAll}
                                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 px-4 rounded-lg font-medium transition-colors"
                            >
                                {t('settings.deleteAll.deleteAllBtn')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}