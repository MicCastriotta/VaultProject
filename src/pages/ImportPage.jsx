import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { legacyImportService } from '../services/legacyImportService';
import { cryptoService } from '../services/cryptoService';
import { databaseService } from '../services/databaseService';
import { useAuth } from '../contexts/AuthContext';
import {
    Upload,
    Lock,
    Database,
    CheckCircle,
    AlertTriangle,
    Loader,
    ArrowRight,
    ArrowLeft,
    Eye,
    EyeOff,
    FileWarning,
    Trash2
} from 'lucide-react';

const ImportPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { refreshHMAC } = useAuth();
    // Wizard steps
    const [currentStep, setCurrentStep] = useState(1);

    // Step 1: File selection
    const [selectedFile, setSelectedFile] = useState(null);
    const [fileError, setFileError] = useState('');

    // Step 2: Password
    const [legacyPassword, setLegacyPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // Step 3: Preview
    const [previewData, setPreviewData] = useState(null);
    const [isDecrypting, setIsDecrypting] = useState(false);
    const [decryptError, setDecryptError] = useState('');

    // Step 4: Import
    const [isImporting, setIsImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);

    // ========================================
    // STEP 1: FILE SELECTION
    // ========================================

    const handleFileSelect = async (e) => {
        const file = e.target.files[0];
        setFileError('');

        if (!file) {
            setSelectedFile(null);
            return;
        }

        // Validazione estensione
        const validExtensions = ['.db', '.db3','.sqlite', '.sqlite3'];
        const hasValidExtension = validExtensions.some(ext =>
            file.name.toLowerCase().endsWith(ext)
        );

        if (!hasValidExtension) {
            setFileError(t('import.errors.invalidFileType'));
            setSelectedFile(null);
            return;
        }

        // Validazione dimensione (max 50MB)
        if (file.size > 50 * 1024 * 1024) {
            setFileError(t('import.errors.fileTooLarge'));
            setSelectedFile(null);
            return;
        }

        setSelectedFile(file);
    };

    const handleNextToPassword = () => {
        if (!selectedFile) {
            setFileError(t('import.errors.noFileSelected'));
            return;
        }
        setCurrentStep(2);
    };

    // ========================================
    // STEP 2: PASSWORD & PREVIEW
    // ========================================

    const handleDecryptAndPreview = async () => {
        if (!legacyPassword.trim()) {
            setDecryptError(t('import.errors.noPassword'));
            return;
        }

        setIsDecrypting(true);
        setDecryptError('');
        setPreviewData(null);

        try {
            // Carica il database
            await legacyImportService.loadDatabase(selectedFile);

            // Conta i profili
            const countInfo = await legacyImportService.getProfileCount();

            if (countInfo.count === 0) {
                setDecryptError(t('import.errors.emptyDatabase'));
                setIsDecrypting(false);
                return;
            }

            // Tenta di decifrare un profilo di test per validare la password
            const result = await legacyImportService.importAllProfiles(legacyPassword);

            if (result.profiles.length === 0 && result.errors.length > 0) {
                // Tutte le decifrature sono fallite = password sbagliata
                setDecryptError(t('import.errors.wrongPassword'));
                setIsDecrypting(false);
                return;
            }

            setPreviewData(result);
            setCurrentStep(3);
        } catch (error) {
            console.error('Decryption error:', error);
            setDecryptError(error.message || t('import.errors.decryptionFailed'));
        } finally {
            setIsDecrypting(false);
        }
    };

    // ========================================
    // STEP 3: IMPORT
    // ========================================

    const handleImport = async () => {
        if (!previewData || !previewData.profiles.length) {
            return;
        }

        setIsImporting(true);

        try {
            let successCount = 0;
            let errorCount = 0;
            const errors = [];

            // Importa ogni profilo nel nuovo sistema
            for (const profile of previewData.profiles) {
                try {
                    const category = profile.category === 'card' ? 'CARD' : 'WEB';
                    // Cifra con il NUOVO schema (AES-GCM + DEK)
                    const encryptedProfile = await cryptoService.encryptData(profile);

                    // Salva nel nuovo database
                    await databaseService.saveProfile({
                        ...encryptedProfile,
                        category: category,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    });

                    successCount++;
                } catch (error) {
                    errorCount++;
                    errors.push({
                        title: profile.title,
                        error: error.message
                    });
                }
            }

            setImportResult({
                success: successCount,
                failed: errorCount,
                total: previewData.profiles.length,
                errors
            });

            setCurrentStep(4);
        } catch (error) {
            console.error('Import error:', error);
            alert(t('import.errors.importFailed') + ': ' + error.message);
        } finally {
            setIsImporting(false);

            // CRITICAL: Pulisci memoria
            if (legacyPassword) {
                setLegacyPassword('');
            }
            legacyImportService.cleanup();
            await refreshHMAC();
        }
    };

    const handleFinish = () => {
        // Pulisci tutto
        setSelectedFile(null);
        setLegacyPassword('');
        setPreviewData(null);
        setImportResult(null);
        setCurrentStep(1);

        // Torna alla home
        navigate('/');
    };

    // ========================================
    // RENDER STEPS
    // ========================================

    const renderStep1 = () => (
        <div className="space-y-6">
            <div className="text-center">
                <Database className="w-16 h-16 mx-auto mb-4 text-blue-500" />
                <h2 className="text-2xl font-bold mb-2">
                    {t('import.step1.title')}
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                    {t('import.step1.description')}
                </p>
            </div>

            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
                <input
                    type="file"
                    id="db-file"
                    accept=".db,.sqlite,.sqlite3"
                    onChange={handleFileSelect}
                    className="hidden"
                />
                <label
                    htmlFor="db-file"
                    className="cursor-pointer flex flex-col items-center"
                >
                    <Upload className="w-12 h-12 mb-3 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t('import.step1.selectFile')}
                    </span>
                    <span className="text-xs text-gray-500 mt-1">
                        .db, .sqlite, .sqlite3
                    </span>
                </label>
            </div>

            {selectedFile && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <div className="flex-1">
                        <p className="text-sm font-medium text-green-900 dark:text-green-100">
                            {selectedFile.name}
                        </p>
                        <p className="text-xs text-green-700 dark:text-green-300">
                            {(selectedFile.size / 1024).toFixed(2)} KB
                        </p>
                    </div>
                </div>
            )}

            {fileError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    <p className="text-sm text-red-900 dark:text-red-100">
                        {fileError}
                    </p>
                </div>
            )}

            <div className="flex justify-end">
                <button
                    onClick={handleNextToPassword}
                    disabled={!selectedFile}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    {t('common.next')}
                    <ArrowRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );

    const renderStep2 = () => (
        <div className="space-y-6">
            <div className="text-center">
                <Lock className="w-16 h-16 mx-auto mb-4 text-blue-500" />
                <h2 className="text-2xl font-bold mb-2">
                    {t('import.step2.title')}
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                    {t('import.step2.description')}
                </p>
            </div>

            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 flex gap-3">
                <FileWarning className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-900 dark:text-yellow-100">
                    <p className="font-medium mb-1">
                        {t('import.step2.warningTitle')}
                    </p>
                    <p className="text-yellow-800 dark:text-yellow-200">
                        {t('import.step2.warningMessage')}
                    </p>
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium mb-2">
                    {t('import.step2.passwordLabel')}
                </label>
                <div className="relative">
                    <input
                        type={showPassword ? 'text' : 'password'}
                        value={legacyPassword}
                        onChange={(e) => setLegacyPassword(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleDecryptAndPreview()}
                        className="w-full px-4 py-3 pr-12 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                        placeholder={t('import.step2.passwordPlaceholder')}
                        autoFocus
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                </div>
            </div>

            {decryptError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    <p className="text-sm text-red-900 dark:text-red-100">
                        {decryptError}
                    </p>
                </div>
            )}

            <div className="flex justify-between">
                <button
                    onClick={() => setCurrentStep(1)}
                    className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                    <ArrowLeft className="w-4 h-4" />
                    {t('common.back')}
                </button>
                <button
                    onClick={handleDecryptAndPreview}
                    disabled={!legacyPassword.trim() || isDecrypting}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    {isDecrypting ? (
                        <>
                            <Loader className="w-4 h-4 animate-spin" />
                            {t('import.step2.decrypting')}
                        </>
                    ) : (
                        <>
                            {t('import.step2.preview')}
                            <ArrowRight className="w-4 h-4" />
                        </>
                    )}
                </button>
            </div>
        </div>
    );

    const renderStep3 = () => (
        <div className="space-y-6">
            <div className="text-center">
                <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
                <h2 className="text-2xl font-bold mb-2">
                    {t('import.step3.title')}
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                    {t('import.step3.description')}
                </p>
            </div>

            {previewData && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
                    <div className="text-center mb-4">
                        <p className="text-4xl font-bold text-blue-600 dark:text-blue-400">
                            {previewData.profiles.length}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            {t('import.step3.profilesFound')}
                        </p>
                    </div>

                    {previewData.errors.length > 0 && (
                        <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
                            <p className="text-sm text-yellow-800 dark:text-yellow-200">
                                <AlertTriangle className="w-4 h-4 inline mr-1" />
                                {previewData.errors.length} {t('import.step3.profilesSkipped')}
                            </p>
                        </div>
                    )}

                    <div className="mt-4 space-y-2 max-h-60 overflow-y-auto">
                        {previewData.profiles.slice(0, 10).map((profile, idx) => (
                            <div
                                key={idx}
                                className="p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700"
                            >
                                <p className="font-medium text-sm">{profile.title}</p>
                                <p className="text-xs text-gray-500">{profile.username}</p>
                            </div>
                        ))}
                        {previewData.profiles.length > 10 && (
                            <p className="text-xs text-center text-gray-500">
                                ... {t('import.step3.andMore', { count: previewData.profiles.length - 10 })}
                            </p>
                        )}
                    </div>
                </div>
            )}

            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <p className="text-sm text-green-900 dark:text-green-100">
                    <CheckCircle className="w-4 h-4 inline mr-1" />
                    {t('import.step3.securityNote')}
                </p>
            </div>

            <div className="flex justify-between">
                <button
                    onClick={() => setCurrentStep(2)}
                    className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                    <ArrowLeft className="w-4 h-4" />
                    {t('common.back')}
                </button>
                <button
                    onClick={handleImport}
                    disabled={isImporting}
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    {isImporting ? (
                        <>
                            <Loader className="w-4 h-4 animate-spin" />
                            {t('import.step3.importing')}
                        </>
                    ) : (
                        <>
                            {t('import.step3.startImport')}
                            <ArrowRight className="w-4 h-4" />
                        </>
                    )}
                </button>
            </div>
        </div>
    );

    const renderStep4 = () => (
        <div className="space-y-6">
            <div className="text-center">
                <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
                <h2 className="text-2xl font-bold mb-2">
                    {t('import.step4.title')}
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                    {t('import.step4.description')}
                </p>
            </div>

            {importResult && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6">
                    <div className="text-center space-y-4">
                        <div>
                            <p className="text-4xl font-bold text-green-600 dark:text-green-400">
                                {importResult.success}
                            </p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                {t('import.step4.successfullyImported')}
                            </p>
                        </div>

                        {importResult.failed > 0 && (
                            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
                                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                                    <AlertTriangle className="w-4 h-4 inline mr-1" />
                                    {importResult.failed} {t('import.step4.profilesFailed')}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex gap-3">
                <Trash2 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-900 dark:text-blue-100">
                    <p className="font-medium mb-1">
                        {t('import.step4.cleanupTitle')}
                    </p>
                    <p className="text-blue-800 dark:text-blue-200">
                        {t('import.step4.cleanupMessage')}
                    </p>
                </div>
            </div>

            <div className="flex justify-end">
                <button
                    onClick={handleFinish}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                >
                    {t('import.step4.finish')}
                </button>
            </div>
        </div>
    );

    // ========================================
    // MAIN RENDER
    // ========================================

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4">
            <div className="max-w-2xl mx-auto">
                {/* Progress bar */}
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-2">
                        {[1, 2, 3, 4].map((step) => (
                            <div
                                key={step}
                                className={`flex items-center ${step < 4 ? 'flex-1' : ''
                                    }`}
                            >
                                <div
                                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${currentStep >= step
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                                        }`}
                                >
                                    {step}
                                </div>
                                {step < 4 && (
                                    <div
                                        className={`flex-1 h-1 mx-2 ${currentStep > step
                                                ? 'bg-blue-600'
                                                : 'bg-gray-300 dark:bg-gray-600'
                                            }`}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                        <span>{t('import.steps.file')}</span>
                        <span>{t('import.steps.password')}</span>
                        <span>{t('import.steps.preview')}</span>
                        <span>{t('import.steps.complete')}</span>
                    </div>
                </div>

                {/* Content card */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
                    {currentStep === 1 && renderStep1()}
                    {currentStep === 2 && renderStep2()}
                    {currentStep === 3 && renderStep3()}
                    {currentStep === 4 && renderStep4()}
                </div>

                {/* Cancel button */}
                {currentStep < 4 && (
                    <div className="text-center mt-6">
                        <button
                            onClick={() => navigate(-1)}
                            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                        >
                            {t('common.cancel')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ImportPage;