# Fase 4 · Pieza 1 — First-run del grupo nº2 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un grupo recién creado abra la app sin ver «Lomeros» donde no le corresponde (marca de plataforma → «Padelo») y sin ver nada roto estando vacío (empty states limpios y unificados).

**Architecture:** Dos frentes independientes. (A) Una constante `PLATFORM_NAME='Padelo'` como fuente única, con un test-guard que prohíbe el literal «Lomeros» en los ficheros de plataforma; la raíz `/` (grupo insignia Lomeros) se preserva. (B) Un componente presentacional compartido `<EmptyState>` que absorbe los ~5 empty-states ad-hoc existentes y cubre los huecos, verificado por e2e sobre un grupo vacío.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, TypeScript, Vitest (unit/guard, entorno node — sin jsdom → la UI se verifica en e2e), Playwright (e2e). Spec: `docs/superpowers/specs/2026-07-13-fase4-first-run-grupo-design.md`.

**Convención de tests de este plan:** el entorno vitest es `node` (no hay React Testing Library). Por tanto **los componentes React no llevan test unitario**; su corrección se verifica en el e2e (Task 10). La Parte A se ancla en un **test-guard de sistema de ficheros** (grep sobre el código), que es TDD puro. Sigue la regla de `AGENTS.md` (e2e obligatorio) y el guard `check:db-access`.

**Nota de worktree:** ejecutar `npm install` en el worktree antes de nada (gotcha conocido). Tests: `npm test` (vitest) y `npm run e2e` (Playwright, puerto 3100).

---

## PARTE A — Marca de plataforma «Padelo»

### Task 1: Constante `PLATFORM_NAME`

**Files:**
- Modify: `src/lib/groups/constants.ts`

- [ ] **Step 1: Añadir la constante**

Añadir al final de `src/lib/groups/constants.ts`:

```ts
/** Nombre neutro de la PLATAFORMA (lo que ve un grupo ajeno en login, atribución
 *  «hecho con …» y la PWA). Distinto de LOMEROS_GROUP_NAME, que es el nombre del
 *  grupo insignia. La marca de cada grupo (nombre/logo/color) la resuelve la Fase 3. */
export const PLATFORM_NAME = 'Padelo';
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/groups/constants.ts
git commit -m "feat(fase4): PLATFORM_NAME='Padelo' como fuente única de marca de plataforma"
```

---

### Task 2: Test-guard que prohíbe «Lomeros» en ficheros de plataforma (RED)

**Files:**
- Create: `src/lib/groups/platform-name.test.ts`

- [ ] **Step 1: Escribir el test-guard**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PLATFORM_NAME } from './constants';

// Ruta al raíz del repo desde src/lib/groups/
const repoFile = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), 'utf8');

// Ficheros de PLATAFORMA que un grupo ajeno ve y que NO deben mencionar «Lomeros»
// (mayúscula). La raíz insignia — src/app/(public)/** y constants.ts — queda fuera:
// ahí «Lomeros» es correcto.
const PLATFORM_FILES = [
  'src/app/login/page.tsx',
  'src/app/manifest.ts',
  'src/app/layout.tsx',
  'src/components/shared/crest.tsx',
  'src/app/g/[slug]/layout.tsx',
  'src/components/players/player-profile-view.tsx',
];

