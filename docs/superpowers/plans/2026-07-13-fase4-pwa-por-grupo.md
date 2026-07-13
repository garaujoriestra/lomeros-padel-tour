# Fase 4 · Pieza 2 — PWA por-grupo (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la PWA instalada refleje la identidad del grupo desde el que se instaló (nombre/icono/color): raíz `/` → «Lomeros Padel Tour», `/g/<slug>` → la marca del grupo. «Padelo» queda solo como marca de plataforma no-instalable.

**Architecture:** Un constructor puro `buildGroupManifest` alimenta tanto el `manifest.ts` de la raíz (identidad del grupo insignia Lomeros, con constantes → build-safe) como un Route Handler `/g/[slug]/manifest.webmanifest` (dinámico, resuelve el grupo por slug). El layout de grupo enlaza su manifest vía `metadata.manifest`. Iconos por-grupo generados con `ImageResponse` (monograma sobre el color de acento, o escudo de plataforma si el grupo no tiene marca de pago). Gating espejo de Fase 3 (`isPaidGroup`).

**Tech Stack:** Next.js 16 (App Router, RSC, Route Handlers, `next/og` ImageResponse), React 19, TypeScript, Vitest (unit — entorno node, sin RTL → los componentes/rutas se verifican en e2e), Playwright (e2e). Spec: `docs/superpowers/specs/2026-07-13-fase4-pwa-por-grupo-design.md`.

**Notas:** `npm install` en el worktree antes de tests. Sin cambios de esquema (las columnas de branding ya existen en prod, Fase 3). Regla de `AGENTS.md` (e2e obligatorio) + guard `check:db-access`.

---

### Task 1: `buildGroupManifest` (constructor puro) + tests

**Files:**
- Create: `src/lib/groups/manifest.ts`
- Create: `src/lib/groups/manifest.test.ts`

- [ ] **Step 1: Escribir los tests (TDD, fallan primero)**

`src/lib/groups/manifest.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildGroupManifest } from './manifest';

const PLATFORM_BG = '#0c1715';
const lomeros = { name: 'Lomeros Padel Tour', slug: 'lomeros', logoUrl: null, accentColor: null };

describe('buildGroupManifest', () => {
  it('grupo por defecto (basePath \'\'): start_url / e identidad Lomeros, iconos de plataforma', () => {
    const m = buildGroupManifest({ brand: lomeros, basePath: '', paid: true });
    expect(m.name).toBe('Lomeros Padel Tour');
    expect(m.start_url).toBe('/');
    expect(m.id).toBe('/');
    expect(m.scope).toBe('/');
    expect(m.theme_color).toBe(PLATFORM_BG);
    expect(m.icons?.map((i) => i.src)).toEqual(['/icon', '/icon-512', '/icon-maskable']);
  });

  it('grupo de pago con acento: start_url /g/<slug>, theme = acento, iconos del grupo', () => {
    const m = buildGroupManifest({
      brand: { name: 'Los Cracks', slug: 'cracks', logoUrl: null, accentColor: '#ff3366' },
      basePath: '/g/cracks',
      paid: true,
    });
    expect(m.name).toBe('Los Cracks');
    expect(m.start_url).toBe('/g/cracks');
    expect(m.scope).toBe('/');
    expect(m.theme_color).toBe('#ff3366');
    expect(m.icons?.map((i) => i.src)).toEqual(['/g/cracks/icon', '/g/cracks/icon-512', '/g/cracks/icon-maskable']);
    expect(m.icons?.find((i) => i.purpose === 'maskable')?.src).toBe('/g/cracks/icon-maskable');
  });

  it('grupo NO de pago: nombre del grupo pero color e iconos de plataforma', () => {
    const m = buildGroupManifest({
      brand: { name: 'Los Cracks', slug: 'cracks', logoUrl: 'https://x/logo.png', accentColor: '#ff3366' },
      basePath: '/g/cracks',
      paid: false,
    });
    expect(m.name).toBe('Los Cracks');
    expect(m.theme_color).toBe(PLATFORM_BG);
    expect(m.icons?.map((i) => i.src)).toEqual(['/icon', '/icon-512', '/icon-maskable']);
  });

  it('grupo de pago con logo pero sin acento válido: iconos del grupo, theme de plataforma', () => {
    const m = buildGroupManifest({
      brand: { name: 'G', slug: 'g', logoUrl: 'https://x/l.png', accentColor: 'no-color' },
      basePath: '/g/g',
      paid: true,
    });
    expect(m.theme_color).toBe(PLATFORM_BG);
    expect(m.icons?.[0].src).toBe('/g/g/icon');
  });
});
```

