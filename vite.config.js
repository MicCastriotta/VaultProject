import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Plugin personalizzato per aggiungere CSP headers
function cspPlugin() {
  return {
    name: 'csp-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Applica CSP header a tutte le risposte HTML
        if (req.url === '/' || req.url === '/index.html') {
          res.setHeader('Content-Security-Policy', [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://www.googleapis.com",
            "style-src 'self' 'unsafe-inline'", // Tailwind necessita inline styles
            "img-src 'self' data: blob:",
            "font-src 'self' data:",
            "connect-src 'self' https://www.googleapis.com https://oauth2.googleapis.com https://www.google.com",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
            "upgrade-insecure-requests"
          ].join('; '));
        }
        next();
      });
    }
  };
}

export default defineConfig({
  build: {
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
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      devOptions: {
        enabled: true
      },
      manifest: {
        name: 'OwnVault',
        short_name: 'OwnVault',
        description: 'OwnVault. Your Keys. Your Control',
        theme_color: '#2196F3',
        background_color: '#ffffff',
        display: 'standalone',
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
          'ownvault.eu'
      ]
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
  }
});