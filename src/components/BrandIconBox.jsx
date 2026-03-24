/**
 * BrandIconBox
 * Contenitore icona brand: background = colore brand, icona = bianco.
 * Carica il colore hex in autonomia tramite getIconBySlug.
 * Fallback: sfondo blu tenue + icona currentColor.
 */

import { useState, useEffect } from 'react';
import { getIconBySlug } from '../icons/brandIcons';
import { IconRenderer } from './IconRenderer';

const FALLBACK_BG = 'rgba(59, 130, 246, 0.1)';

export function BrandIconBox({ slug, iconSize = 22, className = '' }) {
    const [hex, setHex] = useState(null);

    useEffect(() => {
        if (!slug) { setHex(null); return; }
        getIconBySlug(slug).then(icon => setHex(icon ? `#${icon.hex}` : null));
    }, [slug]);

    return (
        <div
            className={className}
            style={{ backgroundColor: hex || FALLBACK_BG }}
        >
            <IconRenderer
                slug={slug}
                size={iconSize}
                useHex={false}
                className={hex ? 'text-white' : ''}
                fallback="generic"
            />
        </div>
    );
}
