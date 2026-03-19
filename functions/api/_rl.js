/**
 * Rate limiter leggero basato su KV (fixed window counter per IP).
 *
 * KV ha consistenza eventuale → in caso di burst simultaneo potrebbe
 * lasciar passare qualche richiesta in più. Per questo use-case
 * (protezione da abuso, non da attaccanti sofisticati) è sufficiente.
 *
 * Chiavi KV: rl:{action}:{ip}  →  contatore intero
 * TTL = durata della finestra → la chiave scade da sola a fine finestra.
 */

const WINDOW_SECONDS = 60 * 60; // finestra di 1 ora

/**
 * Verifica il rate limit per un'azione e un IP.
 *
 * @param {KVNamespace} kv      - namespace KV da usare (OV_RELAY o OV_IDENTITY)
 * @param {string}      ip      - IP del client (header CF-Connecting-IP)
 * @param {string}      action  - identificatore azione (es. 'relay:post')
 * @param {number}      limit   - max richieste per finestra (1h)
 * @returns {Promise<boolean>}  - true = consentito, false = rate limited
 */
export async function checkRateLimit(kv, ip, action, limit) {
    // In assenza di IP (test locale / dev) lasciamo passare
    if (!ip) return true;

    const key = `rl:${action}:${ip}`;

    const raw = await kv.get(key);
    const count = raw ? parseInt(raw, 10) + 1 : 1;

    if (count > limit) return false;

    // Aggiorna il contatore. expirationTtl resetta il TTL ad ogni richiesta
    // nella stessa finestra — comportamento fixed-window approssimato.
    await kv.put(key, String(count), { expirationTtl: WINDOW_SECONDS });
    return true;
}

/**
 * Risposta standard 429 con header Retry-After.
 */
export function rateLimitedResponse(headers) {
    return new Response(
        JSON.stringify({ error: 'Too many requests' }),
        {
            status: 429,
            headers: { ...headers, 'Retry-After': String(WINDOW_SECONDS) }
        }
    );
}
