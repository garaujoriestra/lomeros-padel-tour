# Fase 1 · Paso 1B-4 — Scoping del dominio de torneos (pozos + torneos)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scopear por `group_id` todo el dominio de torneos — `tournaments` (raíz) y sus 5 sub-tablas (hijas vía FK) — a nivel de API y páginas, de modo que ningún miembro del grupo A pueda listar, ver, generar, editar, borrar ni registrar resultados de pozos/torneos del grupo B, **sin cambiar nada visible para Lomeros**.

**Architecture:** Patrón **gatekeeper en la ruta/página** (igual que el de `settle` en 1B-3, pero aplicado a la entrada de cada operación). Solo 3 funciones del motor hacen escaneos *realmente* globales y reciben `groupId`: `createEvent` (fija la columna), `listEvents` y `listEventSummaries` (listados sin filtro). El resto del motor (`loadEvent`, `generateEvent`, `recordResult`, `replacePairs`, `updateEvent`, `deleteEvent` y todos los `*-run`/`pair-store`) opera por `tournamentId`/`matchId` y **NO se toca**: cada ruta/página valida primero que el torneo está en el grupo con un gatekeeper nuevo (`getTournamentInGroup`), y una vez verificado el padre, todas las operaciones por FK de las sub-tablas son in-grupo. Esto evita enhebrar `groupId` por la cadena delicada del motor (`event-engine`→`pozo-engine`→`pozo-run`/`torneo-run`).

**Tech Stack:** Next.js (App Router, server components) · Drizzle ORM · libSQL/Turso · Vitest · Playwright.

**Alcance:** dominio de torneos a nivel **API + páginas**: `lib/tournament/queries.ts` (nuevo), `lib/tournament/event-store.ts` (3 firmas), las 6 rutas `api/tournaments*`, las 2 listas admin, las 4 páginas de detalle (admin+público pozo/torneo) y las 2 llamadas a `listEventSummaries` (home + `/eventos`). **Fuera (a 1B-5):** el resto de lecturas globales de la **home** (players/matches/rankings) y el cron; el capstone (quitar `.default` de `groupId`, grep CI).

---

## Decisiones clave

1. **Gatekeeper, no threading.** El motor (`loadEvent`, `generateEvent`, `recordResult`, `replacePairs`, `updateEvent`, `deleteEvent`, y todos los `pozo-run`/`torneo-run`/`pair-store`) sigue operando por `tournamentId`/`matchId` SIN `groupId`. La ruta/página valida el torneo in-grupo con `getTournamentInGroup(groupId, id)` **antes** de invocarlos → 404/notFound si no. Una vez verificado el padre, las lecturas/escrituras por FK de las sub-tablas (courts/participants/pairs/groups/matches) son in-grupo. Mismo razonamiento que 1B-3 con `settle`: no se reescribe el motor delicado.
2. **Solo 3 funciones reciben `groupId`** porque hacen escaneos genuinamente globales o fijan la columna: `createEvent(db, groupId, input)` (INSERT con groupId), `listEvents(db, groupId, kind)` (`WHERE groupId AND kind`), `listEventSummaries(db, groupId)` (`WHERE groupId`). Cambiar su firma obliga a actualizar a sus llamadores (api GET/POST, 2 listas admin, home, `/eventos`) en el mismo commit → build verde.
3. **La ruta de resultado valida a nivel de partido.** `POST .../matches/[matchId]/result` no recibe el torneo cargado; un admin de Lomeros podría pasar un `matchId` de otro grupo con un `id` de torneo Lomeros. Se cierra con `getTournamentMatchInGroup(groupId, matchId)` (join del partido a su torneo padre filtrado por grupo) + verificar `m.tournamentId === id`.
4. **Roster scopeado.** `POST`/`PATCH /api/tournaments` validan los participantes contra el roster; ese `db.select().from(players)` global pasa a `listPlayersByElo(groupId)` (DAL de 1B-1) → solo jugadores del grupo.
5. **Páginas de detalle de torneo SÍ entran en 1B-4** (el spec las nombra: "páginas públicas de pozo/torneo"), porque la fuga por id es aguda (un id de otro grupo cargaría su pozo/torneo). Se añade el gate `getTournamentInGroup` antes de `loadEvent`. **La home** solo cambia su llamada a `listEventSummaries`; sus demás lecturas globales (players/matches/rankings) quedan para 1B-5.
6. **`listEventSummaries`: solo se scopea el SELECT de `tournaments`.** La 2ª query (conteo de `tournament_matches` por torneo, agregada) se deja igual: solo se mapean las filas in-grupo, así que los conteos de otros grupos se descartan (no se exponen). No es fuga; mantenerla simple respeta "comportamiento idéntico para Lomeros".

