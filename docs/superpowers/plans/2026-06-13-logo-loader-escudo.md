# Logo escudo + loaders animados — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir el logo tipográfico "LPT" por un escudo de marca y animar el splash de arranque (se dibuja solo) y el loader entre pantallas (escudo + pulso).

**Architecture:** Una única fuente de verdad del escudo en strings SVG puros (`crest-svg.ts`), reutilizada por: un componente React (`crest.tsx`) para la UI/loader, el splash inline de `layout.tsx`, y los iconos PWA (`icon.tsx`/`apple-icon.tsx`) vía data-URI. El splash usa CSS inline (se pinta antes que React) con animación de trazado; el loader entre pantallas reutiliza el escudo ya dibujado con pulso.

**Tech Stack:** Next.js 16 (App Router), React 19, `next/og` (Satori) para iconos, CSS keyframes, vitest.

---

## Estructura de archivos

- **Crear** `src/components/shared/crest-svg.ts` — generadores de SVG puros (sin JSX): constantes de color, `SHIELD_PATH`, markup del contenido, `crestSvgMarkup(size)`, `crestDataUri(size)`. Testeable con vitest.
- **Crear** `src/components/shared/crest-svg.test.ts` — tests de los generadores puros.
- **Crear** `src/components/shared/crest.tsx` — componente React `Crest` (escudo estático), reusa el inner markup de `crest-svg.ts`.
- **Modificar** `src/components/shared/screen-loader.tsx` — usar `<Crest/>` en vez de texto "LPT" + ring.
- **Modificar** `src/app/globals.css` — reescribir el bloque `.screen-loader*`.
- **Modificar** `src/app/layout.tsx` — splash con escudo + animación de trazado (CSS inline).
- **Modificar** `src/app/icon.tsx` — escudo vía `<img>` data-URI en `ImageResponse`.
- **Modificar** `src/app/apple-icon.tsx` — íd. a 180px.
- **Eliminar** `src/app/favicon.ico` — dejar que `/icon` haga de favicon.

Decisión técnica clave para el trazado: el path del escudo lleva `pathLength="100"`, así `stroke-dasharray`/`stroke-dashoffset` trabajan sobre una longitud normalizada de 100 y la animación se completa siempre, independientemente de la longitud real del path.

---

### Task 1: Generadores de SVG del escudo (fuente única)

**Files:**
- Create: `src/components/shared/crest-svg.ts`
- Test: `src/components/shared/crest-svg.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`src/components/shared/crest-svg.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  SHIELD_PATH,
  LIME,
  crestInnerMarkup,
  crestInkMarkup,
  crestSvgMarkup,
  crestDataUri,
} from './crest-svg';

