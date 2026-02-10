/**
 * Main App Component
 * Gestisce routing e protezione route
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { IntegrityWarningBanner } from './components/IntegrityWarningBanner';
import { BiometricSetupDialog } from './components/BiometricSetupDialog';
import { SignUpPage } from './pages/SignUpPage';
import { LoginPage } from './pages/LoginPage';
import { MainPage } from './pages/MainPage';
import { ProfileFormPage } from './pages/ProfileFormPage';
import { ProfileDetailPage } from './pages/ProfileDetailPage';
import { SettingsPage } from './pages/SettingsPage';
import { PasswordGeneratorPage } from './pages/PasswordGeneratorPage';

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
                    <p className="text-gray-600">Loading SafeProfiles...</p>
                </div>
            </div>
        );
    }

    // Se non esiste utente -> SignUp
    if (!userExists) {
        return (
            <Routes>
                <Route path="*" element={<SignUpPage />} />
            </Routes>
        );
    }

    // Se esiste utente ma non è unlocked -> Login
    if (!isUnlocked) {
        return (
            <Routes>
                <Route path="*" element={<LoginPage />} />
            </Routes>
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

            <Routes>
                <Route path="/" element={<MainPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/generator" element={<PasswordGeneratorPage />} />
                <Route path="/profile/new" element={<ProfileFormPage />} />
                <Route path="/profile/:id" element={<ProfileDetailPage />} />
                <Route path="/profile/:id/edit" element={<ProfileFormPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
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