---

## File Structure

**Crear:**
- `src/lib/tournament/queries.ts` — gatekeepers scopeados: `getTournamentInGroup`, `getTournamentMatchInGroup`.
- `e2e/no-fuga-tournaments.spec.ts` — aislamiento de pozos/torneos.

**Modificar:**
- `src/lib/tournament/event-store.ts` — `createEvent`/`listEvents`/`listEventSummaries` reciben `groupId` (import `and`).
- `src/app/api/tournaments/route.ts` — GET listEvents por grupo; POST createEvent + roster por grupo.
- `src/app/api/tournaments/[id]/route.ts` — GET/PATCH/DELETE gatekeepean; PATCH roster por grupo.
- `src/app/api/tournaments/[id]/generate/route.ts` — gatekeep antes de generar.
- `src/app/api/tournaments/[id]/pairs/route.ts` — gatekeep antes de reemplazar parejas.
- `src/app/api/tournaments/[id]/matches/[matchId]/result/route.ts` — gatekeep partido in-grupo.
- `src/app/admin/pozos/page.tsx`, `src/app/admin/torneos/page.tsx` — listEvents por grupo.
- `src/app/admin/pozos/[id]/page.tsx`, `src/app/admin/torneos/[id]/page.tsx` — gatekeep detalle.
- `src/app/(public)/pozos/[id]/page.tsx`, `src/app/(public)/torneos/[id]/page.tsx` — gatekeep detalle público.
- `src/app/(public)/eventos/page.tsx`, `src/app/(public)/page.tsx` — listEventSummaries por grupo por defecto.
- `e2e/global-setup.ts` — sembrar un torneo del 2º grupo.

---

## Task 1: Gatekeepers de torneo (`tournament/queries.ts`)

**Files:**
- Create: `src/lib/tournament/queries.ts`

- [ ] **Step 1: Crear `src/lib/tournament/queries.ts`**

```ts
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tournaments, tournamentMatches, type Tournament, type TournamentMatch } from '@/lib/db/schema';

// Gatekeeper: el torneo del grupo (undefined si no existe o es de otro grupo). Las rutas y
// páginas lo llaman ANTES de invocar el motor (loadEvent/generate/record/pairs); una vez
// verificado el torneo in-grupo, todas las operaciones por tournamentId de las sub-tablas
// (courts/participants/pairs/groups/matches) son in-grupo.
export async function getTournamentInGroup(groupId: string, id: string): Promise<Tournament | undefined> {
  const [t] = await db.select().from(tournaments)
    .where(and(eq(tournaments.id, id), eq(tournaments.groupId, groupId)));
  return t;
}

// Un partido de torneo cuyo torneo padre está en el grupo (para la ruta de resultado, que
// recibe matchId suelto). Devuelve undefined si el partido no existe o su torneo es de otro grupo.
export async function getTournamentMatchInGroup(groupId: string, matchId: string): Promise<TournamentMatch | undefined> {
  const [m] = await db
    .select({
      id: tournamentMatches.id, tournamentId: tournamentMatches.tournamentId,
      courtId: tournamentMatches.courtId, round: tournamentMatches.round,
      phaseTag: tournamentMatches.phaseTag, scheduledStart: tournamentMatches.scheduledStart,
      scheduledEnd: tournamentMatches.scheduledEnd, status: tournamentMatches.status,
      slotA1: tournamentMatches.slotA1, slotA2: tournamentMatches.slotA2,
      slotB1: tournamentMatches.slotB1, slotB2: tournamentMatches.slotB2,
      teamAScore: tournamentMatches.teamAScore, teamBScore: tournamentMatches.teamBScore,
      setsJson: tournamentMatches.setsJson, winner: tournamentMatches.winner,
    })
    .from(tournamentMatches)
    .innerJoin(tournaments, eq(tournaments.id, tournamentMatches.tournamentId))
    .where(and(eq(tournamentMatches.id, matchId), eq(tournaments.groupId, groupId)));
  return m;
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/tournament/queries.ts
git commit -m "feat(multitenant): gatekeepers de torneo scopeados por grupo (1B-4)"
```

