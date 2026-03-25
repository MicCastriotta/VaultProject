/**
 * POST /api/gtoken
 * Scambia un authorization code OAuth2 con access + refresh token,
 * oppure usa un refresh token per ottenere un nuovo access token.
 *
 * Il client secret Google non viene mai esposto nel bundle frontend:
 * risiede esclusivamente come env var server-side su Cloudflare Pages.
 *
 * Env vars richieste nel dashboard Cloudflare Pages > Settings > Env:
 *   VITE_GOOGLE_CLIENT_ID     — stesso usato dal frontend
 *   GOOGLE_CLIENT_SECRET      — segreto, NON con prefisso VITE_
 *
 * Body (JSON):
 *   { code, redirect_uri }          → scambia code → { access_token, refresh_token, expires_in }
 *   { refresh_token }               → rinnova     → { access_token, expires_in }
 */

import { checkRateLimit, rateLimitedResponse } from '../_rl.js';

const ALLOWED_ORIGINS = [
    'https://ownvault.eu',
    'http://localhost:3000',
    'http://localhost:8788'
];

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

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

    // Rate limiting: 20 scambi token per IP per ora (throttle, non blocco rigido)
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const kv = env.OV_RELAY; // riuso il namespace esistente per il rate limiter
    if (kv) {
        const allowed = await checkRateLimit(kv, ip, 'gtoken', 20);
        if (!allowed) return rateLimitedResponse(headers);
    }

    const clientId     = env.VITE_GOOGLE_CLIENT_ID;
    const clientSecret = env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        return new Response(
            JSON.stringify({ error: 'server_misconfigured' }),
            { status: 500, headers }
        );
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400, headers });
    }

    // ── Scambio authorization code ──────────────────────────────────────────
    if (body.code && body.redirect_uri) {
        const params = new URLSearchParams({
            code:          body.code,
            client_id:     clientId,
            client_secret: clientSecret,
            redirect_uri:  body.redirect_uri,
            grant_type:    'authorization_code',
        });

        const resp = await fetch(GOOGLE_TOKEN_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body:    params,
        });

        const data = await resp.json();
        if (data.error) {
            return new Response(JSON.stringify({ error: data.error }), { status: 400, headers });
        }

        return new Response(JSON.stringify({
            access_token:  data.access_token,
            refresh_token: data.refresh_token ?? null,
            expires_in:    data.expires_in ?? 3600,
        }), { status: 200, headers });
    }

    // ── Rinnovo tramite refresh token ───────────────────────────────────────
    if (body.refresh_token) {
        const params = new URLSearchParams({
            refresh_token: body.refresh_token,
            client_id:     clientId,
            client_secret: clientSecret,
            grant_type:    'refresh_token',
        });

        const resp = await fetch(GOOGLE_TOKEN_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body:    params,
        });

        const data = await resp.json();
        if (data.error) {
            // invalid_grant = refresh token revocato/scaduto → l'utente deve riconnettersi
            return new Response(
                JSON.stringify({ error: data.error }),
                { status: data.error === 'invalid_grant' ? 401 : 400, headers }
            );
        }

        return new Response(JSON.stringify({
            access_token: data.access_token,
            expires_in:   data.expires_in ?? 3600,
        }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400, headers });
}
