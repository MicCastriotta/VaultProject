/**
 * GET  /api/identity/:fingerprint  — lookup chiave pubblica per fingerprint
 * DELETE /api/identity/:fingerprint — rimuove la registrazione (richiede deleteToken)
 *
 * Zero-knowledge: GET restituisce solo { pk }, mai deleteTokenHash.
 * DELETE è autenticato tramite deleteToken derivato dalla chiave privata del vault.
 */

import { checkRateLimit, rateLimitedResponse } from '../_rl.js';

const ALLOWED_ORIGINS = [
    'https://ownvault.eu',
    'http://localhost:3000',
    'http://localhost:8788'
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

export async function onRequestGet({ params, env, request }) {
    const origin = request.headers.get('Origin') || '';
    const headers = { 'Content-Type': 'application/json', ...corsHeaders(origin) };

    const ip = request.headers.get('CF-Connecting-IP') || '';
    if (!await checkRateLimit(env.OV_IDENTITY, ip, 'identity:get', 60)) {
        return rateLimitedResponse(headers);
    }

    const { fingerprint } = params;

    if (!fingerprint || !/^[0-9a-f]{16}$/.test(fingerprint)) {
        return new Response(JSON.stringify({ error: 'Invalid fingerprint' }), { status: 400, headers });
    }

    const raw = await env.OV_IDENTITY.get(`identity:${fingerprint}`);
    if (!raw) {
        return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers });
    }

    const { pk } = JSON.parse(raw);

    return new Response(JSON.stringify({ pk }), {
        status: 200,
        headers: { ...headers, 'Cache-Control': 'no-store' }
    });
}

export async function onRequestDelete({ params, env, request }) {
    const origin = request.headers.get('Origin') || '';
    const headers = { 'Content-Type': 'application/json', ...corsHeaders(origin) };

    const { fingerprint } = params;

    if (!fingerprint || !/^[0-9a-f]{16}$/.test(fingerprint)) {
        return new Response(JSON.stringify({ error: 'Invalid fingerprint' }), { status: 400, headers });
    }

    let deleteToken;
    try {
        const body = await request.json();
        deleteToken = body.deleteToken;
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers });
    }

    if (!deleteToken || typeof deleteToken !== 'string') {
        return new Response(JSON.stringify({ error: 'Missing deleteToken' }), { status: 400, headers });
    }

    const raw = await env.OV_IDENTITY.get(`identity:${fingerprint}`);
    if (!raw) {
        // Entry già assente — risponde OK (idempotente)
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }

    const { deleteTokenHash } = JSON.parse(raw);

    // Verifica: SHA256(deleteToken) == deleteTokenHash
    const tokenBytes = base64urlToBytes(deleteToken);
    if (!tokenBytes) {
        return new Response(JSON.stringify({ error: 'Invalid deleteToken encoding' }), { status: 400, headers });
    }

    const hashBuffer = await crypto.subtle.digest('SHA-256', tokenBytes);
    const computedHash = bytesToBase64url(new Uint8Array(hashBuffer));

    if (computedHash !== deleteTokenHash) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 403, headers });
    }

    await env.OV_IDENTITY.delete(`identity:${fingerprint}`);

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

function bytesToBase64url(bytes) {
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
