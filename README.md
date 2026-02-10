# SafeProfiles PWA

Porting PWA della app Xamarin SafeProfiles con crittografia migliorata.

## 🔐 Schema Crittografico

Implementa lo schema usato dai password manager professionali (Bitwarden, 1Password):

```
Password utente
   ↓
PBKDF2 (600k iterations)
   ↓
KEK (Key Encryption Key)
   ↓
sblocca
   ↓
DEK (Data Encryption Key) random
   ↓
AES-256-GCM
   ↓
JSON cifrati in IndexedDB
```

### Miglioramenti rispetto a Xamarin

| Aspetto | Xamarin (originale) | PWA (nuovo) |
|---------|---------------------|-------------|
| Password come chiave | ❌ sì | ✅ no (usa KDF) |
| IV random | ❌ no (fisso) | ✅ sì (sempre diverso) |
| AES autenticato | ❌ no (CBC) | ✅ GCM |
| Salt sicuro | ❌ fisso | ✅ random |
| Iterazioni KDF | 300 | 600,000 |
| Cambio password | impossibile | banale |
| Export/import | fragile | sicuro |

## 🚀 Setup

```bash
# 1. Installa dipendenze
npm install

# 2. Avvia in dev
npm run dev

# 3. Build per produzione
npm run build

# 4. Preview build
npm run preview
```

## 📁 Struttura

```
safeprofiles-pwa/
├── src/
│   ├── services/
│   │   ├── cryptoService.js      # ⚡ Core crittografico
│   │   └── databaseService.js    # 💾 IndexedDB + Dexie
│   ├── contexts/
│   │   └── AuthContext.jsx       # 🔑 Stato autenticazione
│   ├── pages/
│   │   ├── SignUpPage.jsx        # 🆕 Prima volta
│   │   ├── LoginPage.jsx         # 🔓 Unlock
│   │   ├── MainPage.jsx          # 📋 Lista profili
│   │   ├── ProfileFormPage.jsx   # ✏️ Crea/modifica
│   │   └── ProfileDetailPage.jsx # 👁️ Visualizza
│   ├── App.jsx                   # 🧭 Router
│   ├── main.jsx                  # 🏁 Entry point
│   └── index.css                 # 🎨 Tailwind
├── index.html
├── vite.config.js
├── tailwind.config.js
└── package.json
```

## 🔑 Come Funziona

### 1️⃣ Prima Volta (Setup)

```javascript
// L'utente sceglie la password
const password = "mia-password-sicura";

// Il sistema:
// 1. Genera salt random (32 byte)
// 2. Genera DEK random (32 byte)
// 3. Deriva KEK da password + salt (PBKDF2, 600k iter)
// 4. Cifra DEK con KEK
// 5. Salva in IndexedDB:
{
  salt: "...",
  encryptedDEK: "...",
  iv: "..."
}
```

**⚠️ Password mai salvata in chiaro**  
**⚠️ DEK mai salvata in chiaro**

### 2️⃣ Login (Unlock)

```javascript
// L'utente inserisce la password
const password = "mia-password-sicura";

// Il sistema:
// 1. Recupera salt + encryptedDEK dal DB
// 2. Rideriva KEK da password + salt
// 3. Tenta di decifrare encryptedDEK
// 4. Se succede → password corretta, DEK in RAM
// 5. Se fallisce → password errata
```

### 3️⃣ Salva Profilo

```javascript
const profile = {
  title: "Facebook",
  username: "user@example.com",
  password: "secret123",
  // ...
};

// Il sistema:
// 1. Serializza JSON
// 2. Genera IV random (12 byte)
// 3. Cifra con AES-GCM usando DEK (in RAM)
// 4. Salva in IndexedDB:
{
  iv: "...",
  data: "...",  // ciphertext
  category: "WEB"  // non cifrato per filtri
}
```

### 4️⃣ Carica Profili

```javascript
// Il sistema:
// 1. Carica tutti i record cifrati da IndexedDB
// 2. Per ogni record:
//    - Prende IV e ciphertext
//    - Decifra con AES-GCM usando DEK (in RAM)
//    - Deserializza JSON
// 3. Mostra all'utente
```

## 🛡️ Sicurezza

### Cosa È Protetto

✅ **Dati a riposo**: tutto cifrato con AES-256-GCM  
✅ **Password**: mai salvata, usata solo per derivare KEK  
✅ **Brute-force**: 600k iterazioni PBKDF2  
✅ **Integrità**: GCM garantisce autenticità  
✅ **Pattern**: IV sempre random

