# OwnVault

Password manager locale offline-first, con architettura crittografica a doppia chiave ispirata a Bitwarden/1Password. Porting PWA dell'app Xamarin SafeProfiles con sicurezza significativamente migliorata.

---

## Schema Crittografico

```
Master Password
   ↓
PBKDF2-SHA512 (600.000 iterazioni, salt 256-bit random)
   ↓
KEK — Key Encryption Key (mai salvata)
   ↓
decifra
   ↓
DEK — Data Encryption Key (random, 256-bit)
   ↓ (in RAM solo durante sessione sbloccata)
   ├─→ AES-256-GCM → profili + allegati cifrati in IndexedDB
   └─→ HKDF-SHA256 → Integrity Key → HMAC-SHA256 anti-tampering
```

**La master password non viene mai salvata. La DEK non viene mai salvata in chiaro.**

---

## Funzionalità

### Vault
- Profili **WEB** (credenziali siti) e **CARD** (carte di credito/debito)
- Cifratura AES-256-GCM per ogni campo, IV random per record
- **Allegati file** cifrati per profilo — fino a 15 MB, con AAD legato al profileId
- Icone brand automatiche per oltre 3.000 servizi web
- Ricerca in-memoria su titolo, sito, note (nessun indice plaintext)
- Ordinamento A-Z, Z-A, più recenti, meno recenti
- Generatore OTP/TOTP integrato nel profilo

### Password Generator
- Modalità **Password** — lunghezza 4-64, set di caratteri configurabili (lower/upper/digits/symbols)
- Modalità **Passphrase** — 3-10 parole, separatore personalizzabile, capitalizzazione
- Generazione con `crypto.getRandomValues()` (CSPRNG nativo del browser)
- Calcolo entropia in bit e strength meter
- Storico ultimi 10 risultati con copia rapida

### Password Health
- Rilevamento password compromesse via **HaveIBeenPwned** (k-anonymity API — la password non viene mai inviata)
- Rilevamento password duplicate tra profili
- Rilevamento password deboli (lunghezza, complessità)
- Health score aggregato 0–100
- Cache in-memoria svuotata automaticamente al lock/logout (nessun dato decifrato in storage)

### Sicurezza avanzata
- **Autenticazione biometrica (WebAuthn)** come secondo fattore — non sostituisce la master password, la conferma dopo di essa
- **Auto-lock** per inattività (timeout configurabile) con rilevamento background tramite `visibilitychange`
- **Rate limiting persistente** — lockout sopravvive ai reload della pagina (localStorage)
- **Integrità database (HMAC v2)** — HMAC-SHA256 ricalcolato ad ogni scrittura, verificato ad ogni unlock; copre config, profili, allegati e conteggi
- **Clipboard auto-clear** — testo copiato eliminato automaticamente dopo 30 secondi
- **XSS protection** — tutti gli input sanitizzati con DOMPurify
- **Content Security Policy** — CSP restrittiva via header HTTP in produzione

### Contatti e Condivisione profili
- **Identità crittografica** per ogni vault: keypair ECDH P-256 (condivisione) + keypair Ed25519 (firma) generati al primo accesso, chiavi private cifrate con la DEK; display name opzionale salvato nell'identità
- **Directory identità globale (opt-in)**: l'utente può registrare il proprio fingerprint su Cloudflare KV (`OV_IDENTITY`) per essere trovabile da altri. TTL 6 mesi, auto-rinnovato. Il server è zero-knowledge: salva solo `{ pk, deleteTokenHash }`, nessun dato personale
- **Lookup contatto per fingerprint**: barra di ricerca in `ContactsPage` per trovare un contatto nella directory tramite fingerprint (`AA:BB:CC:DD:EE:FF:11:22` o formato compatto). Il client verifica crittograficamente che `SHA256(pk)[:8 byte] == fingerprint` prima di mostrare il preview
- **Invite via relay link**: l'invito viene caricato sul relay Cloudflare KV e condiviso come URL `/receive/<id>` — il server non ha accesso ai dati (zero-knowledge)
- **Fingerprint visivo** del contatto: primi 8 byte SHA-256(publicKey) in esadecimale per verifica out-of-band
- **Condivisione profilo cifrata**: ECDH effimero + HKDF-SHA256 + AES-256-GCM (forward secrecy per ogni share); payload caricato sul relay, condiviso come link; include allegati del profilo se presenti
- **Autenticazione mittente (Ed25519)**: ogni share include `_senderIdentity` (pk, fingerprint, displayName, signingPk) e `_senderSig` (firma Ed25519 sul commitment SHA-256 del profilo) — tutto dentro il ciphertext, zero-knowledge relay. Il destinatario verifica la firma post-decifratura e vede badge verde/giallo. Il mittente viene auto-aggiunto ai contatti solo se la firma è verificata
- **Write token per delete-after-confirm**: al momento del caricamento viene generato un token casuale a 128 bit. Il suo hash SHA-256 (`_wth`) è inviato al relay; il token stesso è cifrato nel payload ECDH — solo il destinatario può estrarlo per autorizzare il `DELETE` dopo l'importazione. Impedisce a terzi con il solo ID relay di cancellare il payload
- **Inbox pull**: il mittente può indicare il fingerprint del destinatario nel payload relay; il destinatario può fare pull attivo dei profili in attesa dalla `ContactsPage` senza dover ricevere il link direttamente (`GET /api/relay/inbox/:fingerprint`)
- **Protezione auto-aggiunta**: il sistema impedisce di aggiungere se stessi come contatto (controllo sia a livello service che UI)
- Flusso pendente: se il vault è bloccato quando si apre un link `/receive/:id`, l'ID viene salvato in `sessionStorage` e il payload viene recuperato dopo l'unlock
- Export/Import JSON v3: include identità e rubrica contatti

