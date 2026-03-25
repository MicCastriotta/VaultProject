/**
 * pendingTokenService
 *
 * Tiene in memoria il Google refresh token durante la finestra di onboarding
 * in cui il vault non è ancora sbloccato (DEK non disponibile).
 *
 * Sostituisce sessionStorage per evitare l'esposizione del token plaintext
 * in storage accessibile da DevTools, estensioni browser e forensics su disco.
 *
 * Il token viene perso se la pagina viene ricaricata prima del completamento
 * del login — comportamento intenzionale (l'utente dovrà rifare il Drive auth).
 */

let _pendingToken = null;

export const pendingTokenService = {
    store(token)  { _pendingToken = token; },
    consume()     { const t = _pendingToken; _pendingToken = null; return t; },
    clear()       { _pendingToken = null; }
};
