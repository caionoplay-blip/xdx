import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Registra Service Worker para PWA (instalável no Android/iPhone)
// Não registra dentro do APK nativo (Capacitor) - lá o app já é nativo
if ('serviceWorker' in navigator && !(window as any).Capacitor) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(
      (reg) => {
        console.log('[PWA] SW registrado:', reg.scope);
        // Verifica update a cada 60s
        setInterval(() => reg.update().catch(()=>{}), 60000);
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          if (worker) {
            worker.addEventListener('statechange', () => {
              if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[PWA] Nova versão disponível');
              }
            });
          }
        });
      },
      (err) => console.warn('[PWA] SW falhou:', err)
    );
  });
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