### Backup e Sync
- Export/Import JSON cifrato v3 (portabile su qualsiasi device con la stessa password, include allegati, identità e contatti)
- Sync **Google Drive** opzionale (backup automatico, risoluzione conflitti, allegati lazy-loaded)
- Import/restore da Drive: se il backup corrisponde al vault locale (stesso `salt` + `encryptedDEK`), i record `deviceSecret` e `biometric` vengono preservati — nessun re-enroll necessario

### UX
- PWA installabile (Add to Home Screen)
- Offline-first (Service Worker)
- Dark/Light theme con persistenza
- Sidebar desktop + bottom nav mobile
- Multi-lingua (i18n)
- **Setup guidato al primo avvio**: scegli tra "Nuovo dispositivo" (imposta master password) o "Ripristina backup" (da file JSON o Google Drive) con fallback automatico in caso di errore
- **Navigate to root al lock**: auto-lock e logout portano sempre alla root, evitando URL orfani su pagine protette

---

## Architettura di Sicurezza

### Device Secret Key (DSK) e WebAuthn PRF

La DSK è una chiave casuale a 160 bit generata localmente e conservata **solo su questo dispositivo** (IndexedDB). Non viene mai inclusa nei backup né nel sync cloud.

Quando abilitata, la vault key viene derivata dalla combinazione di password + DSK:

```
masterKeyMaterial = PBKDF2(masterPassword, salt)
vaultKey = HKDF(masterKeyMaterial, salt=DSK, info="OwnVault-vault-v2")
DEK = AES-GCM.decrypt(vaultKey, encryptedDEK)
```

Il database rubato è inutilizzabile senza **sia** la master password **che** la DSK sul dispositivo.

#### Wrapping della DSK con WebAuthn PRF (v3)

La DSK è avvolta con l'output dell'estensione PRF del credenziale WebAuthn biometrico:

```
prfOutput = WebAuthn.get(prf: { eval: { first: "OwnVault-device-secret-v1" } })
wrapKey = HKDF(prfOutput, info="OwnVault-wrap-v1")
wrappedDSK = AES-GCM(wrapKey, DSK)   → salvato in IndexedDB
```

L'output PRF è deterministico (stesso credenziale + stesso input = stesso output) e non estraibile dall'autenticatore.

**Sicurezza**: IndexedDB rubato → inutile senza master password + autenticatore fisico.

#### Architettura biometrica legacy (v2)

Il vecchio schema (v2) usa WebAuthn solo come gate UI — nessuna chiave derivata. La DEK non è mai derivabile dalla biometria da sola. Un database rubato è inutilizzabile senza la master password.

```
Master Password → KEK → decifra DEK → DEK in RAM
                                          ↓
                              Se biometria abilitata (v2):
                              WebAuthn assertion → conferma presenza utente
                                          ↓
                                   isUnlocked = true
```

#### Compatibilità WebAuthn PRF

| Piattaforma | Stato |
|---|---|
| Chrome 116+ / macOS Touch ID | Supportato |
| Chrome 116+ / Windows Hello | Supportato |
| Chrome 128+ / Android (passkey locale) | Supportato — richiede `residentKey: required` |
| Android Chrome + Google Password Manager | Non supportato — i passkey GPM cloud non espongono PRF |
| Firefox | Non supportato |
| Safari | Non supportato |

**Nota Android**: la registrazione usa `residentKey: required` per impedire a Google Password Manager di salvare il passkey in cloud (i passkey GPM non supportano PRF). Il flag `prf.enabled` nella risposta di `create()` viene verificato su mobile per rilevare subito i passkey GPM e fare fallback al v2.

Se PRF non è supportato, OwnVault fallisce silenziosamente al 2FA legacy (solo gate UI) — la funzionalità DSK rimane disabilitata.

