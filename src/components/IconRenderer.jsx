/**
 * IconRenderer Component
 * Renderizza un'icona brand da uno slug salvato
 * Con fallback e colore brand automatico
 *
 * Le icone vengono caricate in modo lazy (dynamic import di simple-icons)
 * per evitare di appesantire il bundle principale.
 */

import { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { getIconBySlug, FALLBACK_ICONS } from '../icons/brandIcons';

// Sanifica il contenuto interno dell'SVG da simple-icons.
// Preserva tutti i tag grafici SVG validi ma rimuove script ed event handler.
const SVG_ALLOWED_TAGS = [
    'animate', 'animateTransform', 'circle', 'clipPath', 'defs',
    'desc', 'ellipse', 'feBlend', 'feColorMatrix', 'feComponentTransfer',
    'feComposite', 'feConvolveMatrix', 'feDiffuseLighting', 'feDisplacementMap',
    'feDistantLight', 'feFlood', 'feFuncA', 'feFuncB', 'feFuncG', 'feFuncR',
    'feGaussianBlur', 'feImage', 'feMerge', 'feMergeNode', 'feMorphology',
    'feOffset', 'fePointLight', 'feSpecularLighting', 'feSpotLight',
    'feTile', 'feTurbulence', 'filter', 'g', 'image', 'line', 'linearGradient',
    'marker', 'mask', 'metadata', 'path', 'pattern', 'polygon', 'polyline',
    'radialGradient', 'rect', 'stop', 'symbol', 'text', 'textPath',
    'tspan', 'use', 'view',
];

export function sanitizeSvgInner(svgInner) {
    // Avvolge in un <svg> fittizio, sanifica, poi restituisce solo il contenuto interno
    const wrapped = `<svg xmlns="http://www.w3.org/2000/svg">${svgInner}</svg>`;
    const clean = DOMPurify.sanitize(wrapped, {
        USE_PROFILES: { svg: true, svgFilters: true },
        ALLOWED_TAGS: SVG_ALLOWED_TAGS,
        FORBID_TAGS: ['script', 'style', 'foreignObject'],
        FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
    });
    // Estrai solo il contenuto interno del tag <svg> pulito
    const match = clean.match(/^<svg[^>]*>([\s\S]*)<\/svg>$/i);
    return match ? match[1] : '';
}

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
            dangerouslySetInnerHTML={{ __html: sanitizeSvgInner(displayIcon.svg) }}
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
