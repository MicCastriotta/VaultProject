/**
 * Brand Icons Catalog
 * Pre-indicizzazione locale di Simple Icons
 * - Niente fetch / CDN
 * - Offline friendly
 * - Zero tracking
 * - Privacy-first
 */

import * as icons from 'simple-icons';

// Build catalog cache
let _catalogCache = null;

export function getBrandIcons() {
  if (_catalogCache) return _catalogCache;

  _catalogCache = Object.values(icons)
    .filter(icon => icon.slug && icon.svg)
    .map(icon => ({
      name: icon.title,           // "Spotify"
      slug: icon.slug,            // "spotify"
      hex: icon.hex,              // "1DB954"
      svg: icon.svg               // SVG string
    }));

  return _catalogCache;
}

/**
 * Suggerisci un'icona in base al nome del servizio/URL
 * @param {string} title - Titolo del profilo o URL
 * @returns {Object|null} Icon object o null se non trovata
 */
export function suggestIconFromTitle(title) {
  if (!title) return null;

  try {
    // Converti in lowercase e estrai il dominio/nome servizio
    const cleanName = title.toLowerCase().split('.')[0].trim();
    
    if (!cleanName) return null;

    const icons = getBrandIcons();
    
    // Ricerca esatta dello slug
    let match = icons.find(i => i.slug === cleanName);
    if (match) return match;

    // Ricerca parziale nel nome
    match = icons.find(i => 
      i.name.toLowerCase().includes(cleanName) ||
      i.slug.includes(cleanName)
    );
    
    return match || null;
  } catch (err) {
    console.error('Error suggesting icon:', err);
    return null;
  }
}

/**
 * Recupera un'icona dal slug
 * @param {string} slug - Icon slug (es. "spotify")
 * @returns {Object|null} Icon object o null
 */
export function getIconBySlug(slug) {
  if (!slug) return null;

  const icons = getBrandIcons();
  return icons.find(i => i.slug === slug) || null;
}

/**
 * Ricerca icone per query
 * @param {string} query - Search query
 * @param {number} limit - Max results (default 30)
 * @returns {Array} Array di icone
 */
export function searchIcons(query, limit = 30) {
  if (!query || query.trim().length === 0) {
    return getBrandIcons().slice(0, limit);
  }

  const q = query.toLowerCase();
  const icons = getBrandIcons();

  return icons
    .filter(icon =>
      icon.name.toLowerCase().includes(q) ||
      icon.slug.includes(q)
    )
    .slice(0, limit);
}

/**
 * Fallback icons when brand not found
 * Icone generiche per profili senza brand specifico
 */
export const FALLBACK_ICONS = {
  generic: {
    name: 'Globe',
    slug: 'generic',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>'
  },
  lock: {
    name: 'Lock',
    slug: 'lock',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
  },  
  user: {
    name: 'User',
    slug: 'user',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
  }
};
