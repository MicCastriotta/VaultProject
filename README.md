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
   ├─→ AES-256-GCM → dati cifrati in IndexedDB
   └─→ HKDF-SHA256 → Integrity Key → HMAC-SHA256 anti-tampering
```

**La master password non viene mai salvata. La DEK non viene mai salvata in chiaro.**

---

## Funzionalità

### Vault
- Profili **WEB** (credenziali siti) e **CARD** (carte di credito/debito)
- Cifratura AES-256-GCM per ogni campo, IV random per record
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
- Health score aggregato

### Sicurezza avanzata
- **Autenticazione biometrica (WebAuthn)** come secondo fattore — non sostituisce la master password, la conferma dopo di essa
- **Auto-lock** per inattività (timeout configurabile) con rilevamento background tramite `visibilitychange`
- **Rate limiting persistente** — lockout sopravvive ai reload della pagina (localStorage)
- **Integrità database** — HMAC-SHA256 ricalcolato ad ogni scrittura, verificato ad ogni unlock
- **Clipboard auto-clear** — testo copiato eliminato automaticamente dopo 30 secondi
- **XSS protection** — tutti gli input sanitizzati con DOMPurify

### Backup e Sync
- Export/Import JSON cifrato (portabile su qualsiasi device con la stessa password)
- Sync **Google Drive** opzionale (backup automatico, risoluzione conflitti)

### UX
- PWA installabile (Add to Home Screen)
- Offline-first (Service Worker)
- Dark theme consistente su tutte le pagine
- Sidebar desktop + bottom nav mobile
- Multi-lingua (i18n)

---

## Architettura di Sicurezza

### Schema biometrico (WebAuthn v2)

Il vecchio schema salvava una chiave simmetrica derivata dalla DEK nel database — permettendo di recuperare la DEK senza password. L'attuale implementazione è corretta:

```
Master Password → KEK → decifra DEK → DEK in RAM
                                          ↓
                              Se biometria abilitata:
                              WebAuthn assertion → conferma presenza utente
                                          ↓
                                   isUnlocked = true
```

WebAuthn è un **gate di accesso UI** (2FA locale), non un meccanismo crittografico. La DEK non è mai derivabile dalla biometria da sola. Un database rubato è inutilizzabile senza la master password, anche con la configurazione biometrica.

### Integrità database (anti-tampering)

```
DEK → HKDF → IntegrityKey (domain: "OwnVault-Integrity-v1")
                  ↓
         HMAC-SHA256(cryptoConfig + profili ordinati per ID + conteggio)
                  ↓
         salvato in IndexedDB dopo ogni scrittura
                  ↓
         verificato ad ogni unlock → avviso se mismatch
```

Un attaccante che modifica IndexedDB non può ricalcolare un HMAC valido senza la DEK.

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
| Cancellare localStorage (DevTools) | Bypass — richiede accesso tecnico |
| Navigare in modalità privata | Bypass — storage separato per origine |

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
| Tampering IndexedDB | HMAC-SHA256 con chiave derivata dalla DEK |
| Brute-force locale | Rate limiting persistente + 600k iterazioni KDF |
| XSS nel DOM | DOMPurify su tutti gli input/output |
| Dati in clipboard | Auto-clear dopo 30 secondi |
| Sessione lasciata aperta | Auto-lock per inattività + background timeout |
| HIBP check (leakage password) | k-anonymity — solo prefisso hash inviato |

### Cosa NON è protetto (limitazioni intrinseche)

| Minaccia | Motivo |
|---|---|
| Keylogger hardware/software | Affligge tutti i password manager incluso Bitwarden |
| RAM dump (sessione sbloccata) | La DEK è in memoria durante l'uso — limitazione della piattaforma JS |
| Attaccante con DevTools e pazienza | Può cancellare localStorage per bypassare rate limit |
| Modalità privata del browser | Storage separato — rate limit non persiste tra sessioni private |

---

## Stack Tecnologico

| Layer | Tecnologia |
|---|---|
| UI | React 18 + Vite |
| Styling | Tailwind CSS (dark theme) |
| Routing | React Router v6 |
| Database locale | Dexie.js (IndexedDB) |
| KDF | hash-wasm — PBKDF2-SHA512 (WebCrypto nativo non supporta SHA-512) |
| Cifratura | Web Crypto API — AES-256-GCM |
| Integrità | Web Crypto API — HMAC-SHA256 |
| Key derivation | Web Crypto API — HKDF-SHA256 |
| Autenticazione biometrica | WebAuthn (Platform Authenticator) |
| XSS protection | DOMPurify |
| PWA | Vite PWA Plugin + Service Worker |
| Sync cloud | Google Drive API v3 |
| Password health | HaveIBeenPwned API (k-anonymity) |
| Internazionalizzazione | i18next |

---

## 🔧 Prossimi Step

Funzionalità da implementare:

- [x] Tutorial iniziale primo avvio
- [x] Impostazioni (biometric, 2FA, tema)
- [x] Password generator avanzato
- [x] Ordinamento (A-Z, data)
- [ ] Export/Import completo da altri profili
- [ ] Condivisione profili cifrati
- [x] Generatore OTP (TOTP)
- [x] Backup automatico
- [ ] Tema dark/light
- [ ] Completamento struttura grafica
- [x] PWA
- [x] Multi-lingua
- [ ] Logging centralizzato

## Struttura del Progetto

```
src/
├── App.jsx                        # Router + Auth guard
├── main.jsx                       # Entry point PWA
├── index.css                      # Tailwind + glass effects
│
├── layouts/
│   └── AppLayout.jsx              # Sidebar + layout wrapper
│
├── contexts/
│   └── AuthContext.jsx            # Stato globale auth + biometria
│
├── pages/
│   ├── LoginPage.jsx              # Unlock con password (+ 2FA biometrico)
│   ├── SignUpPage.jsx             # Setup master password (prima volta)
│   ├── MainPage.jsx               # Vault — lista profili con ricerca/ordinamento
│   ├── ProfileDetailPage.jsx      # Visualizzazione profilo + OTP
│   ├── ProfileFormPage.jsx        # Creazione / modifica profilo
│   ├── PasswordGeneratorPage.jsx  # Generatore password e passphrase
│   ├── PasswordHealthPage.jsx     # Analisi sicurezza password
│   ├── SettingsPage.jsx           # Impostazioni (biometria, sync, auto-lock)
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
│   ├── cryptoService.js           # PBKDF2, AES-GCM, HKDF, HMAC
│   ├── databaseService.js         # IndexedDB (Dexie), export/import
│   ├── biometricService.js        # WebAuthn registration + assertion
│   ├── googledriveService.js      # OAuth2 + Drive API
│   ├── syncService.js             # Logica sync + conflict resolution
│   ├── hibpService.js             # HaveIBeenPwned k-anonymity
│   ├── securityUtils.js           # RateLimiter, AutoLockTimer, DOMPurify
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

