/**
 * POST /api/identity
 * Registra il fingerprint + chiave pubblica nella directory globale.
 * Il server è zero-knowledge: salva solo { pk, deleteTokenHash }, nessun dato personale.
 *
 * TTL: 6 mesi (auto-rinnovato dall'app ad ogni sblocco se discoverability attiva).
 *
 * Binding KV richiesto: OV_IDENTITY
 * (Pages > Settings > Functions > KV namespace bindings)
 */

import { checkRateLimit, rateLimitedResponse } from '../_rl.js';

const IDENTITY_TTL_SECONDS = 180 * 24 * 60 * 60; // 6 mesi

const ALLOWED_ORIGINS = [
    'https://ownvault.eu',
    'http://localhost:3000',
    'http://localhost:8788'
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
    if (!await checkRateLimit(env.OV_IDENTITY, ip, 'identity:post', 5)) {
        return rateLimitedResponse(headers);
    }

    let parsed;
    try {
        parsed = await request.json();
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers });
    }

    const { fingerprint, pk, deleteTokenHash } = parsed;

    // Valida formato fingerprint: 16 hex lowercase (senza colons)
    if (!fingerprint || !/^[0-9a-f]{16}$/.test(fingerprint)) {
        return new Response(JSON.stringify({ error: 'Invalid fingerprint format' }), { status: 400, headers });
    }

    // Valida presenza pk e deleteTokenHash
    if (!pk || typeof pk !== 'string' || pk.length < 10) {
        return new Response(JSON.stringify({ error: 'Invalid pk' }), { status: 400, headers });
    }
    if (!deleteTokenHash || typeof deleteTokenHash !== 'string') {
        return new Response(JSON.stringify({ error: 'Missing deleteTokenHash' }), { status: 400, headers });
    }

    // Verifica coerenza: SHA256(pk)[:8 byte] == fingerprint
    // Il client ha già validato, ma verifichiamo lato server per integrità
    const pkBytes = base64urlToBytes(pk);
    if (!pkBytes) {
        return new Response(JSON.stringify({ error: 'Invalid pk encoding' }), { status: 400, headers });
    }
    const hashBuffer = await crypto.subtle.digest('SHA-256', pkBytes);
    const hashHex = Array.from(new Uint8Array(hashBuffer))
        .slice(0, 8)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

    if (hashHex !== fingerprint) {
        return new Response(JSON.stringify({ error: 'Fingerprint does not match pk' }), { status: 400, headers });
    }

    // Salva in KV — il GET espone solo { pk }, mai deleteTokenHash
    const value = JSON.stringify({ pk, deleteTokenHash });
    await env.OV_IDENTITY.put(`identity:${fingerprint}`, value, { expirationTtl: IDENTITY_TTL_SECONDS });

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

function base64urlToBytes(str) {
    try {
        const padded = str.replace(/-/g, '+').replace(/_/g, '/');
        const pad = (4 - (padded.length % 4)) % 4;
        const binary = atob(padded + '='.repeat(pad));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    } catch {
        return null;
    }
}