- [ ] **Step 2: Ejecutar → FALLA** (`npm test -- groups/manifest`, "buildGroupManifest is not a function").

- [ ] **Step 3: Implementar `src/lib/groups/manifest.ts`**

```ts
import type { MetadataRoute } from 'next';
import { isValidAccentColor } from './branding';

const PLATFORM_BG = '#0c1715';

export type ManifestBrand = {
  name: string;
  slug: string;
  logoUrl: string | null;
  accentColor: string | null;
};

/** Construye el manifest PWA de un grupo. Puro (sin DB). `basePath` '' = grupo por
 *  defecto (raíz); `/g/<slug>` para el resto. Gating espejo de Fase 3 vía `paid`. */
export function buildGroupManifest({
  brand,
  basePath,
  paid,
}: {
  brand: ManifestBrand;
  basePath: '' | `/g/${string}`;
  paid: boolean;
}): MetadataRoute.Manifest {
  const start = basePath || '/';
  const accent = paid && isValidAccentColor(brand.accentColor) ? brand.accentColor : null;
  const hasCustomBranding = paid && (!!accent || !!brand.logoUrl);
  const iconBase = hasCustomBranding ? basePath : '';
  return {
    id: start,
    name: brand.name,
    short_name: brand.name,
    description: `Ranking Elo, partidos y apuestas de ${brand.name}`,
    start_url: start,
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: PLATFORM_BG,
    theme_color: accent ?? PLATFORM_BG,
    icons: [
      { src: `${iconBase}/icon`, sizes: '192x192', type: 'image/png' },
      { src: `${iconBase}/icon-512`, sizes: '512x512', type: 'image/png' },
      { src: `${iconBase}/icon-maskable`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
```

