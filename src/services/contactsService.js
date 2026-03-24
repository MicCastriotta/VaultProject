/**
 * Contacts Service
 * Gestisce l'identità crittografica dell'utente (keypair ECDH P-256)
 * e la rubrica contatti locale.
 *
 * Schema identità (in db.config con id='identity'):
 *   publicKey          — base64url della chiave pubblica raw (65 byte, uncompressed)
 *   encryptedPrivateKey — JWK della chiave privata cifrato con la DEK
 *
 * Schema contatto (in db.contacts):
 *   id, name, publicKey (base64url), fingerprint (hex), createdAt
 */

import { cryptoService } from './cryptoService';
import { db, databaseService } from './databaseService';

class ContactsService {

    // ========================================
    // IDENTITÀ
    // ========================================

    /**
     * Restituisce l'identità esistente o ne genera una nuova.
     * Se l'identità esiste ma manca il keypair Ed25519 (vecchie installazioni),
     * lo genera e salva in modo trasparente (migrazione automatica).
     * Richiede vault sbloccato (usa cryptoService.encryptData).
     */
    async getOrCreateIdentity() {
        const stored = await db.config.get('identity');
        if (stored) {
            // Migrazione: aggiunge signing key Ed25519 se assente
            if (!stored.signingPublicKey) {
                return await this._addSigningKeyToIdentity(stored);
            }
            return stored;
        }

        // Crea keypair ECDH P-256 (condivisione profili)
        const ecdhKeypair = await crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-256' },
            true,
            ['deriveKey', 'deriveBits']
        );
        const publicKeyRaw = await crypto.subtle.exportKey('raw', ecdhKeypair.publicKey);
        const publicKeyB64 = this._toBase64url(publicKeyRaw);
        const privateKeyJwk = await crypto.subtle.exportKey('jwk', ecdhKeypair.privateKey);
        const encryptedPrivateKey = await cryptoService.encryptData(privateKeyJwk);

        // Crea keypair Ed25519 (firma payload) con fallback se il browser non supporta
        let signingPublicKey = null;
        let encryptedSigningKey = null;
        try {
            const sigKeypair = await crypto.subtle.generateKey(
                { name: 'Ed25519' }, true, ['sign', 'verify']
            );
            const sigPubRaw = await crypto.subtle.exportKey('raw', sigKeypair.publicKey);
            signingPublicKey = this._toBase64url(sigPubRaw);
            const sigPrivJwk = await crypto.subtle.exportKey('jwk', sigKeypair.privateKey);
            encryptedSigningKey = await cryptoService.encryptData(sigPrivJwk);
        } catch { /* Ed25519 non supportato — firma disabilitata */ }

        const identity = {
            id: 'identity',
            publicKey: publicKeyB64,
            encryptedPrivateKey,
            signingPublicKey,
            encryptedSigningKey,
            createdAt: new Date().toISOString()
        };

