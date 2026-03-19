import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Plugin personalizzato per aggiungere CSP headers
function cspPlugin() {
  // CSP per produzione (iniettata come meta tag nel build output)
  // Nota: frame-ancestors non funziona nei meta tag (limitazione spec) — impostarlo via HTTP header lato server
  const PROD_CSP = [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval' https://apis.google.com https://accounts.google.com",  // wasm-unsafe-eval per hash-wasm; apis.google.com per Drive Picker; accounts.google.com per GIS (gsi/client)
    "style-src 'self' 'unsafe-inline'",           // Tailwind richiede inline styles
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://www.googleapis.com https://oauth2.googleapis.com https://accounts.google.com https://api.pwnedpasswords.com",
    "frame-src https://content.googleapis.com https://docs.google.com",  // Google Drive Picker usa iframe da questi domini
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests"
  ].join('; ');

  let isBuild = false;

  return {
    name: 'csp-plugin',

    configResolved(config) {
      isBuild = config.command === 'build';
    },

    // Dev: mock in-memory del relay Cloudflare KV (non serve wrangler in locale)
    configureServer(server) {
      const relayStore = new Map(); // id → { payload, expiresAt }
      const RELAY_TTL_MS = 48 * 60 * 60 * 1000;

      server.middlewares.use('/api/relay', (req, res, next) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');

        // POST /api/relay — crea entry
        if (req.method === 'POST' && req.url === '/') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              if (!parsed.type || !parsed.v) throw new Error('Invalid');
              const id = Array.from(crypto.getRandomValues(new Uint8Array(16)))
                .map(b => b.toString(16).padStart(2, '0')).join('');
              const expiresAt = new Date(Date.now() + RELAY_TTL_MS).toISOString();
              relayStore.set(id, { payload: body, expiresAt });
              res.writeHead(201);
              res.end(JSON.stringify({ id, expiresAt }));
            } catch {
              res.writeHead(400);
              res.end(JSON.stringify({ error: 'Invalid payload' }));
            }
          });
          return;
        }

        // GET /api/relay/:id — recupera entry
        if (req.method === 'GET' && req.url.length > 1) {
          const id = req.url.slice(1);
          const entry = relayStore.get(id);
          if (!entry || Date.now() > new Date(entry.expiresAt).getTime()) {
            relayStore.delete(id);
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found or expired' }));
            return;
          }
          res.writeHead(200);
          res.end(entry.payload);
          return;
        }

        next();
      });

      server.middlewares.use((req, res, next) => {
        // COOP: same-origin-allow-popups permette al popup OAuth di Google
        // di comunicare con window.opener (necessario per il flusso OAuth)
        // Nota produzione: impostare questo header a livello server (nginx/apache/hosting)
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

        if (req.url === '/' || req.url === '/index.html') {
          res.setHeader('Content-Security-Policy', [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://apis.google.com https://www.googleapis.com https://accounts.google.com",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "font-src 'self' data:",
            "connect-src 'self' https://www.googleapis.com https://oauth2.googleapis.com https://accounts.google.com https://api.pwnedpasswords.com",
            "frame-src https://content.googleapis.com https://docs.google.com",  // Google Drive Picker
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
            "upgrade-insecure-requests"
          ].join('; '));
        }
        next();
      });
    },

    // Produzione: inietta meta tag CSP nell'index.html del build (non in dev)
    transformIndexHtml(html) {
      if (!isBuild) return html;
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${PROD_CSP}" />`
      );
    }
  };
}

export default defineConfig({
  build: {    
    sourcemap: true, // permette di vedere i file originali in DevTools
    minify: false, 
    modulePreload: { polyfill: false }, // evita lo script inline del polyfill (incompatibile con CSP strict)
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/simple-icons')) return 'vendor-simple-icons';
          if (id.includes('node_modules/react') ||
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/react-router-dom')) return 'vendor-react';
          if (id.includes('node_modules/hash-wasm') ||
              id.includes('node_modules/dexie')) return 'vendor-crypto';
          if (id.includes('node_modules/i18next') ||
              id.includes('node_modules/react-i18next')) return 'vendor-i18n';
          if (id.includes('node_modules/otpauth')) return 'vendor-otp';
        }
      }
    }
  },
  plugins: [
    react(),
    cspPlugin(), // Aggiunge CSP headers durante lo sviluppo
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg', 'icons/appicon.png', 'icons/landscape.png'],
      devOptions: {
        enabled: true
      },
      manifest: {
        name: 'OwnVault',
        short_name: 'OwnVault',
        description: 'OwnVault. Your Keys. Your Control',
        theme_color: '#0f172a',
        background_color: '#1e293b',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        orientation: 'portrait',
        file_handlers: [
          {
            action: '/',
            accept: {
              // Tipo custom (per completezza e futura compatibilità)
              'application/x-ownvault': ['.ownv'],
              // application/octet-stream: necessario per Android, dove i file scaricati
              // tramite Blob URL vengono salvati con questo MIME type e il sistema
              // cerca un handler compatibile. Il match avviene solo se MIME + estensione
              // corrispondono entrambi, quindi non cattura file binari generici.
              'application/octet-stream': ['.ownv']
            }
          }
        ],
        icons: [
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ],
        screenshots: [
          {
            src: '/icons/portrait.png',
            sizes: '614x768',
            type: 'image/png',
            form_factor: 'narrow'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3 MB
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  server: {
      port: 3000,
      allowedHosts: [
          'ownvault.eu',
          'localhost'          
      ]
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
  }
});