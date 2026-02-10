/**
 * Main Page - Lista Profili
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { databaseService } from '../services/databaseService';
import { cryptoService } from '../services/cryptoService';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Search, Menu, User, CreditCard } from 'lucide-react';

export function MainPage() {
    const navigate = useNavigate();
    const { logout } = useAuth();
    const [profiles, setProfiles] = useState([]);
    const [decryptedProfiles, setDecryptedProfiles] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [showMenu, setShowMenu] = useState(false);

    useEffect(() => {
        loadProfiles();
    }, []);

    async function loadProfiles() {
        setIsLoading(true);
        try {
            // 1. Carica profili cifrati
            const encrypted = await databaseService.getAllProfiles();

            // 2. Decifra tutti
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
                    } catch (err) {
                        console.error('Decryption error for profile', p.id, err);
                        return null;
                    }
                })
            );

            setDecryptedProfiles(decrypted.filter(p => p !== null));
        } catch (error) {
            console.error('Error loading profiles:', error);
        } finally {
            setIsLoading(false);
        }
    }

    // Filtra profili
    const filteredProfiles = decryptedProfiles.filter(p => {
        if (!searchTerm) return true;
        const search = searchTerm.toLowerCase();
        return (
            p.title?.toLowerCase().includes(search) ||
            p.website?.toLowerCase().includes(search) ||
            p.note?.toLowerCase().includes(search)
        );
    });

    // Raggruppa per iniziale
    const groupedProfiles = filteredProfiles.reduce((acc, profile) => {
        const firstLetter = profile.title?.[0]?.toUpperCase() || '#';
        if (!acc[firstLetter]) {
            acc[firstLetter] = [];
        }
        acc[firstLetter].push(profile);
        return acc;
    }, {});

    const sortedGroups = Object.keys(groupedProfiles).sort();

    function handleLogout() {
        logout();
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-primary text-white">
                <div className="px-4 py-6">
                    <div className="flex items-center justify-between mb-4">
                        <h1 className="text-2xl font-bold">Profiles</h1>
                        <button
                            onClick={() => setShowMenu(!showMenu)}
                            className="p-2 hover:bg-primary-dark rounded-lg transition-colors"
                        >
                            <Menu size={24} />
                        </button>
                    </div>

                    {/* Search Bar */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/70" size={20} />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Title\Web Site\Comments"
                            className="w-full pl-10 pr-4 py-2 bg-primary-dark/50 text-white placeholder-white/70 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/30"
                        />
                    </div>
                </div>
            </div>

            {/* Side Menu */}
            {showMenu && (
                <>
                    <div
                        className="fixed inset-0 bg-black/50 z-40"
                        onClick={() => setShowMenu(false)}
                    />
                    <div className="fixed top-0 left-0 bottom-0 w-64 bg-white z-50 shadow-xl">
                        <div className="p-4 bg-primary text-white">
                            <h2 className="text-xl font-bold">SafeProfiles</h2>
                        </div>
                        <div className="p-4">
                            <button
                                onClick={() => {
                                    setShowMenu(false);
                                    navigate('/generator');
                                }}
                                className="w-full text-left px-4 py-3 hover:bg-gray-100 rounded-lg"
                            >
                                Password Generator
                            </button>
                            <button
                                onClick={() => {
                                    setShowMenu(false);
                                    navigate('/settings');
                                }}
                                className="w-full text-left px-4 py-3 hover:bg-gray-100 rounded-lg"
                            >
                                Settings
                            </button>
                            <button
                                onClick={handleLogout}
                                className="w-full text-left px-4 py-3 hover:bg-gray-100 rounded-lg text-red-600"
                            >
                                Logout
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* Content */}
            <div className="pb-20">
                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                    </div>
                ) : filteredProfiles.length === 0 ? (
                    <div className="text-center py-12 px-4">
                        <p className="text-gray-500">
                            {searchTerm ? 'No profiles found' : 'No profiles yet. Create your first one!'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4 p-4">
                        {sortedGroups.map(letter => (
                            <div key={letter}>
                                <h3 className="text-sm font-semibold text-gray-500 mb-2 px-2">
                                    {letter}
                                </h3>
                                <div className="space-y-2">
                                    {groupedProfiles[letter].map(profile => (
                                        <button
                                            key={profile.id}
                                            onClick={() => navigate(`/profile/${profile.id}`)}
                                            className="w-full bg-white rounded-lg shadow-sm p-4 hover:shadow-md transition-shadow text-left"
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="w-12 h-12 flex items-center justify-center bg-primary/10 rounded-lg">
                                                    {profile.category === 'CARD' ? (
                                                        <CreditCard className="text-primary" size={24} />
                                                    ) : (
                                                        <User className="text-primary" size={24} />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-medium text-primary truncate">
                                                        {profile.title}
                                                    </h4>
                                                    {profile.note && (
                                                        <p className="text-sm text-gray-600 truncate mt-1">
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

            {/* FAB - Create Button */}
            <button
                onClick={() => navigate('/profile/new')}
                className="fixed bottom-6 right-6 bg-white hover:bg-gray-50 text-primary rounded-full p-4 shadow-lg hover:shadow-xl transition-shadow"
            >
                <Plus size={32} />
            </button>
        </div>
    );
}