### Pairing multi-device via QR (ECDH + PIN, senza server)

Permette di trasferire la DSK su un nuovo dispositivo senza server né cloud:

```
Nuovo device  → genera keypair effimero EC P-256 → mostra QR (pubKeyNew)
Vecchio device → scansiona QR, genera il suo keypair
               → ECDH(privOld, pubNew) = sharedSecret
               → PIN = 6 cifre casuali
               → transferKey = HKDF(sharedSecret, salt=PIN, info="OwnVault-transfer-v1")
               → encryptedDSK = AES-GCM(transferKey, DSK)
               → mostra: PIN + QR(pubOld, encryptedDSK, iv)
Nuovo device  → scansiona QR, utente inserisce PIN → ECDH(privNew, pubOld) → decifra DSK
```

Il PIN autentica il canale QR contro un MITM che intercetta il codice.

### Recovery key DSK

Formato: `OV-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX` (Crockford Base32, 20 byte = 160 bit, 4 gruppi da 8 caratteri).

Da conservare offline come backup della DSK. Permette di ri-enrollare la biometria su un device dopo reset o se il credenziale WebAuthn viene eliminato.

### Relay server (Cloudflare KV `OV_RELAY` — zero-knowledge)

I payload di invito e profilo cifrato vengono caricati su un relay Cloudflare KV prima di condividere il link. Il server è **zero-knowledge**: riceve e restituisce solo testo opaco cifrato.

```
Mittente
  → genera writeToken (128 bit random) + writeTokenHash = SHA256(writeToken)
  → cifra payload (invite: pk+name in chiaro | profile: ECDH+AES-GCM ciphertext)
      il writeToken è incluso nel plaintext cifrato come `_wt`
  → POST /api/relay  { payload, _wth: writeTokenHash, recipientFp? }
      → Cloudflare KV  → { id, expiresAt }
      → se recipientFp presente: marker inbox:fp:id salvato nello stesso KV
  → condivide URL: <origin>/receive/<id>

Destinatario (via link diretto)
  → apre /receive/<id>
  → GET /api/relay/<id>  → Cloudflare KV  → payload JSON
  → valida e mostra preview modale in ContactsPage
  → conferma → decifra + estrae writeToken dal plaintext
             → salva profilo/contatto + refreshHMAC
             → DELETE /api/relay/<id> { writeToken }  (cancella il payload)

Destinatario (via inbox pull)
  → ContactsPage: pulsante "Controlla"
  → GET /api/relay/inbox/<fingerprint>  → { ids: [...] }
  → per ogni id: GET /api/relay/<id>  → payload
  → processa in coda con modal preview sequenziale
```

- TTL: 24 ore (il relay non espone dati dopo la scadenza; writeToken è il meccanismo di delete anticipato)
- ID: 128 bit random esadecimale (32 char)
- Payload max: 10 MB (copre allegati fino a ~6 MB effettivi con overhead base64)
- Il relay non ha accesso alle chiavi private — i profili sono leggibili solo dal destinatario
- `_wth` nel payload relay: hash SHA-256 del write token — impedisce delete da parte di terzi con il solo ID
- Se il vault è bloccato all'apertura del link, l'ID viene salvato in `sessionStorage` e il fetch avviene dopo l'unlock

### Directory identità (Cloudflare KV `OV_IDENTITY` — opt-in)

Permette agli utenti di registrare il proprio fingerprint per essere trovabili da altri senza scambiare link di invito.

```
Registrazione (opt-in dalle Impostazioni):
  → deleteToken = HMAC-SHA256(chiave_privata, "OwnVault-directory-delete-v1")
  → deleteTokenHash = SHA256(deleteToken)
  → POST /api/identity  { fingerprint, pk, deleteTokenHash }
      → il server verifica: SHA256(pk)[:8 byte] == fingerprint
      → salva { pk, deleteTokenHash } in OV_IDENTITY  (TTL 6 mesi)
      → deleteTokenHash mai esposto nelle risposte GET

Lookup da parte di un altro utente:
  → GET /api/identity/<fingerprint>  → { pk }
  → client verifica: SHA256(pk)[:8 byte] == fingerprint  (controllo crittografico lato client)
  → se ok: mostra preview "aggiungi contatto"

Cancellazione (utente disabilita discoverability):
  → DELETE /api/identity/<fingerprint>  { deleteToken }
      → server verifica: SHA256(deleteToken) == deleteTokenHash salvato
      → cancella entry
```

- Il `deleteToken` è deterministico e derivabile su qualsiasi device con il vault sbloccato — non richiede storage aggiuntivo
- Il server non può derivare il deleteToken (non conosce la chiave privata) — solo il proprietario può cancellarsi
- Zero metadata: il server non sa chi ha effettuato il lookup né chi ha cercato chi

