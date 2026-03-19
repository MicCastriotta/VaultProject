/**
 * GET /api/relay/:id
 * Recupera un payload cifrato OwnVault dal KV store.
 * Il link rimane valido per tutta la durata del TTL (48h) per compatibilità
 * con iOS, dove l'utente potrebbe aprire il link in contesti diversi
 * (browser in-app, Safari, PWA) in sequenza prima di importare con successo.
 */

const ALLOWED_ORIGINS = [
    'https://ownvault.eu',
    'http://localhost:3000',  // Vite dev server
    'http://localhost:8788'   // wrangler pages dev
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
