import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';
import './i18n/config';
import { configureDOMPurify } from './services/securityUtils';
import { registerSW } from 'virtual:pwa-register'

registerSW({ immediate: true });

configureDOMPurify();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
