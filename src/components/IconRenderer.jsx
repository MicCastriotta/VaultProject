/**
 * IconRenderer Component
 * Renderizza un'icona brand da uno slug salvato
 * Con fallback e colore brand automatico
 *
 * Le icone vengono caricate in modo lazy (dynamic import di simple-icons)
 * per evitare di appesantire il bundle principale.
 */

import { useState, useEffect } from 'react';
import { getIconBySlug, FALLBACK_ICONS } from '../icons/brandIcons';

/**
 * Renderizza l'icona da uno slug
 * @param {string} slug - Icon slug (e.g., 'spotify')
 * @param {number} size - Dimensione in pixel (default 24)
 * @param {string} className - CSS classes aggiuntive
 * @param {string} fallback - Slug fallback icon
 * @param {boolean} useHex - Usa il colore brand come fill
 */
export function IconRenderer({
    slug,
    size = 24,
    className = '',
    fallback = 'generic',
    useHex = false
}) {
    const [icon, setIcon] = useState(null);

    useEffect(() => {
        if (!slug) {
            setIcon(null);
            return;
        }

        getIconBySlug(slug).then(found => {
            setIcon(found || FALLBACK_ICONS[slug] || null);
        });
    }, [slug]);

    const displayIcon = icon || FALLBACK_ICONS[fallback] || FALLBACK_ICONS.generic;

    return (
        <svg
            viewBox="0 0 24 24"
            dangerouslySetInnerHTML={{ __html: displayIcon.svg }}
            className={className}
            style={{
                width: size,
                height: size,
                fill: useHex && displayIcon.hex ? `#${displayIcon.hex}` : 'currentColor'
            }}
            aria-label={displayIcon.name}
        />
    );
}

/**
 * Recupera il colore hex di un'icona brand (async)
 * @param {string} slug - Icon slug
 * @returns {Promise<string>} Hex color (e.g., '#1DB954')
 */
export async function getIconHex(slug) {
    const icon = await getIconBySlug(slug);
    return icon ? `#${icon.hex}` : '#6b7280';
}

/**
 * Recupera il nome di un'icona brand (async)
 * @param {string} slug - Icon slug
 * @returns {Promise<string>} Icon name
 */
export async function getIconName(slug) {
    const icon = await getIconBySlug(slug);
    return icon?.name || 'Unknown';
}