---

## Task 2: Scopear los escaneos globales del motor (`event-store` + sus llamadores)

**Files:**
- Modify: `src/lib/tournament/event-store.ts`
- Modify: `src/app/api/tournaments/route.ts`
- Modify: `src/app/admin/pozos/page.tsx`
- Modify: `src/app/admin/torneos/page.tsx`
- Modify: `src/app/(public)/eventos/page.tsx`
- Modify: `src/app/(public)/page.tsx`

- [ ] **Step 1: `event-store.ts` — import de `and`**

En `src/lib/tournament/event-store.ts` línea 1, cambiar:

```ts
import { eq, asc, desc, sql } from 'drizzle-orm';
```

por:

```ts
import { and, eq, asc, desc, sql } from 'drizzle-orm';
```

- [ ] **Step 2: `event-store.ts` — `createEvent` recibe `groupId`**

Reemplazar la función `createEvent` (líneas 53-62) por:

```ts
export async function createEvent(db: Db, groupId: string, input: CreateEventInput): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(tournaments).values({
    id, groupId, name: input.name, date: input.date, location: input.location ?? null,
    kind: input.kind, format: input.format, config: JSON.stringify(input.config),
    status: 'draft', createdBy: input.createdBy ?? null,
  });
  await insertCourtsAndParticipants(db, id, input.courts, input.participantPlayerIds);
  return id;
}
```

- [ ] **Step 3: `event-store.ts` — `listEvents` recibe `groupId`**

Reemplazar la función `listEvents` (líneas 99-106) por:

```ts
export async function listEvents(db: Db, groupId: string, kind: EventKind): Promise<LoadedEvent[]> {
  const rows = await db.select().from(tournaments)
    .where(and(eq(tournaments.groupId, groupId), eq(tournaments.kind, kind)))
    .orderBy(asc(tournaments.date));
  const out: LoadedEvent[] = [];
  // N+1 aceptable: uso exclusivo admin, N = nº de eventos (decenas como mucho).
  for (const r of rows) out.push(await loadEvent(db, r.id));
  return out;
}
```

- [ ] **Step 4: `event-store.ts` — `listEventSummaries` recibe `groupId`**

Reemplazar la cabecera + la 1ª query de `listEventSummaries` (líneas 124-129) por:

```ts
export async function listEventSummaries(db: Db, groupId: string): Promise<EventSummary[]> {
  const rows = await db.select({
    id: tournaments.id, name: tournaments.name, date: tournaments.date,
    location: tournaments.location, kind: tournaments.kind, format: tournaments.format,
    status: tournaments.status,
  }).from(tournaments).where(eq(tournaments.groupId, groupId)).orderBy(desc(tournaments.date));
```

(El resto de la función — la query de conteos y el `return rows.map(...)` — queda IGUAL: solo se mapean las filas in-grupo, así que los conteos de otros grupos se descartan.)

- [ ] **Step 5: `src/app/api/tournaments/route.ts` — GET/POST por grupo**

Reemplazar el contenido completo por:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { listPlayersByElo } from '@/lib/players/queries';
import { createEvent, listEvents } from '@/lib/tournament/event-store';
import { validateEventInput } from '@/lib/tournament/validation';
import type { EventKind } from '@/lib/tournament/types';

