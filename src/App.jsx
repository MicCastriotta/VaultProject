/**
 * Main App Component
 * Gestisce routing e protezione route
 */

import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { IntegrityWarningBanner } from './components/IntegrityWarningBanner';
import { BiometricSetupDialog } from './components/BiometricSetupDialog';

// Pagine caricate al volo (lazy) per ridurre il bundle iniziale
const SignUpPage = lazy(() => import('./pages/SignUpPage').then(m => ({ default: m.SignUpPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const MainPage = lazy(() => import('./pages/MainPage').then(m => ({ default: m.MainPage })));
const ProfileFormPage = lazy(() => import('./pages/ProfileFormPage').then(m => ({ default: m.ProfileFormPage })));
const ProfileDetailPage = lazy(() => import('./pages/ProfileDetailPage').then(m => ({ default: m.ProfileDetailPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const PasswordGeneratorPage = lazy(() => import('./pages/PasswordGeneratorPage').then(m => ({ default: m.PasswordGeneratorPage })));
const PasswordHealthPage = lazy(() => import('./pages/PasswordHealthPage').then(m => ({ default: m.PasswordHealthPage })));
const ImportPage = lazy(() => import('./pages/ImportPage'));

const PageLoader = () => (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
    </div>
);

function AppRoutes() {
    const {
        isUnlocked,
        isLoading,
        userExists,
        showBiometricSetup,
        enableBiometric,
        skipBiometricSetup
    } = useAuth();

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

    // Se non esiste utente -> SignUp
    if (!userExists) {
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

    // Utente unlocked -> App normale
    return (
        <>
            <IntegrityWarningBanner />

            {/* Biometric Setup Dialog */}
            {showBiometricSetup && (
                <BiometricSetupDialog
                    onEnable={enableBiometric}
                    onSkip={skipBiometricSetup}
                />
            )}

            <Suspense fallback={<PageLoader />}>
                <Routes>
                    <Route path="/" element={<MainPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/import" element={<ImportPage />} />
                    <Route path="/generator" element={<PasswordGeneratorPage />} />
                    <Route path="/health" element={<PasswordHealthPage />} />
                    <Route path="/profile/new" element={<ProfileFormPage />} />
                    <Route path="/profile/:id" element={<ProfileDetailPage />} />
                    <Route path="/profile/:id/edit" element={<ProfileFormPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </Suspense>
        </>
    );
}

export function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <AppRoutes />
            </BrowserRouter>
        </AuthProvider>
    );
}
