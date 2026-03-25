# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Dev server on port 3000 (Service Worker active in dev)
npm run build      # Production build to dist/
npm run preview    # Preview production build locally
npm run lint       # ESLint on src/
```

No test framework is configured.

The dev server (`vite.config.js`) includes an in-memory mock of the Cloudflare relay API (`/api/relay`, `/api/identity`) and the Google token exchange endpoint (`/api/gtoken`), so `wrangler` is not needed for local development. The `/api/gtoken` mock proxies to Google only if `VITE_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set in `.env.local`; otherwise it returns a 501 with an explanatory hint.

## Deployment

Cloudflare Pages. The `functions/` directory contains Cloudflare Pages Functions (edge workers). KV namespace bindings required in the dashboard:
- `OV_RELAY` — temporary encrypted payload storage (TTL 24h)
- `OV_IDENTITY` — public key directory (TTL 6 months)

Environment variables required in Cloudflare Pages dashboard (Settings → Environment variables):
- `VITE_GOOGLE_CLIENT_ID` — Google OAuth client ID (same as frontend)
- `GOOGLE_CLIENT_SECRET` — Google OAuth client secret (**no** `VITE_` prefix; server-side only, never in the frontend bundle)

## Architecture

### Crypto schema

All profile data is encrypted at rest. The key hierarchy:

```
Master password → PBKDF2 (600k iterations, SHA-512) → KEK
KEK decrypts → DEK (random 256-bit, stored encrypted in IndexedDB config)
DEK → AES-256-GCM → encrypts all profile plaintext fields

DEK → HKDF (SHA-256) → Integrity Key (IK)
IK → HMAC-SHA256 over (cryptoConfig + all profiles) → stored as "integrity" in config table
```

When Device Secret Key (DSK) is enabled:
```
HKDF(PBKDF2(password), salt=DSK, info="OwnVault-vault-v2") → KEK
DSK wrapped with WebAuthn PRF output, stored in IndexedDB "deviceSecret" config entry
```

### Profile search and decryption

`MainPage` decrypts **all** profiles on load and filters client-side in JS — it does **not** use `databaseService.searchProfiles()` or the `*searchTerms` DB index. The `searchTerms` index exists on the `profiles` table but is only written (not read back) by the current codebase; it was designed for a future server-side search and can be ignored when reading profiles. Filtering happens in-memory on the already-decrypted array.

### IndexedDB schema (`databaseService.js`)

Currently at **version 4**. When adding tables or indexes, add a new `this.version(N).stores({...})` block — never modify existing versions. Increment `HMAC_VERSION` in `cryptoService.js` when the HMAC payload structure changes (triggers automatic regeneration on next login, no false tamper alerts).

Encrypted profile records store only: `iv`, `data` (ciphertext), `category` (unencrypted index), `searchTerms` (unencrypted index), timestamps. All other fields live inside the encrypted `data` blob.

### Input sanitization

Every profile save must pass all string fields through `validators.*` from `securityUtils.js` before encrypting. Never pass raw `formData` values directly to `cryptoService.encryptData`. Available validators: `title`, `username`, `email`, `url`, `notes`, `cardNumber`, `cvv`, `text(value, maxLength)`. The `url` validator auto-prepends `https://` if no protocol is present and blocks `javascript:`, `data:`, `vbscript:`.

### Mandatory post-write operations

Every operation that saves or deletes a profile **must** call:
```js
await refreshHMAC();          // recalculates HMAC-SHA256 over all profiles
healthCache.clear();          // prevents decrypted data leaking across sessions
await syncService.triggerSync(); // triggers Google Drive sync if enabled
```

`refreshHMAC` is from `useAuth()`. `healthCache` is the in-memory cache in `healthCacheService.js` (cleared also on lock/logout).

### `__APP_VERSION__` global

Injected by Vite via `define: { __APP_VERSION__: ... }` in `vite.config.js` (value = `package.json` version). Any file that references it must include `/* global __APP_VERSION__ */` to suppress the linter warning.

### Google Drive sync

Requires three env vars: `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_API_KEY` (frontend, Google Cloud Console) plus `GOOGLE_CLIENT_SECRET` (server-side only, Cloudflare Pages). Without the client ID / API key the sync feature silently fails to initialize.

**OAuth flow: Authorization Code (not implicit).** `googleDriveService` uses `initCodeClient` (GIS) which opens a popup, receives an authorization code, then exchanges it server-side via `POST /api/gtoken` (`functions/api/gtoken.js`) for an `access_token` + `refresh_token`. The refresh token is encrypted with the vault's DEK and stored in IndexedDB `config` table as `googleRefreshToken`. Subsequent token renewals are fully silent (no popup): `restoreSession()` decrypts the refresh token and calls `/api/gtoken` with `{ refresh_token }`.