describe('crest-svg', () => {
  it('crestInkMarkup contiene las palas y el wordmark LPT', () => {
    const ink = crestInkMarkup();
    expect(ink).toContain('LPT');
    expect(ink).toContain('<ellipse'); // cabeza de la pala
    expect(ink).toContain('<rect'); // mango de la pala
  });

  it('crestInnerMarkup incluye el path del escudo relleno de lima + la tinta', () => {
    const inner = crestInnerMarkup();
    expect(inner).toContain(SHIELD_PATH);
    expect(inner).toContain(LIME);
    expect(inner).toContain('LPT');
  });

  it('crestSvgMarkup envuelve en <svg> con viewBox y tamaño', () => {
    const svg = crestSvgMarkup(128);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('viewBox="0 0 128 138"');
    expect(svg).toContain('width="128"');
    expect(svg).toContain(SHIELD_PATH);
  });

  it('crestDataUri produce un data-URI de svg decodificable', () => {
    const uri = crestDataUri(140);
    expect(uri.startsWith('data:image/svg+xml,')).toBe(true);
    const decoded = decodeURIComponent(uri.slice('data:image/svg+xml,'.length));
    expect(decoded).toContain('<svg');
    expect(decoded).toContain('LPT');
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npm run test -- crest-svg`
Expected: FAIL — "Failed to resolve import './crest-svg'".

- [ ] **Step 3: Implementar los generadores**

`src/components/shared/crest-svg.ts`:

```ts
/**
 * Fuente única del escudo de marca LPT (sin JSX, para poder testearlo y
 * reutilizarlo como string en el splash inline de layout.tsx y en los iconos
 * PWA). El componente React vive en crest.tsx y reutiliza estos generadores.
 *
 * Escudo macizo lima con palas de pádel cruzadas en negativo + "LPT" debajo.
 * viewBox: 0 0 128 138 (relación de aspecto 128:138).
 */

export const LIME = '#c8f03c';
export const DARK = '#0c1715';

export const VIEWBOX_W = 128;
export const VIEWBOX_H = 138;

export const SHIELD_PATH =
  'M64 4 L118 25 V66 C118 104 93 124 64 134 C35 124 10 104 10 66 V25 Z';

// Una pala de pádel como silueta en negativo (oscura) con agujeros en lima.
function racket(rotateDeg: number): string {
  return `<g transform="translate(64,52) rotate(${rotateDeg})">
    <ellipse cx="0" cy="-13" rx="14" ry="18" fill="${DARK}"/>
    <g fill="${LIME}">
      <circle cx="-5" cy="-19" r="2"/><circle cx="3" cy="-21" r="2"/><circle cx="9" cy="-16" r="2"/>
      <circle cx="-7" cy="-11" r="2"/><circle cx="1" cy="-13" r="2"/><circle cx="8" cy="-9" r="2"/>
      <circle cx="-4" cy="-4" r="2"/><circle cx="4" cy="-6" r="2"/>
    </g>
    <rect x="-3" y="3" width="6" height="24" rx="3" fill="${DARK}"/>
  </g>`;
}

// "Tinta" del escudo: lo que va en negativo sobre el relleno lima
// (palas cruzadas + wordmark). Sin el path del escudo.
export function crestInkMarkup(): string {
  return `${racket(38)}${racket(-38)}<text x="64" y="120" text-anchor="middle" font-family="Barlow, system-ui, sans-serif" font-size="20" font-weight="800" fill="${DARK}">LPT</text>`;
}

// Contenido completo del escudo (relleno lima + tinta), sin el wrapper <svg>.
export function crestInnerMarkup(): string {
  return `<path d="${SHIELD_PATH}" fill="${LIME}"/>${crestInkMarkup()}`;
}

// SVG completo como string a un ancho dado (alto proporcional).
export function crestSvgMarkup(size = VIEWBOX_W): string {
  const height = Math.round((size * VIEWBOX_H) / VIEWBOX_W);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${height}" viewBox="0 0 ${VIEWBOX_W} ${VIEWBOX_H}">${crestInnerMarkup()}</svg>`;
}

// data-URI para usar en <img> dentro de next/og ImageResponse.
export function crestDataUri(size = VIEWBOX_W): string {
  return `data:image/svg+xml,${encodeURIComponent(crestSvgMarkup(size))}`;
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `npm run test -- crest-svg`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/crest-svg.ts src/components/shared/crest-svg.test.ts
git commit -m "feat(brand): generadores SVG del escudo LPT (fuente única)"
```

---

### Task 2: Componente React `Crest`

**Files:**
- Create: `src/components/shared/crest.tsx`

- [ ] **Step 1: Implementar el componente**

`src/components/shared/crest.tsx`:

```tsx
import { VIEWBOX_W, VIEWBOX_H, crestInnerMarkup } from './crest-svg';

/**
 * Escudo de marca LPT como componente React (estático, sin animación).
 * Reutiliza el inner markup de crest-svg.ts para no duplicar la geometría.
 */
export default function Crest({
  size = 96,
  className,
  title = 'Lomeros Padel Tour',
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  const height = Math.round((size * VIEWBOX_H) / VIEWBOX_W);
  return (
    <svg
      width={size}
      height={height}
      viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
      className={className}
      role="img"
      aria-label={title}
      dangerouslySetInnerHTML={{ __html: crestInnerMarkup() }}
    />
  );
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en `crest.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/crest.tsx
git commit -m "feat(brand): componente React Crest reutilizando crest-svg"
```

---

### Task 3: Loader entre pantallas con el escudo

**Files:**
- Modify: `src/components/shared/screen-loader.tsx`
- Modify: `src/app/globals.css` (bloque `.screen-loader*`, ~líneas 446-488)

- [ ] **Step 1: Reescribir el componente screen-loader**

Reemplazar TODO el contenido de `src/components/shared/screen-loader.tsx` por:

```tsx
import Crest from './crest';

/**
 * Loader de marca entre pantallas — el escudo LPT (ya dibujado) sobre el verde
 * oscuro, con un pulso suave. Se usa como fallback de los loading.tsx de cada
 * sección. NO re-traza el escudo (a diferencia del splash de arranque): en
 * navegaciones rápidas un re-trazado se vería como un parpadeo. El estilo y el
 * retraso de aparición viven en `.screen-loader` (globals.css).
 */
export default function ScreenLoader() {
  return (
    <div className="screen-loader" role="status" aria-busy="true" aria-label="Cargando">
      <Crest size={104} className="screen-loader__crest" />
    </div>
  );
}
```

- [ ] **Step 2: Reescribir el CSS del loader**

En `src/app/globals.css`, sustituir el bloque que va desde `.screen-loader {` hasta el `@media (prefers-reduced-motion: reduce)` del loader (el que contiene `.screen-loader__logo, .screen-loader__ring`) por:

```css
.screen-loader {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(160deg, #1d2f2c 0%, #0c1715 60%);
  opacity: 0;
  pointer-events: none;
  animation: screenLoaderReveal 0.25s ease 0.1s forwards;
}
.screen-loader__crest {
  animation: lpt-splash-pulse 1.6s ease-in-out infinite;
}
@keyframes screenLoaderReveal { from { opacity: 0; } to { opacity: 1; } }
@keyframes lpt-splash-pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .screen-loader__crest { animation: none; }
}
```

Nota: se elimina `lpt-splash-spin` (el ring ya no se usa). Conservar el `@media`
genérico posterior (`*, *::before, *::after { animation-duration: 0.01ms... }`) tal cual.

- [ ] **Step 3: Verificar typecheck y lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/screen-loader.tsx src/app/globals.css
git commit -m "feat(pwa): loader entre pantallas con el escudo LPT + pulso"
```

---

### Task 4: Splash de arranque que se dibuja solo

**Files:**
- Modify: `src/app/layout.tsx`

Contexto: hoy `layout.tsx` define `SPLASH_STYLE` (string CSS), `SPLASH_SCRIPT`
(string JS que oculta el splash al cargar) y un markup `#lpt-splash` con texto.
El `SPLASH_SCRIPT` y el `setTimeout` de seguridad NO cambian.

- [ ] **Step 1: Importar la geometría del escudo**

Añadir cerca de los imports superiores de `src/app/layout.tsx`:

```ts
import { SHIELD_PATH, crestInkMarkup } from "@/components/shared/crest-svg";
```

- [ ] **Step 2: Reescribir SPLASH_STYLE con la animación de trazado**

Reemplazar la constante `SPLASH_STYLE` por:

```ts
const SPLASH_STYLE = `
#lpt-splash{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#1d2f2c 0%,#0c1715 60%);transition:opacity .45s ease,visibility .45s ease}
#lpt-splash.lpt-splash--hide{opacity:0;visibility:hidden;pointer-events:none}
#lpt-splash .lpt-crest{width:132px;height:auto}
#lpt-splash .lpt-crest__outline{fill:none;stroke:#c8f03c;stroke-width:5;stroke-dasharray:100;stroke-dashoffset:100;animation:lpt-draw 1.4s ease forwards}
#lpt-splash .lpt-crest__fill{fill:#c8f03c;opacity:0;animation:lpt-fill 1.4s ease forwards}
#lpt-splash .lpt-crest__ink{opacity:0;transform:scale(.7);transform-origin:64px 62px;animation:lpt-ink 1.4s ease forwards}
@keyframes lpt-draw{0%{stroke-dashoffset:100}35%{stroke-dashoffset:0}45%{stroke-dashoffset:0;opacity:1}55%,100%{opacity:0}}
@keyframes lpt-fill{0%,32%{opacity:0}48%,100%{opacity:1}}
@keyframes lpt-ink{0%,48%{opacity:0;transform:scale(.7)}66%{opacity:1;transform:scale(1)}100%{opacity:1;transform:scale(1)}}
@media (prefers-reduced-motion: reduce){
  #lpt-splash .lpt-crest__outline{animation:none;opacity:0}
  #lpt-splash .lpt-crest__fill{animation:none;opacity:1}
  #lpt-splash .lpt-crest__ink{animation:none;opacity:1;transform:scale(1)}
}
`;
```

- [ ] **Step 3: Reescribir el markup del splash**

Reemplazar el bloque del splash (el `<div id="lpt-splash">…</div>`) por:

```tsx
{/* Splash instantáneo: el escudo se dibuja solo y se desvanece al cargar */}
<div id="lpt-splash" aria-hidden="true" suppressHydrationWarning>
  <svg
    className="lpt-crest"
    viewBox="0 0 128 138"
    suppressHydrationWarning
  >
    <path className="lpt-crest__outline" pathLength={100} d={SHIELD_PATH} />
    <path className="lpt-crest__fill" d={SHIELD_PATH} />
    <g
      className="lpt-crest__ink"
      dangerouslySetInnerHTML={{ __html: crestInkMarkup() }}
    />
  </svg>
</div>
```

Mantener intactos el `<script dangerouslySetInnerHTML={{ __html: SPLASH_SCRIPT }} />`
y el `<style dangerouslySetInnerHTML={{ __html: SPLASH_STYLE }} />` del `<head>`.

- [ ] **Step 4: Verificar typecheck y lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(pwa): splash de arranque con el escudo que se dibuja solo"
```

---

### Task 5: Iconos PWA con el escudo

**Files:**
- Modify: `src/app/icon.tsx`
- Modify: `src/app/apple-icon.tsx`

Contexto: ambos usan `next/og` `ImageResponse`. Satori no renderiza SVG inline
arbitrario de forma fiable, pero sí un `<img>` con data-URI de SVG (con width/height
explícitos). Se usa `crestDataUri()`.

- [ ] **Step 1: Reescribir `src/app/icon.tsx`**

```tsx
import { ImageResponse } from 'next/og';
import { crestDataUri } from '@/components/shared/crest-svg';

export const size = { width: 192, height: 192 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(160deg, #1d2f2c 0%, #0c1715 60%)',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={crestDataUri(132)} width={132} height={142} alt="LPT" />
      </div>
    ),
    { ...size },
  );
}
```

- [ ] **Step 2: Reescribir `src/app/apple-icon.tsx`**

```tsx
import { ImageResponse } from 'next/og';
import { crestDataUri } from '@/components/shared/crest-svg';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(160deg, #1d2f2c 0%, #0c1715 60%)',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={crestDataUri(124)} width={124} height={134} alt="LPT" />
      </div>
    ),
    { ...size },
  );
}
```

- [ ] **Step 3: Verificar typecheck y lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add src/app/icon.tsx src/app/apple-icon.tsx
git commit -m "feat(pwa): iconos 192/180 con el escudo LPT"
```

---

### Task 6: Retirar el favicon estático antiguo

**Files:**
- Delete: `src/app/favicon.ico`

- [ ] **Step 1: Eliminar el favicon**

```bash
git rm src/app/favicon.ico
```

Razón: con `favicon.ico` presente, Next lo prioriza como favicon. Al quitarlo,
Next sirve `/icon` (el escudo) como favicon en navegadores modernos.

- [ ] **Step 2: Commit**

```bash
git commit -m "chore(pwa): retirar favicon.ico estático; /icon hace de favicon"
```

---

### Task 7: Verificación final

- [ ] **Step 1: Suite de tests pura**

Run: `npm run test -- crest-svg`
Expected: PASS.

- [ ] **Step 2: Typecheck + lint del repo**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores nuevos introducidos por esta rama.

- [ ] **Step 3: Verificación visual (tras desplegar)**

`npm run build`/`dev` no corre en local por falta de env vars de TURSO (solo en
Production de Vercel). La verificación visual se hace en el preview/deploy:

  1. Arranque en frío: el escudo se traza, se rellena y entran palas + "LPT", luego el splash se desvanece.
  2. Navegación entre secciones (p. ej. abrir un partido): el escudo aparece con pulso, sin parpadeo ni re-trazado.
  3. `GET /icon` y `GET /apple-icon` devuelven el escudo (no el texto "LPT").
  4. Favicon de la pestaña muestra el escudo.
  5. Con "reducir movimiento" activado en el SO: el escudo aparece estático (sin trazado ni pulso).

- [ ] **Step 4: Merge a main y push (despliegue)**

Según la convención del proyecto (terminar = push a main, Vercel auto-despliega):

```bash
git checkout main
git merge --no-ff worktree-logo-loader-escudo -m "feat(pwa): logo escudo de marca + loaders animados"
git push origin main
```
