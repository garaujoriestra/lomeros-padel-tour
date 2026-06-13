'use client';

import { useEffect } from 'react';

/**
 * Registra el service worker para TODOS los visitantes (no solo los que
 * activan las notificaciones push). Esto habilita el caché del app-shell, que
 * hace que las aperturas repetidas de la PWA pinten al instante.
 *
 * Se registra en el evento `load` para no competir con la descarga inicial de
 * HTML/JS en la primera visita.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch(() => {
          // Falla en silencio (modo privado, http sin localhost, etc.)
        });
    };

    if (document.readyState === 'complete') {
      register();
      return;
    }
    window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
