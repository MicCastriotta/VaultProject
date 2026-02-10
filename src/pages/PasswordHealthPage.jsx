/**
 * Password Health Page
 * Analizza tutti i profili WEB e rileva:
 * - Password compromesse (via HaveIBeenPwned k-anonymity API)
 * - Password duplicate (usate su più account)
 * - Password deboli (corte o semplici)
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
    ChevronUp
} from 'lucide-react';
import { databaseService } from '../services/databaseService';
import { cryptoService } from '../services/cryptoService';
import { hibpService } from '../services/hibpService';

/**
 * Valuta la forza di una password (semplificato)
 */
function getPasswordStrength(password) {
    if (!password) return { level: 'none', label: 'Empty' };
    if (password.length < 6) return { level: 'critical', label: 'Very Weak' };
    if (password.length < 8) return { level: 'weak', label: 'Weak' };

    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (password.length >= 16) score++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 2) return { level: 'weak', label: 'Weak' };
    if (score <= 3) return { level: 'fair', label: 'Fair' };
    if (score <= 4) return { level: 'good', label: 'Strong' };
    return { level: 'strong', label: 'Very Strong' };
}


export function PasswordHealthPage() {
    const navigate = useNavigate();

    const [isLoading, setIsLoading] = useState(true);
    const [isChecking, setIsChecking] = useState(false);
    const [progress, setProgress] = useState({ checked: 0, total: 0 });
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    // Risultati
    const [profiles, setProfiles] = useState([]);
    const [compromised, setCompromised] = useState([]);
    const [duplicates, setDuplicates] = useState([]);
    const [weakPasswords, setWeakPasswords] = useState([]);
    const [healthScore, setHealthScore] = useState(null);

    // UI
    const [expandedSection, setExpandedSection] = useState(null);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        loadAndAnalyze();

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    /**
     * Carica profili, decifra, e analizza localmente (duplicati + deboli).
     * Il check HIBP viene fatto separatamente perché richiede rete.
     */
    async function loadAndAnalyze() {
        setIsLoading(true);
        try {
            // 1. Carica e decifra profili
            const encrypted = await databaseService.getAllProfiles();
            const decrypted = (await Promise.all(
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
            )).filter(p => p !== null && p.category === 'WEB' && p.password);

            setProfiles(decrypted);

            // 2. Analisi locale: duplicati
            const passwordMap = new Map();
            decrypted.forEach(p => {
                const pwd = p.password;
                if (!passwordMap.has(pwd)) {
                    passwordMap.set(pwd, []);
                }
                passwordMap.get(pwd).push(p);
            });

            const dupes = [];
            passwordMap.forEach((profileList) => {
                if (profileList.length > 1) {
                    dupes.push({
                        profiles: profileList,
                        count: profileList.length
                    });
                }
            });
            setDuplicates(dupes);

            // 3. Analisi locale: password deboli
            const weak = decrypted.filter(p => {
                const s = getPasswordStrength(p.password);
                return s.level === 'critical' || s.level === 'weak';
            }).map(p => ({
                ...p,
                strength: getPasswordStrength(p.password)
            }));
            setWeakPasswords(weak);

            // 4. Check HIBP se online
            if (navigator.onLine) {
                await runHIBPCheck(decrypted);
            }

        } catch (error) {
            console.error('Error loading profiles for health check:', error);
        } finally {
            setIsLoading(false);
        }
    }

    /**
     * Controlla le password contro HaveIBeenPwned
     */
    async function runHIBPCheck(profilesList = null) {
        const list = profilesList || profiles;
        if (list.length === 0) return;

        setIsChecking(true);
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
                    if (profile) {
                        pwnedProfiles.push({
                            ...profile,
                            breachCount: result.count
                        });
                    }
                }
            });

            // Ordina per gravità (più esposizioni prima)
            pwnedProfiles.sort((a, b) => b.breachCount - a.breachCount);
            setCompromised(pwnedProfiles);

            // Calcola health score
            computeHealthScore(list, pwnedProfiles, duplicates, weakPasswords);

        } catch (error) {
            console.error('HIBP check error:', error);
        } finally {
            setIsChecking(false);
        }
    }

    /**
     * Calcola un punteggio di salute 0-100
     */
    function computeHealthScore(allProfiles, pwned, dupes, weak) {
        if (allProfiles.length === 0) {
            setHealthScore(null);
            return;
        }

        const total = allProfiles.length;

        // Ogni problema abbassa il punteggio
        const pwnedCount = pwned.length;
        const dupProfileCount = dupes.reduce((sum, d) => sum + d.count, 0);
        const weakCount = weak.length;

        // Pesi: compromessa = -20pt, duplicata = -10pt, debole = -8pt (per profilo)
        const penalty = (pwnedCount * 20 + dupProfileCount * 10 + weakCount * 8);
        const maxPenalty = total * 20; // Caso peggiore: tutte compromesse

        const score = Math.max(0, Math.round(100 - (penalty / maxPenalty) * 100));
        setHealthScore(score);
    }

    function toggleSection(section) {
        setExpandedSection(prev => prev === section ? null : section);
    }

    function getScoreColor(score) {
        if (score === null) return 'text-gray-400';
        if (score >= 80) return 'text-green-500';
        if (score >= 60) return 'text-yellow-500';
        if (score >= 40) return 'text-orange-500';
        return 'text-red-500';
    }

    function getScoreBg(score) {
        if (score === null) return 'bg-gray-200';
        if (score >= 80) return 'bg-green-500';
        if (score >= 60) return 'bg-yellow-500';
        if (score >= 40) return 'bg-orange-500';
        return 'bg-red-500';
    }

    function getScoreLabel(score) {
        if (score === null) return 'No data';
        if (score >= 90) return 'Excellent';
        if (score >= 80) return 'Good';
        if (score >= 60) return 'Fair';
        if (score >= 40) return 'Needs Work';
        return 'Critical';
    }

    // Conteggi totali problemi
    const totalIssues = compromised.length
        + duplicates.reduce((s, d) => s + d.count, 0)
        + weakPasswords.length;

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50">
                <div className="bg-primary text-white px-4 py-4 flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="p-2 hover:bg-primary-dark rounded-lg transition-colors">
                        <ArrowLeft size={24} />
                    </button>
                    <h1 className="text-xl font-bold">Password Health</h1>
                </div>
                <div className="flex items-center justify-center py-20">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                        <p className="text-gray-500">Analyzing passwords...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-primary text-white px-4 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="p-2 hover:bg-primary-dark rounded-lg transition-colors">
                        <ArrowLeft size={24} />
                    </button>
                    <h1 className="text-xl font-bold">Password Health</h1>
                </div>
                {!isChecking && profiles.length > 0 && isOnline && (
                    <button
                        onClick={() => runHIBPCheck()}
                        className="p-2 hover:bg-primary-dark rounded-lg transition-colors"
                        title="Re-check"
                    >
                        <RefreshCw size={20} />
                    </button>
                )}
            </div>

            <div className="p-4 space-y-4 max-w-2xl mx-auto pb-20">

                {/* No profiles */}
                {profiles.length === 0 && (
                    <div className="text-center py-12">
                        <Shield size={48} className="mx-auto text-gray-300 mb-4" />
                        <p className="text-gray-500">No web accounts with passwords to analyze.</p>
                    </div>
                )}

                {profiles.length > 0 && (
                    <>
                        {/* Health Score */}
                        <div className="bg-white rounded-lg p-6 text-center">
                            <div className="relative w-32 h-32 mx-auto mb-4">
                                {/* Circular progress */}
                                <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
                                    <circle cx="60" cy="60" r="52" fill="none" stroke="#e5e7eb" strokeWidth="8" />
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
                                        {healthScore !== null ? healthScore : '—'}
                                    </span>
                                    <span className="text-xs text-gray-400">/ 100</span>
                                </div>
                            </div>
                            <p className={`font-semibold ${getScoreColor(healthScore)}`}>
                                {getScoreLabel(healthScore)}
                            </p>
                            <p className="text-sm text-gray-500 mt-1">
                                {profiles.length} account{profiles.length !== 1 ? 's' : ''} analyzed
                                {totalIssues > 0 && ` · ${totalIssues} issue${totalIssues !== 1 ? 's' : ''} found`}
                            </p>
                        </div>

                        {/* HIBP progress bar */}
                        {isChecking && (
                            <div className="bg-white rounded-lg p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm text-gray-600">Checking breaches...</span>
                                    <span className="text-sm font-medium text-primary">
                                        {progress.checked}/{progress.total}
                                    </span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div
                                        className="bg-primary h-2 rounded-full transition-all duration-300"
                                        style={{ width: `${progress.total > 0 ? (progress.checked / progress.total) * 100 : 0}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Offline warning */}
                        {!isOnline && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
                                <WifiOff size={20} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-medium text-yellow-800">You're offline</p>
                                    <p className="text-sm text-yellow-700">
                                        Breach check requires an internet connection. Duplicate and weak password analysis is available offline.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* ===== COMPROMISED ===== */}
                        <IssueSection
                            title="Compromised Passwords"
                            icon={<ShieldAlert size={20} />}
                            count={compromised.length}
                            color="red"
                            isExpanded={expandedSection === 'compromised'}
                            onToggle={() => toggleSection('compromised')}
                            emptyText={isChecking ? 'Checking...' : 'No compromised passwords found'}
                        >
                            {compromised.map(profile => (
                                <ProfileIssueCard
                                    key={profile.id}
                                    profile={profile}
                                    navigate={navigate}
                                    badge={
                                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                                            Found in {profile.breachCount.toLocaleString()} breach{profile.breachCount !== 1 ? 'es' : ''}
                                        </span>
                                    }
                                />
                            ))}
                        </IssueSection>

                        {/* ===== DUPLICATES ===== */}
                        <IssueSection
                            title="Reused Passwords"
                            icon={<Copy size={20} />}
                            count={duplicates.reduce((s, d) => s + d.count, 0)}
                            color="orange"
                            isExpanded={expandedSection === 'duplicates'}
                            onToggle={() => toggleSection('duplicates')}
                            emptyText="No reused passwords"
                        >
                            {duplicates.map((group, i) => (
                                <div key={i} className="space-y-1">
                                    <p className="text-xs text-orange-600 font-medium px-1 pt-2">
                                        Same password used on {group.count} accounts:
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
                            title="Weak Passwords"
                            icon={<AlertTriangle size={20} />}
                            count={weakPasswords.length}
                            color="yellow"
                            isExpanded={expandedSection === 'weak'}
                            onToggle={() => toggleSection('weak')}
                            emptyText="No weak passwords"
                        >
                            {weakPasswords.map(profile => (
                                <ProfileIssueCard
                                    key={profile.id}
                                    profile={profile}
                                    navigate={navigate}
                                    badge={
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${profile.strength.level === 'critical'
                                                ? 'bg-red-100 text-red-700'
                                                : 'bg-yellow-100 text-yellow-700'
                                            }`}>
                                            {profile.strength.label} · {profile.password.length} chars
                                        </span>
                                    }
                                />
                            ))}
                        </IssueSection>

                        {/* All clear */}
                        {!isChecking && totalIssues === 0 && (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                                <ShieldCheck size={40} className="mx-auto text-green-500 mb-3" />
                                <p className="font-semibold text-green-800">All passwords look good!</p>
                                <p className="text-sm text-green-600 mt-1">
                                    No compromised, reused, or weak passwords detected.
                                </p>
                            </div>
                        )}

                        {/* Info */}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                            <Shield size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-blue-800 space-y-1">
                                <p>
                                    Breach data is checked via <strong>HaveIBeenPwned</strong> using k-anonymity.
                                    Your passwords are never sent over the network — only the first 5 characters
                                    of the SHA-1 hash are transmitted.
                                </p>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}


