/**
 * QR Code Scanner Component
 * Scansiona QR code per estrarre il secret OTP (otpauth://)
 * Usa Html5Qrcode (low-level API) per controllo completo sull'UI
 */

import { useEffect, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, AlertCircle, Loader } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function QRScanner({ isOpen, onClose, onScan }) {
    const { t } = useTranslation();
    const [status, setStatus] = useState('loading'); // loading | scanning | error
    const [errorType, setErrorType] = useState('');  // permission | notfound | generic
    const [scanError, setScanError] = useState('');

    useEffect(() => {
        if (!isOpen) return;

        setStatus('loading');
        setErrorType('');
        setScanError('');

        let html5QrCode = null;
        let stopped = false;

        const start = async () => {
            try {
                html5QrCode = new Html5Qrcode('qr-video-container');
                await html5QrCode.start(
                    { facingMode: 'environment' },
                    { fps: 10, qrbox: { width: 220, height: 220 } },
                    (decodedText) => {
                        try {
                            const url = new URL(decodedText);
                            if (url.protocol !== 'otpauth:') {
                                setScanError(t('qrScanner.invalidQR'));
                                return;
                            }
                            const secret = url.searchParams.get('secret');
                            if (!secret) {
                                setScanError(t('qrScanner.noSecret'));
                                return;
                            }
                            html5QrCode.stop().catch(() => {});
                            onScan(secret);
                            onClose();
                        } catch {
                            setScanError(t('qrScanner.invalidQR'));
                        }
                    },
                    () => {} // errori di frame senza QR: normali, ignora
                );
                if (!stopped) setStatus('scanning');
            } catch (err) {
                if (stopped) return;
                if (err.name === 'NotAllowedError') {
                    setErrorType('permission');
                } else if (err.name === 'NotFoundError') {
                    setErrorType('notfound');
                } else {
                    setErrorType('generic');
                }
                setStatus('error');
            }
        };

        start();

        return () => {
            stopped = true;
            if (html5QrCode) {
                html5QrCode.stop().catch(() => {});
            }
        };
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3.5 bg-slate-900 border-b border-slate-700 flex-shrink-0">
                <div className="flex items-center gap-3">
                    <Camera size={20} className="text-blue-400" />
                    <h2 className="text-base font-semibold text-white">{t('qrScanner.title')}</h2>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 text-gray-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                >
                    <X size={20} />
                </button>
            </div>

            {/* Body */}
            <div className="flex-1 flex flex-col items-center justify-center p-6 gap-5">

                {status === 'error' ? (
                    /* Stato errore */
                    <div className="w-full max-w-sm flex flex-col items-center gap-5 text-center">
                        <div className="w-16 h-16 rounded-full bg-red-900/30 border border-red-700/50 flex items-center justify-center">
                            <AlertCircle size={30} className="text-red-400" />
                        </div>

                        <div>
                            <h3 className="text-white font-semibold mb-1.5">
                                {errorType === 'permission' ? t('qrScanner.permissionDeniedTitle') :
                                 errorType === 'notfound'  ? t('qrScanner.noCameraTitle') :
                                 t('qrScanner.errorTitle')}
                            </h3>
                            <p className="text-gray-400 text-sm">
                                {errorType === 'permission' ? t('qrScanner.permissionDeniedMsg') :
                                 errorType === 'notfound'  ? t('qrScanner.noCameraMsg') :
                                 t('qrScanner.errorMsg')}
                            </p>
                        </div>

                        {errorType === 'permission' && (
                            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-left w-full">
                                <p className="text-xs font-semibold text-gray-300 mb-2">{t('qrScanner.howToEnable')}</p>
                                <ul className="text-xs text-gray-400 space-y-1.5 list-disc list-inside">
                                    <li>{t('qrScanner.enableChrome')}</li>
                                    <li>{t('qrScanner.enableSafari')}</li>
                                    <li>{t('qrScanner.enableFirefox')}</li>
                                </ul>
                            </div>
                        )}

                        <button
                            onClick={onClose}
                            className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                            {t('common.close')}
                        </button>
                    </div>

                ) : (
                    /* Stato loading / scanning */
                    <div className="w-full max-w-xs flex flex-col items-center gap-5">

                        {/* Viewfinder */}
                        <div className="relative w-64 h-64">
                            {/* Il div che html5-qrcode usa per iniettare il video */}
                            <div
                                id="qr-video-container"
                                className="w-full h-full rounded-xl overflow-hidden bg-slate-900"
                            />

                            {/* Overlay loading */}
                            {status === 'loading' && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900 rounded-xl">
                                    <Loader size={32} className="text-blue-400 animate-spin" />
                                    <p className="text-gray-500 text-xs">{t('qrScanner.requestingCamera')}</p>
                                </div>
                            )}

                            {/* Corner brackets */}
                            {status === 'scanning' && (
                                <div className="absolute inset-0 pointer-events-none">
                                    <div className="absolute top-3 left-3 w-7 h-7 border-t-2 border-l-2 border-blue-400 rounded-tl" />
                                    <div className="absolute top-3 right-3 w-7 h-7 border-t-2 border-r-2 border-blue-400 rounded-tr" />
                                    <div className="absolute bottom-3 left-3 w-7 h-7 border-b-2 border-l-2 border-blue-400 rounded-bl" />
                                    <div className="absolute bottom-3 right-3 w-7 h-7 border-b-2 border-r-2 border-blue-400 rounded-br" />
                                </div>
                            )}
                        </div>

                        {/* Istruzione */}
                        {status === 'scanning' && (
                            <p className="text-gray-400 text-sm text-center leading-relaxed">
                                {t('qrScanner.instruction')}
                            </p>
                        )}

                        {/* Errore scansione (QR non valido) */}
                        {scanError && (
                            <div className="w-full bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-sm text-red-300 text-center">
                                {scanError}
                            </div>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
}
