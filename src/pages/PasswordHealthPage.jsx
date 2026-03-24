/**
 * Password Health Page
 * Analizza tutti i profili WEB e rileva:
 * - Password compromesse (via HaveIBeenPwned k-anonymity API)
 * - Password duplicate (usate su più account)
 * - Password deboli (corte o semplici)
 *
 * I risultati vengono salvati in memoria (healthCache) e mostrati
 * immediatamente al ritorno sulla pagina, senza ri-analisi.
 * La cache viene cancellata al lock/logout del vault.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ArrowLeft,
    Shield,
    ShieldAlert,
    ShieldCheck,
    AlertTriangle,
    Copy,
    RefreshCw,
    ExternalLink,
    WifiOff,
    ChevronDown,
    ChevronUp,
    CreditCard
} from 'lucide-react';
import { databaseService } from '../services/databaseService';
import { cryptoService } from '../services/cryptoService';
import { hibpService } from '../services/hibpService';
import { healthCache } from '../services/healthCacheService';

/**
 * Valuta la forza di una password (semplificato)
 */
function getPasswordStrength(password) {
    if (!password) return { level: 'none', labelKey: 'health.strength.empty' };
    if (password.length < 6) return { level: 'critical', labelKey: 'health.strength.veryWeak' };
    if (password.length < 8) return { level: 'weak', labelKey: 'health.strength.weak' };

    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (password.length >= 16) score++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 2) return { level: 'weak', labelKey: 'health.strength.weak' };
    if (score <= 3) return { level: 'fair', labelKey: 'health.strength.fair' };
    if (score <= 4) return { level: 'good', labelKey: 'health.strength.strong' };
    return { level: 'strong', labelKey: 'health.strength.veryStrong' };
}

/**
 * Calcola il punteggio di salute 0–100 e lo restituisce (senza side-effect).
 */
function computeHealthScoreValue(allProfiles, pwned, dupes, weak) {
    if (allProfiles.length === 0) return null;

    const total = allProfiles.length;
    const pwnedCount = pwned.length;
    const dupProfileCount = dupes.reduce((sum, d) => sum + d.count, 0);
    const weakCount = weak.length;

    const penalty = (pwnedCount * 20 + dupProfileCount * 10 + weakCount * 8);
    const maxPenalty = total * 20;

    return Math.max(0, Math.round(100 - (penalty / maxPenalty) * 100));
}

/**
 * Parsa MM/YY e restituisce la data di scadenza (ultimo istante del mese).
 */
function parseCardExpiry(deadline) {
    if (!deadline || !/^\d{2}\/\d{2}$/.test(deadline)) return null;
    const [mm, yy] = deadline.split('/');
    const month = parseInt(mm, 10) - 1;
    const year = 2000 + parseInt(yy, 10);
    return new Date(year, month + 1, 0, 23, 59, 59, 999);
}

/**
 * Restituisce { status: 'expired'|'expiring', daysUntilExpiry } oppure null se la carta è valida.
 * Soglia "in scadenza": 60 giorni.
 */
