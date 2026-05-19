/**
 * CSV Import Service
 *
 * Parser CSV nativo (no dipendenze esterne) e builder profilo per l'import
 * da file CSV creato manualmente dall'utente. Gestisce due categorie:
 *  - WEB:  title, username, password, website, note
 *  - CARD: title, numberCard, owner, deadline, cvv, pin, note
 *
 * Header atteso (prima riga, ordine libero, case-insensitive):
 *   category, title, username, password, website, note,
 *   numbercard, owner, deadline, cvv, pin
 */

import { validators } from './securityUtils';

const SUPPORTED_HEADERS = [
    'category', 'title', 'username', 'password', 'website', 'note',
    'numbercard', 'owner', 'deadline', 'cvv', 'pin'
];

const REQUIRED_HEADER = 'title';

/**
 * Parser CSV minimale ma robusto su quoting standard RFC4180:
 *  - "" come escape di " dentro a un campo quotato
 *  - virgole e newline ammessi dentro a un campo quotato
 *  - CRLF o LF come fine riga
 *  - righe completamente vuote ignorate
 *
 * @param {string} text
 * @returns {string[][]} array di righe (ogni riga = array di celle stringa)
 */
export function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let i = 0;
    let inQuotes = false;

    while (i < text.length) {
        const ch = text[i];

        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    cell += '"';
                    i += 2;
                    continue;
                }
                inQuotes = false;
                i++;
                continue;
            }
            cell += ch;
            i++;
            continue;
        }

        if (ch === '"') {
            inQuotes = true;
            i++;
            continue;
        }
        if (ch === ',') {
            row.push(cell);
            cell = '';
            i++;
            continue;
        }
        if (ch === '\r') {
            // Gestisce CRLF: skippa anche \n successivo
            if (text[i + 1] === '\n') i++;
            row.push(cell);
            if (!isEmptyRow(row)) rows.push(row);
            row = [];
            cell = '';
            i++;
            continue;
        }
        if (ch === '\n') {
            row.push(cell);
            if (!isEmptyRow(row)) rows.push(row);
            row = [];
            cell = '';
            i++;
            continue;
        }
        cell += ch;
        i++;
    }

    // Ultima cella / ultima riga (file senza newline finale)
    if (cell.length > 0 || row.length > 0) {
        row.push(cell);
        if (!isEmptyRow(row)) rows.push(row);
    }

    return rows;
}

function isEmptyRow(row) {
    return row.length === 0 || (row.length === 1 && row[0].trim() === '');
}

/**
 * Estrae header normalizzato (lowercase + trim) e ritorna { headers, indexMap }.
 * Lancia se manca la colonna "title" o se l'header è completamente vuoto.
 */
function buildHeaderMap(headerRow) {
    if (!headerRow || headerRow.length === 0) {
        throw new Error('EMPTY_HEADER');
    }

    const headers = headerRow.map(h => (h || '').trim().toLowerCase());
    const indexMap = {};

    for (let i = 0; i < headers.length; i++) {
        const h = headers[i];
        if (h && SUPPORTED_HEADERS.includes(h)) {
            indexMap[h] = i;
        }
    }

    if (indexMap[REQUIRED_HEADER] === undefined) {
        throw new Error('MISSING_TITLE_COLUMN');
    }

    return { headers, indexMap };
}

function getCell(row, indexMap, key) {
    const idx = indexMap[key];
    if (idx === undefined) return '';
    const v = row[idx];
    return v === undefined || v === null ? '' : String(v);
}

/**
 * Trasforma il testo CSV in un array di profili validi pronti per la cifratura,
 * più un report sugli errori per riga (titolo mancante / categoria sconosciuta).
 *
 * I valori sono già passati dai validators di securityUtils, quindi sono sicuri
 * da incapsulare in cryptoService.encryptData lato pagina.
 *
 * @param {string} csvText
 * @returns {{ profiles: object[], errors: {row:number, reason:string}[], total:number }}
 */
export function buildProfilesFromCsv(csvText) {
    const rows = parseCsv(csvText);
    if (rows.length === 0) {
        return { profiles: [], errors: [], total: 0 };
    }

    const { indexMap } = buildHeaderMap(rows[0]);

    const profiles = [];
    const errors = [];

    for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const rawTitle = getCell(row, indexMap, 'title').trim();
        if (!rawTitle) {
            errors.push({ row: r + 1, reason: 'MISSING_TITLE' });
            continue;
        }

        const rawCategory = getCell(row, indexMap, 'category').trim().toUpperCase();
        let category;
        if (rawCategory === '' || rawCategory === 'WEB') category = 'WEB';
        else if (rawCategory === 'CARD') category = 'CARD';
        else {
            errors.push({ row: r + 1, reason: 'INVALID_CATEGORY' });
            continue;
        }

        const lastModified = new Date().toISOString();
        const profile = {
            title: validators.title(rawTitle),
            category,
            lastModified,
            note: validators.notes(getCell(row, indexMap, 'note')),
            customFields: []
        };

        if (category === 'WEB') {
            profile.username = validators.username(getCell(row, indexMap, 'username'));
            profile.password = getCell(row, indexMap, 'password'); // non sanitizzato: è un secret
            profile.website  = validators.url(getCell(row, indexMap, 'website'));
            profile.secretKey = '';
            profile.icon = null;
            profile.passwordHistory = [];
            profile.lastPasswordChange = null;
        } else {
            profile.numberCard = validators.cardNumber(getCell(row, indexMap, 'numbercard'));
            profile.owner      = validators.text(getCell(row, indexMap, 'owner'), 100);
            profile.deadline   = validators.text(getCell(row, indexMap, 'deadline'), 5);
            profile.cvv        = validators.cvv(getCell(row, indexMap, 'cvv'));
            profile.pin        = validators.text(getCell(row, indexMap, 'pin'), 6);
        }

        profiles.push(profile);
    }

    return { profiles, errors, total: rows.length - 1 };
}

// Prefisso BOM UTF-8 per far interpretare correttamente le accentate ad Excel.
const UTF8_BOM = '﻿';

/**
 * Genera il template CSV da scaricare (header + 2 righe d'esempio: WEB e CARD).
 */
export function generateCsvTemplate() {
    const lines = [
        'category,title,username,password,website,note,numberCard,owner,deadline,cvv,pin',
        'WEB,GitHub,octocat,SuperSecret123!,https://github.com,"work account",,,,,',
        'CARD,Visa Family,,,,"monthly subscriptions",4111 1111 1111 1111,Mario Rossi,12/28,123,1234'
    ];
    return UTF8_BOM + lines.join('\n') + '\n';
}
