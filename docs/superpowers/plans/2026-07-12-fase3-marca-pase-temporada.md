# Fase 3 — Marca propia + Pase de Temporada · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Branding por grupo (logo + color de acento) aplicado bajo `/g/[slug]`, con Pase de Temporada vía Stripe Checkout — todo tras el flag `BILLING_ENABLED` (apagado = beta gratis).

**Architecture:** Tres columnas nuevas en `groups` (migración idempotente); dos helpers puros de gating (`isPaidGroup` flag-aware para branding/atribución, `hasSeasonPass` para la ⭐); el branding llega a los layouts vía `resolvePageContext().group` (GroupRow ampliado) y se aplica solo en `g/[slug]/layout`; sección nueva `/g/[slug]/admin/marca`; Stripe = checkout de pago único + webhook idempotente por `event.id` (tabla `billing_events`).

**Tech Stack:** Next 16 App Router, Drizzle/libsql, Vercel Blob, `stripe` (SDK server), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-12-fase3-marca-pase-temporada-design.md`

**Contexto para el implementador:**
- Trabajar en la rama `fase3-marca-pase` (ya existe, parte de origin/main con Fase 2 completa).
- Convención API de este repo: mutaciones llevan el grupo en `body.g` (slug o id) y se autorizan con `requireGroupAdmin(await groupIdFromValue(body.g))` — ver `src/app/api/players/route.ts` POST como referencia.
- e2e: dev server en :3100 con DB de fichero; si hay un server viejo vivo, matarlo y borrar `e2e/test.db` antes del run completo.
- ⚠️ La Tarea 2b corre en paralelo en otra sesión y toca `AdminSidebar`/admin de grupo: conflicto pequeño esperado al rebasar antes de la PR.

---

### Task 1: Migración de branding + schema Drizzle + DAL ampliado

**Files:**
- Create: `src/lib/db/migrations/branding.ts`
- Create: `src/app/api/migrate-branding/route.ts`
- Modify: `src/lib/db/schema.ts` (tabla `groups` + nueva `billingEvents`)
- Modify: `src/lib/groups/queries.ts` (GroupRow + selects + 2 updates nuevos)
- Modify: `src/lib/groups/resolve-slug.ts` (select de `getGroupBySlug`)
- Modify: `src/lib/db/bootstrap.ts` (`ensureAuxTables` llama a la migración)

- [ ] **Step 1: Migración idempotente** — crear `src/lib/db/migrations/branding.ts`:

```ts
import type { Client } from '@libsql/client';

export interface BrandingMigrationReport {
  columnsAdded: string[];
}

// Columnas de la Fase 3 en groups: branding (logo/color) + Pase de Temporada.
const GROUP_COLUMNS = ['logo_url TEXT', 'accent_color TEXT', 'paid_until TEXT'] as const;

/**
 * Migración idempotente de la Fase 3 (marca + pase). ALTER ADD COLUMN tolerante a
 * "ya existe" (mismo patrón que ensureAuxTables) + tabla billing_events para la
 * idempotencia del webhook de Stripe (una fila por event.id procesado).
 */
