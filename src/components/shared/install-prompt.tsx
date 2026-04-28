'use client';

import { useEffect, useState } from 'react';

/** Non-standard event fired by Chromium browsers when the PWA is installable. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Mode = 'hidden' | 'android' | 'ios';

const DISMISS_KEY = 'lpt-install-prompt-dismissed';

export function InstallPrompt() {
  const [mode, setMode] = useState<Mode>('hidden');
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosInstructionsOpen, setIosInstructionsOpen] = useState(false);

  useEffect(() => {
    // 1. Already installed?
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (isStandalone) return;

    // 2. Previously dismissed?
    try {
      if (localStorage.getItem(DISMISS_KEY) === 'true') return;
    } catch {
      // localStorage blocked (Safari private mode, etc.) — proceed anyway
    }

    // 3. iOS Safari?
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    if (isIOS && isSafari) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode('ios');
      return;
    }

    // 4. Android / desktop Chrome — wait for beforeinstallprompt
    function handler(e: Event) {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      setMode('android');
    }
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, 'true');
    } catch {
      // ignore
    }
    setMode('hidden');
  }

  async function handleInstall() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') {
      dismiss();
    }
    setInstallEvent(null);
    setMode('hidden');
  }

  if (mode === 'hidden') return null;

  return (
    <div className="bg-white rounded-2xl border border-green-200 shadow-sm p-4 flex items-start gap-3">
      <div className="text-3xl shrink-0" aria-hidden="true">📱</div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-gray-900 text-sm">Instala LPT como app</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Acceso directo desde tu pantalla de inicio, sin barra del navegador.
        </p>
        {mode === 'android' && (
          <button
            type="button"
            onClick={handleInstall}
            className="mt-3 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg"
          >
            📥 Instalar
          </button>
        )}
        {mode === 'ios' && (
          <>
            <button
              type="button"
              onClick={() => setIosInstructionsOpen((v) => !v)}
              className="mt-3 text-sm font-bold text-green-700 hover:text-green-900"
            >
              {iosInstructionsOpen ? 'Ocultar instrucciones ↑' : 'Cómo instalar →'}
            </button>
            {iosInstructionsOpen && (
              <ol className="mt-3 text-xs text-gray-600 space-y-1 list-decimal pl-4">
                <li>
                  Toca el botón <strong>Compartir</strong> ⬆️ en la barra inferior de Safari.
                </li>
                <li>
                  Desplázate y toca <strong>&quot;Añadir a pantalla de inicio&quot;</strong>.
                </li>
                <li>
                  Confirma con <strong>&quot;Añadir&quot;</strong> arriba a la derecha.
                </li>
              </ol>
            )}
          </>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Descartar"
        className="text-gray-400 hover:text-gray-600 shrink-0 text-lg leading-none"
      >
        ✕
      </button>
    </div>
  );
}
