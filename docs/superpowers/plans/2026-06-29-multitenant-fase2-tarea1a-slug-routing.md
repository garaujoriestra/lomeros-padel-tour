# Fase 2 · Tarea 1 · Paso A — Routing por slug `/g/[slug]` (aditivo) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Servir un grupo no-por-defecto bajo `/g/[slug]` con una landing que resuelve el grupo desde el slug y lee sus datos scopeados, sin tocar nada de la raíz (Lomeros).

**Architecture:** Paso A del rollout expand→contract (ver spec `docs/superpowers/specs/2026-06-29-multitenant-fase2-tarea1-slug-routing-design.md`). **Puramente aditivo:** se añade un helper `slug→grupo` (con lista de segmentos reservados) y un segmento `/g/[slug]` con su página landing. No se toca `getSession`, ni `requireAdmin`, ni ninguna ruta de raíz ni `/api`. El grupo por defecto (Lomeros) sigue en la raíz, idéntico; `/g/lomeros` redirige 308 a `/` para mantener un único canónico.

**Tech Stack:** Next.js 16.2.2 (App Router, server components, `params` es `Promise`), Drizzle ORM + Turso/libSQL, Vitest (unit), Playwright (e2e). Convenciones confirmadas en el código: `redirect`/`permanentRedirect`/`notFound` desde `next/navigation`; páginas resuelven `groupId` y lo pasan a helpers de dominio (`@/lib/<dominio>/queries`).

**Alcance de ESTE plan (Paso A):** helper de resolución + segmento `/g/[slug]` con landing de grupo. **Fuera (otros planes):** migrar `/api` por dominio (Paso B), refactor de `getSession`/`requireAdmin` + aterrizaje grupo-hogar (Paso C), paridad completa de páginas bajo `/g/[slug]` (me/admin/matches/pozos/torneos), navbar/chrome de grupo, onboarding (Tarea 2), conmutador (Tarea 3).

---

## Estructura de ficheros

- **Crear** `src/lib/groups/resolve-slug.ts` — resolución `slug→grupo`: `RESERVED_SLUGS`, `isValidGroupSlug()` (pura), `getGroupBySlug()` (DB). Responsabilidad única: traducir un slug de URL a un grupo o `null`.
- **Crear** `src/lib/groups/resolve-slug.test.ts` — unit de la parte pura (`isValidGroupSlug`, `RESERVED_SLUGS`).
- **Crear** `src/app/g/[slug]/page.tsx` — landing pública del grupo: resuelve slug, `notFound()` si inválido, `permanentRedirect('/')` si es el grupo por defecto, renderiza nombre + roster del grupo.
- **Crear** `e2e/slug-routing.spec.ts` — e2e del segmento (200 con datos del grupo, 404 inválido/reservado, 308 lomeros→raíz).
- **No se modifica ningún fichero existente.** (Garantía de no-rotura de Lomeros.)

---

## Task 0: Preparar el worktree

**Files:** ninguno (setup).

- [ ] **Step 1: Instalar dependencias**

El worktree no tiene `node_modules` (necesario para vitest/playwright/next).

Run: `npm install`
Expected: instala sin errores; aparece `node_modules/`.

- [ ] **Step 2: Verificar que la suite parte de verde (baseline)**

Run: `npm test`
Expected: PASS (toda la suite unit existente verde, antes de tocar nada).

---

## Task 1: Helper de resolución `slug→grupo` (+ slugs reservados)

**Files:**
- Create: `src/lib/groups/resolve-slug.ts`
- Test: `src/lib/groups/resolve-slug.test.ts`

- [ ] **Step 1: Escribir el test que falla (parte pura)**

Crea `src/lib/groups/resolve-slug.test.ts`. Mockeamos `@/lib/db` a nivel de módulo (igual que `group-context.test.ts`) porque `resolve-slug.ts` importa el cliente DB en carga de módulo; la parte pura no lo usa.

```ts
import { describe, it, expect, vi } from 'vitest';

// resolve-slug.ts importa @/lib/db al nivel de módulo (para getGroupBySlug).
// Lo mockeamos para no necesitar env vars de DB en este unit de la parte pura.
vi.mock('@/lib/db', () => ({ db: {} }));

import { isValidGroupSlug, RESERVED_SLUGS } from './resolve-slug';

describe('isValidGroupSlug', () => {
  it('acepta slugs en minúsculas con dígitos y guiones internos', () => {
    expect(isValidGroupSlug('grupo-test')).toBe(true);
    expect(isValidGroupSlug('lomeros')).toBe(true);
    expect(isValidGroupSlug('padel2026')).toBe(true);
  });

  it('rechaza mayúsculas, espacios, vacío y guiones en los extremos', () => {
    expect(isValidGroupSlug('Grupo')).toBe(false);
    expect(isValidGroupSlug('con espacio')).toBe(false);
    expect(isValidGroupSlug('-leading')).toBe(false);
    expect(isValidGroupSlug('trailing-')).toBe(false);
    expect(isValidGroupSlug('')).toBe(false);
  });

  it('rechaza segmentos reservados que colisionan con rutas reales', () => {
    for (const r of ['g', 'api', 'admin', 'me', 'login']) {
      expect(RESERVED_SLUGS.has(r)).toBe(true);
      expect(isValidGroupSlug(r)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npx vitest run src/lib/groups/resolve-slug.test.ts`