// GET /api/tournaments?kind=pozo|torneo — listado por tipo (admin), scopeado al grupo.
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  const kind = request.nextUrl.searchParams.get('kind');
  if (kind !== 'pozo' && kind !== 'torneo') {
    return NextResponse.json({ error: 'kind requerido (pozo|torneo)' }, { status: 400 });
  }
  const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
  const events = await listEvents(db, groupId, kind as EventKind);
  return NextResponse.json({ events });
}

// POST /api/tournaments — crea un evento (pozo o torneo) en el grupo. Devuelve { id }.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    const body = await request.json();
    // Roster del GRUPO: un torneo no puede incluir jugadores de otro grupo.
    const roster = await listPlayersByElo(groupId);
    const rosterIds = new Set(roster.map((p) => p.id));
    const v = validateEventInput(body, rosterIds);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

    const id = await createEvent(db, groupId, {
      name: v.value.name, date: v.value.date, location: v.value.location,
      kind: v.value.kind, format: v.value.format, config: v.value.config,
      createdBy: auth.session.userId,
      courts: v.value.courts.map((c) => ({
        label: c.label, sortOrder: c.order, availableFrom: c.availableFrom, availableTo: c.availableTo,
      })),
      participantPlayerIds: v.value.participantPlayerIds,
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al crear el evento' }, { status: 500 });
  }
}
```

- [ ] **Step 6: `src/app/admin/pozos/page.tsx` — listEvents por grupo**

Cambiar el import (líneas 1-4): añadir tras `import { db } from '@/lib/db';`:

```ts
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
```

Y reemplazar la línea 9:

```ts
  const pozos = await listEvents(db, 'pozo');
```

por:

```ts
  const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
  const pozos = await listEvents(db, groupId, 'pozo');
```

- [ ] **Step 7: `src/app/admin/torneos/page.tsx` — listEvents por grupo**

Añadir tras `import { db } from '@/lib/db';`:

```ts
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
```

Y reemplazar la línea 9:

```ts
  const torneos = await listEvents(db, 'torneo');
```

por:

```ts
  const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
  const torneos = await listEvents(db, groupId, 'torneo');
```

- [ ] **Step 8: `src/app/(public)/eventos/page.tsx` — listEventSummaries por grupo por defecto**

Añadir tras `import { db } from '@/lib/db';`:

```ts
import { getDefaultGroupId } from '@/lib/auth/group-context';
```

Y reemplazar la línea 11:

```ts
  const summaries = await listEventSummaries(db);
```

por:

```ts
  const groupId = await getDefaultGroupId();
  const summaries = await listEventSummaries(db, groupId);
```

- [ ] **Step 9: `src/app/(public)/page.tsx` (home) — listEventSummaries por grupo por defecto**

Añadir el import tras la línea 1 (`import { db } from '@/lib/db';`):

```ts
import { getDefaultGroupId } from '@/lib/auth/group-context';
```

Reemplazar dentro del `Promise.all` (línea 44):

```ts
    listEventSummaries(db),
```

por:

```ts
    listEventSummaries(db, await getDefaultGroupId()),
