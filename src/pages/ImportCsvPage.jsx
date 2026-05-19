import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    Upload,
    FileSpreadsheet,
    CheckCircle,
    AlertTriangle,
    Loader,
    ArrowRight,
    ArrowLeft,
    Download,
    Info,
    Trash2
} from 'lucide-react';
import { buildProfilesFromCsv, generateCsvTemplate } from '../services/csvImportService';
import { cryptoService } from '../services/cryptoService';
import { databaseService } from '../services/databaseService';
import { useAuth } from '../contexts/AuthContext';
import { healthCache } from '../services/healthCacheService';
import { syncService } from '../services/syncService';

const MAX_CSV_SIZE = 5 * 1024 * 1024; // 5 MB

const ImportCsvPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { refreshHMAC } = useAuth();

    const [currentStep, setCurrentStep] = useState(1);

    // Step 2: file selection
    const [selectedFile, setSelectedFile] = useState(null);
    const [fileError, setFileError] = useState('');

    // Step 3: preview
    const [previewData, setPreviewData] = useState(null); // { profiles, errors, total }
    const [isParsing, setIsParsing] = useState(false);
    const [parseError, setParseError] = useState('');

    // Step 4: import result
    const [isImporting, setIsImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);

    // ---------- Step 1 → Step 2 ----------
    const handleDownloadTemplate = () => {
        const csv = generateCsvTemplate();
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ownvault-template.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // ---------- Step 2: file ----------
    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        setFileError('');
        if (!file) {
            setSelectedFile(null);
            return;
        }

        const lower = file.name.toLowerCase();
        if (!lower.endsWith('.csv') && file.type !== 'text/csv') {
            setFileError(t('importCsv.errors.invalidFileType'));
            setSelectedFile(null);
            return;
        }
        if (file.size > MAX_CSV_SIZE) {
            setFileError(t('importCsv.errors.fileTooLarge'));
            setSelectedFile(null);
            return;
        }

        setSelectedFile(file);
    };

    const handleParseAndPreview = async () => {
        if (!selectedFile) {
            setFileError(t('importCsv.errors.noFileSelected'));
            return;
        }
        setIsParsing(true);
        setParseError('');
        setPreviewData(null);

        try {
            const text = await selectedFile.text();
            const result = buildProfilesFromCsv(text);

            if (result.profiles.length === 0) {
                if (result.errors.length > 0) {
                    setParseError(t('importCsv.errors.allRowsInvalid'));
                } else {
                    setParseError(t('importCsv.errors.emptyFile'));
                }
                setIsParsing(false);
                return;
            }

            setPreviewData(result);
            setCurrentStep(3);
        } catch (err) {
            console.error('CSV parse error:', err);
            if (err?.message === 'MISSING_TITLE_COLUMN') {
                setParseError(t('importCsv.errors.missingTitleColumn'));
            } else if (err?.message === 'EMPTY_HEADER') {
                setParseError(t('importCsv.errors.emptyFile'));
            } else {
                setParseError(t('importCsv.errors.parseFailed'));
            }
        } finally {
            setIsParsing(false);
        }
    };

    // ---------- Step 3 → Step 4: import ----------
    const handleImport = async () => {
        if (!previewData?.profiles?.length) return;

        setIsImporting(true);
        let successCount = 0;
        let errorCount = 0;
        const errors = [];

        try {
            for (const profile of previewData.profiles) {
                try {
                    const encrypted = await cryptoService.encryptData(profile);
                    await databaseService.saveProfile({
                        ...encrypted,
                        category: profile.category,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    });
                    successCount++;
                } catch (err) {
                    errorCount++;
                    errors.push({ title: profile.title, error: err.message });
                }
            }

            setImportResult({
                success: successCount,
                failed: errorCount,
                total: previewData.profiles.length,
                errors
            });
            setCurrentStep(4);
        } finally {
            setIsImporting(false);
            // Post-write mandatori (vedi CLAUDE.md)
            await refreshHMAC();
            healthCache.clear();
            try { await syncService.triggerSync(); } catch { /* sync facoltativo */ }
        }
    };

    const handleFinish = () => {
        setSelectedFile(null);
        setPreviewData(null);
        setImportResult(null);
        setCurrentStep(1);
        navigate('/');
    };

    // ========================================
    // RENDER STEPS
    // ========================================

    const renderStep1 = () => (
        <div className="space-y-6">
            <div className="text-center">
                <Info className="w-16 h-16 mx-auto mb-4 text-blue-500" />
                <h2 className="text-2xl font-bold mb-2">{t('importCsv.step1.title')}</h2>
                <p className="text-gray-600 dark:text-gray-400">{t('importCsv.step1.description')}</p>
            </div>

            <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-200">{t('importCsv.step1.formatTitle')}</p>
                <p className="text-xs text-gray-400">{t('importCsv.step1.formatIntro')}</p>
                <pre className="text-xs bg-slate-950/70 border border-slate-700 rounded p-3 overflow-x-auto text-gray-300">
{`category,title,username,password,website,note,numberCard,owner,deadline,cvv,pin
WEB,GitHub,octocat,SuperSecret!,https://github.com,work account,,,,,
CARD,Visa,,,,subscriptions,4111 1111 1111 1111,Mario Rossi,12/28,123,1234`}
                </pre>
                <ul className="text-xs text-gray-400 space-y-1 list-disc list-inside">
                    <li>{t('importCsv.step1.ruleCategory')}</li>
                    <li>{t('importCsv.step1.ruleTitle')}</li>
                    <li>{t('importCsv.step1.ruleQuotes')}</li>
                    <li>{t('importCsv.step1.ruleEncoding')}</li>
                </ul>
            </div>

            <button
                onClick={handleDownloadTemplate}
                className="w-full px-4 py-3 border border-blue-500/40 text-blue-300 hover:bg-blue-500/10 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors"
            >
                <Download className="w-4 h-4" />
                {t('importCsv.step1.downloadTemplate')}
            </button>

            <div className="flex justify-end">
                <button
                    onClick={() => setCurrentStep(2)}
                    className="flex-1 sm:flex-none px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 font-medium"
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
                <FileSpreadsheet className="w-16 h-16 mx-auto mb-4 text-blue-500" />
                <h2 className="text-2xl font-bold mb-2">{t('importCsv.step2.title')}</h2>
                <p className="text-gray-600 dark:text-gray-400">{t('importCsv.step2.description')}</p>
            </div>

            <div className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center">
                <input
                    type="file"
                    id="csv-file"
                    accept=".csv,text/csv"
                    onChange={handleFileSelect}
                    className="hidden"
                />
                <label htmlFor="csv-file" className="cursor-pointer flex flex-col items-center">
                    <Upload className="w-12 h-12 mb-3 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t('importCsv.step2.selectFile')}
                    </span>
                    <span className="text-xs text-gray-500 mt-1">.csv</span>
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

            {(fileError || parseError) && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-900 dark:text-red-100">
                        {fileError || parseError}
                    </p>
                </div>
            )}

            <div className="flex gap-3">
                <button
                    onClick={() => setCurrentStep(1)}
                    className="flex-1 px-4 py-3 border border-slate-600 text-gray-300 rounded-lg hover:bg-slate-700 flex items-center justify-center gap-2 font-medium"
                >
                    <ArrowLeft className="w-4 h-4" />
                    {t('common.back')}
                </button>
                <button
                    onClick={handleParseAndPreview}
                    disabled={!selectedFile || isParsing}
                    className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
                >
                    {isParsing ? (
                        <>
                            <Loader className="w-4 h-4 animate-spin" />
                            {t('importCsv.step2.parsing')}
                        </>
                    ) : (
                        <>
                            {t('importCsv.step2.preview')}
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
                <h2 className="text-2xl font-bold mb-2">{t('importCsv.step3.title')}</h2>
                <p className="text-gray-600 dark:text-gray-400">{t('importCsv.step3.description')}</p>
            </div>

            {previewData && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
                    <div className="text-center mb-4">
                        <p className="text-4xl font-bold text-blue-600 dark:text-blue-400">
                            {previewData.profiles.length}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            {t('importCsv.step3.profilesFound')}
                        </p>
                    </div>

                    {previewData.errors.length > 0 && (
                        <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
                            <p className="text-sm text-yellow-800 dark:text-yellow-200">
                                <AlertTriangle className="w-4 h-4 inline mr-1" />
                                {t('importCsv.step3.rowsSkipped', { count: previewData.errors.length })}
                            </p>
                        </div>
                    )}

                    <div className="mt-4 space-y-2 max-h-60 overflow-y-auto">
                        {previewData.profiles.slice(0, 10).map((profile, idx) => (
                            <div
                                key={idx}
                                className="p-3 bg-slate-900/60 rounded border border-slate-700"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <p className="font-medium text-sm text-gray-200 truncate">{profile.title}</p>
                                    <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${
                                        profile.category === 'CARD'
                                            ? 'bg-purple-600/30 text-purple-300'
                                            : 'bg-blue-600/30 text-blue-300'
                                    }`}>
                                        {profile.category}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500 truncate">
                                    {profile.category === 'WEB'
                                        ? (profile.username || profile.website || '—')
                                        : (profile.owner || profile.numberCard || '—')}
                                </p>
                            </div>
                        ))}
                        {previewData.profiles.length > 10 && (
                            <p className="text-xs text-center text-gray-500">
                                ... {t('importCsv.step3.andMore', { count: previewData.profiles.length - 10 })}
                            </p>
                        )}
                    </div>
                </div>
            )}

            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <p className="text-sm text-green-900 dark:text-green-100">
                    <CheckCircle className="w-4 h-4 inline mr-1" />
                    {t('importCsv.step3.securityNote')}
                </p>
            </div>

            <div className="flex gap-3">
                <button
                    onClick={() => setCurrentStep(2)}
                    className="flex-1 px-4 py-3 border border-slate-600 text-gray-300 rounded-lg hover:bg-slate-700 flex items-center justify-center gap-2 font-medium"
                >
                    <ArrowLeft className="w-4 h-4" />
                    {t('common.back')}
                </button>
                <button
                    onClick={handleImport}
                    disabled={isImporting}
                    className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
                >
                    {isImporting ? (
                        <>
                            <Loader className="w-4 h-4 animate-spin" />
                            {t('importCsv.step3.importing')}
                        </>
                    ) : (
                        <>
                            {t('importCsv.step3.startImport')}
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
                <h2 className="text-2xl font-bold mb-2">{t('importCsv.step4.title')}</h2>
                <p className="text-gray-600 dark:text-gray-400">{t('importCsv.step4.description')}</p>
            </div>

            {importResult && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6">
                    <div className="text-center space-y-4">
                        <div>
                            <p className="text-4xl font-bold text-green-600 dark:text-green-400">
                                {importResult.success}
                            </p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                {t('importCsv.step4.successfullyImported')}
                            </p>
                        </div>

                        {importResult.failed > 0 && (
                            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
                                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                                    <AlertTriangle className="w-4 h-4 inline mr-1" />
                                    {t('importCsv.step4.profilesFailed', { count: importResult.failed })}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex gap-3">
                <Trash2 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-900 dark:text-blue-100">
                    <p className="font-medium mb-1">{t('importCsv.step4.cleanupTitle')}</p>
                    <p className="text-blue-800 dark:text-blue-200">{t('importCsv.step4.cleanupMessage')}</p>
                </div>
            </div>

            <div className="flex justify-end">
                <button
                    onClick={handleFinish}
                    className="flex-1 sm:flex-none px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 font-medium"
                >
                    {t('importCsv.step4.finish')}
                </button>
            </div>
        </div>
    );

    // ========================================
    // MAIN RENDER
    // ========================================

    return (
        <div className="h-full flex flex-col">
            <div className="max-w-2xl mx-auto w-full flex flex-col flex-1 min-h-0 p-4 sm:p-6">

                {/* Header */}
                <div className="flex items-center gap-3 mb-5">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 text-gray-400 hover:bg-slate-700 rounded-lg transition-colors flex-shrink-0"
                    >
                        <ArrowLeft size={24} />
                    </button>
                    <h1 className="text-xl font-bold text-white">{t('importCsv.menuTitle')}</h1>
                </div>

                {/* Progress bar */}
                <div className="mb-5">
                    <div className="flex items-center justify-between mb-2">
                        {[1, 2, 3, 4].map((step) => (
                            <div key={step} className={`flex items-center ${step < 4 ? 'flex-1' : ''}`}>
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                                    currentStep >= step
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-slate-700 text-gray-400'
                                }`}>
                                    {step}
                                </div>
                                {step < 4 && (
                                    <div className={`flex-1 h-1 mx-1.5 ${currentStep > step ? 'bg-blue-600' : 'bg-slate-700'}`} />
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                        <span>{t('importCsv.steps.guide')}</span>
                        <span>{t('importCsv.steps.file')}</span>
                        <span>{t('importCsv.steps.preview')}</span>
                        <span>{t('importCsv.steps.complete')}</span>
                    </div>
                </div>

                {/* Contenuto scorrevole */}
                <div className="flex-1 overflow-y-auto">
                    <div className="pb-6">
                        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                            {currentStep === 1 && renderStep1()}
                            {currentStep === 2 && renderStep2()}
                            {currentStep === 3 && renderStep3()}
                            {currentStep === 4 && renderStep4()}
                        </div>

                        {currentStep < 4 && (
                            <div className="text-center mt-5">
                                <button
                                    onClick={() => navigate(-1)}
                                    className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
                                >
                                    {t('common.cancel')}
                                </button>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default ImportCsvPage;