### Identità crittografica e condivisione profili (ECDH + Ed25519)

```
Vault sbloccato
   → genera keypair ECDH P-256 (se non esiste)     — condivisione profili
   → genera keypair Ed25519 (se non esiste)          — firma payload
   → chiavi pubbliche → salvate in chiaro in IndexedDB + export backup
   → chiavi private → cifrate con DEK (JWK → AES-GCM) → IndexedDB
   (identità pre-Ed25519: migrazione automatica al primo accesso)

Condivisione profilo verso contatto:
  sender:
    → genera keypair effimero ECDH P-256 (usa-e-getta)
    → ECDH(effimero_priv, destinatario_pub) → sharedBits 256-bit
    → HKDF-SHA256(sharedBits, info="OwnVault-Share-v1") → wrapKey AES-256
    → commitment = SHA-256(JSON.stringify(profileData))
    → _senderSig = Ed25519_sign(signingPrivKey, commitment)
    → plaintext = { ...profileData, _wt, _senderIdentity: { pk, fp, displayName, signingPk }, _senderSig }
    → AES-256-GCM(wrapKey, plaintext) → (ct, iv)
    → payload = { v:1, epk, iv, ct } → POST /api/relay → URL /receive/<id>
      (relay vede solo ciphertext — mittente e firma sono zero-knowledge)

  destinatario (vault sbloccato):
    → GET /api/relay/<id> → payload JSON
    → decifra chiave privata ECDH con DEK
    → ECDH(priv, epk) → sharedBits → wrapKey
    → AES-256-GCM-decrypt → { profileData, _senderIdentity, _senderSig, _wt }
    → verifica: Ed25519_verify(_senderIdentity.signingPk, _senderSig, commitment)
    → badge verde (firma verificata) o giallo (firma assente/invalida)
    → se firma verificata: auto-aggiunge mittente ai contatti
    → re-cifra profileData con propria DEK → salva in IndexedDB + refreshHMAC
    → DELETE /api/relay/<id> { writeToken }
```

La chiave effimera del mittente garantisce **forward secrecy**: compromettere la chiave privata dell'identità non espone share passati. Il relay è zero-knowledge: non conosce né le chiavi né l'identità del mittente.

**Autenticazione mittente:** la firma Ed25519 inside the ciphertext prova che il mittente possiede la chiave privata corrispondente alla `signingPk` dichiarata — senza che il relay veda alcuna informazione sul mittente. L'auto-add del contatto avviene solo se la firma è crittograficamente verificata.

### Integrità database (HMAC v2 — anti-tampering)

```
DEK → HKDF → IntegrityKey (domain: "OwnVault-Integrity-v1")
                  ↓
         HMAC-SHA256(
           cryptoConfig
           + profili ordinati per ID (iv, data, category, version)
           + conteggio profili
           + allegati ordinati per ID (id, profileId, iv, metaIv, metaData)
           + conteggio allegati
         )
                  ↓
         salvato in IndexedDB dopo ogni scrittura
                  ↓
         verificato ad ogni unlock → IntegrityWarningBanner se mismatch
```

Un attaccante che modifica IndexedDB non può ricalcolare un HMAC valido senza la DEK. Il conteggio dei record protegge anche da eliminazioni silenziose.

### Allegati cifrati (AAD binding)

```
File binario
   ↓
AES-256-GCM con AAD = "ownvault-attachment-v2-profile-{profileId}"
   ↓
Ciphertext + IV salvati in IndexedDB (o Google Drive)
```

L'AAD lega crittograficamente ogni allegato al profilo proprietario. Spostare un allegato su un profilo diverso rende la decifratura impossibile, prevenendo injection cross-profile.

I metadati (fileName, mimeType, size, hash SHA-256) sono cifrati separatamente — mai in chiaro in IndexedDB.

### Rate limiting persistente

```javascript
// 5 tentativi falliti → lockout 5 minuti
// Stato salvato in localStorage → sopravvive a reload, chiusura browser, riapertura
// Reset solo su login riuscito
```

| Azione attaccante | Protezione |
|---|---|
| Premere F5 dopo 5 tentativi | Bloccato — localStorage persiste |
| Chiudere e riaprire il browser | Bloccato — localStorage persiste |
| Cancellare localStorage (DevTools) | Bypass — richiede accesso tecnico al dispositivo |
| Navigare in modalità privata | Bypass — storage separato per origine |

### Content Security Policy (produzione)

```
default-src 'self'
script-src 'self' 'wasm-unsafe-eval' https://apis.google.com https://accounts.google.com
style-src 'self' 'unsafe-inline'
img-src 'self' data: blob:
connect-src 'self' https://www.googleapis.com https://oauth2.googleapis.com https://accounts.google.com https://api.pwnedpasswords.com
frame-src https://content.googleapis.com https://docs.google.com
object-src 'none'
base-uri 'self'
form-action 'self'
upgrade-insecure-requests
```

