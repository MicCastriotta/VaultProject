/**
 * Main App Component
 * Gestisce routing e protezione route
 */

import { lazy, Suspense, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { IntegrityWarningBanner } from './components/IntegrityWarningBanner';
import { BiometricSetupDialog } from './components/BiometricSetupDialog';
import { AppLayout } from './layouts/AppLayout';
import { InstallPrompt } from './components/InstallPrompt';

/* global __APP_VERSION__ */

function UpdateBanner() {
    const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();

    if (!needRefresh) return null;

    return (
        <div className="fixed top-0 left-0 right-0 z-[9999] bg-blue-600 text-white px-4 py-3 flex items-center justify-between gap-4 shadow-lg">
            <span className="text-sm">
                Nuova versione disponibile
                {typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__
                    ? ` — v${__APP_VERSION__}`
                    : ''}
            </span>
            <button
                onClick={() => updateServiceWorker(true)}
                className="bg-white text-blue-600 text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors flex-shrink-0"
            >
                Aggiorna
            </button>
        </div>
    );
}

// Pagine caricate al volo (lazy) per ridurre il bundle iniziale
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
 * Shell statico per le route autenticate.
 * AppLayout (sidebar + sfondo) rimane montato durante le navigazioni;
 * solo il contenuto interno sospende.
 */
function AppShell({ showBiometricSetup, enableBiometric, skipBiometricSetup }) {
    return (
        <AppLayout>
            {showBiometricSetup && (
                <BiometricSetupDialog
                    onEnable={enableBiometric}
                    onSkip={skipBiometricSetup}
                />
            )}
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
        showBiometricSetup,
        enableBiometric,
        skipBiometricSetup
    } = useAuth();

    const [tutorialDone, setTutorialDone] = useState(
        () => localStorage.getItem('tutorialCompleted') === 'true'
    );

    function completeTutorial() {
        localStorage.setItem('tutorialCompleted', 'true');
        setTutorialDone(true);
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
    if (!isUnlocked) {
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
                    <AppShell
                        showBiometricSetup={showBiometricSetup}
                        enableBiometric={enableBiometric}
                        skipBiometricSetup={skipBiometricSetup}
                    />
                }>
                    <Route path="/" element={<MainPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/import" element={<ImportPage />} />
                    <Route path="/generator" element={<PasswordGeneratorPage />} />
                    <Route path="/health" element={<PasswordHealthPage />} />
                    <Route path="/profile/new" element={<ProfileFormPage />} />
                    <Route path="/profile/:id" element={<ProfileDetailPage />} />
                    <Route path="/profile/:id/edit" element={<ProfileFormPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
            </Routes>
        </>
    );
}

export function App() {
    return (
        <ThemeProvider>
            <AuthProvider>
                <BrowserRouter>
                    <UpdateBanner />
                    <InstallPrompt />
                    <AppRoutes />
                </BrowserRouter>
            </AuthProvider>
        </ThemeProvider>
    );
}
