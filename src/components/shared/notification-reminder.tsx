'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { subscribeToPush, PushPermissionDeniedError, isPushSupported } from '@/lib/push/client';

/**
 * Per-browser-session flag. We re-prompt on every fresh visit (a new tab/session
 * or a reload) while the player has no subscription, but stay quiet during a
 * single session once dismissed so client-side navigations don't re-pop the modal.
 */
const DISMISS_KEY = 'lpt-notif-reminder-dismissed';

function sessionDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === 'true';
  } catch {
    return false;
  }
}

function rememberDismissed() {
  try {
    sessionStorage.setItem(DISMISS_KEY, 'true');
  } catch {
    /* sessionStorage blocked (private mode, etc.) — nothing to persist */
  }
}

/**
 * Centered modal nudging a logged-in player to enable push notifications.
 * Renders nothing unless push is actually available, the player isn't already
 * subscribed, and they haven't dismissed it this session. Gating to logged-in
 * players happens on the server (see the layout); this component handles the
 * client-only checks the server can't see.
 */
export function NotificationReminder() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isPushSupported() || sessionDismissed()) return;
    let cancelled = false;
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!cancelled && !sub) setOpen(true);
      })
      .catch(() => {
        /* can't determine subscription state — don't nag */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss() {
    rememberDismissed();
    setOpen(false);
  }

  async function enable() {
    setBusy(true);
    try {
      await subscribeToPush();
      toast.success('Notificaciones activadas');
      setOpen(false);
    } catch (err) {
      if (err instanceof PushPermissionDeniedError) {
        // Once denied the browser won't re-show its prompt, so stop nudging this session.
        toast.error('Permiso de notificaciones denegado');
        dismiss();
      } else {
        toast.error('No se pudieron activar las notificaciones');
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="notif-reminder-title"
      onClick={dismiss}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'grid',
        placeItems: 'center',
        padding: 20,
        paddingTop: 'calc(20px + env(safe-area-inset-top))',
        paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
        background: 'color-mix(in oklab, var(--bg) 55%, transparent)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        animation: 'fadeIn 0.18s ease',
      }}
    >
      <div
        className="lpt-card card-pad"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 380,
          textAlign: 'center',
          // El panel entra con scale+fade (no solo el backdrop): nada aparece de golpe.
          animation: 'popIn 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div style={{ fontSize: 40, lineHeight: 1 }} aria-hidden="true">
          🔔
        </div>
        <h2
          id="notif-reminder-title"
          className="display"
          style={{ fontSize: 24, margin: '12px 0 0' }}
        >
          No te pierdas nada
        </h2>
        <p className="muted small" style={{ margin: '8px 0 0', lineHeight: 1.45 }}>
          Activa las notificaciones y entérate al instante de tus próximos partidos,
          resultados y logros.
        </p>
        <div style={{ display: 'grid', gap: 10, marginTop: 20 }}>
          <button
            type="button"
            onClick={enable}
            disabled={busy}
            className="lpt-btn primary"
            style={{ width: '100%', opacity: busy ? 0.6 : 1 }}
          >
            {busy ? 'Activando…' : 'Activar notificaciones'}
          </button>
          <button
            type="button"
            onClick={dismiss}
            disabled={busy}
            className="lpt-btn"
            style={{ width: '100%' }}
          >
            Ahora no
          </button>
        </div>
      </div>
    </div>
  );
}