```

(El resto de lecturas globales de la home — players/matches/rankings — se scopean en 1B-5; aquí solo se toca el resumen de eventos para no romper la firma.)

- [ ] **Step 10: Verificar tipos y suite unit**

Run: `npx tsc --noEmit`
Expected: sin errores (todos los llamadores de `createEvent`/`listEvents`/`listEventSummaries` actualizados).

Run: `npx vitest run`
Expected: toda la suite unit verde (el motor de torneo no cambia de comportamiento; los tests puros no se ven afectados).

- [ ] **Step 11: Commit**

```bash
git add src/lib/tournament/event-store.ts src/app/api/tournaments/route.ts src/app/admin/pozos/page.tsx src/app/admin/torneos/page.tsx "src/app/(public)/eventos/page.tsx" "src/app/(public)/page.tsx"
git commit -m "feat(multitenant): listados/creación de torneos scopeados por grupo (1B-4)"
```

---

## Task 3: Gatekeepear las rutas por id (`[id]`, generate, pairs, result)

**Files:**
- Modify: `src/app/api/tournaments/[id]/route.ts`
- Modify: `src/app/api/tournaments/[id]/generate/route.ts`
- Modify: `src/app/api/tournaments/[id]/pairs/route.ts`
- Modify: `src/app/api/tournaments/[id]/matches/[matchId]/result/route.ts`

- [ ] **Step 1: `src/app/api/tournaments/[id]/route.ts`**

Reemplazar el contenido completo por:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { listPlayersByElo } from '@/lib/players/queries';
import { loadEvent, updateEvent, deleteEvent } from '@/lib/tournament/event-store';
import { getTournamentInGroup } from '@/lib/tournament/queries';
import { validateEventInput } from '@/lib/tournament/validation';

// GET /api/tournaments/[id] — carga un evento del grupo por id (admin).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  const { id } = await params;
  try {
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    if (!(await getTournamentInGroup(groupId, id))) {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }
    const event = await loadEvent(db, id);
    return NextResponse.json({ event });
  } catch (error) {
    if (error === 'NOT_FOUND' || (error instanceof Error && error.message === 'NOT_FOUND')) {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }
    console.error(error);
    return NextResponse.json({ error: 'Error al cargar el evento' }, { status: 500 });
  }
}

// PATCH /api/tournaments/[id] — edita meta + pistas + participantes de un evento del grupo.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  const { id } = await params;
  try {
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    if (!(await getTournamentInGroup(groupId, id))) {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }
    const body = await request.json();
    const roster = await listPlayersByElo(groupId);
    const v = validateEventInput(body, new Set(roster.map((p) => p.id)));
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    await updateEvent(db, id, {
      name: v.value.name, date: v.value.date, location: v.value.location, config: v.value.config,
      courts: v.value.courts.map((c) => ({
        label: c.label, sortOrder: c.order, availableFrom: c.availableFrom, availableTo: c.availableTo,
      })),
      participantPlayerIds: v.value.participantPlayerIds,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 });
  }
}

// DELETE /api/tournaments/[id] — borra un evento del grupo y todos sus hijos (admin).
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  const { id } = await params;
  try {
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    if (!(await getTournamentInGroup(groupId, id))) {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }
    await deleteEvent(db, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 });
  }
}
```

- [ ] **Step 2: `src/app/api/tournaments/[id]/generate/route.ts`**