- `wasm-unsafe-eval` — richiesto da hash-wasm per PBKDF2-SHA512
- `unsafe-inline` su stili — necessario per Tailwind CSS (nessuna alternativa pratica senza nonce)
- `object-src 'none'` — blocca plugin Flash/Java

---

## Threat Model

### Cosa è protetto

| Minaccia | Protezione |
|---|---|
| DB rubato (senza password) | AES-256-GCM + PBKDF2 600k iter — inutilizzabile |
| DB rubato + password (con DSK abilitata) | Senza DSK sul device la vault key non è derivabile |
| IndexedDB rubato (DSK + wrappedDSK) | Inutile senza master password + autenticatore fisico (PRF non estraibile) |
| Rainbow table / dizionario | Salt 256-bit random per utente |
| Replay attack | IV 96-bit random per ogni record |
| Bit flipping / corruzione | GCM rileva qualsiasi modifica |
| Padding oracle | GCM non usa padding |
| Tampering IndexedDB | HMAC-SHA256 v2 con chiave derivata dalla DEK (copre anche allegati) |
| Profilo importato senza HMAC update | refreshHMAC() chiamato dopo ogni import da contatto/relay |
| Share profilo intercettato sul relay | Il relay riceve solo ciphertext AES-256-GCM — illeggibile senza chiave privata destinatario |
| Share profilo intercettato in transito | HTTPS + payload E2E cifrato con chiave ECDH effimera |
| Delete payload relay da terzi | writeToken richiesto per DELETE — estratto solo dal destinatario dopo decifratura ECDH |
| Cancellazione identità da directory da terzi | deleteToken deterministico richiesto per DELETE — derivabile solo da chi ha la chiave privata del vault |
| Auto-aggiunta come contatto | Controllo fingerprint in `addContact()` (service) e in tutti gli handler UI — errore `cannot_add_self` |
| Eliminazione silenziosa record | Conteggio profili + allegati nel payload HMAC |
| Allegati spostati tra profili | AAD con profileId — decifratura fallisce cross-profile |
| Brute-force locale | Rate limiting persistente + 600k iterazioni KDF |
| XSS nel DOM | DOMPurify su tutti gli input/output + CSP |
| Dati in clipboard | Auto-clear dopo 30 secondi |
| Sessione lasciata aperta | Auto-lock per inattività + background timeout (60s) |
| HIBP check (leakage password) | k-anonymity — solo prefisso hash (5 chars SHA-1) inviato |
| Health data decifrati in memoria | healthCache svuotato al lock/logout |
| Timing attack su HMAC compare | Constant-time comparison (`constantTimeCompare`) |

### Cosa NON è protetto (limitazioni intrinseche)

| Minaccia | Motivo |
|---|---|
| Keylogger hardware/software | Affligge tutti i password manager incluso Bitwarden |
| RAM dump (sessione sbloccata) | La DEK è in memoria durante l'uso — limitazione della piattaforma JS |
| Attaccante con DevTools e pazienza | Può cancellare localStorage per bypassare rate limit |
| Modalità privata del browser | Storage separato — rate limit non persiste tra sessioni private |
| Brute-force GPU su DB rubato | PBKDF2 non è memory-hard (Argon2id sarebbe più resistente) |
| Mittente non autenticato nello share | Firma Ed25519 inside ciphertext — badge giallo se firma assente/invalida, auto-add contatto solo su firma verificata |
| Sostituzione chiave pubblica nell'invito | TOFU — l'utente deve verificare il fingerprint out-of-band |
| Relay link compromesso prima dell'apertura | ID a 128 bit — forza bruta impraticabile; scade dopo 24h |

---

## Stack Tecnologico

| Layer | Tecnologia |
|---|---|
| UI | React 18 + Vite |
| Styling | Tailwind CSS (dark/light theme) |
| Routing | React Router v6 |
| Database locale | Dexie.js (IndexedDB) |
| KDF | hash-wasm — PBKDF2-SHA512 (WebCrypto nativo non supporta SHA-512) |
| Cifratura | Web Crypto API — AES-256-GCM |
| Integrità | Web Crypto API — HMAC-SHA256 |
| Key derivation | Web Crypto API — HKDF-SHA256 |
| Autenticazione biometrica | WebAuthn (Platform Authenticator) |
| XSS protection | DOMPurify |
| PWA | Vite PWA Plugin + Service Worker (Workbox) |
| Relay condivisione | Cloudflare Pages Functions + Cloudflare KV |
| Sync cloud | Google Drive API v3 |
| Password health | HaveIBeenPwned API (k-anonymity) |
| Internazionalizzazione | i18next |

