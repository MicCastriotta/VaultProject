/**
 * Main App Component
 * Gestisce routing e protezione route
 */

import { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { IntegrityWarningBanner } from './components/IntegrityWarningBanner';
import { SyncConflictDialog } from './components/SyncConflictDialog';
import { AppLayout } from './layouts/AppLayout';
import { InstallPrompt } from './components/InstallPrompt';
import { syncService } from './services/syncService';

/* global __APP_VERSION__ */

function UpdateBanner() {
    const { t } = useTranslation();
    const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
        onRegisteredSW(_swUrl, r) {
            r.update(); // check immediato
            // iOS Safari non fa polling automatico: forziamo un check ogni ora
            setInterval(() => r.update(), 60 * 60 * 1000);
        }
    });

    if (!needRefresh) return null;

    return (
        <div className="fixed top-0 left-0 right-0 z-[9999] bg-blue-600 text-white px-4 py-3 flex items-center justify-between gap-4 shadow-lg">
            <span className="text-sm">{t('pwa.updateAvailable')}</span>
            <button
                onClick={() => updateServiceWorker(true)}
                className="bg-white text-blue-600 text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors flex-shrink-0"
            >
                {t('pwa.update')}
            </button>
        </div>
    );
}

// Pagine caricate al volo (lazy) per ridurre il bundle iniziale
const PrivacyPage = lazy(() => import('./pages/PrivacyPage').then(m => ({ default: m.PrivacyPage })));
const TutorialPage = lazy(() => import('./pages/TutorialPage').then(m => ({ default: m.TutorialPage })));
const SignUpPage = lazy(() => import('./pages/SignUpPage').then(m => ({ default: m.SignUpPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const MainPage = lazy(() => import('./pages/MainPage').then(m => ({ default: m.MainPage })));
const ProfileFormPage = lazy(() => import('./pages/ProfileFormPage').then(m => ({ default: m.ProfileFormPage })));
const ProfileDetailPage = lazy(() => import('./pages/ProfileDetailPage').then(m => ({ default: m.ProfileDetailPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const PasswordGeneratorPage = lazy(() => import('./pages/PasswordGeneratorPage').then(m => ({ default: m.PasswordGeneratorPage })));
const PasswordHealthPage = lazy(() => import('./pages/PasswordHealthPage').then(m => ({ default: m.PasswordHealthPage })));
const ImportPage = lazy(() => import('./pages/ImportPage'));
const ContactsPage = lazy(() => import('./pages/ContactsPage').then(m => ({ default: m.ContactsPage })));

// Spinner piccolo per transizioni interne (non sostituisce tutto lo schermo)
const PageSpinner = () => (
    <div className="flex-1 flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
    </div>
);

const PageLoader = () => (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
    </div>
);

/**
 * Gestione globale sync: check all'avvio, dialog conflitto, toast notifiche.
 */
function SyncLaunchCheck() {
    const { t } = useTranslation();
    const [syncConflict, setSyncConflict] = useState(null);
    const [syncToast, setSyncToast] = useState(null);
    const [isSyncing, setIsSyncing] = useState(false);

    useEffect(() => {
        const handleSyncEvent = (event, data) => {
            if (event === 'conflict') {
                setSyncConflict(data);
            } else if (event === 'syncing') {
                setIsSyncing(true);
            } else if (event === 'synced') {
                setIsSyncing(false);
                setSyncToast({ type: 'success', text: t('settings.sync.syncedDirection', { direction: data.direction }) });
            } else if (event === 'error') {
                setIsSyncing(false);
                setSyncToast({ type: 'error', text: t('settings.sync.syncErrorMsg', { error: data.error }) });
            } else if (event === 'reauth_needed') {
                setIsSyncing(false);
                setSyncToast({ type: 'error', text: t('settings.sync.reauthNeeded') });
            }
        };

        syncService.addListener(handleSyncEvent);
        syncService.checkSyncOnLaunch().catch(console.error);

        return () => syncService.removeListener(handleSyncEvent);
    }, []);

    useEffect(() => {
        if (!syncToast) return;
        const timer = setTimeout(() => setSyncToast(null), 3500);
        return () => clearTimeout(timer);
    }, [syncToast]);

    function handleConflictResolution(useCloud) {
        if (syncConflict?.resolve) {
            syncConflict.resolve(useCloud);
            setSyncConflict(null);
        }
    }

    return (
        <>
            {syncConflict && (
                <SyncConflictDialog
                    cloudData={syncConflict.cloudData}
                    localData={syncConflict.localData}
                    onResolve={handleConflictResolution}
                />
            )}
            {/* Spinner durante sync — si trasforma nel toast al completamento */}
            {(isSyncing || syncToast) && (
                <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[9998] px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-medium whitespace-nowrap transition-colors
                    ${syncToast
                        ? syncToast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                        : 'bg-slate-700 text-white'
                    }`}>
                    {syncToast ? (
                        syncToast.type === 'success'
                            ? <CheckCircle size={16} />
                            : <AlertTriangle size={16} />
                    ) : (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                    )}
                    {syncToast ? syncToast.text : t('settings.sync.status.syncing')}
                </div>
            )}
        </>
    );
}


/**
 * Dopo il login, recupera un payload relay pendente (salvato in sessionStorage
 * prima del login quando l'utente ha aperto un link /receive/:id da non autenticato).
 */
function PendingRelayHandler() {
    const navigate = useNavigate();

    useEffect(() => {
        const id = sessionStorage.getItem('ov_pending_relay_id');
        if (!id) return;
        sessionStorage.removeItem('ov_pending_relay_id');

        import('./services/contactsService').then(({ contactsService }) => {
            contactsService.fetchFromRelay(id)
                .then(text => {
                    if (text) sessionStorage.setItem('ov_pending_for_contacts', text);
                    navigate('/contacts');
                })
                .catch(() => navigate('/contacts'));
        });
    }, []);

    return null;
}

/**
 * Pagina intermedia per link /receive/:id quando il vault è già sbloccato.
 * Fetcha il payload dal relay e reindirizza a /contacts per la preview modale.
 */
function ReceivePage() {
    const { id } = useParams();
    const navigate = useNavigate();

    useEffect(() => {
        import('./services/contactsService').then(({ contactsService }) => {
            contactsService.fetchFromRelay(id)
                .then(text => {
                    if (text) sessionStorage.setItem('ov_pending_for_contacts', text);
                })
                .catch(() => {})
                .finally(() => navigate('/contacts', { replace: true }));
        });
    }, [id]);

    return (
        <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
    );
}

/**
 * Shell statico per le route autenticate.
 * AppLayout (sidebar + sfondo) rimane montato durante le navigazioni;
 * solo il contenuto interno sospende.
 */
function AppShell() {
    return (
        <AppLayout>
            <SyncLaunchCheck />
            <PendingRelayHandler />
            <Suspense fallback={<PageSpinner />}>
                <Outlet />
            </Suspense>
        </AppLayout>
    );
}

function AppRoutes() {
    const {
        isUnlocked,
        isLoading,
        userExists,
    } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const wasUnlocked = useRef(false);

    // Quando il vault si blocca (auto-lock o logout), torna alla root
    useEffect(() => {
        if (wasUnlocked.current && !isUnlocked) {
            navigate('/', { replace: true });
        }
        wasUnlocked.current = isUnlocked;
    }, [isUnlocked]);

    // Hook chiamato prima di qualsiasi return anticipato (Rules of Hooks)
    const [tutorialDone, setTutorialDone] = useState(
        () => localStorage.getItem('tutorialCompleted') === 'true'
    );

    function completeTutorial() {
        localStorage.setItem('tutorialCompleted', 'true');
        setTutorialDone(true);
    }

    if (location.pathname === '/privacy') {
        return (
            <Suspense fallback={<PageLoader />}>
                <PrivacyPage />
            </Suspense>
        );
    }

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading OwnVault...</p>
                </div>
            </div>
        );
    }

    // Se non esiste utente -> Tutorial (prima volta) poi SignUp
    if (!userExists) {
        if (!tutorialDone) {
            return (
                <Suspense fallback={<PageLoader />}>
                    <TutorialPage onDone={completeTutorial} />
                </Suspense>
            );
        }
        return (
            <Suspense fallback={<PageLoader />}>
                <Routes>
                    <Route path="*" element={<SignUpPage />} />
                </Routes>
            </Suspense>
        );
    }

    // Se esiste utente ma non è unlocked -> Login
    // Salva relay ID pendente se l'utente arriva da un link /receive/:id
    if (!isUnlocked) {
        const relayMatch = location.pathname.match(/^\/receive\/([0-9a-f]{32})$/);
        if (relayMatch) sessionStorage.setItem('ov_pending_relay_id', relayMatch[1]);

        return (
            <Suspense fallback={<PageLoader />}>
                <Routes>
                    <Route path="*" element={<LoginPage />} />
                </Routes>
            </Suspense>
        );
    }

    // Utente unlocked -> shell statico + pagine lazy
    return (
        <>
            <IntegrityWarningBanner />
            <Routes>
                <Route element={
                    <AppShell />
                }>
                    <Route path="/" element={<MainPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/import" element={<ImportPage />} />
                    <Route path="/generator" element={<PasswordGeneratorPage />} />
                    <Route path="/health" element={<PasswordHealthPage />} />
                    <Route path="/profile/new" element={<ProfileFormPage />} />
                    <Route path="/profile/:id" element={<ProfileDetailPage />} />
                    <Route path="/profile/:id/edit" element={<ProfileFormPage />} />
                    <Route path="/contacts" element={<ContactsPage />} />
                    <Route path="/receive/:id" element={<ReceivePage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
            </Routes>
        </>
    );
}

/**
 * Splash screen in-app per Android (e qualsiasi piattaforma che non supporti
 * apple-touch-startup-image). Mostrata una sola volta per sessione.
 */
function SplashScreen({ onDone }) {
    const [fading, setFading] = useState(false);

    useEffect(() => {
        const fadeTimer = setTimeout(() => setFading(true), 1500);
        const doneTimer = setTimeout(onDone, 2000); // 1.5s visibile + 0.5s fade
        return () => { clearTimeout(fadeTimer); clearTimeout(doneTimer); };
    }, [onDone]);

    return (
        <div
            className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950"
            style={{ transition: 'opacity 0.5s ease', opacity: fading ? 0 : 1 }}
        >
            <img
                src="/icons/portrait.png"
                alt="OwnVault"
                className="max-w-full max-h-full object-contain"
            />
        </div>
    );
}

export function App() {
    const [showSplash, setShowSplash] = useState(
        () => !sessionStorage.getItem('ov_splash_shown')
    );

    function handleSplashDone() {
        sessionStorage.setItem('ov_splash_shown', '1');
        setShowSplash(false);
    }

    return (
        <ThemeProvider>
            <AuthProvider>
                <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                    {showSplash && <SplashScreen onDone={handleSplashDone} />}
                    <UpdateBanner />
                    <InstallPrompt />
                    <AppRoutes />
                </BrowserRouter>
            </AuthProvider>
        </ThemeProvider>
    );
}