describe('marca de plataforma neutralizada', () => {
  it('PLATFORM_NAME es «Padelo»', () => {
    expect(PLATFORM_NAME).toBe('Padelo');
  });

  it.each(PLATFORM_FILES)('%s no contiene el literal «Lomeros»', (file) => {
    // Case-sensitive: los comentarios con «/g/lomeros» (minúscula) son legítimos.
    expect(repoFile(file)).not.toMatch(/Lomeros/);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que FALLA**

Run: `npm test -- platform-name`
Expected: FAIL — los 6 ficheros aún contienen «Lomeros Padel Tour» / «grupo Lomeros». (El caso `PLATFORM_NAME` pasa; los 6 de ficheros fallan.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/groups/platform-name.test.ts
git commit -m "test(fase4): guard — ficheros de plataforma sin literal «Lomeros» (RED)"
```

---

### Task 3: Neutralizar login + crest

**Files:**
- Modify: `src/app/login/page.tsx`
- Modify: `src/components/shared/crest.tsx`

- [ ] **Step 1: crest.tsx — título por defecto**

En `src/components/shared/crest.tsx`, añadir el import y cambiar el default del prop `title`:

```tsx
import { VIEWBOX_W, VIEWBOX_H, crestInnerMarkup, crestInnerMarkupNoWordmark } from './crest-svg';
import { PLATFORM_NAME } from '@/lib/groups/constants';
```

y en la firma:

```tsx
  title = PLATFORM_NAME,
```

(sustituye `title = 'Lomeros Padel Tour',`)

- [ ] **Step 2: login/page.tsx — crest + h1**

En `src/app/login/page.tsx` añadir el import:

```tsx
import { PLATFORM_NAME } from '@/lib/groups/constants';
```

y sustituir las dos apariciones (líneas ~16 y ~18):

```tsx
          <Crest size={44} title={PLATFORM_NAME} />
```
```tsx
        <h1 className="display" style={{ fontSize: 26, margin: 0 }}>{PLATFORM_NAME}</h1>
```

- [ ] **Step 3: Ejecutar el guard (progreso)**

Run: `npm test -- platform-name`
Expected: `login/page.tsx` y `crest.tsx` ya PASAN; siguen fallando `manifest.ts`, `layout.tsx`, `g/[slug]/layout.tsx`, `player-profile-view.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/app/login/page.tsx src/components/shared/crest.tsx
git commit -m "feat(fase4): login y crest usan PLATFORM_NAME"
```

---

### Task 4: Neutralizar manifest + metadata raíz (título por contexto)

**Files:**
- Modify: `src/app/manifest.ts`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/(public)/page.tsx`

- [ ] **Step 1: manifest.ts → Padelo**

En `src/app/manifest.ts` añadir el import y cambiar `name`/`description`:

```ts
import type { MetadataRoute } from 'next';
import { PLATFORM_NAME } from '@/lib/groups/constants';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PLATFORM_NAME,
    short_name: PLATFORM_NAME,
    description: 'Ranking Elo, partidos y apuestas de tu grupo de pádel · ' + PLATFORM_NAME,
    start_url: '/',
```

(el resto del objeto queda igual; `short_name` pasa de `'LPT'` a `PLATFORM_NAME`.)

- [ ] **Step 2: layout.tsx — título de plataforma por defecto + plantilla**

En `src/app/layout.tsx` añadir el import (junto a los demás) y cambiar el bloque `metadata`:

```tsx
import { PLATFORM_NAME } from "@/lib/groups/constants";
```

```tsx
export const metadata: Metadata = {
  title: {
    default: PLATFORM_NAME,
    template: `%s · ${PLATFORM_NAME}`,
  },
  description: "Ranking Elo, partidos y apuestas de tu grupo de pádel",
  appleWebApp: {
    capable: true,
    title: PLATFORM_NAME,
    statusBarStyle: "black-translucent",
  },
};
```

(`appleWebApp.title` pasa de `"LPT"` a `PLATFORM_NAME`.)

- [ ] **Step 3: (public)/page.tsx — la raíz sigue siendo Lomeros**

La raíz `/` es el grupo insignia. Añadir/asegurar su propio `metadata` para que el `<title>` diga «Lomeros Padel Tour» (sobrescribe el default de plataforma). En `src/app/(public)/page.tsx`, tras los imports y antes de `export const dynamic`, añadir:

```tsx
import type { Metadata } from 'next';
import { LOMEROS_GROUP_NAME } from '@/lib/groups/constants';

export const metadata: Metadata = {
  title: { absolute: LOMEROS_GROUP_NAME },
  description: `El ranking oficial de ${LOMEROS_GROUP_NAME}`,
};
```

(`title.absolute` evita que se le aplique la plantilla `%s · Padelo`.)

- [ ] **Step 4: Ejecutar el guard (progreso)**

Run: `npm test -- platform-name`
Expected: `manifest.ts` y `layout.tsx` ya PASAN; siguen fallando `g/[slug]/layout.tsx` y `player-profile-view.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/app/manifest.ts src/app/layout.tsx "src/app/(public)/page.tsx"
git commit -m "feat(fase4): PWA/metadata de plataforma → Padelo; la raíz mantiene título Lomeros"
```

---

### Task 5: Neutralizar atribución + texto de compartir (GREEN)

**Files:**
- Modify: `src/app/g/[slug]/layout.tsx:70`
- Modify: `src/components/players/player-profile-view.tsx`
- Modify: `src/app/(public)/players/[id]/page.tsx`
- Modify: `src/app/g/[slug]/players/[id]/page.tsx`
- Modify: `src/components/pages/me-body.tsx`

- [ ] **Step 1: Atribución del footer de grupo**

En `src/app/g/[slug]/layout.tsx` añadir el import:

```tsx
import { PLATFORM_NAME } from '@/lib/groups/constants';
```

y cambiar el footer (línea ~70):

```tsx
      {!paid && (
        <footer className="muted" style={{ textAlign: 'center', fontSize: 12, padding: '12px 0 20px' }}>
          hecho con {PLATFORM_NAME}
        </footer>
      )}
```

- [ ] **Step 2: `player-profile-view.tsx` — prop `brandName`**

El share debe llevar el nombre del **grupo** (en la raíz = Lomeros; en un grupo = su marca), con `PLATFORM_NAME` de *fallback*. Añadir el import y el prop:

```tsx
import { PLATFORM_NAME } from '@/lib/groups/constants';
```

En la firma del componente (añadir `brandName`):

```tsx
export function PlayerProfileView({
  data,
  editable = false,
  basePath = '',
  brandName = PLATFORM_NAME,
}: {
  data: PlayerProfileData;
  editable?: boolean;
  basePath?: string;
  brandName?: string;
}) {
```

Y en el texto de compartir (línea ~109) sustituir `· Lomeros Padel Tour` por `· ${brandName}`:

```tsx
              <ShareProfileButton
                title={`${displayName(player)} · ${brandName}`}
                text={`${displayName(player)} — Elo ${Math.round(player.eloRating)}${rank != null ? ` · #${rank} del ranking` : ''} · ${brandName}`}
              />
```

(El `title` pasa de `· LPT` a `· ${brandName}` por coherencia.)

- [ ] **Step 3: Pasar `brandName` desde los 3 llamadores**

`src/app/(public)/players/[id]/page.tsx` (raíz = Lomeros): añadir import y prop.

```tsx
import { LOMEROS_GROUP_NAME } from '@/lib/groups/constants';
```
```tsx
        <PlayerProfileView data={data} editable={false} brandName={LOMEROS_GROUP_NAME} />
```

`src/app/g/[slug]/players/[id]/page.tsx` (grupo): usar el nombre del grupo del contexto.

```tsx
        <PlayerProfileView data={data} editable={false} basePath={ctx.basePath} brandName={ctx.group.name} />
```

`src/components/pages/me-body.tsx`: localizar la llamada a `<PlayerProfileView ... />` y añadir `brandName={ctx.group.name}` (me-body ya recibe `ctx`; en la raíz `ctx.group.name` es «Lomeros Padel Tour»).

- [ ] **Step 4: Ejecutar el guard (debe quedar GREEN)**

Run: `npm test -- platform-name`
Expected: PASS — los 6 ficheros de plataforma sin «Lomeros»; `PLATFORM_NAME==='Padelo'`.

- [ ] **Step 5: Typecheck/lint rápido y commit**

Run: `npm run lint`
Expected: sin errores nuevos.

```bash
git add "src/app/g/[slug]/layout.tsx" src/components/players/player-profile-view.tsx "src/app/(public)/players/[id]/page.tsx" "src/app/g/[slug]/players/[id]/page.tsx" src/components/pages/me-body.tsx
git commit -m "feat(fase4): atribución «hecho con Padelo» + share con marca de grupo (guard GREEN)"
```

---

## PARTE B — Empty states limpios

### Task 6: Componente compartido `<EmptyState>`

**Files:**
- Create: `src/components/shared/empty-state.tsx`

- [ ] **Step 1: Escribir el componente**

Absorbe el patrón ad-hoc existente (centrado, `muted`, emoji 40px / título 700 / hint `small`) y añade `icon` (lucide) y `action` (CTA opcional). Presentacional puro, on-brand (`DESIGN.md`: quieto, sin motion).

```tsx
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Estado vacío on-brand y quieto. Unifica los empties ad-hoc del proyecto.
 * Usa `emoji` (compatibilidad con el look actual) O `icon` (lucide, tinta-3).
 * `action` es un CTA opcional (p. ej. en listas de admin).
 */
export function EmptyState({
  emoji,
  icon: Icon,
  title,
  hint,
  action,
}: {
  emoji?: string;
  icon?: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="muted" style={{ textAlign: 'center', padding: '56px 16px' }}>
      {emoji ? (
        <p style={{ fontSize: 40, margin: '0 0 10px' }}>{emoji}</p>
      ) : Icon ? (
        <Icon size={40} strokeWidth={1.6} aria-hidden style={{ margin: '0 auto 12px', display: 'block', color: 'var(--ink-3)' }} />
      ) : null}
      <p style={{ fontWeight: 700, margin: 0 }}>{title}</p>
      {hint && <p className="small" style={{ marginTop: 6 }}>{hint}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npm run lint`
Expected: sin errores. (Sin test unitario: entorno vitest node; la UI se verifica en el e2e de Task 10.)

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/empty-state.tsx
git commit -m "feat(fase4): componente compartido <EmptyState>"
```

---

### Task 7: Migrar rankings, parejas y lista de partidos a `<EmptyState>`

**Files:**
- Modify: `src/components/pages/rankings-body.tsx:65-69`
- Modify: `src/components/pages/rankings-pairs-body.tsx:27-32`
- Modify: `src/components/shared/matches-list.tsx:64-69`

- [ ] **Step 1: rankings-body.tsx**

Añadir import:

```tsx
import { EmptyState } from '@/components/shared/empty-state';
```

Sustituir el bloque `ranked.length === 0 ? (...)` (líneas ~65-69) por:

```tsx
        {ranked.length === 0 ? (
          <EmptyState emoji="🏆" title="Aún no hay partidos registrados" />
        ) : (
          podiumGroups.length >= 3 && <Podium groups={podiumGroups} />
        )}
```

- [ ] **Step 2: rankings-pairs-body.tsx**

Añadir import `EmptyState` y sustituir el bloque `pairs.length === 0 ? (...)` (líneas ~27-32) por:

```tsx
        {pairs.length === 0 ? (
          <EmptyState
            emoji="👥"
            title="Aún no hay datos de parejas"
            hint="Registra partidos para ver las estadísticas de pareja"
          />
        ) : (
```

- [ ] **Step 3: matches-list.tsx**

Añadir import `EmptyState` y sustituir el bloque final `showUpcoming.length === 0 && showPlayed.length === 0 && (...)` (líneas ~64-69) por:

```tsx
      {showUpcoming.length === 0 && showPlayed.length === 0 && (
        <EmptyState emoji="🎾" title="Aún no hay partidos registrados" />
      )}
```

- [ ] **Step 4: Lint y commit**

Run: `npm run lint`
Expected: sin errores.

```bash
git add src/components/pages/rankings-body.tsx src/components/pages/rankings-pairs-body.tsx src/components/shared/matches-list.tsx
git commit -m "feat(fase4): ranking, parejas y partidos usan <EmptyState>"
```

---

### Task 8: Migrar home de grupo + listas de admin (con CTA)

**Files:**
- Modify: `src/components/pages/group-home-body.tsx:91-95`
- Modify: `src/components/pages/admin-players-body.tsx:37-44`
- Modify: `src/components/pages/admin-matches-body.tsx:56-61`

- [ ] **Step 1: group-home-body.tsx — mensaje de arranque**

Añadir import `EmptyState` y sustituir el bloque `allPlayers.length === 0 && (...)` (líneas ~91-95) por un empty state más cuidado (público → sin CTA):

```tsx
      {allPlayers.length === 0 && (
        <EmptyState
          icon={Users}
          title="Este grupo está arrancando"
          hint="Aún no hay jugadores ni partidos. En cuanto el organizador registre el primero, aparecerán aquí la clasificación y la jornada."
        />
      )}
```

(`Users` ya está importado en este fichero.)

- [ ] **Step 2: admin-players-body.tsx — con CTA**

Añadir import `EmptyState` y sustituir el bloque `allPlayers.length === 0 ? (...)` (líneas ~37-44) por:

```tsx
      {allPlayers.length === 0 ? (
        <EmptyState
          emoji="👤"
          title="No hay jugadores todavía"
          hint="Añade a los miembros del grupo para empezar a registrar partidos."
          action={
            <Link href={`${basePath}/admin/players/new`}>
              <Button>Añadir el primero</Button>
            </Link>
          }
        />
      ) : (
```

- [ ] **Step 3: admin-matches-body.tsx — con CTA**

Añadir import `EmptyState` y sustituir el bloque `allMatches.length === 0 ? (...)` (líneas ~56-61) por:

```tsx
      {allMatches.length === 0 ? (
        <EmptyState
          emoji="🎾"
          title="No hay partidos todavía"
          hint="Registra el primer partido para empezar a mover el ranking."
          action={
            <Link href={`${basePath}/admin/matches/new`} className="lpt-btn primary inline-flex">
              Registrar el primero
            </Link>
          }
        />
      ) : (
```

- [ ] **Step 4: Lint y commit**

Run: `npm run lint`
Expected: sin errores.

```bash
git add src/components/pages/group-home-body.tsx src/components/pages/admin-players-body.tsx src/components/pages/admin-matches-body.tsx
git commit -m "feat(fase4): home de grupo y listas de admin usan <EmptyState> (con CTA en admin)"
```

---

### Task 9: Barrido de superficies restantes

Objetivo: que **ninguna** vista de grupo muestre una lista/tabla vacía a pelo. Para cada fichero: leerlo, localizar dónde se renderiza una colección que puede venir vacía, y (si no hay ya un empty razonable) añadir la rama `coleccion.length === 0 ? <EmptyState .../> : (...)`. Reutiliza el patrón de Task 7.

**Files a revisar (leer cada uno antes de tocar):**
- `src/components/pages/planner-body.tsx` y `src/components/planner/availability-grid.tsx` — semana sin jugadores/disponibilidad.
- `src/components/pages/torneo-public-body.tsx` — torneo/pozo sin partidos generados.
- `src/app/(public)/eventos/page.tsx` y `src/app/g/[slug]/eventos/page.tsx` — sin eventos.
- `src/app/(public)/rankings/tokens/page.tsx` (clasificación pública de La Timba) — verificar si hay una vista de clasificación aparte de `tokens-body` (cartera personal) y si queda vacía a pelo con 0 jugadores.
- `src/components/pages/me-body.tsx` — jugador sin partidos (probablemente ya OK: `player-profile-view` gatea `matchesPlayed > 0`; solo confirmar que no rompe).

- [ ] **Step 1: Para cada fichero, aplicar el patrón**

Copia de referencia por superficie (usar el `<EmptyState>` con este copy):

```tsx
// planner (sin jugadores en el grupo)
<EmptyState emoji="🗓️" title="Aún no hay disponibilidad" hint="Cuando los jugadores marquen sus horas, verás aquí quién puede jugar esta semana." />

// torneo/pozo sin partidos generados
<EmptyState emoji="🏟️" title="El cuadro aún no está generado" hint="El organizador generará los partidos desde el panel de administración." />

// eventos vacíos
<EmptyState emoji="📅" title="Aún no hay eventos" hint="Los torneos y pozos del grupo aparecerán aquí." />

// clasificación de La Timba vacía (si aplica)
<EmptyState emoji="🪙" title="La Timba aún no ha empezado" hint="Cuando haya jugadores con fichas, verás aquí la clasificación." />
```

Regla: si el fichero YA tiene un empty razonable (texto centrado), migrarlo a `<EmptyState>` para consistencia; si no tiene, añadir la rama. Si una superficie ya renderiza bien vacía (p. ej. `me-body`), **no** forzar cambios — anotarlo en el commit.

- [ ] **Step 2: Guard de acceso a BD y lint**

Run: `npm run check:db-access && npm run lint`
Expected: sin errores (no se ha añadido acceso directo a Drizzle en `src/app`).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(fase4): empty states en planner, torneos/pozos, eventos y timba"
```

---

### Task 10: e2e de first-run + suites completas

**Files:**
- Create: `e2e/fase4-first-run.spec.ts`
- Read (patrón de setup): `e2e/group-home.spec.ts`, `e2e/1c-roles-memberships.spec.ts`

- [ ] **Step 1: Leer el patrón de setup de grupo**

Leer `e2e/group-home.spec.ts` para reutilizar sus helpers de creación de grupo + dev-login + cookie de sesión forjada (no reinventarlos). El nuevo spec debe montar un **grupo vacío** (sin jugadores/partidos) con su admin.

- [ ] **Step 2: Escribir el spec**

Estructura (rellenar el setup con los helpers de `group-home.spec.ts`):

```ts
import { test, expect } from '@playwright/test';
// import { <helpers de creación de grupo + login> } from './helpers'; // ver group-home.spec.ts

test.describe('Fase 4 · first-run del grupo nº2', () => {
  test('login muestra «Padelo», no «Lomeros»', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Padelo' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Lomeros Padel Tour');
  });

  test('la raíz sigue siendo «Lomeros Padel Tour» (insignia intacta)', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Lomeros Padel Tour/);
  });

  test('un grupo vacío renderiza empty states y no rompe', async ({ page }) => {
    // 1) Crear grupo vacío «demo-vacio» + admin y loguear (helpers de group-home.spec.ts).
    const slug = 'demo-vacio';
    // <setup: crear grupo, forjar sesión de su admin>

    // Home de grupo
    await page.goto(`/g/${slug}`);
    await expect(page.getByText('Este grupo está arrancando')).toBeVisible();

    // Ranking vacío
    await page.goto(`/g/${slug}/rankings`);
    await expect(page.getByText('Aún no hay partidos registrados')).toBeVisible();

    // Admin de jugadores: empty con CTA
    await page.goto(`/g/${slug}/admin/players`);
    await expect(page.getByText('No hay jugadores todavía')).toBeVisible();
    await expect(page.getByRole('link', { name: /Añadir el primero/ })).toBeVisible();

    // Atribución de plataforma (grupo gratis, con billing en beta puede no verse:
    // aserción tolerante — si el footer existe, dice «Padelo», nunca «Lomeros»).
    await expect(page.locator('footer')).not.toContainText('Lomeros');

    // Ninguna página ha lanzado error de runtime (sin overlay de error de Next).
    await expect(page.locator('text=Application error')).toHaveCount(0);
  });
});
```

- [ ] **Step 3: Ejecutar el nuevo spec**

Run: `npx playwright test e2e/fase4-first-run.spec.ts`
Expected: PASS (ajustar selectores del setup a los helpers reales de `group-home.spec.ts` si algo falla).

- [ ] **Step 4: Suites completas (regresión)**

Run: `npm test`
Expected: PASS (incluye el guard `platform-name` en verde).

Run: `npm run e2e`
Expected: PASS (todos los specs, incluidos `no-fuga-*` y el nuevo first-run). Anotar cualquier flake pre-existente conocido (p. ej. `group-admin`, ver memoria del design audit).

- [ ] **Step 5: Commit**

```bash
git add e2e/fase4-first-run.spec.ts
git commit -m "test(fase4): e2e first-run — grupo vacío + «Padelo» en plataforma + raíz Lomeros"
```

---

## Self-review (autor)

**Cobertura del spec:**
- §2.2 `PLATFORM_NAME` → Task 1. ✅
- §2.3 mapa de literales (login, atribución, manifest, layout/título, crest, share) → Tasks 3-5. ✅
- §2.4 política de `<title>` (plantilla + override raíz + grupo) → Task 4 (default+template), Task 4 step 3 (raíz), y el título de grupo se hereda de la marca del grupo vía `group.name` (el layout de grupo ya lo tiene; si se quiere `<title>` explícito por grupo, es barato pero opcional — anotado). ✅
- §2.5 manifest estático → Task 4. ✅
- §3.1 `<EmptyState>` → Task 6. ✅
- §3.2 superficies (home, ranking ×3, partidos/eventos, timba, torneos/pozos, planner, /me, admin) → Tasks 7-9. ✅ (tokens-body ya tiene empties inline correctos; se revisa en Task 9.)
- §5 testing (e2e grupo vacío + Padelo + regresión Lomeros; guard) → Tasks 2 y 10. ✅

**Placeholders:** ninguno pendiente salvo el setup del e2e (Task 10), que remite a helpers reales existentes (`group-home.spec.ts`) — decisión consciente para no inventar una API de helpers.

**Consistencia de tipos:** `PLATFORM_NAME` (string) importado igual en todos los sitios; `<EmptyState>` props (`emoji?`, `icon?`, `title`, `hint?`, `action?`) usadas de forma coherente en Tasks 7-9; `brandName?: string` con default `PLATFORM_NAME`, pasado como `LOMEROS_GROUP_NAME` / `ctx.group.name` desde los llamadores.

**Nota de alcance:** las 4 piezas restantes de Fase 4 (landing, legal, i18n, PWA por-grupo) quedan fuera, cada una con su propio ciclo.