---

## Struttura del Progetto

```
src/
├── App.jsx                        # Router + Auth guard + UpdateBanner + InstallPrompt
│                                  # PendingRelayHandler (fetch relay dopo unlock)
│                                  # ReceivePage (intercetta /receive/:id da vault sbloccato)
├── main.jsx                       # Entry point PWA
├── index.css                      # Tailwind + glass effects + light theme overrides
│
├── layouts/
│   └── AppLayout.jsx              # Sidebar + layout wrapper, theme-aware
│
├── contexts/
│   ├── AuthContext.jsx            # Stato globale auth + biometria + auto-lock
│   └── ThemeContext.jsx           # Dark/light theme via data-theme su <html>
│
├── pages/
│   ├── LoginPage.jsx              # Unlock con password (+ 2FA biometrico)
│   ├── SignUpPage.jsx             # Setup guidato: nuovo dispositivo | ripristina da file/Drive
│   ├── MainPage.jsx               # Vault — lista profili con ricerca/ordinamento
│   ├── ProfileDetailPage.jsx      # Visualizzazione profilo + OTP + allegati + share ECDH via relay
│   ├── ProfileFormPage.jsx        # Creazione / modifica profilo
│   ├── PasswordGeneratorPage.jsx  # Generatore password e passphrase
│   ├── PasswordHealthPage.jsx     # Analisi sicurezza password (HIBP + duplicati + forza)
│   ├── SettingsPage.jsx           # Impostazioni (biometria, sync, auto-lock, tema)
│   ├── ImportPage.jsx             # Import da database legacy
│   └── ContactsPage.jsx          # Rubrica contatti + identità + invite/receive via relay
│
├── components/
│   ├── Sidebar.jsx                # Navigazione desktop + mobile bottom nav
│   ├── IconRenderer.jsx           # Icone brand dinamiche
│   ├── IconPicker.jsx             # Selettore icona profilo
│   ├── OTPDisplay.jsx             # Display TOTP con countdown
│   ├── QRScanner.jsx              # Scanner QR per setup 2FA
│   ├── BiometricSetupDialog.jsx        # Dialog abilitazione biometria legacy
│   ├── BiometricSettingsSection.jsx    # Gestione DSK + biometria nelle impostazioni
│   ├── DeviceSecretSetupDialog.jsx     # Wizard attivazione DSK
│   ├── DeviceApprovalDialog.jsx        # Sblocco via biometria + DSK al login
│   ├── IntegrityWarningBanner.jsx # Avviso tampering database
│   ├── LanguageSelector.jsx       # Cambio lingua
│   ├── SyncConflictDialog.jsx     # Risoluzione conflitti sync
│   └── UpdateAvailableDialog.jsx  # Notifica aggiornamento PWA
│
├── services/
│   ├── cryptoService.js           # PBKDF2, AES-GCM, HKDF, HMAC, blob encryption con AAD
│   ├── databaseService.js         # IndexedDB (Dexie), export/import v3, validazione
│   ├── contactsService.js         # Identità ECDH, rubrica, relay upload/fetch, encrypt/decrypt profili
│   ├── biometricService.js        # WebAuthn registration + PRF authentication
│   ├── deviceSecretService.js     # DSK generazione/wrap/unwrap, QR pairing ECDH, recovery key
│   ├── healthCacheService.js      # Cache in-memoria per risultati Password Health
│   ├── googledriveService.js      # OAuth2 + Drive API
│   ├── syncService.js             # Logica sync + conflict resolution + allegati lazy
│   ├── hibpService.js             # HaveIBeenPwned k-anonymity
│   ├── securityUtils.js           # RateLimiter, AutoLockTimer, DOMPurify, clipboard clear
│   └── legacyImportService.js     # Import da database SQLite legacy
│
├── icons/
│   └── brandIcons.js              # Mapping servizi → icone brand
│
└── i18n/
    ├── config.js
    └── locales/                   # Traduzioni (it, en, ...)

functions/
└── api/
    ├── _rl.js                     # Rate limiter condiviso (Cloudflare KV sliding window)
    ├── relay/
    │   ├── index.js               # POST /api/relay — crea entry su OV_RELAY (24h TTL)
    │   ├── [id].js                # GET + DELETE /api/relay/:id — recupera/cancella payload (delete richiede writeToken)
    │   └── inbox/
    │       └── [fingerprint].js   # GET /api/relay/inbox/:fp — lista ID payload pendenti per fingerprint
    └── identity/
        ├── index.js               # POST /api/identity — registra fingerprint in OV_IDENTITY (6 mesi TTL)
        └── [fingerprint].js       # GET + DELETE /api/identity/:fp — lookup pk / cancella registrazione
```

