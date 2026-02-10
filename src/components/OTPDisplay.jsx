/**
 * OTP Display Component
 * Mostra il codice TOTP che si aggiorna automaticamente ogni 30 secondi
 */

import { useState, useEffect } from 'react';
import { Shield, Clock } from 'lucide-react';
import * as OTPAuth from 'otpauth';

export function OTPDisplay({ secret, title = 'OTP Code' }) {
    const [otp, setOtp] = useState('');
    const [timeLeft, setTimeLeft] = useState(30);
    const [isValid, setIsValid] = useState(true);

    useEffect(() => {
        if (!secret) {
            setIsValid(false);
            return;
        }

        // Tenta di generare il codice OTP
        try {
            const totp = new OTPAuth.TOTP({
                issuer: 'SafeProfiles',
                label: title,
                algorithm: 'SHA1',
                digits: 6,
                period: 30,
                secret: OTPAuth.Secret.fromBase32(secret)
            });

            // Funzione per aggiornare OTP e countdown
            const updateOTP = () => {
                try {
                    const token = totp.generate();
                    setOtp(token);
                    setIsValid(true);
                    
                    // Calcola secondi rimanenti
                    const now = Math.floor(Date.now() / 1000);
                    const remaining = 30 - (now % 30);
                    setTimeLeft(remaining);
                } catch (err) {
                    console.error('Error generating OTP:', err);
                    setIsValid(false);
                }
            };

            // Prima generazione
            updateOTP();

            // Aggiorna ogni secondo
            const interval = setInterval(updateOTP, 1000);

            return () => clearInterval(interval);
        } catch (err) {
            console.error('Invalid OTP secret:', err);
            setIsValid(false);
        }
    }, [secret, title]);

    if (!secret) {
        return null;
    }

    if (!isValid) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-red-700">
                    <Shield size={20} />
                    <span className="text-sm font-medium">Invalid OTP Secret Key</span>
                </div>
            </div>
        );
    }

    // Calcola la percentuale per la progress bar
    const progress = (timeLeft / 30) * 100;
    const isExpiring = timeLeft <= 5;

    return (
        <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-primary">
                    <Shield size={20} />
                    <span className="text-sm font-medium">2FA Code</span>
                </div>
                <div className={`flex items-center gap-1 text-sm font-medium ${
                    isExpiring ? 'text-red-600' : 'text-gray-600'
                }`}>
                    <Clock size={16} />
                    <span>{timeLeft}s</span>
                </div>
            </div>

            {/* Codice OTP */}
            <div className="bg-white rounded-lg p-4 mb-3">
                <div className="text-center">
                    <div className="text-3xl font-mono font-bold text-gray-900 tracking-wider">
                        {otp.slice(0, 3)} {otp.slice(3)}
                    </div>
                </div>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                    className={`h-full transition-all duration-1000 ease-linear ${
                        isExpiring ? 'bg-red-500' : 'bg-primary'
                    }`}
                    style={{ width: `${progress}%` }}
                />
            </div>
        </div>
    );
}