- [ ] **Step 4: Ejecutar → PASA** (`npm test -- groups/manifest`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/groups/manifest.ts src/lib/groups/manifest.test.ts
git commit -m "feat(fase4): buildGroupManifest — constructor puro del manifest PWA por grupo"
```

---

### Task 2: Raíz `manifest.ts` = identidad Lomeros + sacar del guard

**Files:**
- Modify: `src/app/manifest.ts`
- Modify: `src/lib/groups/platform-name.test.ts`

- [ ] **Step 1: Reescribir `src/app/manifest.ts`**

```ts
import type { MetadataRoute } from 'next';
import { buildGroupManifest } from '@/lib/groups/manifest';
import { LOMEROS_GROUP_NAME, LOMEROS_GROUP_SLUG } from '@/lib/groups/constants';

// La raíz `/` es el grupo insignia (Lomeros). Identidad estática desde constantes
// (build-safe, sin DB): el grupo por defecto no tiene marca de pago propia. Un
// despliegue con un grupo por defecto branded necesitaría leer DB (fuera de alcance).
export default function manifest(): MetadataRoute.Manifest {
  return buildGroupManifest({
    brand: { name: LOMEROS_GROUP_NAME, slug: LOMEROS_GROUP_SLUG, logoUrl: null, accentColor: null },
    basePath: '',
    paid: true,
  });
}
```

- [ ] **Step 2: Sacar `manifest.ts` del guard**

En `src/lib/groups/platform-name.test.ts`, quitar la línea `'src/app/manifest.ts',` de `PLATFORM_FILES` (el manifest ahora representa legítimamente la identidad del grupo insignia, no la marca de plataforma). Añadir un comentario:

```ts
// NOTA: src/app/manifest.ts NO está aquí a propósito — desde Fase 4 · Pieza 2 el
// manifest es la identidad del grupo (raíz = Lomeros insignia), no «Padelo».
const PLATFORM_FILES = [
  'src/app/login/page.tsx',
  'src/app/layout.tsx',
  'src/components/shared/crest.tsx',
  'src/app/g/[slug]/layout.tsx',
  'src/components/players/player-profile-view.tsx',
];
```

- [ ] **Step 3: Verificar**

Run: `npm test -- platform-name groups/manifest`
Expected: PASS (5 ficheros en el guard, todos verdes; manifest builder verde).

- [ ] **Step 4: Commit**

```bash
git add src/app/manifest.ts src/lib/groups/platform-name.test.ts
git commit -m "feat(fase4): manifest de la raíz = identidad Lomeros (insignia); fuera del guard de plataforma"
```

---

### Task 3: Iconos por-grupo generados

**Files:**
- Create: `src/lib/og/group-icon.tsx`
- Create: `src/app/g/[slug]/icon/route.tsx`
- Create: `src/app/g/[slug]/icon-512/route.tsx`
- Create: `src/app/g/[slug]/icon-maskable/route.tsx`
- Create: `src/app/g/[slug]/apple-icon/route.tsx`

- [ ] **Step 1: Helper compartido `src/lib/og/group-icon.tsx`**

```tsx
import { ImageResponse } from 'next/og';
import { crestDataUri } from '@/components/shared/crest-svg';
import { getGroupBySlug } from '@/lib/groups/resolve-slug';
import { isPaidGroup } from '@/lib/billing/paid';
import { isValidAccentColor, isDarkColor } from '@/lib/groups/branding';

const PLATFORM_BG = 'linear-gradient(160deg, #1d2f2c 0%, #0c1715 60%)';

// Icono PWA de un grupo. Con marca de pago (acento o logo) → monograma (inicial del
// nombre) sobre el color de acento; si no → escudo de plataforma (idéntico a /icon).
// `safe` < 1 reduce el contenido para dejar zona segura en la variante maskable.
export async function renderGroupIcon(slug: string, canvas: number, safe = 1): Promise<ImageResponse> {
  const group = await getGroupBySlug(slug);
  const paid = group ? isPaidGroup(group) : false;
  const accent = group && paid && isValidAccentColor(group.accentColor) ? group.accentColor : null;
  const hasBrand = !!group && paid && (!!accent || !!group.logoUrl);

  if (!hasBrand) {
    const inner = Math.round(canvas * 0.72 * safe);
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: PLATFORM_BG }}>
          <img src={crestDataUri(inner)} width={inner} height={Math.round(inner * 1.08)} alt="" />
        </div>
      ),
      { width: canvas, height: canvas },
    );
  }

  const bg = accent ?? '#0c1715';
  const fg = accent && !isDarkColor(accent) ? '#0c1715' : '#ffffff';
  const letter = (group!.name.trim()[0] ?? '?').toUpperCase();
  const fontSize = Math.round(canvas * 0.5 * safe);
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: bg }}>
        <div style={{ fontSize, fontWeight: 800, fontStyle: 'italic', color: fg, lineHeight: 1 }}>{letter}</div>
      </div>
    ),
    { width: canvas, height: canvas },
  );
}
```

- [ ] **Step 2: Las 4 rutas**

`src/app/g/[slug]/icon/route.tsx`:
```tsx
import { renderGroupIcon } from '@/lib/og/group-icon';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return renderGroupIcon(slug, 192);
}
```

`src/app/g/[slug]/icon-512/route.tsx`: idéntico salvo `return renderGroupIcon(slug, 512);`

`src/app/g/[slug]/icon-maskable/route.tsx`: idéntico salvo `return renderGroupIcon(slug, 512, 0.8);`

`src/app/g/[slug]/apple-icon/route.tsx`: idéntico salvo `return renderGroupIcon(slug, 180);`

- [ ] **Step 3: Verificar compilación** (`npm run lint` — sin errores nuevos). Sin test unitario (ImageResponse → se verifica en e2e Task 5).

- [ ] **Step 4: Commit**

```bash
git add src/lib/og/group-icon.tsx "src/app/g/[slug]/icon" "src/app/g/[slug]/icon-512" "src/app/g/[slug]/icon-maskable" "src/app/g/[slug]/apple-icon"
git commit -m "feat(fase4): iconos PWA por-grupo (monograma sobre acento / escudo de plataforma)"
```

---

### Task 4: Route handler del manifest de grupo + enganche en el layout

**Files:**
- Create: `src/app/g/[slug]/manifest.webmanifest/route.ts`
- Modify: `src/app/g/[slug]/layout.tsx` (el `generateMetadata` de Pieza 1)

- [ ] **Step 1: Route handler**

`src/app/g/[slug]/manifest.webmanifest/route.ts`:
```ts
import { getGroupBySlug } from '@/lib/groups/resolve-slug';
import { isPaidGroup } from '@/lib/billing/paid';
import { buildGroupManifest } from '@/lib/groups/manifest';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const group = await getGroupBySlug(slug);
  if (!group) return new Response('Not found', { status: 404 });
  const manifest = buildGroupManifest({
    brand: group,
    basePath: `/g/${slug}`,
    paid: isPaidGroup(group),
  });
  return Response.json(manifest, { headers: { 'content-type': 'application/manifest+json' } });
}
```

- [ ] **Step 2: Enganchar en `generateMetadata` del layout de grupo**

El layout ya importa `isPaidGroup` e `isValidAccentColor`. Sustituir el `generateMetadata` actual por:
```tsx
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const ctx = await resolvePageContext(slug);
  const paid = isPaidGroup(ctx.group);
  const hasCustomBranding = paid && (isValidAccentColor(ctx.group.accentColor) || !!ctx.group.logoUrl);
  return {
    title: { default: ctx.group.name },
    manifest: `/g/${slug}/manifest.webmanifest`,
    ...(hasCustomBranding ? { icons: { apple: `/g/${slug}/apple-icon` } } : {}),
  };
}
```

- [ ] **Step 3: Verificar** (`npm run lint`, `npm run check:db-access`, `npm test` → verdes).

- [ ] **Step 4: Commit**

```bash
git add "src/app/g/[slug]/manifest.webmanifest" "src/app/g/[slug]/layout.tsx"
git commit -m "feat(fase4): manifest por-grupo servido y enlazado desde el layout de grupo"
```

---

### Task 5: e2e + suites completas

**Files:**
- Create: `e2e/fase4-pwa-grupo.spec.ts`
- Read (setup de grupo): `e2e/fase4-first-run.spec.ts`, `e2e/group-home.spec.ts`

- [ ] **Step 1: Leer el patrón de setup**

Leer `e2e/fase4-first-run.spec.ts` (crea un grupo vía onboarding/dev-login) y `e2e/group-home.spec.ts` para reutilizar helpers de creación de grupo + sesión forjada. Para el caso «grupo con acento» conviene un grupo con `accentColor` seteado: si el flujo de branding no es trivial en e2e, usar un grupo existente del global-setup que ya tenga branding, o setear el acento vía la API de branding (`PUT /api/groups/branding`) como hace `e2e/group-branding.spec.ts` — **leer ese spec** para el patrón exacto.

- [ ] **Step 2: Escribir el spec**

```ts
import { test, expect } from '@playwright/test';
// helpers de creación de grupo/branding: ver e2e/fase4-first-run.spec.ts y e2e/group-branding.spec.ts