---

## Flusso di Autenticazione

### Prima volta (nuovo dispositivo)

```
Utente sceglie master password
   → genera salt 256-bit random
   → genera DEK 256-bit random
   → PBKDF2-SHA512(password, salt, 600k) → KEK
   → AES-GCM(KEK, DEK) → encryptedDEK salvato in IndexedDB
   → HKDF(DEK, "OwnVault-Integrity-v1") → IntegrityKey
   → HMAC(IntegrityKey, DB state v2) → salvato in IndexedDB
```

### Attivazione DSK (dalle Impostazioni)

```
# Con WebAuthn PRF (v3, default se supportato):
   → genera DSK 160-bit random
   → WebAuthn registration con prf extension → credentialId
   → WebAuthn get() → prfOutput (32 byte deterministico)
   → wrapKey = HKDF(prfOutput, info="OwnVault-wrap-v1")
   → wrappedDSK = AES-GCM(wrapKey, DSK) → salvato in IndexedDB
   → encryptedDEK aggiornato: vaultKey = HKDF(PBKDF2(password), salt=DSK)

# Senza PRF (v2 fallback):
   → DSK non disponibile — WebAuthn usato solo come gate UI 2FA
```

La recovery key `OV-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX` viene mostrata all'utente al momento dell'attivazione e deve essere conservata offline.

### Login

```
Utente inserisce master password
   → PBKDF2-SHA512(password, salt, 600k) → KEK

   # Senza DSK:
   → vaultKey = HKDF(masterKeyMaterial, info="OwnVault-vault-v1")
   → AES-GCM-decrypt(vaultKey, encryptedDEK) → DEK in RAM

   # Con DSK + biometria PRF (v3):
   → WebAuthn get() → prfOutput
   → unwrapDSK = AES-GCM-decrypt(HKDF(prfOutput), wrappedDSK)
   → vaultKey = HKDF(masterKeyMaterial, salt=DSK, info="OwnVault-vault-v2")
   → AES-GCM-decrypt(vaultKey, encryptedDEK) → DEK in RAM

   # Con DSK + biometria legacy (v2):
   → WebAuthn assertion → conferma presenza
   → DSK da IndexedDB (non avvolta)
   → vaultKey = HKDF(masterKeyMaterial, salt=DSK, info="OwnVault-vault-v2")
   → AES-GCM-decrypt(vaultKey, encryptedDEK) → DEK in RAM

   → HMAC verify → controlla integrità DB (profili + allegati)
   → isUnlocked = true
```

### Lock (auto o manuale)

```
DEK.fill(0) → DEK = null   (zeroing esplicito prima del GC)
integrityKey = null
healthCache.clear()         (svuota cache dati decifrati)
isUnlocked = false
```

---

## Export / Import (formato v3)

```json
{
  "version": 3,
  "exportDate": "2025-01-01T00:00:00.000Z",
  "crypto": {
    "version": 2,
    "kdf": "PBKDF2",
    "hash": "SHA-512",
    "iterations": 600000,
    "salt": "<base64>",
    "iv": "<base64>",
    "encryptedDEK": "<base64>",
    "hmac": "<base64>",
    "hmacVersion": 2
  },
  "profiles": [
    {
      "id": "<uuid>",
      "iv": "<base64>",
      "data": "<base64 ciphertext>",
      "category": "WEB",
      "version": 2,
      "lastModified": "<ISO date>"
    }
  ],
  "attachments": [
    {
      "id": "<uuid>",
      "profileId": "<uuid>",
      "iv": "<base64>",
      "encryptedData": "<base64>",
      "metaIv": "<base64>",
      "metaData": "<base64>",
      "driveFileId": null
    }
  ],
  "identity": {
    "publicKey": "<base64url>",
    "encryptedPrivateKey": { "iv": "...", "data": "..." },
    "signingPublicKey": "<base64url>",
    "encryptedSigningKey": { "iv": "...", "data": "..." },
    "displayName": "Mario Rossi"
  },
  "contacts": [
    { "name": "Alice", "publicKey": "<base64url>", "fingerprint": "AA:BB:CC:DD:EE:FF:11:22", "signingPublicKey": "<base64url>" }
  ]
}
```

Il file è portabile: funziona su qualsiasi device con la stessa master password. L'import valida rigorosamente la struttura prima di sovrascrivere il database.

**Versioni supportate in import:** v1 (senza allegati), v2 (con allegati), v3 (con allegati + identità ECDH + contatti).

---

## Setup e Sviluppo

```bash
# Installa dipendenze
npm install

# Avvia in dev (hot reload) — il relay /api/relay è mockato in memoria da Vite
npm run dev

# Build produzione
npm run build

# Preview build produzione
npm run preview
```

