/**
 * SignUp Page
 * Prima volta: scegli tra nuovo dispositivo o ripristina backup
 */

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { cryptoService } from '../services/cryptoService';
import { databaseService } from '../services/databaseService';
import { googleDriveService } from '../services/googledriveService';
import { syncService } from '../services/syncService';
import {
    Eye, EyeOff, ShieldCheck, RefreshCw,
    FileText, Cloud, AlertTriangle, ArrowLeft, Loader
} from 'lucide-react';

/* global __APP_VERSION__ */

export function SignUpPage() {
    const { setupMasterPassword, checkUserExists } = useAuth();
    const { t } = useTranslation();
    const version = __APP_VERSION__;

    // Macchina a stati: choice | new | restore | restoring | restore_error
    const [view, setView] = useState('choice');
    const [restoreError, setRestoreError] = useState('');
    const [restoringMsg, setRestoringMsg] = useState('');

    // Stato form nuovo dispositivo
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const fileInputRef = useRef(null);
    const [isConnecting, setIsConnecting] = useState(false);

    // Pre-carica GIS al mount: quando l'utente tocca "Da Google Drive",
    // init() sarà già completata e requestAccessToken verrà chiamata
    // nell'immediato user-gesture context (fix blocco popup su iOS Safari).
    useEffect(() => {
        googleDriveService.init().catch(() => {});
    }, []);

    const strength = cryptoService.checkPasswordStrength(password);
    const strengthConfig = {
        Blank:      { progress: 0,   color: 'bg-gray-300',   textKey: '' },
        VeryWeak:   { progress: 25,  color: 'bg-red-500',    textKey: 'signup.strength.veryWeak' },
        Weak:       { progress: 25,  color: 'bg-orange-500', textKey: 'signup.strength.weak' },
        Medium:     { progress: 50,  color: 'bg-orange-400', textKey: 'signup.strength.medium' },
        Strong:     { progress: 75,  color: 'bg-blue-500',   textKey: 'signup.strength.strong' },
        VeryStrong: { progress: 100, color: 'bg-green-500',  textKey: 'signup.strength.veryStrong' }
    };
    const currentStrength = strengthConfig[strength] || strengthConfig.Blank;

    // ============================================================
    // NUOVO DISPOSITIVO
    // ============================================================

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');

        if (!password || !confirmPassword) {
            setError(t('auth.requiredField'));
            return;
        }
        // eslint-disable-next-line security/detect-possible-timing-attacks
        if (password !== confirmPassword) {
            setError(t('auth.passwordMismatch'));
            return;
        }
        if (password.length < 10) {
            setError(t('signup.passwordTooShort'));
            return;
        }

        setIsLoading(true);
        try {
            const result = await setupMasterPassword(password);
            if (!result.success) {
                setError(result.error || t('signup.setupFailed'));
            }
        } catch {
            setError(t('auth.unexpectedError'));
        } finally {
            setIsLoading(false);
        }
    }

    // ============================================================
    // RIPRISTINO DA FILE JSON
    // ============================================================

    async function handleFileRestore(e) {
        const file = e.target.files?.[0];
        if (!file) return;

        setView('restoring');
        setRestoringMsg(t('signup.restore.readingFile'));

        try {
            const text = await file.text();
            const data = JSON.parse(text);
            setRestoringMsg(t('signup.restore.importing'));
            await databaseService.importData(data);
            await checkUserExists();
            // AuthContext → userExists=true, isUnlocked=false → LoginPage
        } catch (err) {
            setRestoreError(err.message || t('signup.restore.fileError'));
            setView('restore_error');
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }

    // ============================================================
    // RIPRISTINO DA GOOGLE DRIVE
    // ============================================================

    async function handleDriveRestore() {
        // signIn() deve essere chiamata il prima possibile nel contesto user-gesture,
        // senza await intermedi — altrimenti iOS Safari blocca il popup OAuth.
        setIsConnecting(true);
        let signInResult;
        try {
            signInResult = await googleDriveService.signIn();
        } catch (err) {
            setIsConnecting(false);
            setRestoreError(err.message || t('signup.restore.driveError'));
            setView('restore_error');
            return;
        }

        // Il vault non è ancora sbloccato: il refresh token non può essere cifrato
        // con la DEK ora. Lo salviamo in sessionStorage e lo cifreremo al primo login.
        if (signInResult?.refreshToken) {
            sessionStorage.setItem('ov_pending_drive_token', signInResult.refreshToken);
        }
        setIsConnecting(false);
        setView('restoring');
        setRestoringMsg(t('signup.restore.searchingBackup'));

        try {
            const file = await googleDriveService.findFile('ownvault-sync.json');

            if (!file) {
                throw new Error(t('signup.restore.driveNoBackup'));
            }

            setRestoringMsg(t('signup.restore.downloading'));
            const data = await googleDriveService.downloadFile(file.id);

            setRestoringMsg(t('signup.restore.importing'));
            await databaseService.importData(data);

            // importData svuota syncConfig: ripristina il flag con il fileId noto
            localStorage.setItem('ownvault_sync_enabled_flag', 'true');
            await databaseService.saveSyncConfig({
                enabled: true,
                googleDriveFileId: file.id,
                lastSyncTimestamp: Date.now(),
                lastLocalModification: Date.now(),
                deviceId: syncService.deviceId,
                deviceName: syncService.deviceName,
                conflictStrategy: 'ask'
            });

            await checkUserExists();
            // AuthContext → userExists=true, isUnlocked=false → LoginPage
        } catch (err) {
            setRestoreError(err.message || t('signup.restore.driveError'));
            setView('restore_error');
        }
    }

    // ============================================================
    // RENDER
    // ============================================================

    const header = (
        <div className="text-center mb-10">
            <div className="flex items-center justify-center mb-6">
                <img src="/icons/appicon.png" alt="OwnVault" className="w-24 h-24 object-contain drop-shadow-lg" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2 tracking-wide">OwnVault</h1>
        </div>
    );

    const footer = (
        <div className="mt-6 text-center text-xs text-gray-500">
            {t('login.e2eEncryption')} • v{version}
            <span className="mx-2">•</span>
            <a href="/privacy" target="_blank" rel="noopener noreferrer"
               className="hover:text-gray-300 underline underline-offset-2 transition-colors">
                {t('privacy.link')}
            </a>
        </div>
    );

    // ---- CHOICE ----
    if (view === 'choice') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4">
                <div className="w-full max-w-md">
                    {header}
                    <div className="glass rounded-3xl p-8 border border-slate-800 shadow-2xl space-y-4">
                        <p className="text-gray-300 text-sm text-center mb-2">{t('signup.chooseSetupMode')}</p>

                        <button
                            onClick={() => setView('new')}
                            className="w-full flex items-center gap-4 px-5 py-4 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded-2xl transition-colors text-left"
                        >
                            <div className="p-2 bg-blue-500/20 rounded-xl shrink-0">
                                <ShieldCheck size={24} className="text-blue-400" />
                            </div>
                            <div>
                                <p className="font-semibold text-white">{t('signup.newDevice')}</p>
                                <p className="text-xs text-gray-400 mt-0.5">{t('signup.newDeviceHint')}</p>
                            </div>
                        </button>

                        <button
                            onClick={() => setView('restore')}
                            className="w-full flex items-center gap-4 px-5 py-4 bg-slate-700/40 hover:bg-slate-700/60 border border-slate-600/40 rounded-2xl transition-colors text-left"
                        >
                            <div className="p-2 bg-slate-600/40 rounded-xl shrink-0">
                                <RefreshCw size={24} className="text-gray-300" />
                            </div>
                            <div>
                                <p className="font-semibold text-white">{t('signup.restoreBackup')}</p>
                                <p className="text-xs text-gray-400 mt-0.5">{t('signup.restoreBackupHint')}</p>
                            </div>
                        </button>
                    </div>
                    {footer}
                </div>
            </div>
        );
    }

    // ---- RESTORE SOURCE SELECTION ----
    if (view === 'restore') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4">
                <div className="w-full max-w-md">
                    {header}
                    <div className="glass rounded-3xl p-8 border border-slate-800 shadow-2xl space-y-4">
                        <button onClick={() => setView('choice')} className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors mb-1">
                            <ArrowLeft size={15} /> {t('common.back')}
                        </button>

                        <p className="text-gray-300 text-sm text-center">{t('signup.restore.chooseSource')}</p>

                        {/* Input file nascosto */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json"
                            className="hidden"
                            onChange={handleFileRestore}
                        />

                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full flex items-center gap-4 px-5 py-4 bg-slate-700/40 hover:bg-slate-700/60 border border-slate-600/40 rounded-2xl transition-colors text-left"
                        >
                            <div className="p-2 bg-slate-600/40 rounded-xl shrink-0">
                                <FileText size={24} className="text-gray-300" />
                            </div>
                            <div>
                                <p className="font-semibold text-white">{t('signup.restore.fromFile')}</p>
                                <p className="text-xs text-gray-400 mt-0.5">{t('signup.restore.fromFileHint')}</p>
                            </div>
                        </button>

                        <button
                            onClick={handleDriveRestore}
                            disabled={isConnecting}
                            className="w-full flex items-center gap-4 px-5 py-4 bg-slate-700/40 hover:bg-slate-700/60 border border-slate-600/40 rounded-2xl transition-colors text-left disabled:opacity-50"
                        >
                            <div className="p-2 bg-slate-600/40 rounded-xl shrink-0">
                                {isConnecting
                                    ? <Loader size={24} className="text-gray-300 animate-spin" />
                                    : <Cloud size={24} className="text-gray-300" />
                                }
                            </div>
                            <div>
                                <p className="font-semibold text-white">{t('signup.restore.fromDrive')}</p>
                                <p className="text-xs text-gray-400 mt-0.5">{t('signup.restore.fromDriveHint')}</p>
                            </div>
                        </button>
                    </div>
                    {footer}
                </div>
            </div>
        );
    }

    // ---- RESTORING (loading) ----
    if (view === 'restoring') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4">
                <div className="w-full max-w-md">
                    {header}
                    <div className="glass rounded-3xl p-8 border border-slate-800 shadow-2xl flex flex-col items-center gap-5">
                        <Loader size={40} className="text-blue-400 animate-spin" />
                        <p className="text-gray-300 text-sm text-center">{restoringMsg}</p>
                    </div>
                </div>
            </div>
        );
    }

    // ---- RESTORE ERROR ----
    if (view === 'restore_error') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4">
                <div className="w-full max-w-md">
                    {header}
                    <div className="glass rounded-3xl p-8 border border-slate-800 shadow-2xl space-y-5">
                        <div className="flex flex-col items-center gap-3 text-center">
                            <div className="p-3 bg-red-500/10 rounded-2xl">
                                <AlertTriangle size={32} className="text-red-400" />
                            </div>
                            <h2 className="text-lg font-semibold text-white">{t('signup.restore.errorTitle')}</h2>
                            <p className="text-sm text-gray-400">{restoreError}</p>
                        </div>

                        <div className="space-y-3">
                            <button
                                onClick={() => { setRestoreError(''); setView('restore'); }}
                                className="w-full py-3 border border-slate-600 text-gray-300 rounded-xl hover:bg-slate-700 transition-colors text-sm font-medium"
                            >
                                {t('signup.restore.tryAgain')}
                            </button>
                            <button
                                onClick={() => { setRestoreError(''); setView('new'); }}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors text-sm font-medium"
                            >
                                {t('signup.restore.fallbackToNew')}
                            </button>
                        </div>
                    </div>
                    {footer}
                </div>
            </div>
        );
    }

    // ---- NEW DEVICE (form password) ----
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4">
            <div className="w-full max-w-md">
                {header}
                <div className="glass rounded-3xl p-8 border border-slate-800 shadow-2xl">
                    <button onClick={() => setView('choice')} className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors mb-5">
                        <ArrowLeft size={15} /> {t('common.back')}
                    </button>

                    <p className="text-gray-300 text-sm text-center mb-6">{t('signup.choosePasswordHint')}</p>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {password && (
                            <div className="space-y-2">
                                <label className="text-xs text-gray-400 font-medium">{t('signup.passwordStrength')}</label>
                                <div className="flex-1 bg-slate-800/50 rounded-full h-2.5 overflow-hidden border border-slate-700">
                                    <div
                                        className={`h-full rounded-full transition-all ${currentStrength.color}`}
                                        style={{ width: `${currentStrength.progress}%` }}
                                    />
                                </div>
                                <p className={`text-sm font-semibold ${
                                    currentStrength.progress < 50 ? 'text-red-400' :
                                    currentStrength.progress < 75 ? 'text-orange-400' : 'text-accent'
                                }`}>
                                    {currentStrength.textKey ? t(currentStrength.textKey) : ''}
                                </p>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-xs text-gray-400 font-medium">{t('auth.masterPassword')}</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-800/70 text-gray-200 border border-slate-700 rounded-xl focus:ring-2 focus:ring-brand focus:border-transparent placeholder-gray-500"
                                    placeholder={t('signup.enterPasswordPlaceholder')}
                                    disabled={isLoading}
                                />
                                <button type="button" onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300">
                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs text-gray-400 font-medium">{t('auth.confirmPassword')}</label>
                            <div className="relative">
                                <input
                                    type={showConfirm ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-800/70 text-gray-200 border border-slate-700 rounded-xl focus:ring-2 focus:ring-brand focus:border-transparent placeholder-gray-500"
                                    placeholder={t('signup.confirmPasswordPlaceholder')}
                                    disabled={isLoading}
                                />
                                <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300">
                                    {showConfirm ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className="bg-red-900/30 border border-red-700/50 text-red-400 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                                <AlertTriangle size={14} />
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-gradient-to-r from-brand to-blue-500 hover:from-brand/90 hover:to-blue-500/90 text-white py-3 rounded-xl font-semibold transition-all shadow-lg shadow-blue-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <div className="flex items-center justify-center gap-2">
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                    <span>{t('signup.creating')}</span>
                                </div>
                            ) : t('signup.start')}
                        </button>
                    </form>
                </div>
                {footer}
            </div>
        </div>
    );
}
