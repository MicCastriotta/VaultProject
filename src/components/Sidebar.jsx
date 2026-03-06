import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { Shield, Key, Activity, Settings, LogOut } from 'lucide-react';

export function Sidebar() {
    const navigate = useNavigate();
    const location = useLocation();
    const { logout } = useAuth();
    const { t } = useTranslation();

    const navItems = [
        { label: t('nav.vault'), icon: Shield, path: '/' },
        { label: t('nav.generator'), icon: Key, path: '/generator' },
        { label: t('nav.health'), icon: Activity, path: '/health' },
        { label: t('nav.settings'), icon: Settings, path: '/settings' }
    ];

    function handleLogout() {
        logout();
    }

    return (
        <>
            {/* DESKTOP SIDEBAR */}
            <aside className="hidden md:flex fixed top-0 left-0 h-screen w-64 bg-slate-900/70 backdrop-blur-xl border-r border-slate-800 p-6 flex-col">


                <div
                    onClick={() => navigate('/')}
                    className="text-2xl font-bold mb-10 text-white tracking-wide cursor-pointer"
                >
                    🔐 OwnVault
                </div>

                <nav className="space-y-2">
                    {navItems.map(item => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.path;

                        return (
                            <button
                                key={item.path}
                                onClick={() => navigate(item.path)}
                                className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-all
                  ${isActive
                                        ? 'bg-blue-500/20 text-blue-400'
                                        : 'hover:bg-blue-500/10 text-gray-300'
                                    }`}
                            >
                                <Icon size={18} />
                                {item.label}
                            </button>
                        );
                    })}
                </nav>

                <div className="mt-auto pt-10">
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-all"
                    >
                        <LogOut size={18} />
                        {t('auth.logout')}
                    </button>
                </div>
            </aside>

            {/* MOBILE BOTTOM NAV */}
            <nav
                className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900/80 backdrop-blur-xl border-t border-slate-800 flex justify-around z-50"
                style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
                {navItems.map(item => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path;

                    return (
                        <button
                            key={item.path}
                            onClick={() => navigate(item.path)}
                            className={`flex flex-col items-center gap-1 flex-1 py-3 px-2 text-xs transition-all active:opacity-60 ${
                                isActive ? 'text-blue-400' : 'text-gray-400'
                            }`}
                        >
                            <Icon size={24} />
                            <span>{item.label}</span>
                        </button>
                    );
                })}
            </nav>
        </>
    );
}
