# Multi-tenant Fase 1 — Paso 1D (namespacing transversal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cablear los transversales (cron, push, blob de avatares, OG/marca) para que operen **por grupo**, cerrando la Fase 1 multi-tenant — sin cambio visible para Lomeros.

**Architecture:** Es el último paso de la Fase 1 (plumbing invisible). 1B/1C ya scopearon datos y roles; 1D scopea lo que quedaba fuera del request-por-usuario: (1) el **cron** de recordatorios itera por grupo; (2) el **push** resuelve destinatarios por grupo vía membership (cierra la deuda de `userIdsForPlayers` group-agnostic de 1C y añade `sendToGroup`); (3) el **blob** de avatares se namespacea `avatars/{groupId}/…`; (4) el **OG image** lee el nombre desde el registro del grupo (fuente única para Fase 2-3). Los ~13 literales "Lomeros" globales y estáticos (manifest/layout/navbar/crest/home/login/info) se DEJAN para Fase 4 — el spec §7 los difiere explícitamente; en Fase 1 el output es idéntico.

**Tech Stack:** Next.js (App Router, versión con breaking changes — ver `node_modules/next/dist/docs/`), Drizzle ORM + Turso/libSQL, web-push (VAPID), @vercel/blob, Vitest (unit, lógica pura), Playwright (e2e).

---

## Contexto imprescindible (leer antes de tocar nada)

- **Procedimiento del proyecto:** TDD donde haya lógica pura; lo que toca el `db` compartido o infra (push/blob/cron/OG) se cubre por e2e de humo + tsc (el repo **no** tiene tests unit de DAL ni e2e de push/cron/OG/blob — su listón para esas superficies es lógica pura + regresión). Commits por tarea; al final `git push origin HEAD:main` (Vercel auto-despliega). **Sin migración de DB** (no se añaden columnas; `groups` ya existe con `name`).
- **Estado de partida:** `getSession`/roles ya leen de `memberships` (1C). El push ya usa `memberships` pero `userIdsForPlayers` es **group-agnostic** (deuda de 1C que 1D cierra). Las `pushSubscriptions` cuelgan de `users`, no de grupo → a quién notificar se decide vía membership del grupo (spec §2).
- **`groups`** (schema) tiene `id`, `slug`, `name` (sin colores/logo — eso es Fase 3). `LOMEROS_GROUP_NAME='Lomeros Padel Tour'` en `src/lib/groups/constants.ts`. No hay DAL de groups todavía (solo `getDefaultGroupId` en `group-context.ts`).
- **Cron** (`vercel.json`): `/api/cron/match-reminders?kind=day|eve`, protegido por `Authorization: Bearer CRON_SECRET`. El entorno e2e **no** trae `CRON_SECRET` ni VAPID (Task 6 añade `CRON_SECRET` al webServer de Playwright; sin VAPID el push no entrega pero las rutas no fallan).
- **OG** (`(public)/matches/[id]/opengraph-image.tsx`): es público (sin sesión) → resuelve `getDefaultGroupId()`. En Fase 1 solo renderiza partidos del grupo por defecto. El cambio de marca produce el MISMO texto ("Lomeros Padel Tour"), ahora leído de `group.name`.

### Mapa de ficheros

| Fichero | Tarea | Cambio |
|---|---|---|
| `src/lib/groups/queries.ts` (nuevo) | 1 | `listGroups()`, `getGroupById(id)`. |
| `src/lib/push/send.ts` | 2 | `userIdsForPlayers(groupId, playerIds)`; nuevo `sendToGroup(groupId, payload)`; **borra** `sendToAll`. |
| `src/lib/push/bet-events.ts` | 2 | `notifyBettingOpen` → `sendToGroup(match.groupId, …)` (+`groupId` en `ScheduledMatchForPush`); `notifyBetSettlements` → `userIdsForPlayers(match.groupId, …)`. |
| `src/lib/push/match-events.ts` | 2 | `userIdsForPlayers(match.groupId, …)` (×2). |
| `src/app/api/push/broadcast/route.ts` | 2 | `sendToGroup(adminGroupId, …)` en vez de `sendToAll`. |
| `src/app/api/cron/match-reminders/route.ts` | 3 | Itera `listGroups()`; por grupo: scheduled + reminders + `userIdsForPlayers(group.id, …)`. |
| `src/lib/upload/blob-path.ts` (+`.test.ts`) | 4 | Helper puro `buildAvatarKey(groupId, uuid, ext)` → `avatars/{groupId}/{uuid}.{ext}`. |
| `src/app/api/upload/route.ts` | 4 | Resuelve groupId y usa `buildAvatarKey`. |
| `src/app/(public)/matches/[id]/opengraph-image.tsx` | 5 | Lee el nombre del grupo (`getGroupById`), reemplaza el literal. |
| `playwright.config.ts` | 6 | `CRON_SECRET` en el webServer + en `TEST_ENV`. |
| `e2e/1d-namespacing.spec.ts` (nuevo) | 6 | Cron por grupo (200 con bearer, 401 sin), broadcast admin (200). |

