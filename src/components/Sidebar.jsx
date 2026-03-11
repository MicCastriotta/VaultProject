import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { Shield, Key, Activity, Settings, LogOut, HardDrive } from 'lucide-react';

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function useStorageEstimate() {
    const [storage, setStorage] = useState(null);

    useEffect(() => {
        async function estimate() {
            if (!navigator.storage?.estimate) return;
            try {
                const { usage, quota } = await navigator.storage.estimate();
                setStorage({
                    used: usage ?? 0,
                    quota: quota ?? 0,
                    percentage: quota ? Math.round(((usage ?? 0) / quota) * 100) : 0,
                });
            } catch {
                // API non supportata
            }
        }
        estimate();
    }, []);

    return storage;
}

function StorageWidget({ storage, t }) {
    if (!storage) return null;
    const { used, quota, percentage } = storage;
    const barColor =
        percentage > 80 ? 'bg-red-500' : percentage > 50 ? 'bg-yellow-400' : 'bg-blue-500';

    return (
        <div className="px-4 py-3 rounded-xl border border-slate-700/50 bg-slate-800/40 mb-3">
            <div className="flex items-center gap-2 mb-2">
                <HardDrive size={13} className="text-gray-400 shrink-0" />
                <span className="text-xs text-gray-400 font-medium">{t('storage.title')}</span>
                <span className="ml-auto text-xs font-semibold text-gray-400">{percentage}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden mb-2">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                />
            </div>
            <div className="flex justify-between text-xs text-gray-500">
                <span>{t('storage.used')}: {formatBytes(used)}</span>
                <span>{t('storage.total')}: {formatBytes(quota)}</span>
            </div>
        </div>
    );
}


export function Sidebar() {
    const navigate = useNavigate();
    const location = useLocation();
    const { logout } = useAuth();
    const { t } = useTranslation();
    const storage = useStorageEstimate();

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
                    className="flex items-center gap-3 mb-10 cursor-pointer"
                >
                    <img src="/icons/appicon.png" alt="OwnVault" className="w-9 h-9 object-contain" />
                    <span className="text-2xl font-bold text-white tracking-wide">OwnVault</span>
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
                    <StorageWidget storage={storage} t={t} />
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
