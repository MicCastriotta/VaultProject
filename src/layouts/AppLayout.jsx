import { Sidebar } from '../components/Sidebar';

export function AppLayout({ children }) {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-gray-200 md:flex">

            <Sidebar />

            <main className="flex-1 md:ml-64 h-screen overflow-hidden pb-20 md:pb-0">
                {children}
            </main>

        </div>
    );
}
