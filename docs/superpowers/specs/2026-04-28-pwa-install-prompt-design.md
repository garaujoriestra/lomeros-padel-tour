# PWA install prompt — Spec

## Contexto

Bloque 4 del roadmap. La app ya está configurada como PWA básica vía `src/app/manifest.ts` (Next.js metadata route): nombre, short_name, theme_color, background_color, start_url, display=standalone, e iconos 192×192 y 180×180. Pero los usuarios no descubren que pueden instalarla — Android Chrome muestra un icono pequeño en la URL bar que pasa desapercibido, y iOS Safari requiere "Share → Añadir a pantalla de inicio" sin pista alguna.

Este bloque añade un **install prompt** visible en el dashboard que guía al usuario a instalar la app, con UX específico por plataforma.

## Objetivos

- Banner informativo en el dashboard que invita a instalar la app.
- Detección automática de plataforma (Android Chrome/Edge → botón nativo, iOS Safari → instrucciones, ya instalada → oculto).
- Banner descartable con persistencia en localStorage (un dismiss = se acabó).

## Fuera de alcance

- **Service worker / offline support.** La app sigue requiriendo conexión.
- **Push notifications.**
- **Splash screen custom.** El manifest existente ya genera uno básico con el icono.
- **Analytics** de cuántos usuarios instalan.
- **Soporte para Firefox móvil / otros navegadores raros.** Solo Android Chrome family + iOS Safari, que son ~95% del tráfico.

---

## Diseño

### 1. Componente `<InstallPrompt />`

**Archivo:** `src/components/shared/install-prompt.tsx`

Client component (`'use client'`). Toda la lógica vive en el cliente porque depende de browser APIs (matchMedia, navigator, beforeinstallprompt, localStorage).

### 2. Estado interno

```ts
type Mode = 'hidden' | 'android' | 'ios';

const [mode, setMode] = useState<Mode>('hidden');
const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
const [iosInstructionsOpen, setIosInstructionsOpen] = useState(false);
```

### 3. Detección — `useEffect` al montar

```ts
useEffect(() => {
  // 1. Already installed? (Android: matchMedia, iOS: navigator.standalone)
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (isStandalone) return;  // mode stays 'hidden'

  // 2. User dismissed already?
  if (localStorage.getItem('lpt-install-prompt-dismissed') === 'true') return;

  // 3. iOS Safari detection (UA — imperfect but adequate)
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  if (isIOS && isSafari) {
    setMode('ios');
    return;
  }

  // 4. Android Chrome / Edge / Desktop Chrome — wait for beforeinstallprompt
  const handler = (e: Event) => {
    e.preventDefault();  // we'll trigger it ourselves
    setInstallEvent(e as BeforeInstallPromptEvent);
    setMode('android');
  };
  window.addEventListener('beforeinstallprompt', handler);
  return () => window.removeEventListener('beforeinstallprompt', handler);
}, []);
```

The `BeforeInstallPromptEvent` type is non-standard:

```ts
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
```

Defined locally in the component file.

### 4. Acciones del usuario

**Click "Instalar" (Android):**
```ts
async function handleInstall() {
  if (!installEvent) return;
  await installEvent.prompt();
  const choice = await installEvent.userChoice;
  if (choice.outcome === 'accepted') {
    // Install accepted — also dismiss the banner so it doesn't re-show
    dismiss();
  }
  setInstallEvent(null);
  setMode('hidden');
}
```

**Click "Cómo instalar" (iOS):**
```ts
function toggleIosInstructions() {
  setIosInstructionsOpen((v) => !v);
}
```

**Click X (cualquier modo):**
```ts
function dismiss() {
  localStorage.setItem('lpt-install-prompt-dismissed', 'true');
  setMode('hidden');
}
```

### 5. Render — UX del banner

**Modo `hidden`:** `return null`.

**Modo `android`:**
```tsx
<div className="bg-white rounded-2xl border border-green-200 shadow-sm p-4 flex items-start gap-3">
  <div className="text-3xl shrink-0">📱</div>
  <div className="flex-1 min-w-0">
    <p className="font-bold text-gray-900 text-sm">Instala LPT como app</p>
    <p className="text-xs text-gray-500 mt-0.5">Acceso directo desde tu pantalla de inicio, sin barra del navegador.</p>
    <button onClick={handleInstall} className="mt-3 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg">
      📥 Instalar
    </button>
  </div>
  <button onClick={dismiss} aria-label="Descartar" className="text-gray-400 hover:text-gray-600 shrink-0">✕</button>
</div>
```

