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
    Database
} from 'lucide-react';
import { syncService } from '../services/syncService';
import { SyncConflictDialog } from '../components/SyncConflictDialog';
import { BiometricSettingsSection } from '../components/BiometricSettingsSection';
import { LanguageSelector } from '../components/LanguageSelector';
import { useTranslation } from 'react-i18next';

export function SettingsPage() {
    const navigate = useNavigate();
    const { logout, autoLockTimeout, setAutoLockTimeout } = useAuth();
    const { t } = useTranslation();
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [message, setMessage] = useState(null);
    const [syncStatus, setSyncStatus] = useState(null);
    const [isSyncEnabled, setIsSyncEnabled] = useState(false);
    const [syncConflict, setSyncConflict] = useState(null);

    // Carica stato sync all'avvio
    useEffect(() => {
        loadSyncStatus();

        // Listener per eventi sync
        const handleSyncEvent = (event, data) => {
            if (event === 'conflict') {
                setSyncConflict(data);
            } else if (event === 'synced') {
                loadSyncStatus();
                setMessage({
                    type: 'success',
                    text: `Synced successfully (${data.direction})`
                });
            } else if (event === 'error') {
                setMessage({
                    type: 'error',
                    text: `Sync error: ${data.error}`
                });
            }
        };

        syncService.addListener(handleSyncEvent);

        return () => {
            syncService.removeListener(handleSyncEvent);
        };
    }, []);

    async function loadSyncStatus() {
        try {
            const status = await syncService.getSyncStatus();
            setSyncStatus(status);
            setIsSyncEnabled(status.enabled);
        } catch (error) {
            console.error('Error loading sync status:', error);
        }
    }

    async function handleEnableSync() {
        try {
            await syncService.enableSync();
            await loadSyncStatus();
            setMessage({ type: 'success', text: 'Google Drive sync enabled!' });
        } catch (error) {
            console.error('Error enabling sync:', error);
            setMessage({ type: 'error', text: 'Failed to enable sync: ' + error.message });
        }
    }

    async function handleDisableSync() {
        try {
            await syncService.disableSync();
            await loadSyncStatus();
            setMessage({ type: 'success', text: 'Google Drive sync disabled' });
        } catch (error) {
            console.error('Error disabling sync:', error);
            setMessage({ type: 'error', text: 'Failed to disable sync: ' + error.message });
        }
    }

    async function handleSyncNow() {
        try {
            await syncService.sync();
            setMessage({ type: 'success', text: 'Sync completed!' });
        } catch (error) {
            console.error('Error syncing:', error);
            setMessage({ type: 'error', text: 'Sync failed: ' + error.message });
        }
    }

    function handleConflictResolution(useCloud) {
        if (syncConflict?.resolve) {
            syncConflict.resolve(useCloud);
            setSyncConflict(null);
        }
    }

    // Export database
    async function handleExport() {
        setIsExporting(true);
        setMessage(null);

        try {
            const data = await databaseService.exportData();
            const jsonString = JSON.stringify(data, null, 2);
            const fileName = `OwnVault-backup-${new Date().toISOString().split('T')[0]}.json`;

            const blob = new Blob([jsonString], { type: 'application/json' });

            // Try 1: Web Share API (funziona su iOS/Android mobile)
            if (navigator.share && navigator.canShare) {
                try {
                    const file = new File([blob], fileName, { type: 'application/json' });
                    if (navigator.canShare({ files: [file] })) {
                        await navigator.share({
                            files: [file],
                            title: 'OwnVault Backup',
                            text: 'Encrypted backup of OwnVault database'
                        });
                        setMessage({ type: 'success', text: 'Backup shared successfully!' });
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

            // Try 2: Standard download
            try {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                setMessage({ type: 'success', text: 'Database exported successfully! Check your downloads.' });
                return;
            } catch (downloadError) {
                console.log('Download failed, trying clipboard...', downloadError);
            }

            // Try 3: Copy to clipboard (fallback per Safari iOS)
            try {
                await navigator.clipboard.writeText(jsonString);
                setMessage({ type: 'success', text: 'Backup copied to clipboard! Paste it in a text file to save.' });
            } catch (clipboardError) {
                throw new Error('All export methods failed. Please try on desktop browser.');
            }

        } catch (error) {
            console.error('Export error:', error);
            setMessage({ type: 'error', text: 'Export failed: ' + error.message });
        } finally {
            setIsExporting(false);
        }
    }

    // Import database
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
                text: `Import successful! Config: ${result.configImported ? '✓' : '✗'}, Profiles: ${result.profilesImported}. Logging out...`
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

    // Delete all data
    async function handleDeleteAll() {
        try {
            await databaseService.deleteAllData();
            setShowDeleteConfirm(false);
            logout();
        } catch (error) {
            console.error('Delete error:', error);
            setMessage({ type: 'error', text: 'Delete failed: ' + error.message });
        }
    }

    return (
        <>
        <div className="h-full flex flex-col">
                <div className="max-w-2xl mx-auto w-full flex flex-col flex-1 min-h-0 p-6">

                    {/* Header - fisso */}
                    <div className="flex items-center gap-3 mb-6">
                        <button
                            onClick={() => navigate('/')}
                            className="p-2 text-gray-400 hover:bg-slate-700 rounded-lg transition-colors"
                        >
                            <ArrowLeft size={24} />
                        </button>
                        <h1 className="text-2xl font-bold text-white">{t('settings.title')}</h1>
                    </div>

                    {/* Contenuto - scorrevole */}
                    <div className="flex-1 overflow-y-auto">
                        <div className="space-y-4 pb-6">

                            {/* Message */}
                            {message && (
                                <div className={`p-4 rounded-xl flex items-start gap-3 ${message.type === 'success'
                                    ? 'bg-green-900/20 border border-green-500/30 text-green-400'
                                    : 'bg-red-900/20 border border-red-500/30 text-red-400'
                                    }`}>
                                    {message.type === 'success'
                                        ? <CheckCircle size={20} className="flex-shrink-0 mt-0.5" />
                                        : <XCircle size={20} className="flex-shrink-0 mt-0.5" />
                                    }
                                    <p className="text-sm flex-1">{message.text}</p>
                                </div>
                            )}

                            {/* Language Selector */}
                            <LanguageSelector />

                            {/* Google Drive Sync */}
                            <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
                                <div className="p-4 border-b border-slate-700">
                                    <h2 className="font-semibold text-gray-200 flex items-center gap-2">
                                        <Cloud size={20} />
                                        {t('settings.sync.title')}
                                    </h2>
                                </div>
                                <div className="p-4">
                                    {!isSyncEnabled ? (
                                        <>
                                            <p className="text-sm text-gray-400 mb-4">
                                                Automatically sync your encrypted data across all your devices using Google Drive.
                                            </p>
                                            <button
                                                onClick={handleEnableSync}
                                                className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                                            >
                                                <Cloud size={20} />
                                                <span>Connect Google Drive</span>
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <div className="space-y-3 mb-4">
                                                {/* Status */}
                                                <div className="flex items-center justify-between p-3 bg-slate-900/60 border border-slate-700 rounded-lg">
                                                    <span className="text-sm font-medium text-gray-300">Status:</span>
                                                    <span className="flex items-center gap-2">
                                                        {syncStatus?.status === 'synced' && (
                                                            <>
                                                                <CheckCircle size={16} className="text-green-500" />
                                                                <span className="text-sm text-green-400">Synced</span>
                                                            </>
                                                        )}
                                                        {syncStatus?.status === 'syncing' && (
                                                            <>
                                                                <RefreshCw size={16} className="text-blue-400 animate-spin" />
                                                                <span className="text-sm text-blue-400">Syncing...</span>
                                                            </>
                                                        )}
                                                        {syncStatus?.status === 'pending' && (
                                                            <>
                                                                <AlertTriangle size={16} className="text-yellow-400" />
                                                                <span className="text-sm text-yellow-400">Pending</span>
                                                            </>
                                                        )}
                                                        {syncStatus?.status === 'offline' && (
                                                            <>
                                                                <XCircle size={16} className="text-slate-400" />
                                                                <span className="text-sm text-slate-400">Offline</span>
                                                            </>
                                                        )}
                                                    </span>
                                                </div>

                                                {/* Last Sync */}
                                                {syncStatus?.lastSyncTimestamp > 0 && (
                                                    <div className="flex items-center justify-between p-3 bg-slate-900/60 border border-slate-700 rounded-lg">
                                                        <span className="text-sm font-medium text-gray-300">Last sync:</span>
                                                        <span className="text-sm text-gray-400">
                                                            {new Date(syncStatus.lastSyncTimestamp).toLocaleString()}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Actions */}
                                            <div className="space-y-2">
                                                <button
                                                    onClick={handleSyncNow}
                                                    disabled={syncStatus?.status === 'syncing' || !syncStatus?.isOnline}
                                                    className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 px-4 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                                >
                                                    <RefreshCw size={20} />
                                                    <span>Sync Now</span>
                                                </button>
                                                <button
                                                    onClick={handleDisableSync}
                                                    className="w-full bg-slate-700 hover:bg-slate-600 text-gray-300 py-2 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                                                >
                                                    <LogOut size={20} />
                                                    <span>Disconnect</span>
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Biometric */}
                            <BiometricSettingsSection />

                            {/* Auto-Lock */}
                            <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
                                <div className="p-4 border-b border-slate-700">
                                    <h2 className="font-semibold text-gray-200 flex items-center gap-2">
                                        <Shield size={20} />
                                        Auto-Lock
                                    </h2>
                                </div>
                                <div className="p-4 space-y-3">
                                    <p className="text-sm text-gray-400">
                                        Automatically lock the app after a period of inactivity. The app also locks faster when you switch to another tab or app.
                                    </p>
                                    <select
                                        value={autoLockTimeout}
                                        onChange={(e) => setAutoLockTimeout(Number(e.target.value))}
                                        className="w-full px-3 py-3 bg-slate-900/60 border border-slate-700 rounded-lg text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    >
                                        <option value={60000}>1 minute</option>
                                        <option value={120000}>2 minutes</option>
                                        <option value={300000}>5 minutes (default)</option>
                                        <option value={600000}>10 minutes</option>
                                        <option value={900000}>15 minutes</option>
                                        <option value={1800000}>30 minutes</option>
                                        <option value={0}>Never (not recommended)</option>
                                    </select>
                                    {autoLockTimeout === 0 && (
                                        <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-3 flex items-start gap-2">
                                            <AlertTriangle size={18} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                                            <p className="text-sm text-yellow-300">
                                                Disabling auto-lock is not recommended. Anyone with access to your device could see your passwords.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Export */}
                            <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
                                <div className="p-4 border-b border-slate-700">
                                    <h2 className="font-semibold text-gray-200 flex items-center gap-2">
                                        <Download size={20} />
                                        Export Database
                                    </h2>
                                </div>
                                <div className="p-4">
                                    <p className="text-sm text-gray-400 mb-4">
                                        Download an encrypted backup of all your profiles. The file will contain all your data in encrypted format.
                                    </p>
                                    <button
                                        onClick={handleExport}
                                        disabled={isExporting}
                                        className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 px-4 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {isExporting ? (
                                            <>
                                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                                <span>Exporting...</span>
                                            </>
                                        ) : (
                                            <>
                                                <Download size={20} />
                                                <span>Export Database</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Import */}
                            <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
                                <div className="p-4 border-b border-slate-700">
                                    <h2 className="font-semibold text-gray-200 flex items-center gap-2">
                                        <Upload size={20} />
                                        Import Database
                                    </h2>
                                </div>
                                <div className="p-4">
                                    <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-3 mb-4 flex items-start gap-2">
                                        <AlertTriangle size={18} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                                        <p className="text-sm text-yellow-300">
                                            <strong>Warning:</strong> Importing will replace all current data. Make sure to export first if you want to keep your current profiles.
                                        </p>
                                    </div>
                                    <label className="block">
                                        <input
                                            type="file"
                                            accept=".json"
                                            onChange={handleImport}
                                            disabled={isImporting}
                                            className="hidden"
                                        />
                                        <div className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 px-4 rounded-lg font-medium transition-colors cursor-pointer flex items-center justify-center gap-2">
                                            {isImporting ? (
                                                <>
                                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                                    <span>Importing...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Upload size={20} />
                                                    <span>Choose File to Import</span>
                                                </>
                                            )}
                                        </div>
                                    </label>
                                </div>
                            </div>

                            {/* Import Legacy */}
                            <div className="bg-slate-800/50 border-2 border-blue-500/40 rounded-xl overflow-hidden">
                                <div className="p-4 border-b border-slate-700">
                                    <h2 className="font-semibold text-gray-200 flex items-center gap-2">
                                        <Database size={20} className="text-blue-400" />
                                        <span>{t('import.menuTitle')}</span>
                                        <span className="ml-auto text-xs bg-blue-600 text-white px-2 py-1 rounded">NEW</span>
                                    </h2>
                                </div>
                                <div className="p-4">
                                    <p className="text-sm text-gray-400 mb-4">
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
                            </div>

                            {/* Delete All */}
                            <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
                                <div className="p-4 border-b border-slate-700">
                                    <h2 className="font-semibold text-gray-200 flex items-center gap-2">
                                        <Trash2 size={20} />
                                        Delete All Data
                                    </h2>
                                </div>
                                <div className="p-4">
                                    <p className="text-sm text-gray-400 mb-4">
                                        Permanently delete all profiles and reset the app. This action cannot be undone.
                                    </p>
                                    <button
                                        onClick={() => setShowDeleteConfirm(true)}
                                        className="w-full bg-red-600 hover:bg-red-700 text-white py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Trash2 size={20} />
                                        <span>Delete All Data</span>
                                    </button>
                                </div>
                            </div>

                            {/* Security Info */}
                            <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4 flex items-start gap-3">
                                <Shield size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <h3 className="font-semibold text-blue-200 mb-1">Security Note</h3>
                                    <p className="text-sm text-blue-300">
                                        Your exported backup file is encrypted with your master password.
                                        Keep your password safe - it's required to import the data on any device.
                                    </p>
                                </div>
                            </div>

                        </div>
                    </div>

                </div>
            </div>

            {/* Conflict Dialog */}
            {syncConflict && (
                <SyncConflictDialog
                    cloudData={syncConflict.cloudData}
                    localData={syncConflict.localData}
                    onResolve={handleConflictResolution}
                    onClose={() => setSyncConflict(null)}
                />
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md w-full">
                        <div className="flex items-center gap-3 mb-4 text-red-400">
                            <AlertTriangle size={24} />
                            <h3 className="text-lg font-bold text-white">Confirm Deletion</h3>
                        </div>
                        <p className="text-gray-300 mb-6">
                            Are you sure you want to delete all data? This will permanently remove all profiles and reset the app. This action cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="flex-1 border border-slate-600 text-gray-300 hover:bg-slate-700 py-3 px-4 rounded-lg font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteAll}
                                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 px-4 rounded-lg font-medium transition-colors"
                            >
                                Delete All
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
