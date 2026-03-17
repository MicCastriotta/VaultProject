/**
 * IconPicker Component
 * Ricerca e selezione di icone brand da Simple Icons
 *
 * Features:
 * - Ricerca live mentre digiti
 * - Preview SVG in tempo reale
 * - Grid responsive
 * - Fallback icons
 * - Privacy-first (offline, no tracking)
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { getBrandIcons, FALLBACK_ICONS } from '../icons/brandIcons';
import { sanitizeSvgInner } from './IconRenderer';
import './IconPicker.css';

export function IconPicker({
    onSelect,
    onClose,
    selectedSlug = null,
}) {
    const [query, setQuery] = useState('');
    const [showFallbacks, setShowFallbacks] = useState(false);
    const [allIcons, setAllIcons] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // Carica il catalogo icone in modo lazy (dynamic import)
    useEffect(() => {
        getBrandIcons().then(icons => {
            setAllIcons(icons);
            setIsLoading(false);
        });
    }, []);

    // Ricerca live con debounce implicito (useMemo)
    const searchResults = useMemo(() => {
        if (!query.trim()) {
            return allIcons.slice(0, 10);
        }

        const q = query.toLowerCase();
        return allIcons
            .filter(icon =>
                icon.name.toLowerCase().includes(q) ||
                icon.slug.includes(q)
            )
            .slice(0, 10);
    }, [query, allIcons]);

    const handleSelect = useCallback((icon) => {
        onSelect(icon);
        onClose?.();
    }, [onSelect, onClose]);

    return (
        <div className="icon-picker">
            {/* Header */}
            <div className="icon-picker__header">
                <div className="icon-picker__search">
                    <Search size={18} className="icon-picker__search-icon" />
                    <input
                        type="text"
                        placeholder="Cerca servizio (Spotify, Netflix, Instagram...)"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        autoFocus
                        className="icon-picker__input"
                    />
                    {query && (
                        <button
                            onClick={() => setQuery('')}
                            className="icon-picker__clear"
                            aria-label="Cancella ricerca"
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>

                {onClose && (
                    <button
                        onClick={onClose}
                        className="icon-picker__close"
                        aria-label="Chiudi"
                    >
                        <X size={20} />
                    </button>
                )}
            </div>

            {/* Results Grid */}
            <div className="icon-picker__grid">
                {isLoading ? (
                    <div className="icon-picker__no-results">Caricamento icone...</div>
                ) : searchResults.length > 0 ? (
                    searchResults.map(icon => (
                        <button
                            key={icon.slug}
                            onClick={() => handleSelect(icon)}
                            className={`icon-picker__result-btn ${selectedSlug === icon.slug ? 'icon-picker__result-btn--selected' : ''
                                }`}
                            title={icon.name}
                        >
                            <svg
                                viewBox="0 0 24 24"
                                dangerouslySetInnerHTML={{ __html: sanitizeSvgInner(icon.svg) }}
                                className="icon-picker__result-svg"
                            />
                            <span className="icon-picker__result-name">{icon.name}</span>
                        </button>
                    ))
                ) : (
                    <div className="icon-picker__no-results">
                        Nessun risultato per "{query}"
                    </div>
                )}
            </div>

            {/* Fallback Icons */}
            {!query && (
                <div className="icon-picker__fallback-section">
                    <button type="button"
                        onClick={() => setShowFallbacks(!showFallbacks)}
                        className="icon-picker__fallback-toggle"
                    >
                        {showFallbacks ? '▼' : '▶'} Icone generiche
                    </button>

                    {showFallbacks && (
                        <div className="icon-picker__fallback-grid">
                            {Object.values(FALLBACK_ICONS).map(icon => (
                                <button
                                    key={icon.slug}
                                    onClick={() => handleSelect(icon)}
                                    className={`icon-picker__result-btn ${selectedSlug === icon.slug ? 'icon-picker__result-btn--selected' : ''
                                        }`}
                                    title={icon.name}
                                >
                                    <svg
                                        viewBox="0 0 24 24"
                                        dangerouslySetInnerHTML={{ __html: sanitizeSvgInner(icon.svg) }}
                                        className="icon-picker__result-svg"
                                    />
                                    <span className="icon-picker__result-name">{icon.name}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