Cambiar los imports (líneas 1-5) por:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { loadEvent } from '@/lib/tournament/event-store';
import { getTournamentInGroup } from '@/lib/tournament/queries';
import { generateEvent } from '@/lib/tournament/event-engine';
```

Y reemplazar el bloque `const { id } = await params;` + `try {` + `const ev = await loadEvent(db, id);` (líneas 11-13) por:

```ts
  const { id } = await params;
  try {
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    if (!(await getTournamentInGroup(groupId, id))) {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }
    const ev = await loadEvent(db, id);
```

(El resto de la función no cambia.)

- [ ] **Step 3: `src/app/api/tournaments/[id]/pairs/route.ts`**

Cambiar los imports (líneas 1-6) por:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { loadEvent } from '@/lib/tournament/event-store';
import { getTournamentInGroup } from '@/lib/tournament/queries';
import { replacePairs } from '@/lib/tournament/pair-store';
import { validatePairsInput } from '@/lib/tournament/validation';
```

Y reemplazar el bloque `const { id } = await params;` + `try {` + `const ev = await loadEvent(db, id);` (líneas 13-15) por:

```ts
  const { id } = await params;
  try {
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    if (!(await getTournamentInGroup(groupId, id))) {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }
    const ev = await loadEvent(db, id);
```

(El resto de la función no cambia.)

- [ ] **Step 4: `src/app/api/tournaments/[id]/matches/[matchId]/result/route.ts`**

Reemplazar el contenido completo por:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { getTournamentMatchInGroup } from '@/lib/tournament/queries';
import { recordResult } from '@/lib/tournament/event-engine';

// POST /api/tournaments/[id]/matches/[matchId]/result — registra marcador (admin). Body: { gamesA, gamesB }.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; matchId: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  const { id, matchId } = await params;
  try {
    const body = await request.json();
    const gamesA = body?.gamesA;
    const gamesB = body?.gamesB;
    if (!Number.isInteger(gamesA) || !Number.isInteger(gamesB) || gamesA < 0 || gamesB < 0) {
      return NextResponse.json({ error: 'Marcador inválido' }, { status: 400 });
    }
    // El partido debe pertenecer a un torneo del grupo, y a ESTE torneo de la URL.
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    const m = await getTournamentMatchInGroup(groupId, matchId);
    if (!m || m.tournamentId !== id) {
      return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
    }
    await recordResult(db, matchId, gamesA, gamesB);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
    }
    console.error(error);
    return NextResponse.json({ error: 'Error al registrar el resultado' }, { status: 500 });
  }
}
```

- [ ] **Step 5: Verificar tipos y suite unit**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npx vitest run`
Expected: toda la suite unit verde.

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/tournaments/[id]/route.ts" "src/app/api/tournaments/[id]/generate/route.ts" "src/app/api/tournaments/[id]/pairs/route.ts" "src/app/api/tournaments/[id]/matches/[matchId]/result/route.ts"
git commit -m "feat(multitenant): rutas de torneo por id gatekeepean el grupo (1B-4)"
```

---

## Task 4: Gatekeepear las páginas de detalle (admin + público)

**Files:**
- Modify: `src/app/admin/pozos/[id]/page.tsx`
- Modify: `src/app/admin/torneos/[id]/page.tsx`
- Modify: `src/app/(public)/pozos/[id]/page.tsx`
- Modify: `src/app/(public)/torneos/[id]/page.tsx`

- [ ] **Step 1: `src/app/admin/pozos/[id]/page.tsx`**

Reemplazar el contenido completo por:

```ts
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { getTournamentInGroup } from '@/lib/tournament/queries';
import { notFound } from 'next/navigation';
import { EventPanel } from '@/components/admin/event-panel';

export const dynamic = 'force-dynamic';

export default async function PozoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
  const t = await getTournamentInGroup(groupId, id);
  if (!t || t.kind !== 'pozo') notFound();
  return <EventPanel id={id} />;
}
```

- [ ] **Step 2: `src/app/admin/torneos/[id]/page.tsx`**

Reemplazar el contenido completo por:

```ts
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { getTournamentInGroup } from '@/lib/tournament/queries';
import { notFound } from 'next/navigation';
import { EventPanel } from '@/components/admin/event-panel';

export const dynamic = 'force-dynamic';

export default async function TorneoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
  const t = await getTournamentInGroup(groupId, id);
  if (!t || t.kind !== 'torneo') notFound();
  return <EventPanel id={id} />;
}
```

- [ ] **Step 3: `src/app/(public)/pozos/[id]/page.tsx` — gate antes de cargar**

Añadir el import tras la línea 4 (`import { notFound } from 'next/navigation';`):

```ts
import { getDefaultGroupId } from '@/lib/auth/group-context';
import { getTournamentInGroup } from '@/lib/tournament/queries';
```

Reemplazar el bloque (líneas 16-19):

```ts
  const { id } = await params;
  let ev;
  try { ev = await loadEvent(db, id); } catch { notFound(); }
  if (ev.kind !== 'pozo') notFound();
```

por:

```ts
  const { id } = await params;
  const groupId = await getDefaultGroupId();
  if (!(await getTournamentInGroup(groupId, id))) notFound();
  let ev;
  try { ev = await loadEvent(db, id); } catch { notFound(); }
  if (ev.kind !== 'pozo') notFound();
```

- [ ] **Step 4: `src/app/(public)/torneos/[id]/page.tsx` — gate antes de cargar**

Añadir el import tras la línea 4 (`import { notFound } from 'next/navigation';`):

```ts
import { getDefaultGroupId } from '@/lib/auth/group-context';
import { getTournamentInGroup } from '@/lib/tournament/queries';
```

Reemplazar el bloque (líneas 16-19):

```ts
  const { id } = await params;
  let ev;
  try { ev = await loadEvent(db, id); } catch { notFound(); }
  if (ev.kind !== 'torneo') notFound();
