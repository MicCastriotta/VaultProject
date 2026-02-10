/**
 * QR Code Scanner Component
 * Permette di scansionare QR code per estrarre il secret OTP
 */

import { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X, Camera, AlertCircle } from 'lucide-react';

export function QRScanner({ isOpen, onClose, onScan }) {
    const scannerRef = useRef(null);
    const [error, setError] = useState('');
    const [permissionStatus, setPermissionStatus] = useState('pending'); // pending, granted, denied

    useEffect(() => {
        if (!isOpen) return;

        let scanner = null;
        let isCleanedUp = false;

        const requestCameraPermission = async () => {
            try {
                // Richiedi esplicitamente i permessi della fotocamera
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { facingMode: 'environment' } 
                });
                
                // Ferma lo stream subito dopo aver ottenuto i permessi
                stream.getTracks().forEach(track => track.stop());
                
                setPermissionStatus('granted');
                return true;
            } catch (err) {
                console.error('Camera permission error:', err);
                setPermissionStatus('denied');
                
                if (err.name === 'NotAllowedError') {
                    setError('Camera access denied. Please allow camera access in your browser settings.');
                } else if (err.name === 'NotFoundError') {
                    setError('No camera found on this device.');
                } else if (err.name === 'NotSupportedError') {
                    setError('Camera access is not supported. Please use HTTPS.');
                } else {
                    setError('Unable to access camera. Please check your browser permissions.');
                }
                return false;
            }
        };

        const initScanner = async () => {
            // Prima richiedi i permessi
            const hasPermission = await requestCameraPermission();
            
            if (!hasPermission || isCleanedUp) {
                return;
            }

            // Aspetta che il DOM sia pronto
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verifica che l'elemento esista
            const element = document.getElementById('qr-reader');
            if (!element || isCleanedUp) {
                console.error('QR reader element not found');
                return;
            }

            try {
                scanner = new Html5QrcodeScanner(
                    'qr-reader',
                    {
                        fps: 10,
                        qrbox: { width: 250, height: 250 },
                        aspectRatio: 1.0,
                        showTorchButtonIfSupported: true,
                        rememberLastUsedCamera: true,
                        supportedScanTypes: [],
                        videoConstraints: {
                            facingMode: { ideal: "environment" }  // Fotocamera posteriore su mobile
                        }
                    },
                    false
                );

                scanner.render(onScanSuccess, onScanError);
            } catch (err) {
                console.error('Scanner initialization error:', err);
                setError('Unable to initialize scanner');
            }
        };

        const onScanSuccess = (decodedText) => {
            try {
                // Parse otpauth://totp/... URL
                const url = new URL(decodedText);
                
                if (url.protocol !== 'otpauth:') {
                    setError('Invalid QR code format. Please scan a valid 2FA QR code.');
                    return;
                }

                // Estrai il secret dai parametri URL
                const secret = url.searchParams.get('secret');
                
                if (!secret) {
                    setError('Secret key not found in QR code');
                    return;
                }

                // Chiama callback con il secret
                onScan(secret);
                
                // Chiudi lo scanner
                if (scanner) {
                    scanner.clear().catch(console.error);
                }
                onClose();
            } catch (err) {
                console.error('QR parse error:', err);
                setError('Invalid QR code. Please scan a valid 2FA QR code.');
            }
        };

        const onScanError = (err) => {
            // Ignora errori di scanning continui (quando non trova il QR)
            if (err && typeof err === 'string' && err.includes('NotFoundException')) {
                return;
            }
            // Non loggare altri errori comuni
        };

        initScanner();

        return () => {
            isCleanedUp = true;
            if (scanner) {
                scanner.clear().catch(console.error);
            }
        };
    }, [isOpen, onClose, onScan]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col">
            {/* Header */}
            <div className="bg-primary text-white px-4 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Camera size={24} />
                    <h2 className="text-lg font-bold">Scan QR Code</h2>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-primary-dark rounded-lg transition-colors"
                >
                    <X size={24} />
                </button>
            </div>

            {/* Scanner Container */}
            <div className="flex-1 flex flex-col items-center justify-center p-4">
                <div className="w-full max-w-md">
                    {permissionStatus === 'pending' && (
                        <div className="bg-white rounded-lg p-6 text-center">
                            <Camera className="mx-auto mb-4 text-primary" size={48} />
                            <h3 className="text-lg font-bold mb-2">Camera Permission Required</h3>
                            <p className="text-gray-600 text-sm">
                                Requesting camera access...
                            </p>
                        </div>
                    )}

                    {permissionStatus === 'denied' && (
                        <div className="bg-white rounded-lg p-6 text-center">
                            <AlertCircle className="mx-auto mb-4 text-red-500" size={48} />
                            <h3 className="text-lg font-bold mb-2 text-red-700">Camera Access Denied</h3>
                            <p className="text-gray-600 text-sm mb-4">
                                {error || 'Please allow camera access in your browser settings to scan QR codes.'}
                            </p>
                            <div className="space-y-2 text-left text-xs text-gray-500 bg-gray-50 p-4 rounded">
                                <p className="font-semibold">How to enable camera:</p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li>Chrome/Edge: Click the camera icon in the address bar</li>
                                    <li>Safari: Settings → Safari → Camera → Allow</li>
                                    <li>Firefox: Click the permissions icon next to the URL</li>
                                </ul>
                            </div>
                            <button
                                onClick={onClose}
                                className="mt-4 px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    )}

                    {permissionStatus === 'granted' && (
                        <>
                            <div id="qr-reader" className="rounded-lg overflow-hidden" />
                            
                            {error && !error.includes('Camera access denied') && (
                                <div className="mt-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                                    {error}
                                </div>
                            )}

                            <div className="mt-6 text-white text-center space-y-2">
                                <p className="text-sm opacity-90">
                                    Position the QR code within the frame
                                </p>
                                <p className="text-xs opacity-75">
                                    The scanner will automatically detect and read the code
                                </p>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
