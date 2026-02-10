/**
 * Integrity Warning Banner
 * Mostra un avviso quando viene rilevata manomissione del database.
 * Appare in cima all'app dopo il login se l'HMAC non corrisponde.
 */

import { AlertTriangle, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function IntegrityWarningBanner() {
    const { integrityError, dismissIntegrityError } = useAuth();

    if (!integrityError) return null;

    return (
        <div className="bg-red-600 text-white px-4 py-3 flex items-start gap-3 shadow-lg">
            <AlertTriangle className="flex-shrink-0 mt-0.5" size={20} />
            <div className="flex-1">
                <p className="font-bold text-sm">⚠ Database Integrity Warning</p>
                <p className="text-xs mt-1 opacity-90">
                    The database may have been modified externally. 
                    Your data could have been tampered with. 
                    If you did not make changes via DevTools or another tool, 
                    consider exporting your data and resetting the app.
                </p>
            </div>
            <button
                onClick={dismissIntegrityError}
                className="flex-shrink-0 p-1 hover:bg-red-700 rounded transition-colors"
                aria-label="Dismiss"
            >
                <X size={18} />
            </button>
        </div>
    );
}