Il relay in sviluppo è simulato da un middleware Vite in-memory (vedere `vite.config.js`), senza bisogno di Cloudflare Wrangler.

### Variabili d'ambiente (opzionali — solo per sync Google Drive)

```env
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=your-api-key
```

### Deploy (Cloudflare Pages)

Il progetto usa **Cloudflare Pages Functions** per relay e directory:

| Function | Endpoint | Binding KV |
|---|---|---|
| `relay/index.js` | `POST /api/relay` | `OV_RELAY` |
| `relay/[id].js` | `GET + DELETE /api/relay/:id` | `OV_RELAY` |
| `relay/inbox/[fingerprint].js` | `GET /api/relay/inbox/:fp` | `OV_RELAY` |
| `identity/index.js` | `POST /api/identity` | `OV_IDENTITY` |
| `identity/[fingerprint].js` | `GET + DELETE /api/identity/:fp` | `OV_IDENTITY` |

Binding KV richiesti (Pages > Settings > Functions > KV namespace bindings):
- `OV_RELAY` — payload relay temporanei (24h TTL) + marker inbox
- `OV_IDENTITY` — directory fingerprint opt-in (6 mesi TTL)

---

## Miglioramenti rispetto all'app Xamarin originale

| Aspetto | Xamarin | PWA |
|---|---|---|
| Password usata come chiave | Diretta | PBKDF2 600k iterazioni |
| IV | Fisso | Random per ogni record |
| AES mode | CBC | GCM (autenticato) |
| Salt | Fisso | Random 256-bit |
| Integrità dati | Nessuna | HMAC-SHA256 v2 anti-tampering (profili + allegati) |
| Biometria | N/A | WebAuthn 2FA locale + PRF per DSK wrapping |
| Device Secret Key | N/A | DSK locale 160-bit + pairing QR ECDH multi-device |
| Rate limiting | Nessuno | 5 tentativi / 5 min, persistente |
| Auto-lock | Nessuno | Timer configurabile + background detection |
| XSS protection | N/A (nativo) | DOMPurify + CSP |
| Password health | Nessuna | HIBP k-anonymity + duplicati + forza |
| Allegati | Nessuno | File cifrati con AAD, fino a 15 MB |
| Backup | Manuale | Google Drive automatico |
| Condivisione profili | Nessuna | E2E cifrata via relay zero-knowledge (ECDH + AES-GCM) |
| Platform | Android/iOS | Web (qualsiasi OS/device) |

---

## PWA Features

- Installabile (Add to Home Screen) su Android, iOS, Windows, macOS
- Offline-first con Service Worker (Workbox)
- Responsive: layout desktop con sidebar, mobile con bottom nav
- Notifica aggiornamento disponibile (registerType: 'prompt')

---

## Roadmap

- [x] Tutorial iniziale primo avvio
- [x] Impostazioni (biometric, 2FA, tema)
- [x] Password generator avanzato
- [x] Ordinamento (A-Z, data)
- [x] Generatore OTP (TOTP)
- [x] Backup automatico Google Drive
- [x] Dark/Light theme
- [x] PWA
- [x] Multi-lingua
- [x] Allegati file cifrati per profilo
- [x] HMAC v2 (integrità su profili + allegati)
- [x] Content Security Policy (produzione)
- [x] Identità crittografica ECDH P-256 per vault (con display name)
- [x] Rubrica contatti con fingerprint visivo
- [x] Condivisione profili cifrata E2E (ECDH effimero + AES-256-GCM, forward secrecy)
- [x] Relay server zero-knowledge (Cloudflare KV `OV_RELAY`, 24h TTL) per condivisione via link
- [x] Write token per delete-after-confirm su relay (solo il destinatario può cancellare)
- [x] Directory identità globale opt-in (Cloudflare KV `OV_IDENTITY`, 6 mesi TTL, lookup per fingerprint)
- [x] Inbox pull: ricezione profili senza link diretto (`GET /api/relay/inbox/:fp`)
- [x] Export/Import v3 (include identità + contatti)
- [x] Setup guidato al primo avvio (nuovo dispositivo o ripristino backup)
- [x] Device Secret Key (DSK) — chiave locale a 160 bit, secondo fattore crittografico
- [x] WebAuthn PRF extension — DSK avvolta con output PRF del credenziale biometrico
- [x] Pairing multi-device via QR (ECDH P-256 + PIN a 6 cifre, senza server)
- [x] Recovery key DSK in formato Crockford Base32 (`OV-XXXXXXXX-...`)
- [x] Firme Ed25519 per autenticazione mittente nello share (v2 protocollo)
- [ ] Export/Import da altri password manager (Bitwarden, 1Password CSV)
- [ ] Campi personalizzati nella creazione profilo
- [ ] Logging centralizzato
