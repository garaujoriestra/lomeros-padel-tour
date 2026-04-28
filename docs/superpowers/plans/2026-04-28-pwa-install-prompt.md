# PWA Install Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dashboard banner that invites the user to install the LPT as a PWA, with platform-aware UX (Android Chrome native button via `beforeinstallprompt`, iOS Safari instructions, hidden when already installed or previously dismissed).

**Architecture:** Single new client component `<InstallPrompt />` rendered in the dashboard. All detection logic (already-installed, iOS Safari UA, beforeinstallprompt subscription, localStorage dismiss state) lives in `useEffect` on mount. The manifest at `src/app/manifest.ts` is already configured — no changes there.

**Tech Stack:** React 19 client component, Tailwind v4, browser APIs (`matchMedia`, `navigator.userAgent`, `beforeinstallprompt`, `localStorage`).

**Verification model:**
- Per task: `npx tsc --noEmit && npm run lint && npm test`. No new tests (browser-API logic).
- Manual smoke at the end on iOS Safari, Android Chrome, and desktop Chrome (post-deploy).

**Background:** spec at `docs/superpowers/specs/2026-04-28-pwa-install-prompt-design.md`. Read before starting.

**Notable constraints:**
- The component is `'use client'` because it depends on browser APIs.
- `beforeinstallprompt` is non-standard — define `BeforeInstallPromptEvent` type locally.
- Baseline: 103 tests across 11 files.

---

## Pre-flight

- [ ] **Step 0a: Create branch + baseline**

```bash
cd /Users/gar/Personal/ClaudeCode/lomeros-padel-tour
git checkout -b feature/pwa-install-prompt
npx tsc --noEmit && npm run lint && npm test
```

Expected: branch created. tsc/lint clean. 103/103 tests pass.

---

## Task 1: Create `<InstallPrompt />` component

**Files:**
- Create: `src/components/shared/install-prompt.tsx`

- [ ] **Step 1: Create the file**

Create `src/components/shared/install-prompt.tsx` with this content:

```tsx
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
```

- [ ] **Step 2: Type check + lint + tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. 103/103 tests.

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/install-prompt.tsx
git commit -m "feat(pwa): add InstallPrompt client component

Detects platform on mount: hides if already installed or
dismissed, shows a native button on Android Chrome via
beforeinstallprompt, or expandable instructions on iOS Safari.
Persists dismiss state in localStorage. Wiring into the
dashboard follows in next commit."
```

---

## Task 2: Wire `<InstallPrompt />` into the dashboard

**Files:**
- Modify: `src/app/(public)/page.tsx`

- [ ] **Step 1: Add the import**

At the top of `src/app/(public)/page.tsx`, next to the existing component imports, add:

```tsx
import { InstallPrompt } from '@/components/shared/install-prompt';
```

- [ ] **Step 2: Render the component**

Find the JSX of the page. The first child of the outer wrapper is the gradient header (the `<div>` with `bg-gradient-to-br from-green-950 ...` or similar). The structure looks roughly like:

```tsx
return (
  <div className="space-y-X">
    <div className="... gradient header ...">...</div>
    {/* Podio */}
    {topPlayers.length > 0 && (...)}
    {/* Próximos */}
    ...
  </div>
);
```

Insert `<InstallPrompt />` immediately AFTER the closing `</div>` of the gradient header section and BEFORE the podio block:

```tsx
    <InstallPrompt />
```

The `space-y-*` class on the outer wrapper handles vertical spacing automatically — no margin needed on the new component.

- [ ] **Step 3: Type check + lint + tests**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean. 103/103 tests.

- [ ] **Step 4: Commit**

```bash
git add 'src/app/(public)/page.tsx'
git commit -m "feat(pwa): render InstallPrompt on the dashboard

Placed after the gradient header and before the podio. The
component returns null in most cases (already installed,
dismissed, unsupported browser) so the layout is unchanged
for users who don't see the prompt."
```

---

## Task 3: Final verification + push

- [ ] **Step 1: Full verification**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tsc clean, lint clean, 103/103 tests pass.

- [ ] **Step 2: Build**

Run: `TURSO_DATABASE_URL="file:./.skip-db.sqlite" TURSO_AUTH_TOKEN="" npm run build && rm -f .skip-db.sqlite .skip-db.sqlite-journal`
Expected: build succeeds.

- [ ] **Step 3: Push branch**

```bash
git push -u origin feature/pwa-install-prompt
```

- [ ] **Step 4: Manual smoke test (post-deploy)**

After Vercel deploys main, test in real browsers:

**iPhone Safari (fresh, not installed):**
- Open the deployed URL.
- Banner "Instala LPT como app" should appear at the top of the dashboard with a "Cómo instalar →" link.
- Tap the link — instructions expand showing the 3 steps.
- Tap X — banner disappears.
- Reload — banner stays gone (localStorage dismiss is set).
- Manually add to home screen via Safari Share → Add to Home Screen.
- Open from home screen — banner does NOT appear (display-mode: standalone).

**Android Chrome (fresh, not installed):**
- Open the deployed URL.
- Banner with "📥 Instalar" button should appear (assuming Chrome fires beforeinstallprompt; if not, banner stays hidden — see risks in spec).
- Tap "Instalar" — Chrome's native install dialog appears.
- Accept — app installs, banner disappears.
- Open from home screen — banner does NOT appear.

**Desktop Chrome:**
- Open in regular tab — banner with "📥 Instalar" should appear.

**Desktop Firefox / mobile Firefox:**
- Banner does NOT appear (no `beforeinstallprompt`, not iOS Safari).

If on Android Chrome the banner does NOT appear despite a fresh install (no service worker installed): we'll iterate post-deploy with a fallback that shows manual instructions for Android. Out of scope for v1.

---

## Self-review (already done by author)

- **Spec coverage:**
  - `<InstallPrompt />` component → Task 1.
  - Dashboard integration → Task 2.
  - Manual smoke checklist → Task 3 step 4.
- **Placeholder scan:** No "TBD" or "implement later". All code blocks complete.
- **Type consistency:** `BeforeInstallPromptEvent` defined locally in the component file; `Mode` type exhaustive across branches.
- **Notable: no tests.** Browser-API logic; manual verification covers all flows.