```

por:

```ts
  const { id } = await params;
  const groupId = await getDefaultGroupId();
  if (!(await getTournamentInGroup(groupId, id))) notFound();
  let ev;
  try { ev = await loadEvent(db, id); } catch { notFound(); }
  if (ev.kind !== 'torneo') notFound();
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add "src/app/admin/pozos/[id]/page.tsx" "src/app/admin/torneos/[id]/page.tsx" "src/app/(public)/pozos/[id]/page.tsx" "src/app/(public)/torneos/[id]/page.tsx"
git commit -m "feat(multitenant): páginas de detalle de pozo/torneo gatekeepean el grupo (1B-4)"
```

---

## Task 5: Arnés y test e2e de no-fuga (torneos)

**Files:**
- Modify: `e2e/global-setup.ts`
- Create: `e2e/no-fuga-tournaments.spec.ts`

- [ ] **Step 1: Sembrar un torneo del 2º grupo**

Las tablas de torneo ya existen en la DB de test (`/api/migrate-tournaments` corre en el `for` del paso 1 del global-setup). En `e2e/global-setup.ts`, justo **después** del bloque que siembra `gt-redemption1` (el último `INSERT OR IGNORE INTO redemptions ...`) y **antes** del comentario `// 3) storageStates`, añadir:

```ts
  // Un torneo (pozo) del "Grupo Test", para no-fuga: Lomeros nunca debe listarlo,
  // cargarlo, generarlo, editarlo, borrarlo ni registrar resultados en él.
  await db.execute({
    sql: `INSERT OR IGNORE INTO tournaments (id, group_id, name, date, kind, format, config, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: ['gt-tournament1', 'grupo-test', 'Torneo GT', '2026-01-01', 'pozo', 'americano', '{}', 'draft'],
  });
```

- [ ] **Step 2: Crear `e2e/no-fuga-tournaments.spec.ts` (falla sin el scoping de las Tasks 2-4)**

```ts
import { test, expect } from '@playwright/test';

// Aislamiento entre grupos para torneos. El global-setup crea `gt-tournament1` (pozo del
// "Grupo Test"). Lomeros nunca debe listarlo ni operarlo por id.
test.describe('no-fuga · torneos (admin de Lomeros)', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('el listado de pozos no incluye torneos de otro grupo', async ({ request }) => {
    const res = await request.get('/api/tournaments?kind=pozo');
    expect(res.ok()).toBeTruthy();
    const { events } = (await res.json()) as { events: Array<{ id: string }> };
    expect(events.map((e) => e.id)).not.toContain('gt-tournament1');
  });

  test('cargar un torneo de otro grupo da 404', async ({ request }) => {
    const res = await request.get('/api/tournaments/gt-tournament1');
    expect(res.status()).toBe(404);
  });

  test('editar un torneo de otro grupo da 404', async ({ request }) => {
    const res = await request.patch('/api/tournaments/gt-tournament1', {
      data: {
        name: 'hack', date: '2026-02-02', location: null, kind: 'pozo', format: 'americano',
        config: {}, courts: [], participantPlayerIds: [],
      },
    });
    expect(res.status()).toBe(404);
  });

  test('borrar un torneo de otro grupo da 404', async ({ request }) => {
    const res = await request.delete('/api/tournaments/gt-tournament1');
    expect(res.status()).toBe(404);
  });

  test('generar un torneo de otro grupo da 404', async ({ request }) => {
    const res = await request.post('/api/tournaments/gt-tournament1/generate', { data: { seed: 1 } });
    expect(res.status()).toBe(404);
  });

  test('reemplazar parejas de un torneo de otro grupo da 404', async ({ request }) => {
    const res = await request.put('/api/tournaments/gt-tournament1/pairs', { data: { pairs: [] } });
    expect(res.status()).toBe(404);
  });

  test('registrar resultado en un partido de un torneo de otro grupo da 404', async ({ request }) => {
    const res = await request.post('/api/tournaments/gt-tournament1/matches/whatever/result', {
      data: { gamesA: 6, gamesB: 0 },
    });
    expect(res.status()).toBe(404);
  });
});

