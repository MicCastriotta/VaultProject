import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { databaseService } from '../services/databaseService';
import { cryptoService } from '../services/cryptoService';
import { Plus, Search, ArrowUpDown, User, CreditCard, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { IconRenderer } from '../components/IconRenderer';
import { getIconBySlug } from '../icons/brandIcons';

const SORT_OPTIONS = {
    ALPHA_ASC: 'alpha_asc',
    ALPHA_DESC: 'alpha_desc',
    DATE_ASC: 'date_asc',
    DATE_DESC: 'date_desc'
};

const SORT_LABELS = {
    [SORT_OPTIONS.ALPHA_ASC]: 'A → Z',
    [SORT_OPTIONS.ALPHA_DESC]: 'Z → A',
    [SORT_OPTIONS.DATE_ASC]: 'Oldest First',
    [SORT_OPTIONS.DATE_DESC]: 'Newest First'
};

export function MainPage() {
    const navigate = useNavigate();
    const [decryptedProfiles, setDecryptedProfiles] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [showSortMenu, setShowSortMenu] = useState(false);
    const [iconColors, setIconColors] = useState({});
    const { logout } = useAuth();

    // Carica i colori hex brand in modo lazy, solo per gli slug presenti
    useEffect(() => {
        const slugs = [...new Set(
            decryptedProfiles.filter(p => p.icon).map(p => p.icon)
        )];
        if (slugs.length === 0) return;

        Promise.all(slugs.map(async slug => {
            const icon = await getIconBySlug(slug);
            return icon ? [slug, `#${icon.hex}`] : null;
        })).then(entries => {
            const colors = Object.fromEntries(entries.filter(Boolean));
            setIconColors(colors);
        });
    }, [decryptedProfiles]);

    const [sortBy, setSortBy] = useState(() => {
        return localStorage.getItem('profileSortOrder') || SORT_OPTIONS.ALPHA_ASC;
    });

    useEffect(() => {
        loadProfiles();
    }, []);

    useEffect(() => {
        localStorage.setItem('profileSortOrder', sortBy);
    }, [sortBy]);

    async function loadProfiles() {
        setIsLoading(true);
        try {
            const encrypted = await databaseService.getAllProfiles();

            const decrypted = await Promise.all(
                encrypted.map(async (p) => {
                    try {
                        const data = await cryptoService.decryptData({
                            iv: p.iv,
                            data: p.data
                        });

                        return {
                            id: p.id,
                            ...data,
                            updatedAt: p.updatedAt
                        };
                    } catch {
                        return null;
                    }
                })
            );

            setDecryptedProfiles(decrypted.filter(Boolean));
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    }

    const filteredProfiles = decryptedProfiles.filter(p => {
        if (!searchTerm) return true;
        const s = searchTerm.toLowerCase();
        return (
            p.title?.toLowerCase().includes(s) ||
            p.website?.toLowerCase().includes(s) ||
            p.note?.toLowerCase().includes(s)
        );
    });

    const sortedProfiles = [...filteredProfiles].sort((a, b) => {
        switch (sortBy) {
            case SORT_OPTIONS.ALPHA_ASC:
                return (a.title || '').localeCompare(b.title || '');
            case SORT_OPTIONS.ALPHA_DESC:
                return (b.title || '').localeCompare(a.title || '');
            case SORT_OPTIONS.DATE_ASC:
                return new Date(a.updatedAt) - new Date(b.updatedAt);
            case SORT_OPTIONS.DATE_DESC:
                return new Date(b.updatedAt) - new Date(a.updatedAt);
            default:
                return 0;
        }
    });

    const groupedProfiles = sortedProfiles.reduce((acc, profile) => {
        let groupKey = '';

        if (
            sortBy === SORT_OPTIONS.ALPHA_ASC ||
            sortBy === SORT_OPTIONS.ALPHA_DESC
        ) {
            groupKey = profile.title?.[0]?.toUpperCase() || '#';
        } else {
            const date = new Date(profile.updatedAt);

            // Raggruppamento per giorno (puoi cambiarlo in mese se vuoi)
            groupKey = date.toLocaleDateString();
        }

        if (!acc[groupKey]) {
            acc[groupKey] = [];
        }

        acc[groupKey].push(profile);
        return acc;
    }, {});

    const sortedGroupKeys = Object.keys(groupedProfiles).sort((a, b) => {
        if (
            sortBy === SORT_OPTIONS.ALPHA_ASC ||
            sortBy === SORT_OPTIONS.ALPHA_DESC
        ) {
            return sortBy === SORT_OPTIONS.ALPHA_ASC
                ? a.localeCompare(b)
                : b.localeCompare(a);
        } else {
            return sortBy === SORT_OPTIONS.DATE_ASC
                ? new Date(a) - new Date(b)
                : new Date(b) - new Date(a);
        }
    });

    return (
        <div className="p-6 h-full flex flex-col">

                {/* Header */}
                <div className="flex justify-between items-center mb-6 relative">
                    <h1 className="text-2xl font-semibold text-white">Your Vault</h1>

                    <div className="flex items-center gap-2">

                        {/* Logout - solo mobile */}
                        <button
                            onClick={logout}
                            className="md:hidden p-2 hover:bg-red-500/10 text-red-400 rounded-lg transition"
                        >
                            <LogOut size={20} />
                        </button>

                        {/* Sort */}
                        <button
                            onClick={() => setShowSortMenu(!showSortMenu)}
                            className="p-2 hover:bg-slate-800 rounded-lg transition"
                        >
                            <ArrowUpDown size={20} />
                        </button>

                    </div>
                </div>

                {/* Sort Dropdown */}
                {showSortMenu && (
                    <>
                        <div
                            className="fixed inset-0 z-40"
                            onClick={() => setShowSortMenu(false)}
                        />

                        <div className="absolute right-6 mt-2 bg-slate-900 border border-slate-700 rounded-xl shadow-xl z-50 w-48">
                            <div className="py-2">
                                {Object.entries(SORT_LABELS).map(([value, label]) => (
                                    <button
                                        key={value}
                                        onClick={() => {
                                            setSortBy(value);
                                            setShowSortMenu(false);
                                        }}
                                        className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-800 transition
              ${sortBy === value ? 'text-blue-400 font-semibold' : 'text-gray-300'}
            `}
                                    >
                                        {label}
                                        {sortBy === value && <span className="float-right">✓</span>}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </>
                )}

                {/* Search */}
                <div className="relative mb-6">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search..."
                        className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-800/70 border border-slate-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    {isLoading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin h-10 w-10 border-b-2 border-blue-500 rounded-full" />
                        </div>
                    ) : sortedProfiles.length === 0 ? (
                        <p className="text-gray-400">No profiles yet</p>
                    ) : (
                                <div className="space-y-6">
                                    {sortedGroupKeys.map(group => (
                                        <div key={group}>
                                            <h3 className="text-xs font-semibold text-gray-500 mb-3 px-1">
                                                {group}
                                            </h3>

                                            <div className="space-y-4">
                                                {groupedProfiles[group].map(profile => (
                                                    <button
                                                        key={profile.id}
                                                        onClick={() => navigate(`/profile/${profile.id}`)}
                                                        className="w-full flex justify-between items-center p-4 rounded-2xl bg-slate-800/60 border border-slate-700 hover:bg-slate-800 transition"
                                                    >
                                                        <div className="flex items-center gap-4">
                                                            <div 
                                                                className="w-10 h-10 flex items-center justify-center rounded-lg"
                                                                style={{
                                                                    backgroundColor: iconColors[profile.icon]
                                                                        ? `${iconColors[profile.icon]}20`
                                                                        : 'rgba(59, 130, 246, 0.1)'
                                                                }}
                                                            >
                                                                {profile.icon && profile.category === 'WEB' ? (
                                                                    <IconRenderer
                                                                        slug={profile.icon}
                                                                        size={20}
                                                                        useHex={true}
                                                                        fallback="generic"
                                                                    />
                                                                ) : profile.category === 'CARD' ? (
                                                                    <CreditCard size={20} />
                                                                ) : (
                                                                    <User size={20} />
                                                                )}
                                                            </div>

                                                            <div className="text-left">
                                                                <p className="font-semibold">{profile.title}</p>
                                                                {profile.note && (
                                                                    <p className="text-sm text-gray-400">
                                                                        {profile.note}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                    )}
                </div>


                {/* FAB */}
                <button
                    onClick={() => navigate('/profile/new')}
                    className="fixed right-6 bg-green-500 text-black p-4 rounded-full shadow-lg hover:opacity-90 transition z-[9999]"
                    style={{ bottom: '3.5rem' }}

                >
                    <Plus size={28} />
                </button>

            </div>
    );
}