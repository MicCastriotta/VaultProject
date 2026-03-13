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
- Icone brand automatiche per oltre 500 servizi web
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

### Backup e Sync
- Export/Import JSON cifrato v2 (portabile su qualsiasi device con la stessa password, include allegati)
- Sync **Google Drive** opzionale (backup automatico, risoluzione conflitti, allegati lazy-loaded)

### UX
- PWA installabile (Add to Home Screen)
- Offline-first (Service Worker)
- Dark/Light theme con persistenza
- Sidebar desktop + bottom nav mobile
- Multi-lingua (i18n)

---

## Architettura di Sicurezza

### Schema biometrico (WebAuthn)

Il vecchio schema salvava una chiave simmetrica derivata dalla DEK nel database — permettendo di recuperare la DEK senza password. L'attuale implementazione è corretta:

```
Master Password → KEK → decifra DEK → DEK in RAM
                                          ↓
                              Se biometria abilitata:
                              WebAuthn assertion → conferma presenza utente
                                          ↓
                                   isUnlocked = true
```

WebAuthn è un **gate di accesso UI** (2FA locale), non un meccanismo crittografico. La DEK non è mai derivabile dalla biometria da sola. Un database rubato è inutilizzabile senza la master password, anche con la configurazione biometrica registrata.

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
connect-src 'self' https://www.googleapis.com https://api.pwnedpasswords.com
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
| Rainbow table / dizionario | Salt 256-bit random per utente |
| Replay attack | IV 96-bit random per ogni record |
| Bit flipping / corruzione | GCM rileva qualsiasi modifica |
| Padding oracle | GCM non usa padding |
| Tampering IndexedDB | HMAC-SHA256 v2 con chiave derivata dalla DEK (copre anche allegati) |
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
| Sync cloud | Google Drive API v3 |
| Password health | HaveIBeenPwned API (k-anonymity) |
| Internazionalizzazione | i18next |

---

## Struttura del Progetto

```
src/
├── App.jsx                        # Router + Auth guard + UpdateBanner + InstallPrompt
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
│   ├── SignUpPage.jsx             # Setup master password (prima volta)
│   ├── MainPage.jsx               # Vault — lista profili con ricerca/ordinamento
│   ├── ProfileDetailPage.jsx      # Visualizzazione profilo + OTP + allegati
│   ├── ProfileFormPage.jsx        # Creazione / modifica profilo
│   ├── PasswordGeneratorPage.jsx  # Generatore password e passphrase
│   ├── PasswordHealthPage.jsx     # Analisi sicurezza password (HIBP + duplicati + forza)
│   ├── SettingsPage.jsx           # Impostazioni (biometria, sync, auto-lock, tema)
│   └── ImportPage.jsx             # Import da database legacy
│
├── components/
│   ├── Sidebar.jsx                # Navigazione desktop + mobile bottom nav
│   ├── IconRenderer.jsx           # Icone brand dinamiche
│   ├── IconPicker.jsx             # Selettore icona profilo
│   ├── OTPDisplay.jsx             # Display TOTP con countdown
│   ├── QRScanner.jsx              # Scanner QR per setup 2FA
│   ├── BiometricSetupDialog.jsx   # Dialog abilitazione biometria
│   ├── BiometricSettingsSection.jsx # Gestione biometria nelle impostazioni
│   ├── IntegrityWarningBanner.jsx # Avviso tampering database
│   ├── LanguageSelector.jsx       # Cambio lingua
│   ├── SyncConflictDialog.jsx     # Risoluzione conflitti sync
│   └── UpdateAvailableDialog.jsx  # Notifica aggiornamento PWA
│
├── services/
│   ├── cryptoService.js           # PBKDF2, AES-GCM, HKDF, HMAC, blob encryption con AAD
│   ├── databaseService.js         # IndexedDB (Dexie), export/import v2, validazione
│   ├── biometricService.js        # WebAuthn registration + assertion
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
```

---

## Flusso di Autenticazione

### Prima volta

```
Utente sceglie master password
   → genera salt 256-bit random
   → genera DEK 256-bit random
   → PBKDF2-SHA512(password, salt, 600k) → KEK
   → AES-GCM(KEK, DEK) → encryptedDEK salvato in IndexedDB
   → HKDF(DEK, "OwnVault-Integrity-v1") → IntegrityKey
   → HMAC(IntegrityKey, DB state v2) → salvato in IndexedDB
   → (opzionale) WebAuthn registration → credentialId salvato in IndexedDB
```

### Login

```
Utente inserisce master password
   → PBKDF2-SHA512(password, salt, 600k) → KEK
   → AES-GCM-decrypt(KEK, encryptedDEK) → DEK in RAM
   → HMAC verify → controlla integrità DB (profili + allegati)
   → [se biometria abilitata] WebAuthn assertion → conferma presenza
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

## Export / Import (formato v2)

```json
{
  "version": 2,
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
  ]
}
```

Il file è portabile: funziona su qualsiasi device con la stessa master password. L'import valida rigorosamente la struttura prima di sovrascrivere il database. Il formato v1 (senza allegati) è supportato in import per retrocompatibilità.

---

## Setup e Sviluppo

```bash
# Installa dipendenze
npm install

# Avvia in dev (hot reload)
npm run dev

# Build produzione
npm run build

# Preview build produzione
npm run preview
```

### Variabili d'ambiente (opzionali — solo per sync Google Drive)

```env
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=your-api-key
```

---

## Miglioramenti rispetto all'app Xamarin originale

| Aspetto | Xamarin | PWA |
|---|---|---|
| Password usata come chiave | Diretta | PBKDF2 600k iterazioni |
| IV | Fisso | Random per ogni record |
| AES mode | CBC | GCM (autenticato) |
| Salt | Fisso | Random 256-bit |
| Integrità dati | Nessuna | HMAC-SHA256 v2 anti-tampering (profili + allegati) |
| Biometria | N/A | WebAuthn 2FA locale |
| Rate limiting | Nessuno | 5 tentativi / 5 min, persistente |
| Auto-lock | Nessuno | Timer configurabile + background detection |
| XSS protection | N/A (nativo) | DOMPurify + CSP |
| Password health | Nessuna | HIBP k-anonymity + duplicati + forza |
| Allegati | Nessuno | File cifrati con AAD, fino a 15 MB |
| Backup | Manuale | Google Drive automatico |
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
- [ ] Argon2id come KDF (più resistente a brute-force GPU)
- [ ] Secret Key (entropia extra indipendente dalla password)
- [ ] Export/Import da altri password manager (Bitwarden, 1Password CSV)
- [ ] Campi personalizzati nella creazione profilo
- [ ] Condivisione profili cifrati
- [ ] Logging centralizzato