---

## Task 1: DAL de groups (`listGroups`, `getGroupById`)

**Files:**
- Create: `src/lib/groups/queries.ts`

(Sin unit test: toca el `db` compartido → patrón DAL del repo, cubierto por e2e/tsc.)

- [ ] **Step 1: Crear `src/lib/groups/queries.ts`**

```ts
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { groups } from '@/lib/db/schema';

export interface GroupRow {
  id: string;
  slug: string;
  name: string;
}

// Todos los grupos. Lo usa el cron (itera por grupo) y la futura vista cross-grupo.
export async function listGroups(): Promise<GroupRow[]> {
  return db.select({ id: groups.id, slug: groups.slug, name: groups.name }).from(groups);
}

// Un grupo por id (o null). Fuente del nombre de marca (OG y, en Fase 3, branding).
export async function getGroupById(id: string): Promise<GroupRow | null> {
  const [g] = await db
    .select({ id: groups.id, slug: groups.slug, name: groups.name })
    .from(groups)
    .where(eq(groups.id, id));
  return g ?? null;
}
```

- [ ] **Step 2: tsc verde**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/groups/queries.ts
git commit -m "feat(multitenant): DAL de groups (listGroups/getGroupById) para 1D"
```

---

## Task 2: Push scopeado por grupo

**Files:**
- Modify: `src/lib/push/send.ts`
- Modify: `src/lib/push/bet-events.ts`
- Modify: `src/lib/push/match-events.ts`
- Modify: `src/app/api/push/broadcast/route.ts`

(Sin unit test: db/infra → e2e de humo en Task 6 + tsc fuerza el groupId en cada call-site.)

- [ ] **Step 1: `send.ts` — `userIdsForPlayers(groupId, …)`, `sendToGroup`, borra `sendToAll`**

En `src/lib/push/send.ts`: cambiar el import de `drizzle-orm` para incluir `and`, y sustituir `userIdsForPlayers`/`sendToAll`.

Import (línea 2) pasa a:
```ts
import { inArray, eq, and } from 'drizzle-orm';
```

`userIdsForPlayers` pasa a:
```ts
// Returns the userIds linked (vía membership del grupo) to any of the given playerIds.
export async function userIdsForPlayers(groupId: string, playerIds: string[]): Promise<string[]> {
  if (playerIds.length === 0) return [];
  const rows = await db
    .select({ id: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.groupId, groupId), inArray(memberships.playerId, playerIds)));
  return rows.map((r) => r.id);
}
```

Borrar `sendToAll` (líneas 81-84) y, en su lugar, añadir `sendToGroup`:
```ts
// Envía a TODOS los miembros del grupo (vía sus suscripciones). Reemplaza a sendToAll,
// que enviaba sin scoping. Los miembros = users con membership en el grupo.
export async function sendToGroup(groupId: string, payload: PushPayload): Promise<number> {
  const memberRows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.groupId, groupId));
  const userIds = memberRows.map((r) => r.userId);
  if (userIds.length === 0) return 0;
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, userIds));
  return sendToSubscriptions(subs, payload);
}
```

- [ ] **Step 2: `bet-events.ts` — scopear ambas funciones por el grupo del partido**

En `src/lib/push/bet-events.ts`:

(a) Cambiar el import (línea 5) a:
```ts
import { sendToGroup, sendToUsers, userIdsForPlayers } from './send';
```

(b) Añadir `groupId` a `ScheduledMatchForPush` (la interfaz, líneas 8-17):
```ts
export interface ScheduledMatchForPush {
  id: string;
  groupId: string;
  date: string;
  time: string | null;
  location: string | null;
  team1Player1Id: string;
  team1Player2Id: string;
  team2Player1Id: string;
  team2Player2Id: string;
}
```
(El caller en `api/matches/route.ts:93` ya pasa el `Match` completo, que tiene `groupId` → satisface la interfaz sin tocar el caller.)

(c) En `notifyBettingOpen`, actualizar el comentario y sustituir `sendToAll(` por `sendToGroup(match.groupId, `:
```ts
// Avisa a los miembros DEL GRUPO de que un nuevo partido está disponible para
// apostar en La Timba. Best-effort: nunca lanza.
export async function notifyBettingOpen(match: ScheduledMatchForPush): Promise<void> {
  try {
    const ids = [match.team1Player1Id, match.team1Player2Id, match.team2Player1Id, match.team2Player2Id];
    const rows = await db.select().from(players).where(inArray(players.id, ids));
    const nameOf = (id: string) => {
      const p = rows.find((r) => r.id === id);
      return p?.nickname || p?.name || '?';
    };
    const label = `${nameOf(ids[0])}/${nameOf(ids[1])} vs ${nameOf(ids[2])}/${nameOf(ids[3])}`;
    await sendToGroup(
      match.groupId,
      buildBettingOpenNotification(
        label,
        { date: match.date, time: match.time, location: match.location },
        match.id,
      ),
    );
  } catch (error) {
    console.error('notifyBettingOpen error', error);
  }
}
```

(d) En `notifyBetSettlements`, el `match` cargado de la DB tiene `groupId`. Sustituir la línea `const userIds = await userIdsForPlayers([o.playerId]);` por:
```ts
      const userIds = await userIdsForPlayers(match.groupId, [o.playerId]);
```

- [ ] **Step 3: `match-events.ts` — scopear por `match.groupId` (×2)**

En `src/lib/push/match-events.ts`, `MatchTeams` ya tiene `groupId`. Sustituir las DOS llamadas:
- línea 37: `const userIds = await userIdsForPlayers([ec.playerId]);` →
```ts
      const userIds = await userIdsForPlayers(match.groupId, [ec.playerId]);
```
- línea 49: `const userIds = await userIdsForPlayers([ach.playerId]);` →
```ts
      const userIds = await userIdsForPlayers(match.groupId, [ach.playerId]);
```

- [ ] **Step 4: `broadcast/route.ts` — emitir al grupo del admin**

En `src/app/api/push/broadcast/route.ts`:

(a) Imports (líneas 2-3) pasan a:
```ts
import { requireAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { sendToGroup } from '@/lib/push/send';
```

(b) Dentro del `try`, resolver el grupo del admin y usar `sendToGroup`:
```ts
    const { title, body, url } = await request.json();
    if (!title || !body) {
      return NextResponse.json({ error: 'Título y cuerpo son obligatorios' }, { status: 400 });
    }
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    const sent = await sendToGroup(groupId, {
      title: String(title),
      body: String(body),
      url: typeof url === 'string' && url.length > 0 ? url : '/',
      tag: 'broadcast',
    });
    return NextResponse.json({ success: true, sent });
```

- [ ] **Step 5: tsc verde (debe forzar todos los call-sites de `userIdsForPlayers`)**

Run: `npx tsc --noEmit`
Expected: PASS. Si tsc señala alguna llamada a `userIdsForPlayers` sin groupId que el plan no listó, arreglarla con el groupId del contexto y anotarlo.

- [ ] **Step 6: Commit**

```bash
git add src/lib/push/send.ts src/lib/push/bet-events.ts src/lib/push/match-events.ts src/app/api/push/broadcast/route.ts
git commit -m "feat(multitenant): push (reminders/bets/broadcast) scopeado por grupo vía membership (1D)"
```

---

## Task 3: Cron de recordatorios itera por grupo

**Files:**
- Modify: `src/app/api/cron/match-reminders/route.ts`

(Sin unit test: la lógica pura `selectReminders` ya está testada en `src/lib/push/reminders.test.ts`; el bucle por grupo se cubre en e2e Task 6.)

- [ ] **Step 1: Reescribir el handler en `src/app/api/cron/match-reminders/route.ts`**

El fichero queda:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notificationLog } from '@/lib/db/schema';
import { listGroups } from '@/lib/groups/queries';
import { listScheduledMatches } from '@/lib/matches/queries';
import { madridDateParts, selectReminders } from '@/lib/push/reminders';
import { buildReminderNotification } from '@/lib/push/notifications';
import { sendToUsers, userIdsForPlayers } from '@/lib/push/send';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/cron/match-reminders?kind=day|eve
// Lo invoca Vercel Cron con el header Authorization: Bearer <CRON_SECRET>.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const kindParam = new URL(request.url).searchParams.get('kind');
  const wantKind = kindParam === 'eve' ? 'reminder_eve' : 'reminder_day';

  const { today, tomorrow } = madridDateParts(new Date());
  const groups = await listGroups();

  let sent = 0;
  for (const group of groups) {
    const scheduled = await listScheduledMatches(group.id);
    const due = selectReminders(scheduled, today, tomorrow).filter((r) => r.kind === wantKind);

    for (const r of due) {
      // Idempotencia: insertar en notification_log; si choca con UNIQUE, ya se envió.
      try {
        await db.insert(notificationLog).values({ matchId: r.matchId, kind: r.kind });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('UNIQUE') && !msg.includes('constraint')) {
          console.error('notification_log insert failed unexpectedly', r.matchId, err);
        }
        continue;
      }
      const m = scheduled.find((x) => x.id === r.matchId);
      if (!m) continue;
      const playerIds = [m.team1Player1Id, m.team1Player2Id, m.team2Player1Id, m.team2Player2Id];
      const userIds = await userIdsForPlayers(group.id, playerIds);
      await sendToUsers(
        userIds,
        buildReminderNotification(r.kind, { time: m.time, location: m.location }, r.matchId),
      );
      sent++;
    }
  }

  return NextResponse.json({ ok: true, kind: wantKind, sent });
}
```

Cambios: se quita el import de `getDefaultGroupId`, se añade `listGroups`, y el cuerpo envuelve la lógica existente en un `for (const group of groups)` pasando `group.id` a `listScheduledMatches` y `userIdsForPlayers`.

- [ ] **Step 2: tsc verde**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/match-reminders/route.ts
git commit -m "feat(multitenant): el cron de recordatorios itera por grupo (1D)"
```

---

## Task 4: Blob de avatares namespaceado `avatars/{groupId}/…`

**Files:**
- Create: `src/lib/upload/blob-path.ts`
- Test: `src/lib/upload/blob-path.test.ts`
- Modify: `src/app/api/upload/route.ts`

- [ ] **Step 1: Escribir el test que falla (`src/lib/upload/blob-path.test.ts`)**

```ts
import { describe, it, expect } from 'vitest';
import { buildAvatarKey } from './blob-path';

describe('buildAvatarKey', () => {
  it('namespacea la ruta del avatar por grupo', () => {
    expect(buildAvatarKey('lomeros', 'abc-123', 'png')).toBe('avatars/lomeros/abc-123.png');
  });

  it('normaliza la extensión a minúsculas y sin punto', () => {
    expect(buildAvatarKey('grupo-test', 'uuid', '.JPG')).toBe('avatars/grupo-test/uuid.jpg');
  });

  it('cae a jpg si la extensión viene vacía', () => {
    expect(buildAvatarKey('lomeros', 'uuid', '')).toBe('avatars/lomeros/uuid.jpg');
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/lib/upload/blob-path.test.ts`
Expected: FAIL ("buildAvatarKey is not defined" / módulo no existe).

- [ ] **Step 3: Crear `src/lib/upload/blob-path.ts`**

```ts
// Ruta del blob de avatar namespaceada por grupo: avatars/{groupId}/{uuid}.{ext}.
// La extensión se normaliza (sin punto, minúsculas) y cae a 'jpg' si viene vacía.
export function buildAvatarKey(groupId: string, uuid: string, ext: string): string {
  const clean = ext.replace(/^\./, '').toLowerCase() || 'jpg';
  return `avatars/${groupId}/${uuid}.${clean}`;
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `npx vitest run src/lib/upload/blob-path.test.ts`
Expected: PASS.

- [ ] **Step 5: Cablear `src/app/api/upload/route.ts`**

El fichero queda:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { randomUUID } from 'crypto';
import { requireSession } from '@/lib/auth/guard';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { buildAvatarKey } from '@/lib/upload/blob-path';

export async function POST(req: NextRequest) {
  // Subida de avatar: la usa el admin (fichas de jugador) y también el propio
  // jugador desde /me/edit, así que basta con estar autenticado (no solo admin).
  const auth = await requireSession();
  if ('response' in auth) return auth.response;
  try {
    const formData = await req.formData();
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

    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const filename = buildAvatarKey(groupId, randomUUID(), ext);

    const blob = await put(filename, file, {
      access: 'public',
      contentType: file.type,
    });

    return NextResponse.json({ url: blob.url });
  } catch (e) {
    console.error('Upload error:', e);
    return NextResponse.json({ error: 'Error al subir la imagen' }, { status: 500 });
  }
}
```

- [ ] **Step 6: tsc + el test del helper verde**

Run: `npx tsc --noEmit && npx vitest run src/lib/upload/blob-path.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/upload/blob-path.ts src/lib/upload/blob-path.test.ts src/app/api/upload/route.ts
git commit -m "feat(multitenant): avatares namespaceados avatars/{groupId}/ (1D)"
```

---

## Task 5: OG image lee el nombre desde el grupo (fuente única)

**Files:**
- Modify: `src/app/(public)/matches/[id]/opengraph-image.tsx`

Cambia el literal de marca del footer por el nombre del grupo que se está renderizando. En Fase 1 el output es idéntico ("Lomeros Padel Tour"), pero ahora sale de `group.name` → fuente única para Fase 2-3.

- [ ] **Step 1: Imports**

Añadir a los imports de la cabecera:
```ts
import { getGroupById } from '@/lib/groups/queries';
import { LOMEROS_GROUP_NAME } from '@/lib/groups/constants';
```

- [ ] **Step 2: Resolver el nombre tras `getDefaultGroupId`**

Dentro del `export default async function Image`, justo después de `const groupId = await getDefaultGroupId();`, añadir:
```ts
  const brandName = (await getGroupById(groupId))?.name ?? LOMEROS_GROUP_NAME;
```

- [ ] **Step 3: Usar `brandName` en el footer**

Sustituir la línea `<span>Lomeros Padel Tour</span>` (≈línea 235) por:
```tsx
            <span>{brandName}</span>
```

- [ ] **Step 4: tsc verde**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(public)/matches/[id]/opengraph-image.tsx"
git commit -m "feat(multitenant): el OG del partido lee el nombre desde el grupo (1D)"
```

---

## Task 6: e2e de humo del cron por grupo + broadcast + config

**Files:**
- Modify: `playwright.config.ts`
- Create: `e2e/1d-namespacing.spec.ts`

El cron y el push son infra (sin VAPID el push no entrega), así que el e2e es de **humo/regresión**: que el cron corra el bucle por grupo end-to-end sin reventar, que su guard siga vivo, y que el broadcast (que ahora usa `sendToGroup`) responda. La corrección del scoping la garantiza tsc (el tipo obliga groupId en cada llamada).

- [ ] **Step 1: Añadir `CRON_SECRET` al webServer de Playwright**

En `playwright.config.ts`:

(a) Tras `const TEST_ADMIN_EMAIL = 'e2e-admin@test.com';` añadir:
```ts
const TEST_CRON_SECRET = 'e2e-cron-secret';
```

(b) En el `command` del `webServer`, añadir `CRON_SECRET=${TEST_CRON_SECRET}` a las env vars (junto a `AUTH_SECRET`/`ADMIN_EMAIL`):
```ts
    command: `rm -f e2e/test.db && TURSO_DATABASE_URL=file:./e2e/test.db TURSO_AUTH_TOKEN= AUTH_SECRET=${TEST_AUTH_SECRET} ADMIN_EMAIL=${TEST_ADMIN_EMAIL} CRON_SECRET=${TEST_CRON_SECRET} npm run dev:e2e`,
```

(c) Exportarlo en `TEST_ENV`:
```ts
export const TEST_ENV = { AUTH_SECRET: TEST_AUTH_SECRET, ADMIN_EMAIL: TEST_ADMIN_EMAIL, DB_URL: 'file:./e2e/test.db', CRON_SECRET: TEST_CRON_SECRET };
```

- [ ] **Step 2: Crear `e2e/1d-namespacing.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { TEST_ENV } from '../playwright.config';

test.describe('1D — namespacing transversal', () => {
  test('el cron de recordatorios corre el bucle por grupo (200 con bearer)', async ({ request }) => {
    const res = await request.get('/api/cron/match-reminders?kind=day', {
      headers: { authorization: `Bearer ${TEST_ENV.CRON_SECRET}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.kind).toBe('reminder_day');
    expect(typeof body.sent).toBe('number');
  });

  test('el cron rechaza sin el bearer correcto (401)', async ({ request }) => {
    const res = await request.get('/api/cron/match-reminders?kind=day');
    expect(res.status()).toBe(401);
  });

  test('el broadcast del admin responde (sendToGroup cableado)', async ({ page }) => {
    const res = await page.request.post('/api/push/broadcast', {
      data: { title: 'Hola', body: 'Aviso de prueba' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.sent).toBe('number');
  });
});
```

Notas:
- El test del broadcast usa `page` (storageState admin del proyecto, igual que el spec de 1C). Si el default del proyecto no fuese admin, envolver ese test con `test.use({ storageState: 'e2e/.auth/admin.json' })` (verificar `playwright.config.ts`).
- El test del cron usa el fixture `request` (sin cookies); el cron no requiere sesión, solo el bearer.

- [ ] **Step 3: Ejecutar la nueva e2e**

Run: `npm run e2e -- 1d-namespacing`
Expected: PASS (3 tests).

- [ ] **Step 4: Ejecutar TODA la suite e2e (regresión: Lomeros intacto)**

Run: `npm run e2e`
Expected: PASS (toda la suite existente + la nueva).

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts e2e/1d-namespacing.spec.ts
git commit -m "test(e2e): cron por grupo + broadcast scopeado (1D)"
```

---

## Verificación final (antes de push)

- [ ] `npx tsc --noEmit` → limpio.
- [ ] `npx vitest run` → toda la suite unit verde (incluye el nuevo `blob-path.test.ts`).
- [ ] `npm run e2e` → toda la suite e2e verde.
- [ ] `rg -n "sendToAll" src` → cero hits (eliminado; no debe quedar ningún broadcast sin scoping).
- [ ] `rg -n "userIdsForPlayers\(" src` → todas las llamadas pasan `groupId` como primer argumento.
- [ ] Push: `git push origin HEAD:main` (Vercel auto-despliega). **Sin curl de migración** (1D no migra datos).
- [ ] Sanity prod tras el deploy: home/login/rankings 200; un partido público renderiza su OG (200 image/png); el cron sigue protegido (sin bearer → 401). Login/admin intactos.

---

## Riesgos y notas

- **NO romper Lomeros:** ningún cambio es visible. El cron procesa los mismos partidos (ahora agrupados por grupo; con un solo grupo real el resultado es idéntico). El push llega a los mismos usuarios (los del grupo del partido). El blob namespacea solo las subidas NUEVAS (las URLs viejas siguen guardadas en la ficha, intactas). El OG muestra el mismo texto.
- **Deuda de 1C cerrada:** `userIdsForPlayers` pasa a estar scopeado por grupo (era group-agnostic). `sendToAll` (broadcast global sin scoping) se elimina en favor de `sendToGroup`.
- **Branding (alcance deliberado):** 1D cablea SOLO el OG (única superficie per-grupo dinámica) + el DAL de groups como fuente única. Los ~13 literales globales estáticos (manifest/layout/navbar/crest/home/login/info) se DEJAN para Fase 4 — el spec §7 los difiere y hacerlos dinámicos en Fase 1 (metadata global sin grupo de request) añadiría lecturas a DB en el render global por cero cambio de comportamiento.
- **Testabilidad de push/cron/OG/blob:** el repo nunca los testeó por e2e (no hay VAPID/Blob en el entorno de prueba). 1D se apoya en: tsc (obliga groupId en cada call-site de push), unit del helper puro del blob, e2e de humo del cron/broadcast, y la suite e2e existente verde (regresión). La entrega real de push no es e2e-able aquí (consistente con el estado previo).
- **Cierra la Fase 1.** Después: **Fase 2** (onboarding self-service, routing por slug `/g/[slug]`, conmutador de grupo del súper-admin), **Fase 3** (marca configurable + paywall) — entonces se retoman los literales globales y los colores/logo del grupo.
</content>