        await db.config.put(identity);
        return identity;
    }

    /**
     * Aggiunge il keypair Ed25519 a un'identità esistente (migrazione trasparente).
     */
    async _addSigningKeyToIdentity(identity) {
        let signingPublicKey = null;
        let encryptedSigningKey = null;
        try {
            const sigKeypair = await crypto.subtle.generateKey(
                { name: 'Ed25519' }, true, ['sign', 'verify']
            );
            const sigPubRaw = await crypto.subtle.exportKey('raw', sigKeypair.publicKey);
            signingPublicKey = this._toBase64url(sigPubRaw);
            const sigPrivJwk = await crypto.subtle.exportKey('jwk', sigKeypair.privateKey);
            encryptedSigningKey = await cryptoService.encryptData(sigPrivJwk);
        } catch { /* Ed25519 non supportato */ }

        const updated = { ...identity, signingPublicKey, encryptedSigningKey };
        await db.config.put(updated);
        return updated;
    }

    /**
     * Decifra e restituisce la chiave privata Ed25519 per la firma.
     * Ritorna null se non disponibile (browser senza supporto o identità non migrata).
     */
    async _getSigningPrivateKey() {
        const identity = await db.config.get('identity');
        if (!identity?.encryptedSigningKey) return null;
        try {
            const jwk = await cryptoService.decryptData(identity.encryptedSigningKey);
            return await crypto.subtle.importKey(
                'jwk', jwk,
                { name: 'Ed25519' },
                false,
                ['sign']
            );
        } catch {
            return null;
        }
    }

    /** Restituisce la chiave pubblica base64url dell'utente corrente. */
    async getPublicKey() {
        const identity = await this.getOrCreateIdentity();
        return identity.publicKey;
    }

    /** Importa la chiave privata per operazioni ECDH (decifratura payload ricevuti). */
    async _getPrivateKey() {
        const identity = await db.config.get('identity');
        if (!identity) throw new Error('No identity found');
        const jwk = await cryptoService.decryptData(identity.encryptedPrivateKey);
        return await crypto.subtle.importKey(
            'jwk', jwk,
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            ['deriveKey', 'deriveBits']
        );
    }

    /** Restituisce il nome display salvato nell'identity (stringa vuota se non impostato). */
    async getDisplayName() {
        const identity = await db.config.get('identity');
        return identity?.displayName || '';
    }

    /** Salva il nome display nell'identity. Crea l'identity se non esiste ancora. */
    async setDisplayName(name) {
        const identity = await this.getOrCreateIdentity();
        await db.config.put({ ...identity, displayName: name.trim() });
        await databaseService.touchLocalModification();
    }

    /**
     * Genera il link di invito da condividere.
     * Formato: <origin>/invite#pk=<base64url>&name=<encoded>
     * Il fragment non viene inviato al server.
     */
    async generateInviteLink() {
        const identity = await this.getOrCreateIdentity();
        const name = identity.displayName || '';
        const base = window.location.origin + '/invite';
        const params = `pk=${encodeURIComponent(identity.publicKey)}&name=${encodeURIComponent(name)}`;
        return `${base}#${params}`;
    }

    /**
     * Calcola il fingerprint visivo di una chiave pubblica (primi 8 byte SHA-256).
     * Formato: AA:BB:CC:DD:EE:FF:11:22
     */
    async getFingerprint(publicKeyB64) {
        const bytes = this._fromBase64url(publicKeyB64);
        const hash = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(hash).slice(0, 8))
            .map(b => b.toString(16).padStart(2, '0').toUpperCase())
            .join(':');
    }

    /**
     * Parsa il fragment hash di un invite link.
     * Ritorna { publicKey, name } oppure null se malformato.
     */
    parseInviteHash(hash) {
        const raw = hash.startsWith('#') ? hash.slice(1) : hash;
        const params = new URLSearchParams(raw);
        const pk = params.get('pk');
        const name = params.get('name');
        if (!pk) return null;
        return { publicKey: pk, name: decodeURIComponent(name || 'Unknown') };
    }

    // ========================================
    // RUBRICA CONTATTI
    // ========================================

    /** Aggiunge un contatto dalla chiave pubblica. Ignora duplicati (stesso fingerprint). */
    async addContact({ name, publicKey, signingPublicKey = null }) {
        const fingerprint = await this.getFingerprint(publicKey);

        // Impedisce di aggiungere se stessi come contatto
        const ownPk = await this.getPublicKey().catch(() => null);
        if (ownPk) {
            const ownFingerprint = await this.getFingerprint(ownPk);
            if (fingerprint === ownFingerprint) throw new Error('cannot_add_self');
        }

        const existing = await db.contacts.where('fingerprint').equals(fingerprint).first();
        if (existing) {
            // Aggiorna signingPublicKey se ora disponibile e prima era assente
            if (signingPublicKey && !existing.signingPublicKey) {
                await db.contacts.update(existing.id, { signingPublicKey });
            }
            return existing.id;
        }
        return await db.contacts.add({
            name: name || 'Unknown',
            publicKey,
            fingerprint,
            signingPublicKey,
            createdAt: new Date().toISOString()
        });
    }

    /**
     * Verifica la firma Ed25519 di un payload profilo decifrato.
     * Ritorna true se la firma è valida, false altrimenti (firma assente, chiave mancante, errore).
     * La firma copre il profileData originale, esclusi i metadati interni (_wt, _senderIdentity, _senderSig).
     */
    async verifySenderSignature(decryptedData) {
        const { _senderIdentity, _senderSig, _wt, ...profileForCommitment } = decryptedData;
        if (!_senderIdentity?.signingPk || !_senderSig) return false;

        try {
            const keyBytes = this._fromBase64url(_senderIdentity.signingPk);
            const verifyKey = await crypto.subtle.importKey(
                'raw', keyBytes,
                { name: 'Ed25519' },
                false,
                ['verify']
            );
            const commitment = new TextEncoder().encode(JSON.stringify(profileForCommitment));
            const commitmentHash = await crypto.subtle.digest('SHA-256', commitment);
            const sigBytes = this._fromBase64url(_senderSig);
            return await crypto.subtle.verify('Ed25519', verifyKey, sigBytes, commitmentHash);
        } catch {
            return false;
        }
    }

    async getAllContacts() {
        const all = await db.contacts.toArray();
        return all.sort((a, b) => a.name.localeCompare(b.name));
    }

    async deleteContact(id) {
        await db.contacts.delete(id);
    }

    async updateContactName(id, name) {
        const contact = await db.contacts.get(id);
        if (!contact) throw new Error('contact_not_found');
        await db.contacts.update(id, { name: name.trim() || 'Unknown' });
    }

    // ========================================
    // CONDIVISIONE PROFILO (ECDH + AES-GCM)
    // ========================================

    /**
     * Cifra un profilo per un destinatario.
     * Usa ECDH effimero per forward secrecy.
     * writeToken (opzionale): se fornito viene incluso nel plaintext come `_wt` —
     * solo il destinatario (con la sua private key) potrà estrarlo per autorizzare il DELETE.
     *
     * Ritorna un payload JSON serializzabile da includere in un link/file.
     */
    async encryptProfileForContact(profileData, recipientPublicKeyB64, writeToken) {
        // Importa la chiave pubblica del destinatario
        const recipientKeyBytes = this._fromBase64url(recipientPublicKeyB64);
        const recipientPublicKey = await crypto.subtle.importKey(
            'raw', recipientKeyBytes,
            { name: 'ECDH', namedCurve: 'P-256' },
            false, []
        );

        // Genera keypair effimero (usa e getta — forward secrecy)
        const ephemeral = await crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-256' },
            true,
            ['deriveKey', 'deriveBits']
        );

        // ECDH: sharedSecret tra chiave privata effimera e chiave pubblica destinatario
        const sharedBits = await crypto.subtle.deriveBits(
            { name: 'ECDH', public: recipientPublicKey },
            ephemeral.privateKey,
            256
        );

        // HKDF per derivare la wrapKey da sharedBits
        const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
        const wrapKey = await crypto.subtle.deriveKey(
            { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode('OwnVault-Share-v1') },
            hkdfKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt']
        );

        // Cifra il payload del profilo.
        // _wt: write token relay (autorizza DELETE)
        // _senderIdentity + _senderSig: identità e firma del mittente, dentro il ciphertext
        //   → relay zero-knowledge (non vede mittente né firma)
        //   → il destinatario verifica la firma e può auto-aggiungere il mittente ai contatti
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const plainData = { ...profileData };
        if (writeToken) plainData._wt = writeToken;

        try {
            const identity = await db.config.get('identity');
            if (identity?.publicKey) {
                plainData._senderIdentity = {
                    pk: identity.publicKey,
                    fp: await this.getFingerprint(identity.publicKey),
                    displayName: identity.displayName || '',
                    signingPk: identity.signingPublicKey || null
                };

                // Firma il commitment sul profileData originale (prima di aggiungere metadati interni).
                // Il destinatario rimuoverà _wt/_senderIdentity/_senderSig per ricostruire lo stesso commitment.
                if (identity.signingPublicKey) {
                    const signingKey = await this._getSigningPrivateKey();
                    if (signingKey) {
                        const commitment = new TextEncoder().encode(JSON.stringify(profileData));
                        const commitmentHash = await crypto.subtle.digest('SHA-256', commitment);
                        const sigBytes = await crypto.subtle.sign('Ed25519', signingKey, commitmentHash);
                        plainData._senderSig = this._toBase64url(sigBytes);
                    }
                }
            }
        } catch { /* non bloccante — il profilo viene inviato comunque */ }

        const plaintext = new TextEncoder().encode(JSON.stringify(plainData));
        const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrapKey, plaintext);

        // Esporta la chiave pubblica effimera per includerla nel payload
        const epkRaw = await crypto.subtle.exportKey('raw', ephemeral.publicKey);

        return {
            v: 1,
            alg: 'ECDH-P256-HKDF-AES256GCM',
            epk: this._toBase64url(epkRaw),
            iv: this._toBase64url(iv),
            ct: this._toBase64url(ciphertext)
        };
    }

    /**
     * Decifra un profilo ricevuto da un contatto.
     * Usa la chiave privata locale e la chiave pubblica effimera del mittente.
     */
    async decryptIncomingProfile(payload) {
        if (payload.v !== 1) throw new Error('Unsupported share format');

        const privateKey = await this._getPrivateKey();

        const epkBytes = this._fromBase64url(payload.epk);
        const epkPublic = await crypto.subtle.importKey(
            'raw', epkBytes,
            { name: 'ECDH', namedCurve: 'P-256' },
            false, []
        );

        const sharedBits = await crypto.subtle.deriveBits(
            { name: 'ECDH', public: epkPublic },
            privateKey,
            256
        );

        const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
        const wrapKey = await crypto.subtle.deriveKey(
            { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode('OwnVault-Share-v1') },
            hkdfKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt']
        );

        const iv = this._fromBase64url(payload.iv);
        const ct = this._fromBase64url(payload.ct);
        const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, wrapKey, ct);

        return JSON.parse(new TextDecoder().decode(plaintext));
    }

    // ========================================
    // DIRECTORY IDENTITÀ (Cloudflare KV OV_IDENTITY)
    // ========================================

    /**
     * Normalizza un fingerprint: rimuove colons, lowercase, 16 hex chars.
     * Accetta sia "AA:BB:CC:DD:EE:FF:11:22" che "aabbccddeeff1122".
     * Ritorna null se il formato non è valido.
     */
    normalizeFingerprint(fp) {
        const clean = fp.replace(/:/g, '').toLowerCase();
        return /^[0-9a-f]{16}$/.test(clean) ? clean : null;
    }

    /**
     * Deriva il deleteToken dalla chiave privata dell'identità (HMAC deterministico).
     * Funziona su qualsiasi device che ha il vault sbloccato con lo stesso backup.
     */
    async _deriveDeleteToken() {
        const identity = await db.config.get('identity');
        if (!identity) throw new Error('No identity');
        const jwk = await cryptoService.decryptData(identity.encryptedPrivateKey);
        // Usa il parametro 'd' (scalare privato base64url) come materiale HMAC
        const keyBytes = this._fromBase64url(jwk.d);
        const hmacKey = await crypto.subtle.importKey(
            'raw', keyBytes,
            { name: 'HMAC', hash: 'SHA-256' },
            false, ['sign']
        );
        const info = new TextEncoder().encode('OwnVault-directory-delete-v1');
        const sig = await crypto.subtle.sign('HMAC', hmacKey, info);
        return this._toBase64url(sig);
    }

    /**
     * Registra il fingerprint dell'utente nella directory globale (opt-in).
     * Richiede vault sbloccato. TTL 6 mesi, auto-rinnovato dall'app.
     */
    async registerIdentity() {
        const identity = await this.getOrCreateIdentity();
        const fingerprint = await this.getFingerprint(identity.publicKey);
        const fp16 = this.normalizeFingerprint(fingerprint);

        const deleteToken = await this._deriveDeleteToken();
        const deleteTokenHashBuf = await crypto.subtle.digest(
            'SHA-256',
            this._fromBase64url(deleteToken)
        );
        const deleteTokenHash = this._toBase64url(new Uint8Array(deleteTokenHashBuf));

        const response = await fetch('/api/identity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fingerprint: fp16, pk: identity.publicKey, deleteTokenHash })
        });
        if (!response.ok) throw new Error('identity_register_failed');
    }

    /**
     * Rimuove la registrazione dalla directory.
     * Richiede vault sbloccato (per derivare il deleteToken).
     */
    async unregisterIdentity() {
        const identity = await db.config.get('identity');
        if (!identity) return;
        const fingerprint = await this.getFingerprint(identity.publicKey);
        const fp16 = this.normalizeFingerprint(fingerprint);
        const deleteToken = await this._deriveDeleteToken();

        const response = await fetch(`/api/identity/${fp16}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deleteToken })
        });
        if (!response.ok && response.status !== 404) throw new Error('identity_unregister_failed');
    }

    /**
     * Controlla se l'utente è registrato nella directory.
     * Ritorna true/false senza richiedere vault sbloccato.
     */
    async isRegisteredInDirectory() {
        const identity = await db.config.get('identity');
        if (!identity) return false;
        const fingerprint = await this.getFingerprint(identity.publicKey);
        const fp16 = this.normalizeFingerprint(fingerprint);
        const response = await fetch(`/api/identity/${fp16}`);
        return response.ok;
    }

    /**
     * Cerca un contatto per fingerprint nella directory globale.
     * Verifica crittograficamente che SHA256(pk)[:8] == fingerprint.
     * Ritorna { pk, fingerprint } oppure lancia un errore.
     */
    async lookupByFingerprint(rawFingerprint) {
        const fp16 = this.normalizeFingerprint(rawFingerprint);
        if (!fp16) throw new Error('invalid_fingerprint_format');

        const response = await fetch(`/api/identity/${fp16}`);
        if (response.status === 404) throw new Error('fingerprint_not_found');
        if (!response.ok) throw new Error('directory_lookup_failed');

        const { pk } = await response.json();

        // Verifica crittografica: SHA256(pk)[:8 byte] deve corrispondere al fingerprint cercato
        const pkBytes = this._fromBase64url(pk);
        const hashBuf = await crypto.subtle.digest('SHA-256', pkBytes);
        const computedFp = Array.from(new Uint8Array(hashBuf).slice(0, 8))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        if (computedFp !== fp16) throw new Error('fingerprint_mismatch');

        // Ritorna il fingerprint nel formato display con colons
        const displayFp = Array.from(new Uint8Array(hashBuf).slice(0, 8))
            .map(b => b.toString(16).padStart(2, '0').toUpperCase())
            .join(':');

        return { pk, fingerprint: displayFp };
    }

    // ========================================
    // RELAY SERVER (Cloudflare KV OV_RELAY)
    // ========================================

    /**
     * Carica il payload del profilo cifrato per il destinatario sul relay.
     * recipientFp (opzionale): fingerprint display del destinatario — aggiunge il marker inbox
     * così il destinatario può fare pull senza ricevere il link direttamente.
     * Ritorna { url, id } — l'id serve per il delete-after-confirmation.
     *
     * Genera un writeToken casuale (128 bit) che viene:
     * - incluso nel plaintext cifrato come `_wt` (solo il destinatario può estrarlo)
     * - inviato al relay come hash `_wth` per autorizzare il DELETE
     * Questo impedisce a chiunque abbia solo l'ID relay di cancellare il payload.
     */
    async shareProfileViaRelay(profileData, recipientPublicKeyB64, recipientFp) {
        // Genera writeToken e il suo hash SHA-256
        const wtBytes = crypto.getRandomValues(new Uint8Array(16));
        const writeToken = Array.from(wtBytes).map(b => b.toString(16).padStart(2, '0')).join('');
        const wtHashBuf = await crypto.subtle.digest('SHA-256', wtBytes);
        const writeTokenHash = Array.from(new Uint8Array(wtHashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

        // Il writeToken viene incluso nel plaintext prima della cifratura ECDH
        const payload = await this.encryptProfileForContact(profileData, recipientPublicKeyB64, writeToken);
        const data = { type: 'profile', v: 1, ...payload, _wth: writeTokenHash };
        if (recipientFp) {
            const fp16 = this.normalizeFingerprint(recipientFp);
            if (fp16) data.recipientFp = fp16;
        }
        return await this._uploadToRelay(data);
    }

    /**
     * Recupera la lista degli ID payload pendenti nell'inbox del proprio fingerprint.
     * Ritorna un array di ID (stringhe hex 32 char).
     */
    async fetchInbox() {
        const identity = await db.config.get('identity');
        if (!identity) return [];
        const fingerprint = await this.getFingerprint(identity.publicKey);
        const fp16 = this.normalizeFingerprint(fingerprint);
        try {
            const response = await fetch(`/api/relay/inbox/${fp16}`);
            if (!response.ok) return [];
            const { ids } = await response.json();
            return Array.isArray(ids) ? ids : [];
        } catch {
            return [];
        }
    }

    /**
     * POST il payload al relay. Ritorna { url, id }.
     */
    async _uploadToRelay(data) {
        const response = await fetch('/api/relay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (response.status === 413) throw new Error('relay_too_large');
        if (!response.ok) throw new Error('relay_upload_failed');
        const { id } = await response.json();
        return { url: `${window.location.origin}/receive/${id}`, id };
    }

    /**
     * Recupera un payload dal relay tramite ID.
     * Ritorna il testo JSON grezzo.
     * Lancia 'relay_expired' se il link non esiste più.
     */
    async fetchFromRelay(id) {
        const response = await fetch(`/api/relay/${encodeURIComponent(id)}`);
        if (response.status === 404) throw new Error('relay_expired');
        if (!response.ok) throw new Error('relay_fetch_failed');
        return await response.text();
    }

    /**
     * Elimina un payload dal relay dopo import confermato.
     * writeToken (opzionale): se il payload aveva _wth, il server richiede il token per autorizzare.
     * Se writeToken è assente (es. payload inbox vecchio formato), la richiesta viene ignorata silenziosamente.
     * Fallisce silenziosamente in ogni caso — il TTL 24h è il fallback.
     */
    async deleteFromRelay(id, writeToken) {
        try {
            await fetch(`/api/relay/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                headers: writeToken ? { 'Content-Type': 'application/json' } : undefined,
                body: writeToken ? JSON.stringify({ writeToken }) : undefined
            });
        } catch {
            // silenzioso — TTL gestisce la scadenza
        }
    }

    /**
     * Condivide una URL via Web Share API (mobile) o copia negli appunti (desktop).
     * Ritorna 'shared' | 'copied'.
     */
    async shareUrl(url, title = 'OwnVault') {
        const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        if (isMobile && navigator.share) {
            await navigator.share({ url, title });
            return 'shared';
        }
        await navigator.clipboard.writeText(url);
        return 'copied';
    }

    
    /**
     * Parsa il contenuto testuale di un file .ownv.
     * Ritorna l'oggetto parsed oppure null se non valido.
     */
    parseOwnvFile(text) {
        try {
            const data = JSON.parse(text);
            if (!data.type || !data.v) return null;
            if (data.type === 'invite' && !data.pk) return null;
            if (data.type === 'profile' && (!data.epk || !data.iv || !data.ct)) return null;
            return data;
        } catch {
            return null;
        }
    }    

    // ========================================
    // UTILITIES
    // ========================================

    _toBase64url(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (const b of bytes) binary += String.fromCharCode(b);
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }

    _fromBase64url(str) {
        const padded = str.replace(/-/g, '+').replace(/_/g, '/');
        const pad = (4 - (padded.length % 4)) % 4;
        const binary = atob(padded + '='.repeat(pad));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }
}

export const contactsService = new ContactsService();
