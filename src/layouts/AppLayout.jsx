import { Sidebar } from '../components/Sidebar';
import { useTheme } from '../contexts/ThemeContext';

export function AppLayout({ children }) {
    const { theme } = useTheme();

    const bgClass = theme === 'light'
        ? 'h-[100dvh] bg-gradient-to-br from-slate-100 via-slate-50 to-slate-100 text-slate-900 md:flex'
        : 'h-[100dvh] bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-gray-200 md:flex';

    return (
        <div className={bgClass}>
            <Sidebar />
            <main className="flex-1 md:ml-64 h-full overflow-hidden pb-16 md:pb-0">
                {children}
            </main>
        </div>
    );
}
