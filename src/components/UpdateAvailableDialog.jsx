/**
 * Update Available Dialog
 * Mostra quando c'è una versione più recente sul cloud all'avvio
 */

import { Cloud, Download, X } from 'lucide-react';

export function UpdateAvailableDialog({ cloudTimestamp, localTimestamp, onImport, onDismiss }) {
    const cloudDate = new Date(cloudTimestamp);
    const timeDiff = cloudTimestamp - localTimestamp;
    const hoursDiff = Math.floor(timeDiff / (1000 * 60 * 60));
    const minutesDiff = Math.floor(timeDiff / (1000 * 60));

    let timeAgo = '';
    if (hoursDiff > 24) {
        timeAgo = `${Math.floor(hoursDiff / 24)} days ago`;
    } else if (hoursDiff > 0) {
        timeAgo = `${hoursDiff} hours ago`;
    } else {
        timeAgo = `${minutesDiff} minutes ago`;
    }

    return (
        <>
            {/* Overlay */}
            <div
                className="fixed inset-0 bg-black/50 z-50 animate-fadeIn"
                onClick={onDismiss}
            />

            {/* Dialog */}
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-11/12 max-w-md bg-white rounded-lg shadow-2xl z-50 animate-slideUp">
                {/* Header */}
                <div className="p-6 border-b bg-blue-50">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3 text-blue-800">
                            <Cloud size={28} />
                            <div>
                                <h3 className="text-xl font-bold">Update Available</h3>
                                <p className="text-sm text-blue-700 mt-1">
                                    A newer version is available from the cloud
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onDismiss}
                            className="p-1 hover:bg-blue-100 rounded-lg transition-colors"
                        >
                            <X size={20} className="text-blue-600" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-700">Cloud version:</span>
                            <span className="text-sm text-gray-600">{cloudDate.toLocaleString()}</span>
                        </div>
                        <div className="text-xs text-gray-500">
                            Last synced {timeAgo}
                        </div>
                    </div>

                    <p className="text-sm text-gray-600">
                        Your local data appears to be older than the cloud version.
                        Would you like to download and import the latest version?
                    </p>

                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                        <p className="text-xs text-yellow-800">
                            <strong>Note:</strong> Importing will replace your current local data with the cloud version.
                        </p>
                    </div>
                </div>

                {/* Actions */}
                <div className="p-6 border-t bg-gray-50 space-y-3">
                    <button
                        onClick={onImport}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                    >
                        <Download size={20} />
                        <span>Import Cloud Version</span>
                    </button>

                    <button
                        onClick={onDismiss}
                        className="w-full bg-white hover:bg-gray-100 text-gray-700 py-2 px-4 rounded-lg font-medium transition-colors border border-gray-300"
                    >
                        Keep Local Version
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