/**
 * Sync Conflict Dialog
 * Mostra dialog quando c'è un conflitto tra versione locale e cloud
 */

import { AlertTriangle, Cloud, Smartphone, Calendar } from 'lucide-react';

export function SyncConflictDialog({ cloudData, localData, onResolve, onClose }) {
    const cloudTimestamp = new Date(cloudData.lastModified || cloudData.syncTimestamp);
    const localTimestamp = new Date(localData.exportDate || Date.now());

    const cloudProfilesCount = cloudData.profiles?.length || 0;
    const localProfilesCount = localData.profiles?.length || 0;

    function handleKeepLocal() {
        onResolve(false); // false = mantieni locale
        onClose();
    }

    function handleUseCloud() {
        onResolve(true); // true = usa cloud
        onClose();
    }

    return (
        <>
            {/* Overlay */}
            <div
                className="fixed inset-0 bg-black/60 z-50 animate-fadeIn"
                onClick={onClose}
            />

            {/* Dialog */}
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-11/12 max-w-md bg-white rounded-lg shadow-2xl z-50 animate-slideUp">
                {/* Header */}
                <div className="p-6 border-b bg-yellow-50">
                    <div className="flex items-center gap-3 text-yellow-800">
                        <AlertTriangle size={28} />
                        <div>
                            <h3 className="text-xl font-bold">Sync Conflict</h3>
                            <p className="text-sm text-yellow-700 mt-1">
                                Cloud version is newer than local version
                            </p>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    {/* Cloud Version */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                            <Cloud size={24} className="text-blue-600 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <h4 className="font-semibold text-blue-900 mb-2">Cloud Version</h4>
                                <div className="space-y-1 text-sm text-blue-800">
                                    <div className="flex items-center gap-2">
                                        <Calendar size={14} />
                                        <span>{cloudTimestamp.toLocaleString()}</span>
                                    </div>
                                    <div>
                                        <strong>{cloudProfilesCount}</strong> profiles
                                    </div>
                                    {cloudData.deviceName && (
                                        <div className="text-xs text-blue-600">
                                            Last modified from: {cloudData.deviceName}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Local Version */}
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                            <Smartphone size={24} className="text-gray-600 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <h4 className="font-semibold text-gray-900 mb-2">Local Version</h4>
                                <div className="space-y-1 text-sm text-gray-700">
                                    <div className="flex items-center gap-2">
                                        <Calendar size={14} />
                                        <span>{localTimestamp.toLocaleString()}</span>
                                    </div>
                                    <div>
                                        <strong>{localProfilesCount}</strong> profiles
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Warning */}
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <p className="text-sm text-red-800">
                            <strong>Warning:</strong> Choosing one version will overwrite the other.
                            This action cannot be undone.
                        </p>
                    </div>
                </div>

                {/* Actions */}
                <div className="p-6 border-t bg-gray-50 space-y-3">
                    <button
                        onClick={handleUseCloud}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                    >
                        <Cloud size={20} />
                        <span>Use Cloud Version</span>
                    </button>

                    <button
                        onClick={handleKeepLocal}
                        className="w-full bg-gray-600 hover:bg-gray-700 text-white py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                    >
                        <Smartphone size={20} />
                        <span>Keep Local Version</span>
                    </button>

                    <button
                        onClick={onClose}
                        className="w-full bg-white hover:bg-gray-100 text-gray-700 py-2 px-4 rounded-lg font-medium transition-colors border border-gray-300"
                    >
                        Cancel
                    </button>
                </div>
            </div>

            <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { 
            opacity: 0;
            transform: translate(-50%, -40%);
          }
          to { 
            opacity: 1;
            transform: translate(-50%, -50%);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }
      `}</style>
        </>
    );
}