test.describe('Fase 4 · PWA por-grupo', () => {
  test('manifest de la raíz = «Lomeros Padel Tour», no «Padelo»', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.ok()).toBeTruthy();
    const m = await res.json();
    expect(m.name).toBe('Lomeros Padel Tour');
    expect(m.start_url).toBe('/');
    // iconos 512 + maskable siguen presentes (regresión de pwa-manifest.spec.ts)
    const entries = m.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}${i.purpose ? `:${i.purpose}` : ''}`);
    expect(entries).toContain('512x512');
    expect(entries).toContain('512x512:maskable');
  });

  test('manifest de un grupo lleva su nombre y start_url /g/<slug>', async ({ request }) => {
    const slug = /* grupo de test existente, p.ej. 'grupo-test' */ 'grupo-test';
    const res = await request.get(`/g/${slug}/manifest.webmanifest`);
    expect(res.ok()).toBeTruthy();
    const m = await res.json();
    expect(m.start_url).toBe(`/g/${slug}`);
    expect(m.scope).toBe('/');
    expect(typeof m.name).toBe('string');
    expect(m.name).not.toBe('Padelo');
  });

  test('slug inexistente → 404', async ({ request }) => {
    const res = await request.get('/g/no-existe-xyz/manifest.webmanifest');
    expect(res.status()).toBe(404);
  });

  test('una página de grupo enlaza su manifest (un solo <link rel=manifest>)', async ({ page }) => {
    const slug = 'grupo-test';
    await page.goto(`/g/${slug}`);
    const links = page.locator('link[rel="manifest"]');
    await expect(links).toHaveCount(1);
    await expect(links).toHaveAttribute('href', new RegExp(`/g/${slug}/manifest\\.webmanifest`));
  });

  test('las rutas de icono del grupo sirven PNG', async ({ request }) => {
    const slug = 'grupo-test';
    for (const p of [`/g/${slug}/icon`, `/g/${slug}/icon-512`, `/g/${slug}/icon-maskable`]) {
      const r = await request.get(p);
      expect(r.ok()).toBeTruthy();
      expect(r.headers()['content-type']).toContain('image/png');
    }
  });
});
```

Ajustar `slug` al grupo real del setup. **Si el test del «un solo link» falla con 2 links** (colisión entre la convención `manifest.ts` y `metadata.manifest`), ESCALAR: la alternativa es no usar la convención `manifest.ts` y servir `/manifest.webmanifest` como Route Handler + `metadata.manifest` también en el layout raíz. Reportarlo antes de improvisar.

- [ ] **Step 3: Ejecutar el spec** (`npx playwright test e2e/fase4-pwa-grupo.spec.ts`), iterar selectores/slug hasta PASS.

- [ ] **Step 4: Suites completas** (regresión):
  - `npm test` → verde (incl. `platform-name` con 5 ficheros y `groups/manifest`).
  - `npm run e2e` → verde (incl. `pwa-manifest.spec.ts` sin cambios y `fase4-first-run.spec.ts` de Pieza 1). Si solo flakea `group-admin` (flake pre-existente conocido), re-correrlo una vez y reportar.

- [ ] **Step 5: Commit**

```bash
git add e2e/fase4-pwa-grupo.spec.ts
git commit -m "test(fase4): e2e PWA por-grupo — manifest raíz Lomeros, manifest/iconos de grupo, 404, link único"
```

---

## Self-review (autor)

**Cobertura del spec:**
- §2.1 `buildGroupManifest` puro → Task 1. ✅
- §2.2 raíz = Lomeros → Task 2. ✅
- §2.3 route handler por grupo → Task 4. ✅
- §2.4 enganche `metadata.manifest` + apple-icon → Task 4. ✅
- §2.5 iconos generados → Task 3. ✅
- §3 guard sin manifest.ts → Task 2. ✅
- §4 testing (unit builder + e2e manifest/iconos/404/link) → Tasks 1 y 5. ✅

**Placeholders:** el único no-literal es el `slug` del grupo de test en el e2e (Task 5), que se ajusta al helper real — decisión consciente (no inventar API de helpers).

**Consistencia de tipos:** `buildGroupManifest({ brand, basePath, paid })` con `ManifestBrand` usado igual en raíz (constantes), route handler (GroupRow) e (implícitamente) el gating del layout; `renderGroupIcon(slug, canvas, safe?)` firma única usada por las 4 rutas; `hasCustomBranding` calculado igual en el builder (para iconos) y en el layout (para apple-icon).

**Riesgo conocido:** la interacción convención `manifest.ts` ↔ `metadata.manifest` (¿un link o dos?) — cubierta por el assert «un solo link» en Task 5 con plan de escalado explícito.
