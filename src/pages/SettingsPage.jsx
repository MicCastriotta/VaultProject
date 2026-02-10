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
    LogOut
} from 'lucide-react';
import { syncService } from '../services/syncService';
import { SyncConflictDialog } from '../components/SyncConflictDialog';
import { BiometricSettingsSection } from '../components/BiometricSettingsSection';

export function SettingsPage() {
    const navigate = useNavigate();
    const { logout, refreshHMAC } = useAuth();
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
            setMessage({
                type: 'success',
                text: 'Google Drive sync enabled!'
            });
        } catch (error) {
            console.error('Error enabling sync:', error);
            setMessage({
                type: 'error',
                text: 'Failed to enable sync: ' + error.message
            });
        }
    }

    async function handleDisableSync() {
        try {
            await syncService.disableSync();
            await loadSyncStatus();
            setMessage({
                type: 'success',
                text: 'Google Drive sync disabled'
            });
        } catch (error) {
            console.error('Error disabling sync:', error);
            setMessage({
                type: 'error',
                text: 'Failed to disable sync: ' + error.message
            });
        }
    }

    async function handleSyncNow() {
        try {
            await syncService.sync();
            setMessage({
                type: 'success',
                text: 'Sync completed!'
            });
        } catch (error) {
            console.error('Error syncing:', error);
            setMessage({
                type: 'error',
                text: 'Sync failed: ' + error.message
            });
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
            const fileName = `safeprofiles-backup-${new Date().toISOString().split('T')[0]}.json`;

            // Crea file blob
            const blob = new Blob([jsonString], { type: 'application/json' });

            // Try 1: Web Share API (funziona su iOS/Android mobile)
            if (navigator.share && navigator.canShare) {
                try {
                    const file = new File([blob], fileName, { type: 'application/json' });

                    if (navigator.canShare({ files: [file] })) {
                        await navigator.share({
                            files: [file],
                            title: 'SafeProfiles Backup',
                            text: 'Encrypted backup of SafeProfiles database'
                        });

                        setMessage({
                            type: 'success',
                            text: 'Backup shared successfully!'
                        });
                        return;
                    }
                } catch (shareError) {
                    if (shareError.name !== 'AbortError') {
                        console.log('Share failed, trying download...', shareError);
                    } else {
                        // User cancelled share
                        setIsExporting(false);
                        return;
                    }
                }
            }

            // Try 2: Standard download (funziona su desktop e Android Chrome)
            try {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                setMessage({
                    type: 'success',
                    text: 'Database exported successfully! Check your downloads.'
                });
                return;
            } catch (downloadError) {
                console.log('Download failed, trying clipboard...', downloadError);
            }

            // Try 3: Copy to clipboard (fallback per Safari iOS)
            try {
                await navigator.clipboard.writeText(jsonString);
                setMessage({
                    type: 'success',
                    text: 'Backup copied to clipboard! Paste it in a text file to save.'
                });
            } catch (clipboardError) {
                throw new Error('All export methods failed. Please try on desktop browser.');
            }

        } catch (error) {
            console.error('Export error:', error);
            setMessage({
                type: 'error',
                text: 'Export failed: ' + error.message
            });
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
            // Leggi file
            const text = await file.text();
            const data = JSON.parse(text);

            // Importa
            const result = await databaseService.importData(data);

            setMessage({
                type: 'success',
                text: `Import successful! Config: ${result.configImported ? '✓' : '✗'}, Profiles: ${result.profilesImported}. Logging out...`
            });

            // Logout dopo import (per re-login con nuovi dati)
            setTimeout(() => {
                logout();
            }, 2000);
        } catch (error) {
            console.error('Import error:', error);
            setMessage({
                type: 'error',
                text: 'Import failed: ' + error.message
            });
        } finally {
            setIsImporting(false);
            event.target.value = ''; // Reset input
        }
    }

    // Import from clipboard (fallback per Safari iOS)
    async function handleImportFromClipboard() {
        setIsImporting(true);
        setMessage(null);

        try {
            // Leggi da clipboard
            const text = await navigator.clipboard.readText();
            const data = JSON.parse(text);

            // Importa
            const result = await databaseService.importData(data);

            setMessage({
                type: 'success',
                text: `Import successful! Config: ${result.configImported ? '✓' : '✗'}, Profiles: ${result.profilesImported}. Logging out...`
            });

            // Logout dopo import (per re-login con nuovi dati)
            setTimeout(() => {
                logout();
            }, 2000);
        } catch (error) {
            console.error('Import error:', error);
            setMessage({
                type: 'error',
                text: 'Import failed: ' + error.message + '. Make sure you copied the JSON correctly.'
            });
        } finally {
            setIsImporting(false);
        }
    }

    // Delete all data
    async function handleDeleteAll() {
        try {
            await databaseService.deleteAllData();
            setShowDeleteConfirm(false);
            logout(); // Torna alla pagina di setup
        } catch (error) {
            console.error('Delete error:', error);
            setMessage({
                type: 'error',
                text: 'Delete failed: ' + error.message
            });
        }
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-primary text-white px-4 py-4 flex items-center gap-3">
                <button
                    onClick={() => navigate('/')}
                    className="p-2 hover:bg-primary-dark rounded-lg transition-colors"
                >
                    <ArrowLeft size={24} />
                </button>
                <h1 className="text-xl font-bold">Settings</h1>
            </div>

            {/* Message */}
            {message && (
                <div className={`mx-4 mt-4 p-4 rounded-lg flex items-start gap-3 ${message.type === 'success'
                    ? 'bg-green-50 text-green-800'
                    : 'bg-red-50 text-red-800'
                    }`}>
                    {message.type === 'success' ? (
                        <CheckCircle size={20} className="flex-shrink-0 mt-0.5" />
                    ) : (
                        <XCircle size={20} className="flex-shrink-0 mt-0.5" />
                    )}
                    <p className="text-sm flex-1">{message.text}</p>
                </div>
            )}

            {/* Settings Content */}
            <div className="p-4 space-y-4">

                {/* NUOVA SEZIONE: Google Drive Sync */}
                <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                    <div className="p-4 border-b bg-gray-50">
                        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                            <Cloud size={20} />
                            Google Drive Sync
                        </h2>
                    </div>
                    <div className="p-4">
                        {!isSyncEnabled ? (
                            <>
                                <p className="text-sm text-gray-600 mb-4">
                                    Automatically sync your encrypted data across all your devices using Google Drive.
                                </p>
                                <button
                                    onClick={handleEnableSync}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                                >
                                    <Cloud size={20} />
                                    <span>Connect Google Drive</span>
                                </button>
                            </>
                        ) : (
                            <>
                                <div className="space-y-3 mb-4">
                                    {/* Status */}
                                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                        <span className="text-sm font-medium text-gray-700">Status:</span>
                                        <span className="flex items-center gap-2">
                                            {syncStatus?.status === 'synced' && (
                                                <>
                                                    <CheckCircle size={16} className="text-green-600" />
                                                    <span className="text-sm text-green-600">Synced</span>
                                                </>
                                            )}
                                            {syncStatus?.status === 'syncing' && (
                                                <>
                                                    <RefreshCw size={16} className="text-blue-600 animate-spin" />
                                                    <span className="text-sm text-blue-600">Syncing...</span>
                                                </>
                                            )}
                                            {syncStatus?.status === 'pending' && (
                                                <>
                                                    <AlertTriangle size={16} className="text-yellow-600" />
                                                    <span className="text-sm text-yellow-600">Pending</span>
                                                </>
                                            )}
                                            {syncStatus?.status === 'offline' && (
                                                <>
                                                    <XCircle size={16} className="text-gray-400" />
                                                    <span className="text-sm text-gray-400">Offline</span>
                                                </>
                                            )}
                                        </span>
                                    </div>

                                    {/* Last Sync */}
                                    {syncStatus?.lastSyncTimestamp > 0 && (
                                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                            <span className="text-sm font-medium text-gray-700">Last sync:</span>
                                            <span className="text-sm text-gray-600">
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
                                        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        <RefreshCw size={20} />
                                        <span>Sync Now</span>
                                    </button>

                                    <button
                                        onClick={handleDisableSync}
                                        className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                                    >
                                        <LogOut size={20} />
                                        <span>Disconnect</span>
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
                <BiometricSettingsSection />
                {/* Export Section */}
                <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                    <div className="p-4 border-b bg-gray-50">
                        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                            <Download size={20} />
                            Export Database
                        </h2>
                    </div>
                    <div className="p-4">
                        <p className="text-sm text-gray-600 mb-4">
                            Download an encrypted backup of all your profiles. The file will contain all your data in encrypted format.
                        </p>
                        <button
                            onClick={handleExport}
                            disabled={isExporting}
                            className="w-full bg-primary hover:bg-primary-dark text-white py-3 px-4 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

                {/* Import Section */}
                <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                    <div className="p-4 border-b bg-gray-50">
                        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                            <Upload size={20} />
                            Import Database
                        </h2>
                    </div>
                    <div className="p-4">
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 flex items-start gap-2">
                            <AlertTriangle size={18} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-yellow-800">
                                <strong>Warning:</strong> Importing will replace all current data. Make sure to export first if you want to keep your current profiles.
                            </p>
                        </div>

                        {/* Import from File */}
                        <label className="block mb-3">
                            <input
                                type="file"
                                accept=".json"
                                onChange={handleImport}
                                disabled={isImporting}
                                className="hidden"
                            />
                            <div className="w-full bg-primary hover:bg-primary-dark text-white py-3 px-4 rounded-lg font-medium transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2">
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

                {/* Delete All Section */}
                <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                    <div className="p-4 border-b bg-gray-50">
                        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                            <Trash2 size={20} />
                            Delete All Data
                        </h2>
                    </div>
                    <div className="p-4">
                        <p className="text-sm text-gray-600 mb-4">
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
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                    <Shield size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <h3 className="font-semibold text-blue-900 mb-1">Security Note</h3>
                        <p className="text-sm text-blue-800">
                            Your exported backup file is encrypted with your master password.
                            Keep your password safe - it's required to import the data on any device.
                        </p>
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
                <>
                    <div
                        className="fixed inset-0 bg-black/50 z-40"
                        onClick={() => setShowDeleteConfirm(false)}
                    />
                    <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-11/12 max-w-md bg-white rounded-lg shadow-xl z-50 p-6">
                        <div className="flex items-center gap-3 mb-4 text-red-600">
                            <AlertTriangle size={24} />
                            <h3 className="text-lg font-bold">Confirm Deletion</h3>
                        </div>
                        <p className="text-gray-700 mb-6">
                            Are you sure you want to delete all data? This will permanently remove all profiles and reset the app. This action cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-3 px-4 rounded-lg font-medium transition-colors"
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
                </>
            )}
        </div>
    );
}