test.describe('no-fuga · torneos (público)', () => {
  test('la página pública de un pozo de otro grupo da 404', async ({ request }) => {
    const res = await request.get('/pozos/gt-tournament1');
    expect(res.status()).toBe(404);
  });
});
```

- [ ] **Step 3: Ejecutar la suite e2e completa**

Run: `npm run e2e`
Expected: PASS — todos los specs verdes, incluido `no-fuga-tournaments` (8 tests), además de los `no-fuga-players`/`matches`/`timba`/`premios` previos y los specs de torneo existentes (pozo/torneo de Lomeros siguen funcionando: comportamiento idéntico). 

(Nota TDD: sin las Tasks 2-4, el listado incluiría `gt-tournament1` y los GET/PATCH/DELETE/generate/pairs/result/página no darían 404 → los tests fallarían, confirmando que verifican el scoping real.)

- [ ] **Step 4: Commit**

```bash
git add e2e/global-setup.ts e2e/no-fuga-tournaments.spec.ts
git commit -m "test(e2e): no-fuga del dominio de torneos + seed de torneo del 2º grupo (1B-4)"
```

---

## Self-review (cobertura del spec 1B para 1B-4)

- **`event-store.ts` + `*-run`/`pair-store` scopeados (spec §2 fila 1B-4):** los 3 escaneos globales (`createEvent`/`listEvents`/`listEventSummaries`) reciben `groupId` (Task 2); el resto del motor opera por `tournamentId`/`matchId` y se gatekeepea en la ruta/página con `getTournamentInGroup`/`getTournamentMatchInGroup` (Tasks 1, 3, 4) — Decisión 1, mismo patrón que `settle` en 1B-3. ✔
- **`tournaments` raíz con group_id + 5 sub-tablas hijas vía FK (spec §1):** `createEvent` fija `groupId`; las sub-tablas (courts/participants/pairs/groups/matches) se alcanzan por `tournamentId` desde un torneo ya verificado in-grupo. ✔
- **`api/tournaments*` scopeadas (spec §2):** las 6 rutas migradas (GET/POST + GET/PATCH/DELETE/generate/pairs/result), groupId del contexto, roster por grupo. ✔
- **Páginas públicas de pozo/torneo (spec §2 fila 1B-4):** 4 detalle (admin+público) gatekeepean; 2 listas admin + 2 listados públicos (home/eventos) scopean `listEvents`/`listEventSummaries`. ✔
- **Validación a nivel de partido en `result` (cierra inyección de matchId ajeno):** `getTournamentMatchInGroup` + `m.tournamentId === id` (Decisión 3). ✔
- **Roster del grupo en create/edit (no se cuela jugador de otro grupo):** `listPlayersByElo(groupId)` (Decisión 4). ✔
- **Test e2e de no-fuga creciente + seed del 2º grupo (spec §3):** Task 5, 8 aserciones (listado, GET/PATCH/DELETE/generate/pairs/result, página pública). ✔
- **Resto de la home (players/matches/rankings) + cron + capstone → 1B-5:** no se tocan aquí (Decisión 5). ✔
- **Comportamiento idéntico para Lomeros (spec §0):** un solo grupo real → filtrar por su grupo devuelve lo mismo; specs de torneo existentes verdes. ✔

Sin placeholders. Nombres consistentes: `getTournamentInGroup`/`getTournamentMatchInGroup` (queries) usados igual en rutas/páginas; `createEvent(db, groupId, input)`/`listEvents(db, groupId, kind)`/`listEventSummaries(db, groupId)` con la misma firma en motor y llamadores; reutiliza `listPlayersByElo` (1B-1) y el patrón `getGroupContext()/getDefaultGroupId()` de 1B-1/1B-2/1B-3.
