/**
 * Brand Icons Catalog
 * Pre-indicizzazione locale di Simple Icons
 * - Niente fetch / CDN
 * - Offline friendly
 * - Zero tracking
 * - Privacy-first
 *
 * Il modulo simple-icons viene caricato in modo lazy (dynamic import)
 * per evitare di includerlo nel bundle principale (~4MB risparmiati).
 */

let _cache = null;
let _promise = null;

function _load() {
  if (_cache) return Promise.resolve(_cache);
  if (_promise) return _promise;

  _promise = import('simple-icons').then(module => {
    _cache = Object.values(module)
      .filter(icon => icon.slug && icon.svg)
      .map(icon => ({
        name: icon.title,
        slug: icon.slug,
        hex: icon.hex,
        svg: icon.svg
      }));
    return _cache;
  });

  return _promise;
}

export async function getBrandIcons() {
  return _load();
}

export async function getIconBySlug(slug) {
  if (!slug) return null;
  const icons = await _load();
  return icons.find(i => i.slug === slug) || null;
}

export async function suggestIconFromTitle(title) {
  if (!title) return null;

  try {
    const cleanName = title.toLowerCase().split('.')[0].trim();
    if (!cleanName) return null;

    const icons = await _load();

    const exactMatch = icons.find(i => i.slug === cleanName);
    if (exactMatch) return exactMatch;

    return icons.find(i =>
      i.name.toLowerCase().includes(cleanName) ||
      i.slug.includes(cleanName)
    ) || null;
  } catch (err) {
    console.error('Error suggesting icon:', err);
    return null;
  }
}

export async function searchIcons(query, limit = 30) {
  const icons = await _load();

  if (!query || query.trim().length === 0) {
    return icons.slice(0, limit);
  }

  const q = query.toLowerCase();
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