Expected: FAIL — no se puede resolver el módulo `./resolve-slug` (aún no existe).

- [ ] **Step 3: Implementar `resolve-slug.ts`**

Crea `src/lib/groups/resolve-slug.ts`:

```ts
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { groups } from '@/lib/db/schema';
import type { GroupRow } from './queries';

// Segmentos de primer nivel que colisionarían con rutas reales de la app: un slug
// de grupo NUNCA puede ser uno de estos. Mantener en sync con src/app/ (y con
// src/app/(public)/). La validación al ELEGIR slug (onboarding) es de Tarea 2; aquí
// solo se usa para rechazar en el resolutor.
export const RESERVED_SLUGS = new Set<string>([
  'g', 'api', '_next', 'me', 'admin', 'login', 'logout', 'dev-login',
  'offline', 'unauthorized', 'matches', 'players', 'pozos', 'torneos',
  'rankings', 'eventos', 'icon', 'apple-icon', 'manifest.webmanifest',
]);

// Forma válida de slug: minúsculas, dígitos y guiones internos (sin guiones en los
// extremos, sin dobles guiones, no vacío).
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Pura (no toca DB): ¿el slug tiene forma válida y no está reservado?
export function isValidGroupSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug);
}

// Resuelve un slug de la URL a su grupo, o null si: tiene forma inválida, está
// reservado, o no existe ningún grupo con ese slug. Las páginas /g/[slug] hacen
// notFound() cuando devuelve null.
export async function getGroupBySlug(slug: string): Promise<GroupRow | null> {
  if (!isValidGroupSlug(slug)) return null;
  const [g] = await db
    .select({ id: groups.id, slug: groups.slug, name: groups.name })
    .from(groups)
    .where(eq(groups.slug, slug));
  return g ?? null;
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `npx vitest run src/lib/groups/resolve-slug.test.ts`
Expected: PASS (3 tests verdes).

- [ ] **Step 5: Verificar que el guard de acceso a DB sigue contento**

`resolve-slug.ts` consulta `groups` (tabla raíz de identidad, NO tenant) y vive en `src/lib`, no en `src/app` → no debe disparar el guard, que solo vigila `players/matches/rewards/tournaments` en `src/app`.

Run: `npm run check:db-access`
Expected: `✅ Sin acceso directo a tablas tenant raíz en src/app.`

- [ ] **Step 6: Commit**

```bash
git add src/lib/groups/resolve-slug.ts src/lib/groups/resolve-slug.test.ts
git commit -m "feat(fase2): helper getGroupBySlug + slugs reservados (Paso A)"
```

---

## Task 2: Segmento `/g/[slug]` con landing de grupo (e2e-TDD)

**Files:**
- Create: `e2e/slug-routing.spec.ts`
- Create: `src/app/g/[slug]/page.tsx`

- [ ] **Step 1: Escribir el e2e que falla**

Crea `e2e/slug-routing.spec.ts`. El segundo grupo (`grupo-test`, slug `grupo-test`, con jugadores `gt-pl1..4` llamados "Jugador GT…") ya lo siembra `e2e/global-setup.ts`. La landing es pública en Paso A → no hace falta sesión.

```ts
import { test, expect } from '@playwright/test';

test.describe('slug routing · /g/[slug] (Paso A)', () => {
  test('/g/grupo-test renderiza la landing del grupo con sus datos', async ({ page }) => {
    const res = await page.goto('/g/grupo-test');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Grupo Test' })).toBeVisible();
    await expect(page.getByText('Jugador GT', { exact: false }).first()).toBeVisible();
  });

  test('un slug inexistente da 404', async ({ page }) => {
    const res = await page.goto('/g/no-existe-este-grupo');
    expect(res?.status()).toBe(404);
  });

  test('un slug reservado da 404', async ({ page }) => {
    const res = await page.goto('/g/api');
    expect(res?.status()).toBe(404);
  });

  test('/g/lomeros redirige a la raíz (canónico único)', async ({ page }) => {
    await page.goto('/g/lomeros');
    expect(new URL(page.url()).pathname).toBe('/');
  });
});
```

- [ ] **Step 2: Ejecutar el e2e y verificar que falla**

Run: `npx playwright test e2e/slug-routing.spec.ts`
Expected: FAIL — la ruta `/g/[slug]` no existe aún (la app responde 404 también para `/g/grupo-test`, así que el primer test falla en el status 200; `/g/lomeros` no redirige).

- [ ] **Step 3: Implementar la página landing**

Crea `src/app/g/[slug]/page.tsx`:

```tsx
import { notFound, permanentRedirect } from 'next/navigation';
import { getDefaultGroupId } from '@/lib/auth/group-context';
import { getGroupBySlug } from '@/lib/groups/resolve-slug';
import { listAllPlayersInGroup } from '@/lib/players/queries';

export const dynamic = 'force-dynamic';

