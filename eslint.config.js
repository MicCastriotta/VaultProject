import js from '@eslint/js';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import securityPlugin from 'eslint-plugin-security';
import globals from 'globals';

export default [
  // File da ignorare
  {
    ignores: ['dist/**', 'node_modules/**', 'public/**']
  },

  // Base JS
  js.configs.recommended,

  // Security
  securityPlugin.configs.recommended,

  // React + React Hooks
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true }
      },
      globals: {
        ...globals.browser,  // window, document, navigator, crypto, localStorage, ecc.
        ...globals.es2021,
        // Vite define globals
        __APP_VERSION__: 'readonly',
        // Web API non incluse in globals.browser standard
        PublicKeyCredential: 'readonly',
      }
    },
    settings: {
      react: { version: 'detect' }
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,

      // React 17+ non richiede import React in scope
      'react/react-in-jsx-scope': 'off',

      // prop-types: irrilevante per security, progetto non usa TypeScript
      'react/prop-types': 'off',

      // Security: falsi positivi noti
      'security/detect-object-injection': 'off',        // object[key] usato in modo sicuro (dexie, i18n)
      'security/detect-non-literal-fs-filename': 'off', // nessun fs nel browser

      // React hooks: setState in useEffect è un pattern valido per guard conditions
      'react-hooks/set-state-in-effect': 'off',

      // no-redeclare: permette /* global */ comment se il global è già nel config
      'no-redeclare': ['error', { builtinGlobals: false }],
    }
  }
];