### Cosa NON È Protetto

❌ **Keylogger**: se qualcuno registra la password mentre digiti  
❌ **RAM dump**: se qualcuno accede alla RAM mentre app è unlocked  
❌ **XSS**: se il sito ha vulnerabilità JavaScript  
❌ **Device fisico**: se qualcuno ha accesso al device unlocked

### Minacce Mitigate

| Minaccia | Protezione |
|----------|------------|
| DB rubato | ✅ Inutilizzabile senza password |
| Password debole | ⚠️ Indicatore forza + 600k iter |
| Rainbow table | ✅ Salt random |
| Replay attack | ✅ IV sempre diverso |
| Bit flipping | ✅ GCM rileva modifiche |
| Padding oracle | ✅ GCM non usa padding |

## 📦 Export/Import

Il formato di export è:

```json
{
  "version": 1,
  "exportDate": "2025-02-05T...",
  "crypto": {
    "salt": "...",
    "encryptedDEK": "...",
    "iv": "..."
  },
  "profiles": [
    {
      "iv": "...",
      "data": "...",
      "category": "WEB"
    }
  ]
}
```

**Su altro device:**
1. Importa il file JSON
2. Inserisci la stessa password
3. Il sistema ricrea KEK → sblocca DEK → tutto funziona

## 🏗️ Stack Tecnologico

- **React 18** - UI
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **React Router** - Navigation
- **Dexie.js** - IndexedDB wrapper
- **hash-wasm** - PBKDF2 veloce
- **Web Crypto API** - AES-GCM nativo
- **Vite PWA Plugin** - Service worker

## 🔧 Prossimi Step

Funzionalità da implementare:

- [ ] Tutorial iniziale (come Xamarin)
- [x] Impostazioni (biometric, 2FA, tema)
- [ ] Password generator avanzato
- [ ] Ricerca migliorata
- [ ] Ordinamento (A-Z, data, categoria)
- [ ] Export/Import completo da altri profili
- [ ] Condivisione profili cifrati
- [ ] Generatore OTP (TOTP)
- [ ] Statistiche (profili per categoria)
- [ ] Backup automatico
- [ ] Tema dark
- [ ] Multi-lingua



## 🐛 Debug

### IndexedDB

Chrome DevTools → Application → IndexedDB → SafeProfilesDB

Vedrai:
- `config` table: configurazione crypto
- `profiles` table: profili cifrati

### Crypto in RAM

```javascript
// Console del browser
cryptoService.isUnlocked  // true/false
cryptoService.dek         // Uint8Array o null
```

## 📝 Note per lo Sviluppo

1. **Non usare asimmetrico**: per questo caso d'uso è overkill
2. **IV sempre random**: mai riusare
3. **GCM sempre**: CBC è obsoleto per nuovi progetti
4. **PBKDF2 o Argon2**: mai password → chiave diretta
5. **Salt sempre random**: mai fisso
6. **600k+ iterazioni**: bilanciare sicurezza/UX

## 🤝 Differenze con Xamarin

| Feature | Xamarin | PWA |
|---------|---------|-----|
| Platform | Android/iOS | Web (qualsiasi OS) |
| Database | SQLite | IndexedDB |
| Crypto | System.Security | Web Crypto API |
| AES mode | CBC (inferito) | GCM |
| KDF | PBKDF2 (300 iter) | PBKDF2 (600k iter) |
| IV | Fisso | Random |
| Autenticazione | ❌ | ✅ (GCM) |

## ⚡ Performance

- **PBKDF2**: ~500ms su device medio (600k iterazioni)
- **Encrypt**: ~1-2ms per profilo
- **Decrypt**: ~1-2ms per profilo
- **IndexedDB**: async, non blocca UI

## 📱 PWA Features

- ✅ Installabile (Add to Home Screen)
- ✅ Offline-first (Service Worker)
- ✅ Responsive (mobile + desktop)
- ✅ Fast (Vite + lazy loading)

## 🔒 Privacy

- ✅ Zero telemetria
- ✅ Nessun server
- ✅ Nessuna terza parte
- ✅ Tutto locale (device)
- ✅ Open source

## 📄 Licenza

MIT - Usa pure come vuoi

---

**Made with ❤️ by Claude & You**