export default async function GroupHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const group = await getGroupBySlug(slug);
  if (!group) notFound();

  // El grupo por defecto (Lomeros) es canónico en la raíz: /g/lomeros → 308 a '/'.
  const defaultGroupId = await getDefaultGroupId();
  if (group.id === defaultGroupId) permanentRedirect('/');

  // Datos scopeados al grupo resuelto (vía helper de dominio, no acceso directo a DB).
  const players = await listAllPlayersInGroup(group.id);

  return (
    <div className="section" style={{ padding: 'calc(26px * var(--sp))' }}>
      <h1 className="display" style={{ fontSize: 'clamp(30px, 6vw, 48px)', margin: '0 0 8px' }}>
        {group.name}
      </h1>
      <p className="small muted" style={{ margin: '0 0 24px' }}>
        {players.length} {players.length === 1 ? 'jugador' : 'jugadores'}
      </p>
      <ul className="stagger" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {players.map((p) => (
          <li
            key={p.id}
            style={{ padding: '8px 0', borderBottom: '1px solid color-mix(in oklab, currentcolor 12%, transparent)' }}
          >
            {p.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Ejecutar el e2e y verificar que pasa**

Run: `npx playwright test e2e/slug-routing.spec.ts`
Expected: PASS (4 tests verdes: 200 con "Grupo Test" + "Jugador GT", 404 inexistente, 404 reservado, redirect lomeros→`/`).

- [ ] **Step 5: Lint + typecheck del build de la página nueva**

Run: `npm run lint`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add e2e/slug-routing.spec.ts "src/app/g/[slug]/page.tsx"
git commit -m "feat(fase2): segmento /g/[slug] con landing de grupo (Paso A)"
```

---

## Task 3: Regresión completa + verificación de NO-rotura de Lomeros

**Files:** ninguno (verificación; si algo falla, arreglar y re-commitear en la task que corresponda).

- [ ] **Step 1: Suite unit completa**

Run: `npm test`
Expected: PASS (todo verde, incluido el nuevo `resolve-slug.test.ts`).

- [ ] **Step 2: Suite e2e completa (red de regresión de Lomeros)**

La suite existente cubre el flujo real de Lomeros en la raíz. Debe seguir verde sin cambios: ninguna URL de raíz se ha tocado.

Run: `npm run e2e`
Expected: PASS — toda la suite existente verde + `slug-routing.spec.ts`.

- [ ] **Step 3: Guard de acceso directo a DB**

Run: `npm run check:db-access`
Expected: `✅ Sin acceso directo a tablas tenant raíz en src/app.`

- [ ] **Step 4: Build de producción**

Run: `npm run build`
Expected: build OK; la ruta `/g/[slug]` aparece en el árbol de rutas como dinámica.

- [ ] **Step 5: Checklist manual de no-rotura de Lomeros (§0 del spec)**

Confirmar (con `git diff --stat main` y leyendo la salida del build):
- No se modificó ningún fichero existente: solo se crearon `resolve-slug.ts(.test.ts)`, `g/[slug]/page.tsx`, `slug-routing.spec.ts`.
  Run: `git diff --name-status main` → solo líneas `A` (added), ninguna `M`.
- `getSession`, `requireAdmin` y `/api/*` intactos (no aparecen en el diff).
- `/g/lomeros` → 308 a `/` (cubierto por e2e en Task 2).

- [ ] **Step 6: Commit (si hubo algún fixup)**

Si todo pasó sin cambios, no hay nada que commitear en esta task. Si algún paso obligó a un ajuste, commitearlo:

```bash
git add -A
git commit -m "test(fase2): regresión Paso A verde (unit + e2e + build)"
```

---

## Self-Review (autor del plan)

**Cobertura del spec (Paso A):**
- Helper `slug→groupId` + slugs reservados → Task 1. ✅
- Segmento `/g/[slug]` que resuelve contexto y renderiza datos del grupo resuelto → Task 2. ✅
- `/g/lomeros` → 308 a raíz → Task 2 (página) + e2e. ✅
- Slug inexistente/reservado → 404 → Task 1 (lógica) + Task 2 (e2e). ✅
- NO romper Lomeros (raíz intacta, `getSession`/`requireAdmin`/`/api` sin tocar, suite existente verde) → Task 3 (diff solo-añadidos + suite completa). ✅
- *(Diferido a Pasos B/C, por diseño:* migración de `/api`, refactor de auth, aterrizaje grupo-hogar, paridad de páginas, navbar de grupo.*)*

**Placeholders:** ninguno; cada step lleva comando y código completos.

**Consistencia de tipos/nombres:** `isValidGroupSlug`, `RESERVED_SLUGS`, `getGroupBySlug` se definen en Task 1 y se consumen idénticos en Task 2. `GroupRow` se importa de `./queries` (existe). `getDefaultGroupId` de `@/lib/auth/group-context` y `listAllPlayersInGroup` de `@/lib/players/queries` ya existen y se usan hoy en la home.

---

## Próximo paso tras el Paso A

Plan del **Paso B** (migrar `/api` por dominio a grupo explícito + `getGroupContext`, con fallback al por defecto), siguiendo el orden de dominios del spec §6.
