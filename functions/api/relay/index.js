/**
 * POST /api/relay
 * Carica un payload cifrato OwnVault nel KV store temporaneo.
 * Il payload è già E2E cifrato lato client (ECDH + AES-GCM),
 * quindi questo server non ha accesso al contenuto.
 *
 * Richiede il binding KV "OV_RELAY" configurato nel Cloudflare dashboard
 * (Pages > Progetto > Settings > Functions > KV namespace bindings).
 *
 * Body: JSON string con { type, v, ... } (formato .ownv)
 * Response: { id: string, expiresAt: string }
 */

import { checkRateLimit, rateLimitedResponse } from '../_rl.js';

const RELAY_TTL_SECONDS = 24 * 60 * 60; // 24 ore
const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024; // 10 MB (copre allegati fino a ~6 MB effettivi con overhead base64)

const ALLOWED_ORIGINS = [
    'https://ownvault.eu',
    'http://localhost:3000',  // Vite dev server
    'http://localhost:8788'   // wrangler pages dev
];

function corsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400'
    };
}

export async function onRequestOptions({ request }) {
    const origin = request.headers.get('Origin') || '';
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function onRequestPost({ request, env }) {
    const origin = request.headers.get('Origin') || '';
    const headers = { 'Content-Type': 'application/json', ...corsHeaders(origin) };

    const ip = request.headers.get('CF-Connecting-IP') || '';
    if (!await checkRateLimit(env.OV_RELAY, ip, 'relay:post', 30)) {
        return rateLimitedResponse(headers);
    }

    // Legge il body con limite di dimensione
    let body;
    try {
        const reader = request.body.getReader();
        const chunks = [];
        let total = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.length;
            if (total > MAX_PAYLOAD_BYTES) {
                return new Response(JSON.stringify({ error: 'Payload too large' }), { status: 413, headers });
            }
            chunks.push(value);
        }
        const merged = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
        body = new TextDecoder().decode(merged);
    } catch {
        return new Response(JSON.stringify({ error: 'Read error' }), { status: 400, headers });
    }

    // Valida struttura JSON minima (non tocca il contenuto cifrato)
    let parsed;
    try {
        parsed = JSON.parse(body);
        if (!parsed.type || !parsed.v) throw new Error('Missing type/v');
        if (parsed.type === 'invite' && !parsed.pk) throw new Error('Invalid invite');
        if (parsed.type === 'profile' && (!parsed.epk || !parsed.iv || !parsed.ct)) throw new Error('Invalid profile');
        // _wth (write token hash) è opzionale: stringa hex 64 chars (SHA-256 di un token 32-hex)
        if (parsed._wth !== undefined && (typeof parsed._wth !== 'string' || !/^[0-9a-f]{64}$/.test(parsed._wth))) {
            throw new Error('Invalid _wth');
        }
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid payload format' }), { status: 400, headers });
    }

    // ID random 128-bit → 32 caratteri hex
    const idBytes = crypto.getRandomValues(new Uint8Array(16));
    const id = Array.from(idBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    await env.OV_RELAY.put(`relay:${id}`, body, { expirationTtl: RELAY_TTL_SECONDS });

    // Se il payload contiene il fingerprint del destinatario, salva anche il marker inbox.
    // recipientFp è un dato pubblico (non cifrato) — usato solo per il lookup inbox.
    if (parsed.recipientFp && /^[0-9a-f]{16}$/.test(parsed.recipientFp)) {
        await env.OV_RELAY.put(`inbox:${parsed.recipientFp}:${id}`, id, { expirationTtl: RELAY_TTL_SECONDS });
    }

    const expiresAt = new Date(Date.now() + RELAY_TTL_SECONDS * 1000).toISOString();
    return new Response(JSON.stringify({ id, expiresAt }), { status: 201, headers });
}
