import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { databaseService } from '../services/databaseService';
import { cryptoService } from '../services/cryptoService';
import { syncService } from '../services/syncService';
import { Plus, Search, ArrowUpDown, User, CreditCard, LogOut, HardDrive, Paperclip, UserPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { IconRenderer } from '../components/IconRenderer';
import { getIconBySlug } from '../icons/brandIcons';

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
                setStorage({ used: usage ?? 0, quota: quota ?? 0, percentage: quota ? Math.round(((usage ?? 0) / quota) * 100) : 0 });
            } catch {}
        }
        estimate();
        window.addEventListener('storageChanged', estimate);
        return () => window.removeEventListener('storageChanged', estimate);
    }, []);
    return storage;
}

function StoragePopup({ storage, storageOpen, setStorageOpen, t }) {
    const ref = useRef(null);

    useEffect(() => {
        if (!storageOpen) return;
        function handleClick(e) {
            if (ref.current && !ref.current.contains(e.target)) setStorageOpen(false);
        }
        document.addEventListener('pointerdown', handleClick);
        return () => document.removeEventListener('pointerdown', handleClick);
    }, [storageOpen, setStorageOpen]);

    const barColor = storage
        ? storage.percentage > 80 ? 'bg-red-500' : storage.percentage > 50 ? 'bg-yellow-400' : 'bg-blue-500'
        : 'bg-blue-500';

    return (
        <div ref={ref} className="relative md:hidden">
            {storageOpen && storage && (
                <div className="absolute top-full mt-2 right-0 w-52 bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-4 z-50">
                    <div className="absolute top-[-6px] right-3 w-3 h-3 bg-slate-800 border-l border-t border-slate-700 rotate-45" />
                    <div className="flex items-center gap-2 mb-2">
                        <HardDrive size={13} className="text-blue-400 shrink-0" />
                        <span className="text-xs font-semibold text-gray-200">{t('storage.title')}</span>
                        <span className="ml-auto text-xs font-bold text-gray-400">{storage.percentage}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden mb-2">
                        <div
                            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                            style={{ width: `${Math.min(storage.percentage, 100)}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-xs text-gray-400">
                        <span>{t('storage.used')}: <span className="text-gray-200 font-medium">{formatBytes(storage.used)}</span></span>
                        <span>{t('storage.total')}: <span className="text-gray-200 font-medium">{formatBytes(storage.quota)}</span></span>
                    </div>
                </div>
            )}
            <button
                onClick={() => setStorageOpen(v => !v)}
                className={`p-2 rounded-lg transition ${storageOpen ? 'text-blue-400 bg-blue-500/10' : 'text-gray-400 hover:bg-slate-800'}`}
            >
                <HardDrive size={20} />
            </button>
        </div>
    );
}

const SORT_OPTIONS = {
    ALPHA_ASC: 'alpha_asc',
    ALPHA_DESC: 'alpha_desc',
    DATE_ASC: 'date_asc',
    DATE_DESC: 'date_desc'
};

export function MainPage() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [decryptedProfiles, setDecryptedProfiles] = useState([]);
    const [attachmentProfileIds, setAttachmentProfileIds] = useState(new Set());
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

    const storage = useStorageEstimate();
    const [storageOpen, setStorageOpen] = useState(false);

    const [sortBy, setSortBy] = useState(() => {
        return localStorage.getItem('profileSortOrder') || SORT_OPTIONS.ALPHA_ASC;
    });

    useEffect(() => {
        loadProfiles();
    }, []);

    useEffect(() => {
        const handleSyncEvent = (event, data) => {
            if (event === 'synced' && data.direction === 'download') {
                loadProfiles(); // ricarica profili + attachmentProfileIds
            }
        };
        syncService.addListener(handleSyncEvent);
        return () => syncService.removeListener(handleSyncEvent);
    }, []);

    useEffect(() => {
        localStorage.setItem('profileSortOrder', sortBy);
    }, [sortBy]);

    async function loadProfiles() {
        setIsLoading(true);
        try {
            const [encrypted, attachments] = await Promise.all([
                databaseService.getAllProfiles(),
                databaseService.getAllAttachments()
            ]);

            const decrypted = await Promise.all(
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
            );

            setDecryptedProfiles(decrypted.filter(Boolean));
            setAttachmentProfileIds(new Set(attachments.map(a => a.profileId)));
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
                return new Date(a.lastModified) - new Date(b.lastModified);
            case SORT_OPTIONS.DATE_DESC:
                return new Date(b.lastModified) - new Date(a.lastModified);
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
            const date = new Date(profile.lastModified);

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
                    <h1 className="text-2xl font-semibold text-white">{t('profiles.vault')}</h1>

                    <div className="flex items-center gap-2">

                        {/* Storage - solo mobile */}
                        <StoragePopup
                            storage={storage}
                            storageOpen={storageOpen}
                            setStorageOpen={setStorageOpen}
                            t={t}
                        />

                        {/* Aggiungi amico - solo mobile */}
                        <button
                            onClick={() => navigate('/contacts')}
                            className="md:hidden p-2 hover:bg-slate-800 text-gray-400 rounded-lg transition"
                        >
                            <UserPlus size={20} />
                        </button>

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
                                {Object.entries({
                            [SORT_OPTIONS.ALPHA_ASC]: t('profiles.sort.alphaAsc'),
                            [SORT_OPTIONS.ALPHA_DESC]: t('profiles.sort.alphaDesc'),
                            [SORT_OPTIONS.DATE_ASC]: t('profiles.sort.dateAsc'),
                            [SORT_OPTIONS.DATE_DESC]: t('profiles.sort.dateDesc'),
                        }).map(([value, label]) => (
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
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder={t('profiles.searchPlaceholder')}
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
                        <p className="text-gray-400">{t('profiles.noProfiles')}</p>
                    ) : (
                                <div className="space-y-6">
                                    {sortedGroupKeys.map(group => (
                                        <div key={group}>
                                            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-[.1em] mb-1 px-1 pt-2">
                                                {group}
                                            </h3>

                                            <div className="space-y-2">
                                                {groupedProfiles[group].map(profile => (
                                                    <button
                                                        key={profile.id}
                                                        onClick={() => navigate(`/profile/${profile.id}`)}
                                                        className="w-full flex items-center gap-3 px-4 py-[14px] rounded-[14px] bg-slate-800/65 border-slate-600/50 hover:bg-slate-800 active:scale-[0.99] transition-all duration-150"
                                                    >
                                                        <div
                                                            className="w-[42px] h-[42px] flex items-center justify-center rounded-[11px] flex-shrink-0"
                                                            style={{
                                                                backgroundColor: iconColors[profile.icon]
                                                                    ? `${iconColors[profile.icon]}20`
                                                                    : 'rgba(59, 130, 246, 0.1)'
                                                            }}
                                                        >
                                                            {profile.icon && profile.category === 'WEB' ? (
                                                                <IconRenderer
                                                                    slug={profile.icon}
                                                                    size={22}
                                                                    useHex={true}
                                                                    fallback="generic"
                                                                />
                                                            ) : profile.category === 'CARD' ? (
                                                                <CreditCard size={22} />
                                                            ) : (
                                                                <User size={22} />
                                                            )}
                                                        </div>

                                                        <div className="flex-1 min-w-0 text-left">
                                                            <p className="font-semibold text-[15px] text-white">{profile.title}</p>
                                                            {(profile.note || attachmentProfileIds.has(profile.id)) && (
                                                                <p className="text-[13px] text-slate-500 truncate flex items-center gap-1.5">
                                                                    {attachmentProfileIds.has(profile.id) && (
                                                                        <Paperclip size={11} className="shrink-0 text-slate-400" />
                                                                    )}
                                                                    {profile.note || ''}
                                                                </p>
                                                            )}
                                                        </div>

                                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" className="flex-shrink-0"><polyline points="9 18 15 12 9 6"/></svg>
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
                    className="fixed right-6 bg-blue-600 text-white p-4 rounded-full shadow-lg hover:bg-blue-500 active:scale-95 transition-all z-[9999]"
                    style={{ bottom: '5.5rem' }}

                >
                    <Plus size={28} />
                </button>

            </div>
    );
}