import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import i18n from './i18n';
import '../styles/main.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Set text direction based on language (RTL for Arabic)
const setDir = (lng) => {
  const isRtl = /^ar(\b|[-_])/i.test(lng);
  document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', lng);
};

setDir(i18n.language || 'fr');
i18n.on('languageChanged', (lng) => setDir(lng));