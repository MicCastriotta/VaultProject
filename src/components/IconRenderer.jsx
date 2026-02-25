/**
 * IconRenderer Component
 * Renderizza un'icona brand da uno slug salvato
 * Con fallback e colore brand automatico
 */

import { getIconBySlug, FALLBACK_ICONS } from '../icons/brandIcons';

/**
 * Renderizza l'icona da uno slug
 * @param {string} slug - Icon slug (e.g., 'spotify')
 * @param {number} size - Dimensione in pixel (default 24)
 * @param {string} className - CSS classes aggiuntive
 * @returns {JSX} SVG element o fallback
 */
export function IconRenderer({
    slug,
    size = 24,
    className = '',
    fallback = 'generic',
    useHex = false
}) {
      
    let icon = getIconBySlug(slug);
    
    if (!icon && slug && FALLBACK_ICONS[slug]) {
        icon = FALLBACK_ICONS[slug];
    }

    if (!icon) {
        icon = FALLBACK_ICONS[fallback] || FALLBACK_ICONS.generic;
    }

    return (
        <svg
            viewBox="0 0 24 24"
            dangerouslySetInnerHTML={{ __html: icon.svg }}
            className={className}
            style={{
                width: size,
                height: size,
                fill: useHex && icon.hex ? `#${icon.hex}` : 'currentColor'
            }}
            aria-label={icon.name}
        />
    );
}

/**
 * Renderizza il colore brand
 * @param {string} slug - Icon slug
 * @returns {string} Hex color (e.g., '#1DB954')
 */
export function getIconHex(slug) {
  const icon = getIconBySlug(slug);
  return icon ? `#${icon.hex}` : '#6b7280'; // Gray as fallback
}

/**
 * Renderizza il nome dell'icona
 * @param {string} slug - Icon slug
 * @returns {string} Icon name
 */
export function getIconName(slug) {
  const icon = getIconBySlug(slug);
  return icon?.name || 'Unknown';
}