**Modo `ios`:**
```tsx
<div className="bg-white rounded-2xl border border-green-200 shadow-sm p-4 flex items-start gap-3">
  <div className="text-3xl shrink-0">📱</div>
  <div className="flex-1 min-w-0">
    <p className="font-bold text-gray-900 text-sm">Instala LPT como app</p>
    <p className="text-xs text-gray-500 mt-0.5">Acceso directo desde tu pantalla de inicio, sin barra del navegador.</p>
    <button onClick={toggleIosInstructions} className="mt-3 text-sm font-bold text-green-700 hover:text-green-900">
      Cómo instalar {iosInstructionsOpen ? '↑' : '→'}
    </button>
    {iosInstructionsOpen && (
      <ol className="mt-3 text-xs text-gray-600 space-y-1 list-decimal pl-4">
        <li>Toca el botón <strong>Compartir</strong> ⬆️ en la barra inferior de Safari.</li>
        <li>Desplázate y toca <strong>"Añadir a pantalla de inicio"</strong>.</li>
        <li>Confirma con <strong>"Añadir"</strong> arriba a la derecha.</li>
      </ol>
    )}
  </div>
  <button onClick={dismiss} aria-label="Descartar" className="text-gray-400 hover:text-gray-600 shrink-0">✕</button>
</div>
```

### 6. Integración en el dashboard

En `src/app/(public)/page.tsx`, importar y renderizar `<InstallPrompt />` justo después del header (la sección con el `bg-gradient-to-br from-green-950 via-green-900 ...`) y antes del podio.

Como es un client component, simplemente se importa y se renderiza — Next gestiona el boundary.

### 7. Tipos / defensiva

- El evento `beforeinstallprompt` es no-estándar — definimos `BeforeInstallPromptEvent` localmente con `prompt()` y `userChoice`.
- `navigator.standalone` es propio de iOS Safari — accedido vía type assertion.
- localStorage puede no estar disponible (modo privado en Safari ≤ algunos años) — todas las lecturas/escrituras protegidas con try/catch o detección.

---

## Archivos afectados

| Archivo | Cambio |
|---|---|
| `src/components/shared/install-prompt.tsx` | Nuevo. Client component con lógica completa. |
| `src/app/(public)/page.tsx` | Render `<InstallPrompt />` después del header, antes del podio. |

Sin cambios en schema, manifest, iconos. El manifest actual (`src/app/manifest.ts`) ya cubre los requerimientos.

---

## Testing

Sin tests automáticos. Razones:
- La lógica completa depende de browser APIs (beforeinstallprompt, navigator.standalone, matchMedia, UA sniffing) imposibles de testear en vitest sin mocks intrincados.
- El componente devuelve `null` en la mayoría de casos, lo cual hace tests de render triviales (no aportan).

**Verificación manual** (post-deploy):

1. **iPhone Safari:**
   - Abrir la app en Safari, fresh visit (limpiar localStorage si necesario).
   - Banner amarillo/verde con "Cómo instalar →" debe aparecer.
   - Tap → instrucciones se expanden.
   - Tap X → banner desaparece.
   - Recargar → banner ya no aparece.
   - Add to Home Screen manualmente → al abrir desde el home screen, banner no debe aparecer.

2. **Android Chrome:**
   - Abrir la app en Chrome, fresh visit.
   - Banner aparece con botón "📥 Instalar".
   - Tap "Instalar" → diálogo nativo de Chrome aparece.
   - Aceptar → app se instala, banner desaparece.
   - Abrir desde el home screen → banner no aparece (display-mode: standalone).

3. **Desktop Chrome:**
   - Abrir en Chrome desktop.
   - Banner aparece con "📥 Instalar".
   - Tap → instala como PWA en el sistema.

4. **Edge / desktop:** mismo comportamiento que Chrome.

5. **Firefox móvil / otros:** banner no aparece (no firing de `beforeinstallprompt`, no es iOS Safari).

---

## Riesgos y consideraciones

- **`beforeinstallprompt` no se dispara siempre.** Chrome solo lo dispara si la PWA cumple criterios de instalación: HTTPS, manifest, service worker (en algunas versiones). HOY el manifest está OK pero NO HAY service worker. **Esto puede romper la detección Android.** Mitigación: si Chrome no dispara el evento, el banner permanece oculto en Android. Caer al modo iOS no aplica (no es iOS). Resultado: usuarios Android pueden no ver el banner. **Considerar fallback en plan**: si tras 3s no recibimos el evento, mostrar instrucciones genéricas Android (Menú ⋮ → "Instalar app").
- **UA sniffing es frágil.** Browsers cambian UA, in-app webviews (Twitter, Instagram, etc.) tienen UA propios. Puede haber falsos positivos/negativos. Aceptable como trade-off.
- **iOS in-app webview** (LinkedIn, etc.) NO permite "Add to Home Screen". El banner aparecería pero las instrucciones no aplican. Aceptable — el usuario lo entenderá.
- **localStorage en Safari modo privado:** lectura devuelve null silenciosamente, escritura falla. El banner aparecería en cada visita. Aceptable.
- **Cambios futuros del manifest** (icono, theme_color) no requieren tocar este componente.

---

## Open questions

Ninguna. Decisiones cerradas:
- Solo install prompt + UX, sin service worker.
- Banner en el dashboard, después del header, dismissable con localStorage persistente.
- Detección por plataforma: Android Chrome (beforeinstallprompt), iOS Safari (UA), already installed (matchMedia/standalone).
- Sin tests automáticos.