`googleDriveService.init()` must be called **before** the user gesture that triggers `requestCode()`, otherwise iOS Safari blocks the OAuth popup. `SignUpPage` calls `init()` at mount for this reason — replicate this pattern anywhere Drive is accessed for the first time.

**Onboarding edge case:** during SignUpPage Drive restore the vault DEK is not yet available. The refresh token is saved temporarily to `sessionStorage` as `ov_pending_drive_token` and encrypted into IndexedDB in `_finalizeLogin()` after the first vault unlock.

**`importData()` preservation:** `googleRefreshToken` in the `config` table must be re-saved after `deleteAllData()` (like `deviceSecret` and `biometric`) so users do not lose their Drive connection after a sync conflict resolution or data import.

Attachment binaries **do not** travel inside `ownvault-sync.json`. They are uploaded as separate Drive files; the sync JSON stores only a `driveFileId` reference. Attachments without a `driveFileId` are excluded from sync. On a new device, attachment content is lazy-downloaded on first open (`syncService.ensureAttachmentLocal`).

### Relay (E2E encrypted sharing)

`functions/api/relay/` — Cloudflare KV-backed relay. Zero-knowledge: server stores ciphertext only. Payload types currently validated: `invite`, `profile`. Adding a new type requires updating the validation in `functions/api/relay/index.js`.

The relay supports `recipientFp` (16 hex chars) for inbox routing and `_wth` (SHA-256 of a write token) for authorized deletion.

Profile sharing between OwnVault users (`contactsService.encryptProfileForContact`) uses ephemeral ECDH P-256 for forward secrecy — a new keypair is generated per send. The `writeToken` (random 16 hex bytes) is embedded inside the ciphertext as `_wt`; only the recipient can extract it and use it to authorize relay DELETE.

The identity directory (`OV_IDENTITY` KV) is separate from the relay. Registration requires `{ fingerprint, pk, deleteTokenHash }`; `GET /api/identity/:fp` returns only `{ pk }`. Removal requires `DELETE` with `{ deleteToken }` in the body — the server verifies `SHA-256(deleteToken) == deleteTokenHash`. This is different from the relay DELETE which uses `writeToken`/`_wth`.

### Auth flow (`AuthContext.jsx`)

Three unlock paths depending on DSK state:
1. No DSK → `unlock(password, cryptoConfig)`
2. DSK + local biometric → WebAuthn PRF unwraps DSK → `unlockWithDSK(...)`
3. DSK + no local credential → recovery key or QR device approval → `loginWithRecoveryKey()` / `loginWithApprovedDSK()`

Rate limiter: 5 attempts / 5 minutes. Auto-lock timer resets on any user interaction; also fires when the app goes to background for longer than the configured threshold.

### localStorage / sessionStorage keys

| Key | Storage | Purpose |
|---|---|---|
| `tutorialCompleted` | local | Skip tutorial on subsequent visits |
| `ownvault_device_id` | local | Stable device ID for sync conflict display |
| `ownvault_google_token` / `_expires` | local | Short-lived access token cache (~1h); real long-lived credential is the refresh token in IndexedDB |
| `_sp_sec_rl` | local | Persisted rate-limiter state (survives page reload) |
| `ov_splash_shown` | session | Show splash screen once per session |
| `ov_pending_drive_token` | session | Refresh token saved during onboarding Drive restore (before vault DEK is available); encrypted into IndexedDB in `_finalizeLogin()` |
| `ov_pending_relay_id` | session | Relay ID saved before redirect to login (deep link `/receive/:id`) |
| `ov_pending_for_contacts` | session | Fetched relay payload pending display in ContactsPage |
| `mainSearchTerm` | session | Search term persisted across navigations in MainPage |
| `profileSortOrder` | local | Last chosen sort order in MainPage |
| `contacts_guide_seen` | local | Suppress first-use guide in ContactsPage |

### i18n

Two locale files: `src/i18n/locales/en.json` and `it.json`. Both must be updated whenever new translation keys are added.

### Page layout pattern

All authenticated pages use this fixed-header + scrollable-body structure:
```jsx
<div className="h-full flex flex-col">
  <div className="max-w-2xl mx-auto w-full flex flex-col flex-1 min-h-0 p-6">
    <div className="flex items-center ..."> {/* header - does not scroll */} </div>
    <div className="flex-1 overflow-y-auto">
      <div className="space-y-4 pb-6"> {/* content */} </div>
    </div>
  </div>
</div>
```

### Theme

`ThemeContext` sets `data-theme="dark|light"` on `document.documentElement`. Light mode overrides are in `src/index.css` using `[data-theme="light"] selector { property: value !important; }`. Default is dark.
