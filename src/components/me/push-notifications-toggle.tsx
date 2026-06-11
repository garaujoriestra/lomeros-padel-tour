'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { urlBase64ToUint8Array } from '@/lib/push/client';

type State = 'loading' | 'unsupported' | 'needs-install' | 'off' | 'on';

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function PushNotificationsToggle() {
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!supported) {
      // En iOS, sin instalar como PWA, PushManager no está disponible.
      setState(isIos() && !isStandalone() ? 'needs-install' : 'unsupported');
      return;
    }
    if (isIos() && !isStandalone()) {
      setState('needs-install');
      return;
    }
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? 'on' : 'off'))
      .catch(() => setState('unsupported'));
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.error('Permiso de notificaciones denegado');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) as Uint8Array<ArrayBuffer>,
      });
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: JSON.parse(JSON.stringify(sub)) }),
      });
      if (!res.ok) throw new Error('subscribe failed');
      setState('on');
      toast.success('Notificaciones activadas');
    } catch {
      try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        await existing?.unsubscribe();
      } catch {
        /* best-effort cleanup */
      }
      toast.error('No se pudieron activar las notificaciones');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        });
      }
      setState('off');
      toast.success('Notificaciones desactivadas');
    } catch {
      toast.error('No se pudieron desactivar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-gray-800">🔔 Notificaciones</h3>
          <p className="text-sm text-gray-500">
            Recordatorios de partido, resultados y logros.
          </p>
        </div>
        {state === 'loading' && <span className="text-sm text-gray-400">…</span>}
        {state === 'unsupported' && (
          <span className="text-sm text-gray-400">No soportado</span>
        )}
        {state === 'off' && (
          <button
            type="button"
            aria-label="Activar notificaciones"
            onClick={enable}
            disabled={busy}
            className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Activar
          </button>
        )}
        {state === 'on' && (
          <button
            type="button"
            aria-label="Desactivar notificaciones"
            onClick={disable}
            disabled={busy}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50"
          >
            Desactivar
          </button>
        )}
      </div>
      {state === 'needs-install' && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Para recibir notificaciones en iPhone, añade la app a tu pantalla de inicio:
          pulsa <strong>Compartir</strong> → <strong>Añadir a pantalla de inicio</strong>, y
          ábrela desde ahí.
        </p>
      )}
    </div>
  );
}