export async function migrateBranding(client: Client): Promise<BrandingMigrationReport> {
  const columnsAdded: string[] = [];
  for (const col of GROUP_COLUMNS) {
    try {
      await client.execute(`ALTER TABLE groups ADD COLUMN ${col}`);
      columnsAdded.push(col.split(' ')[0]);
    } catch {
      /* ya existe */
    }
  }
  await client.execute(`CREATE TABLE IF NOT EXISTS billing_events (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    type TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  return { columnsAdded };
}
```

- [ ] **Step 2: Endpoint de migración** — crear `src/app/api/migrate-branding/route.ts` (calco de `migrate-multitenant`):

```ts
import { NextResponse } from 'next/server';
import { client } from '@/lib/db';
import { migrateBranding } from '@/lib/db/migrations/branding';

// POST /api/migrate-branding
// Fase 3 (logo/color/pase en groups + billing_events). Idempotente. Ejecutar UNA vez
// tras desplegar:  curl -X POST https://<dominio>/api/migrate-branding
export async function POST() {
  try {
    const report = await migrateBranding(client);
    return NextResponse.json({ success: true, report });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al migrar branding' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Schema Drizzle** — en `src/lib/db/schema.ts`, dentro de `export const groups = sqliteTable('groups', {...})`, añadir tras `name`:

```ts
  // Fase 3 (branding + Pase de Temporada). Columnas físicas creadas por /api/migrate-branding.
  logoUrl: text('logo_url'),
  accentColor: text('accent_color'),
  paidUntil: text('paid_until'),
```

y al final del fichero (junto a las demás tablas) la tabla de idempotencia del webhook:

```ts
// ─── BILLING (Fase 3) ────────────────────────────────────────────────────────
// Un registro por evento de Stripe procesado: el webhook hace INSERT .onConflictDoNothing
// y solo aplica el efecto si la fila es nueva (idempotencia por event.id).
export const billingEvents = sqliteTable('billing_events', {
  id: text('id').primaryKey(),
  groupId: text('group_id').notNull(),
  type: text('type').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});
```

⚠️ NO declarar `.default()` en las columnas nuevas de `groups` y NO usarlas en inserts existentes: son opcionales (NULL). El schema Drizzle solo puede declararlas cuando la columna física existe.

**CORRECCIÓN de riesgo (revisión holística):** el `SELECT` de las 3 columnas nuevas está en `groupColumns`/`resolve-slug`, que corren en `resolvePageContext` — el camino caliente de **TODA** página, incluida la raíz de Lomeros (`(public)`/`me`/`admin`/`planificador` layouts). Y `migrateBranding` **NO se ejecuta en ningún request de prod** (solo vía `ensureAuxTables` en seed-staging/tests). Por tanto, si el código que lee las columnas se despliega antes de que existan físicamente, **el SITIO ENTERO da 500** (`no such column: logo_url`), no solo `/g/*`. La migración es **BLOQUEANTE de release**, no un follow-up dormido. Procedimiento de ventana-cero: aplicar los `ALTER TABLE groups ADD COLUMN` (y `billing_events`) contra la Turso de prod **ANTES** de que el deploy sirva lecturas — vía `turso db shell` con el SQL crudo (el endpoint `/api/migrate-branding` viaja en esta PR, así que no existe en el deploy previo). Alternativa aceptable solo si se asume una ventana de segundos con todo el sitio caído: desplegar y hacer `curl -X POST /api/migrate-branding` de inmediato. Ver el runbook de la PR.

- [ ] **Step 4: DAL** — en `src/lib/groups/queries.ts` ampliar `GroupRow` y los selects, y añadir los 2 updates:

```ts
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { groups } from '@/lib/db/schema';

export interface GroupRow {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  accentColor: string | null;
  paidUntil: string | null;
}

const groupColumns = {
  id: groups.id,
  slug: groups.slug,
  name: groups.name,
  logoUrl: groups.logoUrl,
  accentColor: groups.accentColor,
  paidUntil: groups.paidUntil,
};

// Todos los grupos. Lo usa el cron (itera por grupo), el conmutador del súper-admin
// y la futura vista cross-grupo.
export async function listGroups(): Promise<GroupRow[]> {
  return db.select(groupColumns).from(groups);
}

// Un grupo por id (o null). Fuente del nombre de marca (OG y branding Fase 3).
export async function getGroupById(id: string): Promise<GroupRow | null> {
  const [g] = await db.select(groupColumns).from(groups).where(eq(groups.id, id));
  return g ?? null;
}

// Branding editable por el admin del grupo (Fase 3). null = volver al valor por defecto.
export async function updateGroupBranding(
  id: string,
  branding: { logoUrl: string | null; accentColor: string | null },
): Promise<void> {
  await db.update(groups).set(branding).where(eq(groups.id, id));
}

// Vigencia del Pase de Temporada (la escribe SOLO el webhook de Stripe).
export async function setGroupPaidUntil(id: string, paidUntil: string): Promise<void> {
  await db.update(groups).set({ paidUntil }).where(eq(groups.id, id));
}
```

En `src/lib/groups/resolve-slug.ts`, cambiar el select de `getGroupBySlug` para devolver las mismas columnas:

```ts
  const [g] = await db
    .select({
      id: groups.id,
      slug: groups.slug,
      name: groups.name,
      logoUrl: groups.logoUrl,
      accentColor: groups.accentColor,
      paidUntil: groups.paidUntil,
    })
    .from(groups)
    .where(eq(groups.slug, slug));
```

- [ ] **Step 5: tsc** — `npx tsc --noEmit`. Si algún consumidor construye un `GroupRow` literal (buscar con `grep -rn "GroupRow" src e2e --include="*.ts*"`), añadirle los 3 campos nuevos (`logoUrl: null, accentColor: null, paidUntil: null`). Esperado: limpio.

- [ ] **Step 6: e2e/staging al día** — en `src/lib/db/bootstrap.ts`, importar y llamar la migración al FINAL de `ensureAuxTables` (una sola fuente de verdad; cubre e2e y seed-staging):

```ts
import { migrateBranding } from '@/lib/db/migrations/branding';
// ... al final del cuerpo de ensureAuxTables:
  // Fase 3: columnas de branding/pase en groups + billing_events (idempotente).
  await migrateBranding(client);
```

- [ ] **Step 7: unit rápido de no-regresión** — `npx vitest run src/lib/auth` → Esperado: verde (page-context/group-switcher siguen pasando con el GroupRow ampliado; sus mocks devuelven objetos parciales con cast, no deberían romper — si rompen, añadir los 3 campos null a los fixtures del test).

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(fase3): migración branding — logo/color/pase en groups + billing_events + DAL ampliado"
```

---

### Task 2: Gating puro — `isPaidGroup` / `hasSeasonPass`

**Files:**
- Create: `src/lib/billing/paid.ts`
- Test: `src/lib/billing/paid.test.ts`

- [ ] **Step 1: Test que falla** — crear `src/lib/billing/paid.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { hasSeasonPass, isPaidGroup } from './paid';

const NOW = new Date('2026-07-12T00:00:00.000Z');
const paid = { paidUntil: '2027-07-12T00:00:00.000Z' };
const expired = { paidUntil: '2026-01-01T00:00:00.000Z' };
const never = { paidUntil: null };

afterEach(() => vi.unstubAllEnvs());

describe('hasSeasonPass (⭐: pase REAL, ignora el flag)', () => {
  it('vigente → true; caducado o nunca → false', () => {
    expect(hasSeasonPass(paid, NOW)).toBe(true);
    expect(hasSeasonPass(expired, NOW)).toBe(false);
    expect(hasSeasonPass(never, NOW)).toBe(false);
  });

  it('con el billing apagado NO regala la estrella', () => {
    vi.stubEnv('BILLING_ENABLED', '');
    expect(hasSeasonPass(never, NOW)).toBe(false);
  });
});

describe('isPaidGroup (branding/atribución: flag-aware)', () => {
  it('flag apagado (o ausente) → todos de pago (beta)', () => {
    vi.stubEnv('BILLING_ENABLED', '');
    expect(isPaidGroup(never, NOW)).toBe(true);
    vi.stubEnv('BILLING_ENABLED', 'false');
    expect(isPaidGroup(never, NOW)).toBe(true);
  });

  it('flag encendido → manda el pase real', () => {
    vi.stubEnv('BILLING_ENABLED', 'true');
    expect(isPaidGroup(paid, NOW)).toBe(true);
    expect(isPaidGroup(expired, NOW)).toBe(false);
    expect(isPaidGroup(never, NOW)).toBe(false);
  });
});
```

- [ ] **Step 2: Verificar que falla** — `npx vitest run src/lib/billing/paid.test.ts` → Esperado: FAIL (módulo no existe).

- [ ] **Step 3: Implementación** — crear `src/lib/billing/paid.ts`:

```ts
// ¿Tiene el grupo un Pase de Temporada COMPRADO y vigente? Gobierna la ⭐ Tour
// Oficial: un badge ganado, no regalado — por eso ignora BILLING_ENABLED.
export function hasSeasonPass(
  group: { paidUntil: string | null },
  now: Date = new Date(),
): boolean {
  return !!group.paidUntil && group.paidUntil > now.toISOString();
}

// ¿Se aplica la identidad de pago (logo, color, sin atribución)? Con el billing
// APAGADO (beta) todos los grupos cuentan como de pago; encendido, manda el pase.
export function isPaidGroup(
  group: { paidUntil: string | null },
  now: Date = new Date(),
): boolean {
  if (process.env.BILLING_ENABLED !== 'true') return true;
  return hasSeasonPass(group, now);
}
```

- [ ] **Step 4: Verificar verde** — `npx vitest run src/lib/billing/paid.test.ts` → Esperado: PASS (5).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(fase3): gating puro del pase — isPaidGroup (flag) / hasSeasonPass (⭐)"`

---

### Task 3: API de branding — validación, `PUT /api/groups/branding`, `POST /api/upload/logo`

**Files:**
- Create: `src/lib/groups/branding.ts` (helper puro client-safe)
- Test: `src/lib/groups/branding.test.ts`
- Modify: `src/lib/upload/blob-path.ts` (+ test `src/lib/upload/blob-path.test.ts` si existe; si no, añadir casos al test nuevo de branding NO — crear/ampliar el test del propio fichero)
- Create: `src/app/api/groups/branding/route.ts`
- Create: `src/app/api/upload/logo/route.ts`

- [ ] **Step 1: Tests que fallan** — crear `src/lib/groups/branding.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isValidAccentColor } from './branding';
import { buildLogoKey } from '@/lib/upload/blob-path';

describe('isValidAccentColor', () => {
  it('acepta hex #rrggbb', () => {
    expect(isValidAccentColor('#c8f03c')).toBe(true);
    expect(isValidAccentColor('#FF5500')).toBe(true);
  });
  it('rechaza formatos raros (inyección CSS incluida)', () => {
    expect(isValidAccentColor('#fff')).toBe(false);
    expect(isValidAccentColor('red')).toBe(false);
    expect(isValidAccentColor('#c8f03c; background:url(x)')).toBe(false);
    expect(isValidAccentColor(null)).toBe(false);
    expect(isValidAccentColor(123)).toBe(false);
  });
});

describe('buildLogoKey', () => {
  it('namespacea por grupo y normaliza extensión', () => {
    expect(buildLogoKey('g1', 'uuid1', '.PNG')).toBe('logos/g1/uuid1.png');
    expect(buildLogoKey('g1', 'uuid1', '')).toBe('logos/g1/uuid1.jpg');
  });
});
```

- [ ] **Step 2: Verificar que falla** — `npx vitest run src/lib/groups/branding.test.ts` → FAIL.

- [ ] **Step 3: Helpers** — crear `src/lib/groups/branding.ts`:

```ts
// Puro y client-safe (sin DB): validación del color de acento del branding.
// Solo #rrggbb estricto: el valor acaba en un style inline → nada de formatos libres.
export function isValidAccentColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}
```

y en `src/lib/upload/blob-path.ts` añadir:

```ts
// Ruta del blob del logo de grupo: logos/{groupId}/{uuid}.{ext} (Fase 3).
export function buildLogoKey(groupId: string, uuid: string, ext: string): string {
  const clean = ext.replace(/^\./, '').toLowerCase() || 'jpg';
  return `logos/${groupId}/${uuid}.${clean}`;
}
```

- [ ] **Step 4: Verificar verde** — `npx vitest run src/lib/groups/branding.test.ts` → PASS.

- [ ] **Step 5: Ruta de branding** — crear `src/app/api/groups/branding/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireGroupAdmin } from '@/lib/auth/guard';
import { groupIdFromValue } from '@/lib/groups/request-group';
import { isValidAccentColor } from '@/lib/groups/branding';
import { updateGroupBranding } from '@/lib/groups/queries';

// PUT /api/groups/branding — guarda logo/color del grupo (admin DEL grupo; body.g).
// null = limpiar (volver al defecto). El pase (paid_until) NO se toca aquí: solo webhook.
export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });

  const auth = await requireGroupAdmin(await groupIdFromValue(body.g));
  if ('response' in auth) return auth.response;

  const { logoUrl, accentColor } = body;
  if (accentColor !== null && !isValidAccentColor(accentColor)) {
    return NextResponse.json({ error: 'Color inválido (usa #rrggbb)' }, { status: 400 });
  }
  if (logoUrl !== null && (typeof logoUrl !== 'string' || !logoUrl.startsWith('https://'))) {
    return NextResponse.json({ error: 'Logo inválido' }, { status: 400 });
  }

  await updateGroupBranding(auth.ctx.groupId, { logoUrl, accentColor });
  return NextResponse.json({ success: true });
}
```

(Nota: el contrato es PUT con AMBOS campos siempre — el formulario los manda juntos; `undefined` cae en los checks y devuelve 400, correcto.)

- [ ] **Step 6: Ruta de subida de logo** — crear `src/app/api/upload/logo/route.ts` (calco de `src/app/api/upload/route.ts` con guard de admin de grupo):

```ts
import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { requireGroupAdmin } from '@/lib/auth/guard';
import { groupIdFromValue } from '@/lib/groups/request-group';
import { buildLogoKey } from '@/lib/upload/blob-path';

// Subida del logo del grupo (Fase 3): solo el admin DEL grupo (campo g del form).
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const auth = await requireGroupAdmin(await groupIdFromValue(formData.get('g')));
    if ('response' in auth) return auth.response;

    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No se recibió ningún archivo' }, { status: 400 });
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Solo se permiten imágenes' }, { status: 400 });
    }
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'La imagen no puede superar 2MB' }, { status: 400 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const filename = buildLogoKey(auth.ctx.groupId, randomUUID(), ext);
    const blob = await put(filename, file, { access: 'public', contentType: file.type });
    return NextResponse.json({ url: blob.url });
  } catch (e) {
    console.error('Logo upload error:', e);
    return NextResponse.json({ error: 'Error al subir la imagen' }, { status: 500 });
  }
}
```

⚠️ Comprobar la firma real de `groupIdFromValue` en `src/lib/groups/request-group.ts` (acepta `unknown`/string): si tipa estricto `string | null | undefined`, castear `formData.get('g')` con `String(formData.get('g') ?? '') || undefined` según convenga al helper.

- [ ] **Step 7: tsc** — `npx tsc --noEmit` → limpio.

- [ ] **Step 8: Commit** — `git add -A && git commit -m "feat(fase3): API de branding — PUT /api/groups/branding + POST /api/upload/logo (admin del grupo)"`

---

### Task 4: Aplicar el branding bajo `/g/[slug]` (navbar + acento + atribución)

**Files:**
- Modify: `src/components/shared/navbar.tsx` (prop `brand`)
- Modify: `src/app/g/[slug]/layout.tsx`

- [ ] **Step 1: Navbar con marca de grupo** — en `src/components/shared/navbar.tsx`:

Añadir el tipo y la prop (junto a `NavSession`/props actuales):

```ts
export interface NavBrand {
  name: string;
  logoUrl: string | null; // ya viene gateado por isPaidGroup desde el layout
  star: boolean; // ⭐ Tour Oficial (hasSeasonPass)
}
```

En la firma del componente, añadir `brand = null` con tipo `brand?: NavBrand | null`, y sustituir el bloque de la marca:

```tsx
        <Link href={basePath || '/'} className="brand" aria-label="Inicio">
          {brand?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob externo, tamaño fijo
            <img
              src={brand.logoUrl}
              alt=""
              width={34}
              height={34}
              style={{ borderRadius: 8, objectFit: 'cover' }}
            />
          ) : (
            <Crest size={34} className="brand-crest" title={brand?.name ?? 'Lomeros Padel Tour'} wordmark={false} />
          )}
          <span className="brand-name">{brand?.name ?? 'Lomeros Padel Tour'}</span>
          {brand?.star && (
            <span title="Tour Oficial" aria-label="Tour Oficial" style={{ fontSize: 14 }}>
              ⭐
            </span>
          )}
        </Link>
```

Sin `brand` (todas las páginas raíz) el navbar queda **byte a byte como hoy**.

- [ ] **Step 2: Layout de grupo** — reescribir `src/app/g/[slug]/layout.tsx`:

```tsx
import { permanentRedirect } from 'next/navigation';
import { Navbar } from '@/components/shared/navbar';
import { navSessionFromContext, resolvePageContext } from '@/lib/auth/page-context';
import { getSwitcherGroups } from '@/lib/auth/group-switcher';
import { hasSeasonPass, isPaidGroup } from '@/lib/billing/paid';

export const dynamic = 'force-dynamic';

export default async function GroupLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await resolvePageContext(slug); // notFound() si el slug no existe

  if (ctx.basePath === '') permanentRedirect('/'); // /g/lomeros → raíz canónica

  // Branding Fase 3: identidad de pago (logo/color/sin atribución) gateada por
  // isPaidGroup (flag-aware: en beta, todos); la ⭐ solo con pase REAL comprado.
  const paid = isPaidGroup(ctx.group);
  const accent = paid ? ctx.group.accentColor : null;
  const brand = {
    name: ctx.group.name,
    logoUrl: paid ? ctx.group.logoUrl : null,
    star: hasSeasonPass(ctx.group),
  };

  return (
    <div
      className="min-h-dvh flex flex-col"
      data-branding={accent ? 'custom' : 'default'}
      style={
        accent
          ? ({
              // --acc-text se computa en :root con el --acc de :root, así que al
              // sobreescribir --acc hay que redeclararla aquí (misma fórmula, theme-aware vía var(--ink)).
              '--acc': accent,
              '--acc-text': `color-mix(in oklab, ${accent} 55%, var(--ink))`,
            } as React.CSSProperties)
          : undefined
      }
    >
      <Navbar
        session={navSessionFromContext(ctx)}
        basePath={ctx.basePath}
        links={[]}
        brand={brand}
        switcher={await getSwitcherGroups(ctx.groupId)}
      />
      <main className="screen">
        <div className="lpt-container">{children}</div>
      </main>
      {!paid && (
        <footer className="muted" style={{ textAlign: 'center', fontSize: 12, padding: '12px 0 20px' }}>
          hecho con Lomeros Padel Tour
        </footer>
      )}
    </div>
  );
}
```

⚠️ Si el `switcher`/`session` del layout actual difiere de lo de arriba (la Tarea 3 acaba de tocarlo), conservar lo existente y añadir SOLO `brand`, `data-branding`, `style` y el footer.

- [ ] **Step 3: Ajustar e2e existentes que asuman la marca vieja** — `grep -rn "Lomeros Padel Tour" e2e/*.spec.ts`. Los usos dentro de menús del conmutador (`getByRole('menu')`) no cambian. Si algún spec asierta la marca del navbar EN páginas `/g/` (p.ej. paridad group-home), actualizarlo a esperar el nombre del grupo. Correr los specs afectados: `npx playwright test e2e/group-home.spec.ts e2e/group-switcher.spec.ts` (los que existan) → verdes.

- [ ] **Step 4: tsc + unit** — `npx tsc --noEmit && npx vitest run` → limpio/verde.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(fase3): branding aplicado bajo /g — marca de grupo en navbar, acento custom y atribución"`

---

### Task 5: Sección "Marca" del admin de grupo

**Files:**
- Create: `src/app/g/[slug]/admin/marca/page.tsx`
- Create: `src/components/admin/branding-form.tsx`
- Modify: `src/components/admin/admin-sidebar.tsx`

- [ ] **Step 1: Página** — crear `src/app/g/[slug]/admin/marca/page.tsx`:

```tsx
import { resolvePageContext } from '@/lib/auth/page-context';
import { hasSeasonPass } from '@/lib/billing/paid';
import { BrandingForm } from '@/components/admin/branding-form';

export const dynamic = 'force-dynamic';

// Marca del grupo (Fase 3): logo + color de acento + estado del Pase de Temporada.
// Solo existe bajo /g/[slug] (la raíz es el grupo por defecto: su marca es la del producto).
export default async function GroupBrandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await resolvePageContext(slug); // el layout admin ya gateó el rol

  return (
    <BrandingForm
      slug={slug}
      initial={{ logoUrl: ctx.group.logoUrl, accentColor: ctx.group.accentColor }}
      pass={{
        billingEnabled: process.env.BILLING_ENABLED === 'true',
        active: hasSeasonPass(ctx.group),
        paidUntil: ctx.group.paidUntil,
      }}
    />
  );
}
```

- [ ] **Step 2: Formulario cliente** — crear `src/components/admin/branding-form.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const DEFAULT_ACCENT = '#c8f03c'; // --acc por defecto (globals.css)

export function BrandingForm({
  slug,
  initial,
  pass,
}: {
  slug: string;
  initial: { logoUrl: string | null; accentColor: string | null };
  pass: { billingEnabled: boolean; active: boolean; paidUntil: string | null };
}) {
  const router = useRouter();
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [accentColor, setAccentColor] = useState(initial.accentColor);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [uploading, setUploading] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  async function uploadLogo(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set('g', slug);
      fd.set('file', file);
      const res = await fetch('/api/upload/logo', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) setLogoUrl(data.url);
      else setStatus('error');
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setStatus('saving');
    const res = await fetch('/api/groups/branding', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ g: slug, logoUrl, accentColor }),
    });
    setStatus(res.ok ? 'saved' : 'error');
    if (res.ok) router.refresh();
  }

  async function buyPass() {
    setCheckingOut(true);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ g: slug }),
      });
      const data = await res.json();
      if (res.ok && data.url) window.location.assign(data.url);
      else setStatus('error');
    } finally {
      setCheckingOut(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Marca</h1>

      <section className="lpt-card p-4 flex flex-col gap-3">
        <h2 className="font-medium">Logo</h2>
        <div className="flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- preview del blob subido
            <img src={logoUrl} alt="Logo del grupo" width={48} height={48} style={{ borderRadius: 10, objectFit: 'cover' }} />
          ) : (
            <span className="muted text-sm">Sin logo (se usa el escudo por defecto)</span>
          )}
          <label className="lpt-btn" style={{ cursor: 'pointer' }}>
            {uploading ? 'Subiendo…' : 'Subir logo'}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
            />
          </label>
          {logoUrl && (
            <button className="lpt-btn" onClick={() => setLogoUrl(null)}>
              Quitar
            </button>
          )}
        </div>
      </section>

      <section className="lpt-card p-4 flex flex-col gap-3">
        <h2 className="font-medium">Color de acento</h2>
        <div className="flex items-center gap-3">
          <input
            type="color"
            aria-label="Color de acento"
            value={accentColor ?? DEFAULT_ACCENT}
            onChange={(e) => setAccentColor(e.target.value)}
            style={{ width: 48, height: 32, cursor: 'pointer' }}
          />
          {accentColor && (
            <button className="lpt-btn" onClick={() => setAccentColor(null)}>
              Volver al de serie
            </button>
          )}
        </div>
      </section>

      <section className="lpt-card p-4 flex flex-col gap-2">
        <h2 className="font-medium">Pase de Temporada</h2>
        {pass.active ? (
          <p className="text-sm">
            ⭐ Tour Oficial — activo hasta {new Date(pass.paidUntil!).toLocaleDateString('es-ES')}
          </p>
        ) : pass.billingEnabled ? (
          <>
            <p className="muted text-sm">
              Tu marca (logo, color y sin atribución) se aplica con el Pase de Temporada.
            </p>
            <button className="lpt-btn primary" onClick={buyPass} disabled={checkingOut}>
              {checkingOut ? 'Abriendo…' : 'Conseguir el Pase de Temporada'}
            </button>
          </>
        ) : (
          <p className="muted text-sm">Incluido durante la beta — tu marca se aplica sin pagar.</p>
        )}
      </section>

      <div className="flex items-center gap-3">
        <button className="lpt-btn primary" onClick={save} disabled={status === 'saving'}>
          {status === 'saving' ? 'Guardando…' : 'Guardar'}
        </button>
        {status === 'saved' && <span className="muted text-sm">Guardado ✓</span>}
        {status === 'error' && <span className="text-sm" style={{ color: 'var(--loss-text)' }}>Error al guardar</span>}
      </div>
    </div>
  );
}
```

(Ajustar clases al sistema del repo si algo no existe: `lpt-btn`, `lpt-card`, `muted` sí existen en `globals.css`.)

- [ ] **Step 3: Sidebar** — en `src/components/admin/admin-sidebar.tsx`: importar `Palette` de lucide, añadir al final de `adminLinks`:

```ts
  { href: '/admin/marca', label: 'Marca', icon: Palette },
```

y cambiar el filtrado para que Marca solo salga bajo grupo (no hay página raíz):

```ts
// Solo-grupo: secciones sin página en la raíz (la marca de la raíz es la del producto).
const GROUP_ONLY_LINKS = new Set(['/admin/marca']);

// dentro del componente:
  const links = basePath
    ? adminLinks.filter((l) => GROUP_MVP_LINKS.has(l.href) || GROUP_ONLY_LINKS.has(l.href))
    : adminLinks.filter((l) => !GROUP_ONLY_LINKS.has(l.href));
```

⚠️ Si la Tarea 2b ya cambió este filtrado (GROUP_MVP_LINKS puede haber crecido o desaparecido), integrar la entrada Marca respetando su lógica nueva: la invariante es "Marca visible bajo grupo, ausente en raíz".

- [ ] **Step 4: Smoke manual** — `npx tsc --noEmit` limpio; arrancar el server e2e NO hace falta aquí (el e2e de Task 7 lo cubre).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(fase3): sección Marca del admin de grupo — logo, color y estado del Pase"`

---

### Task 6: Stripe — checkout de pago único + webhook idempotente

**Files:**
- Modify: `package.json` (dep `stripe`)
- Create: `src/lib/billing/pass.ts` (+ test `src/lib/billing/pass.test.ts`)
- Create: `src/lib/billing/stripe.ts`
- Create: `src/lib/billing/events.ts`
- Create: `src/app/api/billing/checkout/route.ts`
- Create: `src/app/api/billing/webhook/route.ts`

- [ ] **Step 1: Instalar SDK** — `npm install stripe` (server-only; no toca el bundle cliente).

- [ ] **Step 2: Test que falla (extensión del pase)** — crear `src/lib/billing/pass.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extendedPaidUntil } from './pass';

const NOW = new Date('2026-07-12T10:00:00.000Z');

describe('extendedPaidUntil', () => {
  it('sin pase previo (o caducado) → un año desde hoy', () => {
    expect(extendedPaidUntil(null, NOW)).toBe('2027-07-12T10:00:00.000Z');
    expect(extendedPaidUntil('2026-01-01T00:00:00.000Z', NOW)).toBe('2027-07-12T10:00:00.000Z');
  });
  it('pase vigente → EXTIENDE un año desde su fin (renovar antes no penaliza)', () => {
    expect(extendedPaidUntil('2026-12-31T00:00:00.000Z', NOW)).toBe('2027-12-31T00:00:00.000Z');
  });
});
```

- [ ] **Step 3: Verificar que falla** — `npx vitest run src/lib/billing/pass.test.ts` → FAIL.

- [ ] **Step 4: Implementación** — crear `src/lib/billing/pass.ts`:

```ts
// Nuevo fin del Pase tras un pago: +1 año desde el fin vigente (renovar antes de
// caducar no penaliza) o desde hoy si no había pase o estaba caducado.
export function extendedPaidUntil(current: string | null, now: Date = new Date()): string {
  const base = current && current > now.toISOString() ? new Date(current) : now;
  const next = new Date(base);
  next.setFullYear(next.getFullYear() + 1);
  return next.toISOString();
}
```

- [ ] **Step 5: Verificar verde** — `npx vitest run src/lib/billing/pass.test.ts` → PASS.

- [ ] **Step 6: Cliente Stripe + registro de eventos** — crear `src/lib/billing/stripe.ts`:

```ts
import Stripe from 'stripe';

// Cliente para CREAR sesiones de checkout: exige la clave real.
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY no configurada');
  return new Stripe(key);
}

// La verificación de firma del webhook solo usa STRIPE_WEBHOOK_SECRET, no la API key
// (así el webhook es testeable en e2e sin clave real).
export function getStripeForWebhooks(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_dummy');
}
```

y `src/lib/billing/events.ts`:

```ts
import { db } from '@/lib/db';
import { billingEvents } from '@/lib/db/schema';

// Registra un evento de Stripe. Devuelve true solo la PRIMERA vez (idempotencia:
// reintentos del mismo event.id no reaplican el efecto).
export async function recordBillingEvent(id: string, groupId: string, type: string): Promise<boolean> {
  const res = await db.insert(billingEvents).values({ id, groupId, type }).onConflictDoNothing();
  return res.rowsAffected > 0;
}
```

- [ ] **Step 7: Checkout** — crear `src/app/api/billing/checkout/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireGroupAdmin } from '@/lib/auth/guard';
import { groupIdFromValue } from '@/lib/groups/request-group';
import { getGroupById } from '@/lib/groups/queries';
import { getStripe } from '@/lib/billing/stripe';

// POST /api/billing/checkout — crea la sesión de pago del Pase de Temporada
// (pago único anual; admin DEL grupo; body.g). Dormido tras BILLING_ENABLED.
export async function POST(request: NextRequest) {
  if (process.env.BILLING_ENABLED !== 'true') {
    return NextResponse.json(
      { error: 'El Pase de Temporada está incluido durante la beta' },
      { status: 503 },
    );
  }
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });

  const auth = await requireGroupAdmin(await groupIdFromValue(body.g));
  if ('response' in auth) return auth.response;

  const group = await getGroupById(auth.ctx.groupId);
  if (!group) return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 });

  try {
    const back = `${request.nextUrl.origin}/g/${group.slug}/admin/marca`;
    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      metadata: { groupId: group.id },
      success_url: `${back}?pase=ok`,
      cancel_url: back,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error('Stripe checkout error:', e);
    return NextResponse.json({ error: 'No se pudo iniciar el pago' }, { status: 500 });
  }
}
```

- [ ] **Step 8: Webhook** — crear `src/app/api/billing/webhook/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripeForWebhooks } from '@/lib/billing/stripe';
import { recordBillingEvent } from '@/lib/billing/events';
import { extendedPaidUntil } from '@/lib/billing/pass';
import { getGroupById, setGroupPaidUntil } from '@/lib/groups/queries';

// POST /api/billing/webhook — único escritor de groups.paid_until.
// Firma verificada con STRIPE_WEBHOOK_SECRET sobre el body RAW; idempotente por
// event.id (billing_events). Siempre 200 a eventos válidos aunque no nos interesen.
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'Webhook no configurado' }, { status: 503 });

  const payload = await request.text();
  const signature = request.headers.get('stripe-signature') ?? '';

  let event: Stripe.Event;
  try {
    event = getStripeForWebhooks().webhooks.constructEvent(payload, signature, secret);
  } catch {
    return NextResponse.json({ error: 'Firma inválida' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const groupId = (event.data.object as Stripe.Checkout.Session).metadata?.groupId;
    if (groupId) {
      const fresh = await recordBillingEvent(event.id, groupId, event.type);
      if (fresh) {
        const group = await getGroupById(groupId);
        if (group) await setGroupPaidUntil(groupId, extendedPaidUntil(group.paidUntil));
      }
    }
  }

  return NextResponse.json({ received: true });
}
```

⚠️ `constructEvent` es SÍNCRONO y usa el body como string tal cual (`request.text()`), no `request.json()`. Si tsc protesta por `res.rowsAffected` en drizzle/libsql, usar `(res as { rowsAffected: number }).rowsAffected`.

- [ ] **Step 9: tsc + unit** — `npx tsc --noEmit && npx vitest run` → limpio/verde.

- [ ] **Step 10: Commit** — `git add -A && git commit -m "feat(fase3): Stripe — checkout de pago único + webhook idempotente del Pase (dormido tras BILLING_ENABLED)"`

---

### Task 7: e2e — fixtures + `group-branding.spec.ts`

**Files:**
- Modify: `playwright.config.ts`
- Modify: `e2e/global-setup.ts`
- Create: `e2e/group-branding.spec.ts`

- [ ] **Step 1: Env del webServer** — en `playwright.config.ts`: añadir constante y env:

```ts
const TEST_STRIPE_WEBHOOK_SECRET = 'whsec_e2e';
```

en el `command` del webServer, añadir antes de `npm run dev:e2e`:

```
BILLING_ENABLED=true STRIPE_WEBHOOK_SECRET=${TEST_STRIPE_WEBHOOK_SECRET}
```

y en `TEST_ENV` exportar `STRIPE_WEBHOOK_SECRET: TEST_STRIPE_WEBHOOK_SECRET`.

(Con el flag ON en e2e se prueba el gating real; `STRIPE_SECRET_KEY` NO se define — el checkout no se e2e-a, su lógica de guard ya está cubierta por el patrón común y el flag.)

- [ ] **Step 2: Fixtures** — en `e2e/global-setup.ts`, (a) añadir `'migrate-branding'` a la lista de migraciones del paso 1 (tras `'migrate-multitenant'`); (b) tras el bloque del torneo GT, sembrar el estado de branding:

```ts
  // Fase 3 (branding): grupo-test CON Pase vigente (fecha lejana, estable entre runs);
  // grupo-free SIN pase para probar atribución/sin-⭐/acento por defecto con el flag ON.
  // El paid_until de grupo-free se RESETEA cada run: el spec del webhook lo activa.
  await db.execute({
    sql: `UPDATE groups SET paid_until = ? WHERE id = 'grupo-test'`,
    args: ['2100-01-01T00:00:00.000Z'],
  });
  await db.execute({
    sql: `INSERT OR IGNORE INTO groups (id, slug, name) VALUES ('grupo-free', 'grupo-free', 'Grupo Free')`,
  });
  await db.execute(`UPDATE groups SET paid_until = NULL, logo_url = NULL, accent_color = NULL WHERE id = 'grupo-free'`);
```

- [ ] **Step 3: Spec** — crear `e2e/group-branding.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { TEST_ENV } from '../playwright.config';

// Firma de webhook de Stripe (esquema t=...,v1=HMAC-SHA256(t.payload)) sin SDK.
function stripeSignature(payload: string, secret: string): string {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

// ORDEN IMPORTA: el spec del webhook activa el pase de grupo-free, así que las
// aserciones "sin pase" van antes (workers=1, orden de fichero).

test.describe('marca · grupo sin pase (flag e2e ON)', () => {
  test('navbar: nombre del grupo + atribución, sin ⭐ ni acento custom', async ({ page }) => {
    await page.goto('/g/grupo-free');
    await expect(page.locator('.brand-name').first()).toHaveText('Grupo Free');
    await expect(page.getByText('hecho con Lomeros Padel Tour').first()).toBeVisible();
    await expect(page.getByLabel('Tour Oficial')).toHaveCount(0);
    await expect(page.locator('[data-branding="custom"]')).toHaveCount(0);
  });
});

test.describe('marca · grupo con pase (grupo-test)', () => {
  test('navbar: nombre + ⭐ y sin atribución', async ({ page }) => {
    await page.goto('/g/grupo-test');
    await expect(page.locator('.brand-name').first()).toHaveText('Grupo Test');
    await expect(page.getByLabel('Tour Oficial').first()).toBeVisible();
    await expect(page.getByText('hecho con Lomeros Padel Tour')).toHaveCount(0);
  });

  test.describe('como admin del grupo', () => {
    test.use({ storageState: 'e2e/.auth/gt-admin.json' });

    test('guarda color de acento por API y la home lo aplica; luego lo limpia', async ({ page, request }) => {
      const res = await request.put('/api/groups/branding', {
        data: { g: 'grupo-test', accentColor: '#ff5500', logoUrl: null },
      });
      expect(res.ok()).toBeTruthy();
      await page.goto('/g/grupo-test');
      await expect(page.locator('[data-branding="custom"]').first()).toBeVisible();
      // Limpieza (la DB de fichero se reutiliza entre runs locales).
      const clear = await request.put('/api/groups/branding', {
        data: { g: 'grupo-test', accentColor: null, logoUrl: null },
      });
      expect(clear.ok()).toBeTruthy();
    });

    test('color inválido → 400', async ({ request }) => {
      const res = await request.put('/api/groups/branding', {
        data: { g: 'grupo-test', accentColor: 'red; url(x)', logoUrl: null },
      });
      expect(res.status()).toBe(400);
    });

    test('la página admin/marca muestra formulario y pase activo', async ({ page }) => {
      await page.goto('/g/grupo-test/admin/marca');
      await expect(page.getByRole('heading', { name: 'Marca' }).first()).toBeVisible();
      await expect(page.getByText(/activo hasta/).first()).toBeVisible();
    });
  });
});

test.describe('marca · authz cross-grupo', () => {
  test.describe('admin de Lomeros (ajeno al grupo)', () => {
    test.use({ storageState: 'e2e/.auth/admin.json' });
    test('PUT branding de grupo-test → 403', async ({ request }) => {
      const res = await request.put('/api/groups/branding', {
        data: { g: 'grupo-test', accentColor: '#00ff00', logoUrl: null },
      });
      expect(res.status()).toBe(403);
    });
  });

  test.describe('jugador del grupo (no admin)', () => {
    test.use({ storageState: 'e2e/.auth/gt-player.json' });
    test('PUT branding → 403', async ({ request }) => {
      const res = await request.put('/api/groups/branding', {
        data: { g: 'grupo-test', accentColor: '#00ff00', logoUrl: null },
      });
      expect(res.status()).toBe(403);
    });
  });
});

test.describe('marca · webhook del Pase (Stripe)', () => {
  test('checkout.session.completed activa el pase de grupo-free; reintento idempotente', async ({ page, request }) => {
    const event = {
      id: `evt_e2e_${Date.now()}`,
      type: 'checkout.session.completed',
      data: { object: { metadata: { groupId: 'grupo-free' } } },
    };
    const payload = JSON.stringify(event);
    const headers = {
      'stripe-signature': stripeSignature(payload, TEST_ENV.STRIPE_WEBHOOK_SECRET),
      'content-type': 'application/json',
    };
    const res = await request.post('/api/billing/webhook', { data: payload, headers });
    expect(res.ok()).toBeTruthy();
    // Reintento del MISMO event.id: 200 sin reaplicar (no suma otro año; aquí
    // basta con que responda ok y el estado siga siendo "con pase").
    const retry = await request.post('/api/billing/webhook', { data: payload, headers });
    expect(retry.ok()).toBeTruthy();

    await page.goto('/g/grupo-free');
    await expect(page.getByLabel('Tour Oficial').first()).toBeVisible();
    await expect(page.getByText('hecho con Lomeros Padel Tour')).toHaveCount(0);
  });

  test('firma inválida → 400', async ({ request }) => {
    const res = await request.post('/api/billing/webhook', {
      data: JSON.stringify({ id: 'evt_x', type: 'checkout.session.completed' }),
      headers: { 'stripe-signature': 't=1,v1=deadbeef', 'content-type': 'application/json' },
    });
    expect(res.status()).toBe(400);
  });
});
```

- [ ] **Step 4: Run del spec nuevo** — `pkill -f "next dev -p 3100"; rm -f e2e/test.db; npx playwright test e2e/group-branding.spec.ts` → Esperado: PASS (8).

- [ ] **Step 5: Suite completa** — `pkill -f "next dev -p 3100"; rm -f e2e/test.db; npx playwright test` → Esperado: TODO verde. ⚠️ El flag `BILLING_ENABLED=true` y el grupo nuevo `grupo-free` pueden afectar a specs existentes (conmutador del súper-admin ahora lista 3 grupos; navbar de grupo con nombre nuevo): si algo asierta contra la marca vieja o cuenta grupos, actualizar ese spec con criterio (la intención de producto manda) y anotarlo en el commit.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "test(fase3): e2e de branding — navbar/acento/authz + webhook del Pase con firma"`

---

### Task 8: Verificación final + PR

- [ ] **Step 1: Rebase** — `git fetch origin && git rebase origin/main` (la Tarea 2b puede haber mergeado: resolver conflictos en `admin-sidebar.tsx`/layouts respetando su lógica + la invariante "Marca solo bajo grupo").
- [ ] **Step 2: Batería completa** — `npx tsc --noEmit && npx vitest run && npm run lint && npm run check:db-access`, después `pkill -f "next dev -p 3100"; rm -f e2e/test.db; npx playwright test` → todo verde (lint: 0 errores; los 3 warnings pre-existentes no cuentan).
- [ ] **Step 3: Push + PR draft** —

```bash
git push -u origin fase3-marca-pase
gh pr create --draft --title "feat(fase3): marca propia + Pase de Temporada (paywall apagado)" --body "<resumen: spec, decisiones, garantía raíz intacta, orden de deploy: mergear → curl -X POST /api/migrate-branding, env vars nuevas (BILLING_ENABLED/STRIPE_*: ninguna necesaria hoy), tests>"
```

- [ ] **Step 4: Nota de deploy en la PR** — dejar explícito: tras el merge ejecutar `curl -X POST https://<dominio>/api/migrate-branding` (idempotente); no configurar ninguna env de Stripe hasta encender la caja; `BILLING_ENABLED` sin definir = apagado = beta.

---

## Self-review del plan (hecho)

- **Cobertura de spec:** datos/migración (T1), gating (T2), API branding+logo (T3), aplicación bajo /g (T4), admin marca (T5), Stripe checkout+webhook idempotente (T6), e2e con flag ON + fixtures (T7). OG diferida y raíz intacta: recogidas como no-acciones explícitas.
- **Sin placeholders:** cada step con código completo y comandos con resultado esperado.
- **Consistencia de tipos:** `GroupRow` ampliado en T1 es el que consumen T2 (Pick paidUntil), T4/T5 (ctx.group) y T6 (getGroupById); `buildLogoKey`/`isValidAccentColor` definidos en T3 y usados solo ahí; `extendedPaidUntil`/`recordBillingEvent` definidos en T6 y usados en su webhook.
