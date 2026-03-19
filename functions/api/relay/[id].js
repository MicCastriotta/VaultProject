/**
 * GET /api/relay/:id
 * Recupera un payload cifrato OwnVault dal KV store.
 * Il link rimane valido per tutta la durata del TTL (48h) per compatibilità
 * con iOS, dove l'utente potrebbe aprire il link in contesti diversi
 * (browser in-app, Safari, PWA) in sequenza prima di importare con successo.
 */

import { checkRateLimit, rateLimitedResponse } from '../_rl.js';

const ALLOWED_ORIGINS = [
    'https://ownvault.eu',
    'http://localhost:3000',  // Vite dev server
    'http://localhost:8788'   // wrangler pages dev
];

function corsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
}

export async function onRequestOptions({ request }) {
    const origin = request.headers.get('Origin') || '';
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function onRequestDelete({ params, env, request }) {
    const origin = request.headers.get('Origin') || '';
    const headers = { 'Content-Type': 'application/json', ...corsHeaders(origin) };

    const ip = request.headers.get('CF-Connecting-IP') || '';
    if (!await checkRateLimit(env.OV_RELAY, ip, 'relay:delete', 60)) {
        return rateLimitedResponse(headers);
    }

    const { id } = params;

    if (!id || !/^[0-9a-f]{32}$/.test(id)) {
        return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400, headers });
    }

    // Legge il payload per: a) verificare writeToken se presente, b) pulire inbox marker
    const value = await env.OV_RELAY.get(`relay:${id}`);
    if (!value) {
        // Entry già assente — risponde OK (idempotente)
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }

    let parsed;
    try { parsed = JSON.parse(value); } catch { parsed = {}; }

    // Se il payload include _wth (write token hash), richiede verifica.
    // Payload senza _wth (vecchio formato) non richiedono token → backward compat.
    if (parsed._wth) {
        let writeToken;
        try {
            const body = await request.json();
            writeToken = body?.writeToken;
        } catch {
            // body assente o non JSON
        }

        if (!writeToken || typeof writeToken !== 'string' || !/^[0-9a-f]{32}$/.test(writeToken)) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
        }

        // Verifica: SHA-256(hex→bytes(writeToken)) == _wth
        const wtBytes = new Uint8Array(writeToken.match(/.{2}/g).map(b => parseInt(b, 16)));
        const hashBuf = await crypto.subtle.digest('SHA-256', wtBytes);
        const computed = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

        if (computed !== parsed._wth) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 403, headers });
        }
    }

    // Pulizia inbox marker
    if (parsed.recipientFp && /^[0-9a-f]{16}$/.test(parsed.recipientFp)) {
        await env.OV_RELAY.delete(`inbox:${parsed.recipientFp}:${id}`);
    }

    await env.OV_RELAY.delete(`relay:${id}`);

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

export async function onRequestGet({ params, env, request }) {
    const origin = request.headers.get('Origin') || '';
    const headers = { 'Content-Type': 'application/json', ...corsHeaders(origin) };

    const ip = request.headers.get('CF-Connecting-IP') || '';
    if (!await checkRateLimit(env.OV_RELAY, ip, 'relay:get', 60)) {
        return rateLimitedResponse(headers);
    }

    const { id } = params;

    // Valida formato ID (32 hex chars = 128 bit)
    if (!id || !/^[0-9a-f]{32}$/.test(id)) {
        return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400, headers });
    }

    const value = await env.OV_RELAY.get(`relay:${id}`);
    if (!value) {
        return new Response(JSON.stringify({ error: 'Not found or expired' }), { status: 404, headers });
    }

    return new Response(value, {
        status: 200,
        headers: {
            ...corsHeaders(origin),
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache'
        }
    });
}
