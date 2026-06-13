// Converts the VAPID public key (base64url) to the Uint8Array required by
// pushManager.subscribe({ applicationServerKey }).
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** Thrown by subscribeToPush() when the user declines the browser permission prompt. */
export class PushPermissionDeniedError extends Error {
  constructor() {
    super('Permiso de notificaciones denegado');
    this.name = 'PushPermissionDeniedError';
  }
}

/**
 * Whether the browser can receive web push. On iOS Safari this is only true once
 * the app runs as an installed PWA (PushManager is otherwise absent from window).
 */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Requests notification permission, registers the service worker, subscribes to
 * push and persists the subscription server-side. Throws PushPermissionDeniedError
 * if the user declines, or a generic Error if any later step fails (cleaning up a
 * half-created subscription on the way out).
 */
export async function subscribeToPush(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new PushPermissionDeniedError();
  }
  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
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
  } catch (err) {
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      await existing?.unsubscribe();
    } catch {
      /* best-effort cleanup */
    }
    throw err;
  }
}