function getCardExpiryStatus(deadline) {
    const expiry = parseCardExpiry(deadline);
    if (!expiry) return null;
    const daysUntilExpiry = Math.ceil((expiry - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysUntilExpiry < 0) return { status: 'expired', daysUntilExpiry };
    if (daysUntilExpiry <= 60) return { status: 'expiring', daysUntilExpiry };
    return null;
}

/**
 * Formatta il timestamp in una stringa relativa leggibile.
 */
function formatLastChecked(timestamp, t) {
    if (!timestamp) return null;
    const diffMs = Date.now() - timestamp;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return t('health.time.justNow');
    if (diffMin === 1) return t('health.time.minuteAgo');
    if (diffMin < 60) return t('health.time.minutesAgo', { count: diffMin });
    const diffH = Math.floor(diffMin / 60);
    if (diffH === 1) return t('health.time.hourAgo');
    return t('health.time.hoursAgo', { count: diffH });
}


export function PasswordHealthPage() {
    const navigate = useNavigate();
    const { t } = useTranslation();

    const [isLoading, setIsLoading] = useState(true);
    const [isChecking, setIsChecking] = useState(false);
    const [progress, setProgress] = useState({ checked: 0, total: 0 });
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    // Risultati
    const [profiles, setProfiles] = useState([]);
    const [compromised, setCompromised] = useState([]);
    const [duplicates, setDuplicates] = useState([]);
    const [weakPasswords, setWeakPasswords] = useState([]);
    const [expiringCards, setExpiringCards] = useState([]);
    const [healthScore, setHealthScore] = useState(null);
    const [lastChecked, setLastChecked] = useState(null);

    // UI
    const [expandedSection, setExpandedSection] = useState(null);
    const [hibpError, setHibpError] = useState(false);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Carica dalla cache se disponibile, altrimenti analizza
        const cached = healthCache.get();
        if (cached) {
            setProfiles(cached.profiles);
            setCompromised(cached.compromised);
            setDuplicates(cached.duplicates);
            setWeakPasswords(cached.weakPasswords);
            setExpiringCards(cached.expiringCards || []);
            setHealthScore(cached.healthScore);
            setLastChecked(cached.timestamp);
            setIsLoading(false);
        } else {
            loadAndAnalyze();
        }

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    /**
     * Carica profili, decifra, analizza localmente (duplicati + deboli) e via HIBP.
     * Salva i risultati nella cache al termine.
     */
    async function loadAndAnalyze() {
        setIsLoading(true);
        try {
            // 1. Carica e decifra tutti i profili (una sola passata)
            const encrypted = await databaseService.getAllProfiles();
            const allDecrypted = (await Promise.all(
                encrypted.map(async (p) => {
                    try {
                        const data = await cryptoService.decryptData({
                            iv: p.iv,
                            data: p.data
                        });
                        return { id: p.id, ...data };
                    } catch {
                        return null;
                    }
                })
            )).filter(Boolean);

            const decrypted = allDecrypted.filter(p => p.category === 'WEB' && p.password);
            setProfiles(decrypted);

            // Carte in scadenza o già scadute
            const expiring = allDecrypted
                .filter(p => p.category === 'CARD' && p.deadline)
                .map(p => {
                    const info = getCardExpiryStatus(p.deadline);
                    return info ? { ...p, expiryInfo: info } : null;
                })
                .filter(Boolean);
            setExpiringCards(expiring);

            // 2. Analisi locale: duplicati
            const passwordMap = new Map();
            decrypted.forEach(p => {
                const pwd = p.password;
                if (!passwordMap.has(pwd)) passwordMap.set(pwd, []);
                passwordMap.get(pwd).push(p);
            });

            const dupes = [];
            passwordMap.forEach((profileList) => {
                if (profileList.length > 1) {
                    dupes.push({ profiles: profileList, count: profileList.length });
                }
            });
            setDuplicates(dupes);

            // 3. Analisi locale: password deboli
            const weak = decrypted
                .filter(p => {
                    const s = getPasswordStrength(p.password);
                    return s.level === 'critical' || s.level === 'weak';
                })
                .map(p => ({ ...p, strength: getPasswordStrength(p.password) }));
            setWeakPasswords(weak);

            // Mostra subito i risultati locali: l'utente vede la pagina
            // mentre il check HIBP (lento) procede in background con la sua progress bar
            setIsLoading(false);

            // 4. Check HIBP se online, poi salva in cache con i dati completi
            if (navigator.onLine) {
                const pwnedProfiles = await runHIBPCheck(decrypted, dupes, weak);
                const score = computeHealthScoreValue(decrypted, pwnedProfiles, dupes, weak);
                const now = Date.now();
                healthCache.set({ profiles: decrypted, compromised: pwnedProfiles, duplicates: dupes, weakPasswords: weak, expiringCards: expiring, healthScore: score, timestamp: now });
                setLastChecked(now);
            } else {
                // Offline: salva analisi locale senza dati HIBP
                const score = computeHealthScoreValue(decrypted, [], dupes, weak);
                setHealthScore(score);
                const now = Date.now();
                healthCache.set({ profiles: decrypted, compromised: [], duplicates: dupes, weakPasswords: weak, expiringCards: expiring, healthScore: score, timestamp: now });
                setLastChecked(now);
            }

        } catch (error) {
            console.error('Error loading profiles for health check:', error);
            setIsLoading(false);
        }
    }

    /**
     * Controlla le password contro HaveIBeenPwned.
     * Restituisce l'array dei profili compromessi (per poterli cachare).
     */
    async function runHIBPCheck(profilesList, dupesList, weakList) {
        const list = profilesList || profiles;
        const dupes = dupesList !== undefined ? dupesList : duplicates;
        const weak  = weakList  !== undefined ? weakList  : weakPasswords;

        if (list.length === 0) return [];

        setIsChecking(true);
        setHibpError(false);
        setProgress({ checked: 0, total: list.length });

        try {
            const items = list.map(p => ({ id: p.id, password: p.password }));

            const results = await hibpService.checkBatch(items, (checked, total) => {
                setProgress({ checked, total });
            });

            const pwnedProfiles = [];
            results.forEach((result, id) => {
                if (result.pwned) {
                    const profile = list.find(p => p.id === id);
                    if (profile) pwnedProfiles.push({ ...profile, breachCount: result.count });
                }
            });

            pwnedProfiles.sort((a, b) => b.breachCount - a.breachCount);
            setCompromised(pwnedProfiles);

            const score = computeHealthScoreValue(list, pwnedProfiles, dupes, weak);
            setHealthScore(score);

            return pwnedProfiles;

        } catch (error) {
            console.error('HIBP check error:', error);
            setHibpError(true);
            return [];
        } finally {
            setIsChecking(false);
        }
    }

    function toggleSection(section) {
        setExpandedSection(prev => prev === section ? null : section);
    }

    function getScoreColor(score) {
        if (score === null) return 'text-slate-400';
        if (score >= 80) return 'text-green-500';
        if (score >= 60) return 'text-yellow-500';
        if (score >= 40) return 'text-orange-500';
        return 'text-red-500';
    }

    function getScoreLabel(score) {
        if (score === null) return t('health.score.noData');
        if (score >= 90) return t('health.score.excellent');
        if (score >= 80) return t('health.score.good');
        if (score >= 60) return t('health.score.fair');
        if (score >= 40) return t('health.score.needsWork');
        return t('health.score.critical');
    }

    // Conteggi totali problemi
    const totalIssues = compromised.length
        + duplicates.reduce((s, d) => s + d.count, 0)
        + weakPasswords.length;

    if (isLoading) {
        return (
            <div className="h-full flex flex-col">
                    <div className="max-w-2xl mx-auto w-full flex flex-col flex-1 min-h-0 p-6">
                        <div className="flex items-center gap-3 mb-6">
                            <button
                                onClick={() => navigate(-1)}
                                className="p-2 text-gray-400 hover:bg-slate-700 rounded-lg transition-colors"
                            >
                                <ArrowLeft size={24} />
                            </button>
                            <h1 className="text-2xl font-bold text-white">{t('health.title')}</h1>
                        </div>
                        <div className="flex-1 flex items-center justify-center">
                            <div className="text-center">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
                                <p className="text-slate-400">{t('health.analyzing')}</p>
                            </div>
                        </div>
                    </div>
                </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
                <div className="max-w-2xl mx-auto w-full flex flex-col flex-1 min-h-0 p-6">

                    {/* Header - fisso */}
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => navigate(-1)}
                                className="p-2 text-gray-400 hover:bg-slate-700 rounded-lg transition-colors"
                            >
                                <ArrowLeft size={24} />
                            </button>
                            <div>
                                <h1 className="text-2xl font-bold text-white">{t('health.title')}</h1>
                                {lastChecked && (
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        {t('health.lastChecked', { time: formatLastChecked(lastChecked, t) })}
                                    </p>
                                )}
                            </div>
                        </div>
                        {!isChecking && profiles.length > 0 && (
                            <button
                                onClick={() => loadAndAnalyze()}
                                className="p-2 text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                                title="Re-analyze"
                            >
                                <RefreshCw size={20} />
                            </button>
                        )}
                    </div>

                    {/* Contenuto - scorrevole */}
                    <div className="flex-1 overflow-y-auto">
                        <div className="space-y-4 pb-6">

                            {/* No profiles */}
                            {profiles.length === 0 && (
                                <div className="text-center py-12">
                                    <Shield size={48} className="mx-auto text-slate-600 mb-4" />
                                    <p className="text-slate-400">{t('health.noAccounts')}</p>
                                </div>
                            )}

                            {profiles.length > 0 && (
                                <>
                                    {/* Health Score */}
                                    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 text-center">
                                        <div className="relative w-32 h-32 mx-auto mb-4">
                                            <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
                                                <circle cx="60" cy="60" r="52" fill="none" stroke="#334155" strokeWidth="8" />
                                                <circle
                                                    cx="60" cy="60" r="52" fill="none"
                                                    stroke={healthScore >= 80 ? '#22c55e' : healthScore >= 60 ? '#eab308' : healthScore >= 40 ? '#f97316' : '#ef4444'}
                                                    strokeWidth="8"
                                                    strokeLinecap="round"
                                                    strokeDasharray={`${(healthScore || 0) * 3.267} 326.7`}
                                                    className="transition-all duration-1000"
                                                />
                                            </svg>
                                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                <span className={`text-3xl font-bold ${getScoreColor(healthScore)}`}>
                                                    {healthScore !== null ? healthScore : '–'}
                                                </span>
                                                <span className="text-xs text-slate-400">/ 100</span>
                                            </div>
                                        </div>
                                        <p className={`font-semibold ${getScoreColor(healthScore)}`}>
                                            {getScoreLabel(healthScore)}
                                        </p>
                                        <p className="text-sm text-slate-400 mt-1">
                                            {t('health.accountsAnalyzed', { count: profiles.length })}
                                            {totalIssues > 0 && ` · ${t('health.issuesFound', { count: totalIssues })}`}
                                        </p>
                                    </div>

                                    {/* HIBP progress bar */}
                                    {isChecking && (
                                        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-sm text-gray-300">{t('health.checkingBreaches')}</span>
                                                <span className="text-sm font-medium text-blue-400">
                                                    {progress.checked}/{progress.total}
                                                </span>
                                            </div>
                                            <div className="w-full bg-slate-700 rounded-full h-2">
                                                <div
                                                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                                                    style={{ width: `${progress.total > 0 ? (progress.checked / progress.total) * 100 : 0}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Offline warning */}
                                    {!isOnline && (
                                        <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-xl p-4 flex items-start gap-3">
                                            <WifiOff size={20} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-sm font-medium text-yellow-300">{t('health.offline')}</p>
                                                <p className="text-sm text-yellow-400">
                                                    {t('health.offlineMessage')}
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* HIBP API error warning */}
                                    {hibpError && !isChecking && isOnline && (
                                        <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
                                            <AlertTriangle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
                                            <p className="text-sm text-red-300">
                                                {t('health.hibpCheckError')}
                                            </p>
                                        </div>
                                    )}

                                    {/* ===== COMPROMISED ===== */}
                                    <IssueSection
                                        title={t('health.compromised')}
                                        icon={<ShieldAlert size={20} />}
                                        count={compromised.length}
                                        color="red"
                                        isExpanded={expandedSection === 'compromised'}
                                        onToggle={() => toggleSection('compromised')}
                                        emptyText={isChecking ? t('health.checking') : t('health.noCompromised')}
                                    >
                                        {compromised.map(profile => (
                                            <ProfileIssueCard
                                                key={profile.id}
                                                profile={profile}
                                                navigate={navigate}
                                                badge={
                                                    <span className="text-xs bg-red-900/30 text-red-400 px-2 py-0.5 rounded-full font-medium">
                                                        {t('health.foundInBreaches', { count: profile.breachCount })}
                                                    </span>
                                                }
                                            />
                                        ))}
                                    </IssueSection>

                                    {/* ===== DUPLICATES ===== */}
                                    <IssueSection
                                        title={t('health.reused')}
                                        icon={<Copy size={20} />}
                                        count={duplicates.reduce((s, d) => s + d.count, 0)}
                                        color="orange"
                                        isExpanded={expandedSection === 'duplicates'}
                                        onToggle={() => toggleSection('duplicates')}
                                        emptyText={t('health.noReused')}
                                    >
                                        {duplicates.map((group, i) => (
                                            <div key={i} className="space-y-1">
                                                <p className="text-xs text-orange-400 font-medium px-1 pt-2">
                                                    {t('health.samePasswordOn', { count: group.count })}
                                                </p>
                                                {group.profiles.map(profile => (
                                                    <ProfileIssueCard
                                                        key={profile.id}
                                                        profile={profile}
                                                        navigate={navigate}
                                                    />
                                                ))}
                                            </div>
                                        ))}
                                    </IssueSection>

                                    {/* ===== WEAK ===== */}
                                    <IssueSection
                                        title={t('health.weak')}
                                        icon={<AlertTriangle size={20} />}
                                        count={weakPasswords.length}
                                        color="yellow"
                                        isExpanded={expandedSection === 'weak'}
                                        onToggle={() => toggleSection('weak')}
                                        emptyText={t('health.noWeak')}
                                    >
                                        {weakPasswords.map(profile => (
                                            <ProfileIssueCard
                                                key={profile.id}
                                                profile={profile}
                                                navigate={navigate}
                                                badge={
                                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${profile.strength.level === 'critical'
                                                        ? 'bg-red-900/30 text-red-400'
                                                        : 'bg-yellow-900/30 text-yellow-400'
                                                        }`}>
                                                        {t(profile.strength.labelKey)} · {profile.password.length} {t('health.chars')}
                                                    </span>
                                                }
                                            />
                                        ))}
                                    </IssueSection>

                                    {/* All clear */}
                                    {!isChecking && totalIssues === 0 && (
                                        <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-6 text-center">
                                            <ShieldCheck size={40} className="mx-auto text-green-500 mb-3" />
                                            <p className="font-semibold text-green-300">{t('health.allClear')}</p>
                                            <p className="text-sm text-green-400 mt-1">
                                                {t('health.allClearMessage')}
                                            </p>
                                        </div>
                                    )}

                                    {/* ===== CARD EXPIRY ===== */}
                                    {expiringCards.length > 0 && (
                                        <IssueSection
                                            title={t('health.cardExpiry.title')}
                                            icon={<CreditCard size={20} />}
                                            count={expiringCards.length}
                                            color={expiringCards.some(c => c.expiryInfo.status === 'expired') ? 'red' : 'orange'}
                                            isExpanded={expandedSection === 'cardExpiry'}
                                            onToggle={() => toggleSection('cardExpiry')}
                                            emptyText=""
                                        >
                                            {expiringCards.map(card => (
                                                <ProfileIssueCard
                                                    key={card.id}
                                                    profile={card}
                                                    navigate={navigate}
                                                    badge={
                                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                                            card.expiryInfo.status === 'expired'
                                                                ? 'bg-red-900/30 text-red-400'
                                                                : 'bg-orange-900/30 text-orange-400'
                                                        }`}>
                                                            {card.expiryInfo.status === 'expired'
                                                                ? t('health.cardExpiry.expired', { date: card.deadline })
                                                                : t('health.cardExpiry.expiringSoon', { days: card.expiryInfo.daysUntilExpiry, date: card.deadline })}
                                                        </span>
                                                    }
                                                />
                                            ))}
                                        </IssueSection>
                                    )}

                                    {/* Info */}
                                    <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4 flex items-start gap-3">
                                        <Shield size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
                                        <div className="text-sm text-blue-300 space-y-1">
                                            <p>{t('health.hibpInfo')}</p>
                                        </div>
                                    </div>
                                </>
                            )}

                        </div>                        

                    </div>
                </div>

            </div>
    );
}


/**
 * Sezione collassabile per un tipo di problema
 */
function IssueSection({ title, icon, count, color, isExpanded, onToggle, emptyText, children }) {
    const badgeColors = {
        red: 'bg-red-500',
        orange: 'bg-orange-500',
        yellow: 'bg-yellow-500',
        green: 'bg-green-500'
    };

    const iconColors = {
        red: 'text-red-500',
        orange: 'text-orange-500',
        yellow: 'text-yellow-500',
        green: 'text-green-500'
    };

    const badgeColor = count > 0 ? badgeColors[color] : 'bg-green-500';
    const iconColor = count > 0 ? iconColors[color] : 'text-green-500';

    return (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
            <button
                onClick={onToggle}
                className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-slate-700/50 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <span className={iconColor}>{icon}</span>
                    <span className="font-medium text-gray-200 text-sm">{title}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full text-white ${badgeColor}`}>
                        {count}
                    </span>
                    {count > 0 && (
                        isExpanded
                            ? <ChevronUp size={16} className="text-slate-400" />
                            : <ChevronDown size={16} className="text-slate-400" />
                    )}
                </div>
            </button>
            {isExpanded && count > 0 && (
                <div className="px-4 pb-4 space-y-2 border-t border-slate-700 pt-3">
                    {children}
                </div>
            )}
            {isExpanded && count === 0 && (
                <div className="px-4 pb-4 border-t border-slate-700 pt-3">
                    <p className="text-sm text-slate-400 text-center py-2">{emptyText}</p>
                </div>
            )}
        </div>
    );
}


/**
 * Card per un profilo con problema
 */
function ProfileIssueCard({ profile, navigate, badge }) {
    return (
        <button
            onClick={() => navigate(`/profile/${profile.id}`)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-700/50 transition-colors text-left"
        >
            <div className="w-9 h-9 flex items-center justify-center bg-blue-500/10 rounded-lg flex-shrink-0">
                <span className="text-blue-400 font-bold text-sm">
                    {profile.title?.[0]?.toUpperCase() || '?'}
                </span>
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-200 truncate">
                        {profile.title}
                    </span>
                </div>
                {profile.website && (
                    <p className="text-xs text-slate-400 truncate">{profile.website}</p>
                )}
                {badge && <div className="mt-1">{badge}</div>}
            </div>
            <ExternalLink size={14} className="text-slate-500 flex-shrink-0" />
        </button>
    );
}
