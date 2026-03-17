/**
 * DeviceApprovalDialog
 *
 * Flusso di approvazione dispositivo via QR Code + PIN (ECDH offline).
 * Nessun server richiesto.
 *
 * DUE MODALITÀ:
 *
 * mode="sender" — vecchio device che approva il nuovo:
 *   1. Scansiona il QR del nuovo device (contiene pubKeyBase64 del keypair effimero)
 *   2. Calcola ECDH, genera PIN 6 cifre, cifra DSK
 *   3. Mostra PIN + QR con { senderPubKey, encryptedDSK, transferIv }
 *
 * mode="receiver" — nuovo device che si fa approvare:
 *   1. Genera keypair effimero, mostra QR con pubKeyBase64
 *   2. Scansiona il QR del vecchio device
 *   3. Utente inserisce PIN → decifra DSK → callback onApproved(dskBytes)
 */

import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QRScanner } from './QRScanner';
import { deviceSecretService } from '../services/deviceSecretService';
import { Shield, QrCode, ScanLine, KeyRound, AlertTriangle, CheckCircle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const QR_PREFIX = 'OWNVAULT_APPROVAL:';

// ---- SENDER (vecchio device) ----

export function DeviceApprovalSender({ onClose }) {
    const { t } = useTranslation();

    // 'auth'       — step iniziale: mostra pulsante per avviare biometria esplicitamente
    // 'unlocking'  — biometria in corso
    // 'scan'       — biometria ok, pronto a scansionare QR del nuovo device
    // 'generating' — calcolo ECDH + cifratura DSK
    // 'show'       — mostra PIN + QR risposta
    const [step, setStep]               = useState('auth');
    const [showScanner, setShowScanner] = useState(false);
    const [pin, setPin]                 = useState('');
    const [qrData, setQrData]           = useState('');
    const [error, setError]             = useState('');
    const [dskBytes, setDskBytes]       = useState(null);

    // NON viene chiamata automaticamente al mount — l'utente deve premere il pulsante.
    // Questo evita il conflitto "A request is already pending" con operazioni
    // WebAuthn ancora in corso dalla sessione di login.
    async function unlockDSK() {
        setStep('unlocking');
        setError('');
        try {
            const { databaseService } = await import('../services/databaseService');
            const { biometricService } = await import('../services/biometricService');

            const biometricConfig = await databaseService.getBiometricConfig();
            if (!biometricConfig?.credentialId) {
                setError(t('deviceApproval.sender.noBiometric'));
                setStep('auth');
                return;
            }

            const prfResult = await biometricService.authenticateWithPRF(biometricConfig.credentialId, biometricConfig.transports);
            if (!prfResult.success || !prfResult.prfOutput) {
                setError(t('deviceApproval.sender.biometricFailed'));
                setStep('auth');
                return;
            }

            const deviceSecretRecord = await databaseService.getDeviceSecret();
            if (!deviceSecretRecord) {
                setError(t('deviceApproval.sender.noDSK'));
                setStep('auth');
                return;
            }

            const dsk = await deviceSecretService.unwrapDSKWithPRF(
                deviceSecretRecord.wrappedDSK,
                deviceSecretRecord.wrapIv,
                prfResult.prfOutput
            );
            setDskBytes(dsk);
            setStep('scan');
        } catch (err) {
            setError(err.message);
            setStep('auth');
        }
    }

    async function handleQRScan(raw) {
        setShowScanner(false);
        if (!raw.startsWith(QR_PREFIX)) {
            setError(t('deviceApproval.sender.invalidQR'));
            return;
        }
        if (!dskBytes) {
            setError(t('deviceApproval.sender.noDSK'));
            return;
        }

        setError('');
        setStep('generating');

        try {
            const payload = JSON.parse(raw.slice(QR_PREFIX.length));
            const recipientPub = await deviceSecretService.importPublicKey(payload.pubKey);

            const { privateKey: senderPriv, publicKeyBase64: senderPub } =
                await deviceSecretService.generateEphemeralKeypair();

            const newPin = deviceSecretService.generatePIN();
            setPin(newPin);

            const { encryptedDSK, transferIv } = await deviceSecretService.encryptDSKForTransfer(
                dskBytes, senderPriv, recipientPub, newPin
            );

            const responsePayload = JSON.stringify({ senderPub, encryptedDSK, transferIv });
            setQrData(QR_PREFIX + responsePayload);
            setStep('show');
        } catch (err) {
            setError(err.message);
            setStep('scan');
        }
    }

    return (
    <>
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <div className="bg-slate-800 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-5 border-b border-slate-700">
                    <div className="flex items-center gap-2">
                        <Shield size={20} className="text-blue-400" />
                        <h2 className="text-lg font-bold text-white">
                            {t('deviceApproval.sender.title')}
                        </h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {error && (
                        <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-3 flex items-start gap-2">
                            <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-red-300">{error}</p>
                        </div>
                    )}

                    {step === 'auth' && (
                        <>
                            <p className="text-sm text-gray-300">
                                {t('deviceApproval.sender.authInstruction')}
                            </p>
                            <button
                                onClick={unlockDSK}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                            >
                                <Shield size={18} />
                                <span>{t('deviceApproval.sender.authBtn')}</span>
                            </button>
                        </>
                    )}

                    {step === 'unlocking' && (
                        <div className="flex flex-col items-center gap-3 py-6">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400" />
                            <p className="text-sm text-gray-400">{t('deviceApproval.sender.unlocking')}</p>
                        </div>
                    )}

                    {step === 'scan' && (
                        <>
                            <p className="text-sm text-gray-300">
                                {t('deviceApproval.sender.scanInstruction')}
                            </p>
                            <button
                                onClick={() => setShowScanner(true)}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                            >
                                <ScanLine size={18} />
                                <span>{t('deviceApproval.sender.scanBtn')}</span>
                            </button>
                        </>
                    )}

                    {step === 'generating' && (
                        <div className="flex flex-col items-center gap-3 py-6">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400" />
                            <p className="text-sm text-gray-400">{t('deviceApproval.sender.generating')}</p>
                        </div>
                    )}

                    {step === 'show' && (
                        <>
                            {/* PIN */}
                            <div className="bg-slate-900 border border-slate-600 rounded-xl p-4 text-center">
                                <p className="text-xs text-gray-400 mb-2">{t('deviceApproval.sender.pinLabel')}</p>
                                <p className="text-4xl font-mono font-bold tracking-[0.3em] text-blue-300">
                                    {pin}
                                </p>
                                <p className="text-xs text-gray-500 mt-2">
                                    {t('deviceApproval.sender.pinHint')}
                                </p>
                            </div>

                            {/* QR risposta */}
                            <div className="bg-white rounded-xl p-4 flex justify-center">
                                <QRCodeSVG value={qrData} size={200} />
                            </div>

                            <p className="text-xs text-gray-400 text-center">
                                {t('deviceApproval.sender.showQRHint')}
                            </p>

                            <button
                                onClick={onClose}
                                className="w-full py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-medium transition-colors"
                            >
                                {t('deviceApproval.sender.doneBtn')}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>

        {showScanner && (
            <QRScanner
                isOpen={showScanner}
                onClose={() => setShowScanner(false)}
                onScan={handleQRScan}
                rawMode
            />
        )}
    </>
    );
}

// ---- RECEIVER (nuovo device) ----

export function DeviceApprovalReceiver({ onApproved, onClose }) {
    const { t } = useTranslation();

    const [step, setStep]         = useState('init');  // init | show | scan | pin | done | error
    const [myPubKey, setMyPubKey] = useState('');
    const [myPrivKey, setMyPrivKey] = useState(null);
    const [qrData, setQrData]     = useState('');
    const [showScanner, setShowScanner] = useState(false);
    const [pin, setPin]           = useState('');
    const [pinError, setPinError] = useState('');
    const [senderPayload, setSenderPayload] = useState(null);
    const [isDecrypting, setIsDecrypting]   = useState(false);

    useEffect(() => {
        initKeypair();
    }, []);

    async function initKeypair() {
        const { privateKey, publicKeyBase64 } = await deviceSecretService.generateEphemeralKeypair();
        setMyPrivKey(privateKey);
        setMyPubKey(publicKeyBase64);
        const payload = JSON.stringify({ pubKey: publicKeyBase64 });
        setQrData(QR_PREFIX + payload);
        setStep('show');
    }

    function handleQRScan(raw) {
        setShowScanner(false);
        if (!raw.startsWith(QR_PREFIX)) {
            setStep('error');
            return;
        }
        try {
            const payload = JSON.parse(raw.slice(QR_PREFIX.length));
            if (!payload.senderPub || !payload.encryptedDSK || !payload.transferIv) {
                setStep('error');
                return;
            }
            setSenderPayload(payload);
            setStep('pin');
        } catch {
            setStep('error');
        }
    }

    async function handleDecrypt() {
        if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
            setPinError(t('deviceApproval.receiver.pinInvalid'));
            return;
        }
        setPinError('');
        setIsDecrypting(true);

        try {
            const senderPub = await deviceSecretService.importPublicKey(senderPayload.senderPub);
            const dskBytes = await deviceSecretService.decryptDSKFromTransfer(
                senderPayload.encryptedDSK,
                senderPayload.transferIv,
                myPrivKey,
                senderPub,
                pin
            );

            if (!dskBytes) {
                setPinError(t('deviceApproval.receiver.pinWrong'));
                setIsDecrypting(false);
                return;
            }

            setStep('done');
            onApproved(dskBytes);
        } catch {
            setPinError(t('deviceApproval.receiver.decryptError'));
            setIsDecrypting(false);
        }
    }

    return (
    <>
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <div className="bg-slate-800 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-5 border-b border-slate-700">
                    <div className="flex items-center gap-2">
                        <QrCode size={20} className="text-blue-400" />
                        <h2 className="text-lg font-bold text-white">
                            {t('deviceApproval.receiver.title')}
                        </h2>
                    </div>
                    {step !== 'done' && (
                        <button onClick={onClose} className="text-gray-400 hover:text-white">
                            <X size={20} />
                        </button>
                    )}
                </div>

                <div className="p-5 space-y-4">
                    {step === 'init' && (
                        <div className="flex flex-col items-center gap-3 py-6">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400" />
                            <p className="text-sm text-gray-400">{t('deviceApproval.receiver.initializing')}</p>
                        </div>
                    )}

                    {step === 'show' && (
                        <>
                            <p className="text-sm text-gray-300">
                                {t('deviceApproval.receiver.showQRInstruction')}
                            </p>
                            <div className="bg-white rounded-xl p-4 flex justify-center">
                                <QRCodeSVG value={qrData} size={200} />
                            </div>
                            <p className="text-xs text-gray-400 text-center">
                                {t('deviceApproval.receiver.afterScanInstruction')}
                            </p>
                            <button
                                onClick={() => setShowScanner(true)}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                            >
                                <ScanLine size={18} />
                                <span>{t('deviceApproval.receiver.scanResponseBtn')}</span>
                            </button>
                        </>
                    )}

                    {step === 'pin' && (
                        <>
                            <p className="text-sm text-gray-300">
                                {t('deviceApproval.receiver.enterPinInstruction')}
                            </p>
                            <div className="space-y-1.5">
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    maxLength={6}
                                    value={pin}
                                    onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    onKeyDown={e => e.key === 'Enter' && handleDecrypt()}
                                    className="w-full px-4 py-4 bg-slate-900/70 text-gray-200 border border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 text-center text-2xl font-mono tracking-[0.4em] placeholder-gray-600"
                                    placeholder="000000"
                                    disabled={isDecrypting}
                                />
                                {pinError && (
                                    <p className="text-red-400 text-xs flex items-center gap-1">
                                        <AlertTriangle size={12} /> {pinError}
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={handleDecrypt}
                                disabled={pin.length !== 6 || isDecrypting}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                            >
                                {isDecrypting ? (
                                    <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /><span>{t('deviceApproval.receiver.decrypting')}</span></>
                                ) : (
                                    <><KeyRound size={16} /><span>{t('deviceApproval.receiver.confirmPin')}</span></>
                                )}
                            </button>
                        </>
                    )}

                    {step === 'done' && (
                        <div className="flex flex-col items-center gap-4 py-4">
                            <CheckCircle size={48} className="text-green-400" />
                            <p className="text-base font-semibold text-white text-center">
                                {t('deviceApproval.receiver.success')}
                            </p>
                            <p className="text-sm text-gray-400 text-center">
                                {t('deviceApproval.receiver.successHint')}
                            </p>
                        </div>
                    )}

                    {step === 'error' && (
                        <div className="flex flex-col items-center gap-4 py-4">
                            <AlertTriangle size={48} className="text-red-400" />
                            <p className="text-sm text-red-300 text-center">
                                {t('deviceApproval.receiver.qrInvalid')}
                            </p>
                            <button
                                onClick={() => setStep('show')}
                                className="py-2 px-4 bg-slate-700 hover:bg-slate-600 text-gray-300 rounded-xl text-sm"
                            >
                                {t('common.back')}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>

        {showScanner && (
            <QRScanner
                isOpen={showScanner}
                onClose={() => setShowScanner(false)}
                onScan={handleQRScan}
                rawMode
            />
        )}
    </>
    );
}