## Flusso di Autenticazione

### Prima volta

```
Utente sceglie master password
   → genera salt 256-bit random
   → genera DEK 256-bit random
   → PBKDF2-SHA512(password, salt, 600k) → KEK
   → AES-GCM(KEK, DEK) → encryptedDEK salvato in IndexedDB
   → HKDF(DEK) → IntegrityKey
   → HMAC(IntegrityKey, DB state) → salvato in IndexedDB
   → (opzionale) WebAuthn registration → credentialId salvato in IndexedDB
```

### Login

```
Utente inserisce master password
   → PBKDF2-SHA512(password, salt, 600k) → KEK
   → AES-GCM-decrypt(KEK, encryptedDEK) → DEK in RAM
   → [se biometria abilitata] WebAuthn assertion → conferma presenza
   → HMAC verify → controlla integrità DB
   → isUnlocked = true
```

### Lock (auto o manuale)

```
DEK.fill(0) → DEK = null   (zeroing esplicito prima del GC)
integrityKey = null
isUnlocked = false
```

---

## Export / Import

```json
{
  "version": 1,
  "exportDate": "2025-01-01T00:00:00.000Z",
  "crypto": {
    "kdf": "PBKDF2",
    "iterations": 600000,
    "salt": "<base64>",
    "iv": "<base64>",
    "encryptedDEK": "<base64>"
  },
  "profiles": [
    {
      "iv": "<base64>",
      "data": "<base64 ciphertext>",
      "category": "WEB"
    }
  ]
}
```

Il file è portabile: funziona su qualsiasi device che abbia l'app e la stessa master password. L'import valida rigorosamente la struttura prima di sovrascrivere il database.

---

## Miglioramenti rispetto all'app Xamarin originale

| Aspetto | Xamarin | PWA |
|---|---|---|
| Password usata come chiave | Diretta | PBKDF2 600k iterazioni |
| IV | Fisso | Random per ogni record |
| AES mode | CBC | GCM (autenticato) |
| Salt | Fisso | Random 256-bit |
| Integrità dati | Nessuna | HMAC-SHA256 anti-tampering |
| Biometria | N/A | WebAuthn 2FA locale |
| Rate limiting | Nessuno | 5 tentativi / 5 min, persistente |
| Auto-lock | Nessuno | Timer configurabile + background |
| XSS protection | N/A (nativo) | DOMPurify |
| Password health | Nessuna | HIBP k-anonymity |
| Backup | Manuale | Google Drive automatico |
| Platform | Android/iOS | Web (qualsiasi OS/device) |

---

## PWA Features

- Installabile (Add to Home Screen) su Android, iOS, Windows, macOS
- Offline-first con Service Worker
- Responsive: layout desktop con sidebar, mobile con bottom nav
- Auto-aggiornamento con notifica

---