/**
 * Sezione collassabile per un tipo di problema
 */
function IssueSection({ title, icon, count, color, isExpanded, onToggle, emptyText, children }) {
    const colorClasses = {
        red: {
            bg: 'bg-red-50',
            border: 'border-red-200',
            badge: 'bg-red-500',
            text: 'text-red-700',
            icon: 'text-red-500'
        },
        orange: {
            bg: 'bg-orange-50',
            border: 'border-orange-200',
            badge: 'bg-orange-500',
            text: 'text-orange-700',
            icon: 'text-orange-500'
        },
        yellow: {
            bg: 'bg-yellow-50',
            border: 'border-yellow-200',
            badge: 'bg-yellow-500',
            text: 'text-yellow-700',
            icon: 'text-yellow-500'
        },
        green: {
            bg: 'bg-green-50',
            border: 'border-green-200',
            badge: 'bg-green-500',
            text: 'text-green-700',
            icon: 'text-green-500'
        }
    };

    const c = count > 0 ? colorClasses[color] : colorClasses.green;

    return (
        <div className="bg-white rounded-lg overflow-hidden shadow-sm">
            <button
                onClick={onToggle}
                className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <span className={count > 0 ? c.icon : 'text-green-500'}>
                        {icon}
                    </span>
                    <span className="font-medium text-gray-800 text-sm">{title}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full text-white ${count > 0 ? c.badge : 'bg-green-500'}`}>
                        {count}
                    </span>
                    {count > 0 && (
                        isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />
                    )}
                </div>
            </button>
            {isExpanded && count > 0 && (
                <div className="px-4 pb-4 space-y-2 border-t border-gray-100 pt-3">
                    {children}
                </div>
            )}
            {isExpanded && count === 0 && (
                <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                    <p className="text-sm text-gray-500 text-center py-2">{emptyText}</p>
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
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-left"
        >
            <div className="w-9 h-9 flex items-center justify-center bg-primary/10 rounded-lg flex-shrink-0">
                <span className="text-primary font-bold text-sm">
                    {profile.title?.[0]?.toUpperCase() || '?'}
                </span>
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800 truncate">
                        {profile.title}
                    </span>
                </div>
                {profile.website && (
                    <p className="text-xs text-gray-400 truncate">{profile.website}</p>
                )}
                {badge && <div className="mt-1">{badge}</div>}
            </div>
            <ExternalLink size={14} className="text-gray-300 flex-shrink-0" />
        </button>
    );
}