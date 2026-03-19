/**
 * GET /api/relay/inbox/:fingerprint
 * Restituisce la lista degli ID payload pendenti per un dato fingerprint.
 * Usato dal destinatario per fare "pull" dei profili cifrati ricevuti.
 *
 * Il fingerprint è un identificatore pubblico (16 hex lowercase).
 * Zero-knowledge: il server non sa chi ha inviato né il contenuto.
 */

import { checkRateLimit, rateLimitedResponse } from '../../_rl.js';

const ALLOWED_ORIGINS = [
    'https://ownvault.eu',
    'http://localhost:3000',
    'http://localhost:8788'
];

function corsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
}

export async function onRequestOptions({ request }) {
    const origin = request.headers.get('Origin') || '';
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function onRequestGet({ params, env, request }) {
    const origin = request.headers.get('Origin') || '';
    const headers = { 'Content-Type': 'application/json', ...corsHeaders(origin) };

    const ip = request.headers.get('CF-Connecting-IP') || '';
    if (!await checkRateLimit(env.OV_RELAY, ip, 'relay:inbox', 30)) {
        return rateLimitedResponse(headers);
    }

    const { fingerprint } = params;

    if (!fingerprint || !/^[0-9a-f]{16}$/.test(fingerprint)) {
        return new Response(JSON.stringify({ error: 'Invalid fingerprint' }), { status: 400, headers });
    }

    // KV list con prefix "inbox:{fp}:" — ritorna tutti i marker non ancora scaduti
    const list = await env.OV_RELAY.list({ prefix: `inbox:${fingerprint}:` });
    const ids = list.keys.map(k => k.name.replace(`inbox:${fingerprint}:`, ''));

    return new Response(JSON.stringify({ ids }), {
        status: 200,
        headers: { ...headers, 'Cache-Control': 'no-store' }
    });
}
