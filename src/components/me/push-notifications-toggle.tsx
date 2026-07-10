'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { subscribeToPush, PushPermissionDeniedError } from '@/lib/push/client';

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
      await subscribeToPush();
      setState('on');
      toast.success('Notificaciones activadas');
    } catch (err) {
      if (err instanceof PushPermissionDeniedError) {
        toast.error('Permiso de notificaciones denegado');
      } else {
        toast.error('No se pudieron activar las notificaciones');
      }
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
    <div className="rounded-xl border border-line bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-foreground">🔔 Notificaciones</h3>
          <p className="text-sm text-ink-3">
            Recordatorios de partido, resultados y logros.
          </p>
        </div>
        {state === 'loading' && <span className="text-sm text-ink-3">…</span>}
        {state === 'unsupported' && (
          <span className="text-sm text-ink-3">No soportado</span>
        )}
        {state === 'off' && (
          <button
            type="button"
            aria-label="Activar notificaciones"
            onClick={enable}
            disabled={busy}
            className="rounded-lg bg-primary px-4 py-2 min-h-11 text-sm font-semibold text-primary-foreground disabled:opacity-50"
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
            className="rounded-lg border border-line px-4 py-2 min-h-11 text-sm font-semibold text-ink-2 disabled:opacity-50"
          >
            Desactivar
          </button>
        )}
      </div>
      {state === 'needs-install' && (
        <p className="mt-3 rounded-lg bg-warn/10 p-3 text-sm text-warn">
          Para recibir notificaciones en iPhone, añade la app a tu pantalla de inicio:
          pulsa <strong>Compartir</strong> → <strong>Añadir a pantalla de inicio</strong>, y
          ábrela desde ahí.
        </p>
      )}
    </div>
  );
}
