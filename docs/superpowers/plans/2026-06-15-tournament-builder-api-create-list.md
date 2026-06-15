# Plan 6 — Constructor de torneos: capa API + crear/listar (admin)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exponer la lógica del torneo por HTTP (crear, editar el "cascarón", generar parrilla, registrar resultado) con `requireAdmin` y validación, y dar la primera UI admin real: listar torneos y crear uno (jugadores + pistas con ventanas).

**Architecture:** Rutas finas en `src/app/api/tournaments/**` que orquestan auth → validación pura (`src/lib/tournament/validation.ts`) → funciones de librería ya testeadas (`store.ts`, `results.ts`). La validación de entrada vive en un módulo puro testeable con Vitest (los handlers de Next no se testean directamente; la lógica de DB ya está cubierta por `store.test.ts`/`results.test.ts`). UI admin con el patrón del repo: páginas server-component que leen `db` directamente + un formulario `'use client'` que hace `fetch` a la API.

**Tech Stack:** Next.js 16 App Router (route handlers con `params: Promise<...>`), Drizzle/libSQL, React 19 client components, shadcn/ui + kit `lpt`, `sonner` (toast), Vitest.

**Alcance (acordado en brainstorming):** slice vertical = capa API + listar + crear. **Fuera de este plan:** editor de bloques (parejas/grupos a mano) y edición de bloques → Plan 7; parrilla **editable con drag & drop** + entrada de resultados desde la UI + clasificaciones en vivo → Plan 8 (decidido: la parrilla será arrastrable); vista pública → Plan 9.

---

## Contexto del repo (patrones que hay que seguir, con rutas reales)

- **Auth API:** `requireAdmin()` de `@/lib/auth/guard` → `{ session } | { response }`. Uso: `const auth = await requireAdmin(); if ('response' in auth) return auth.response;`. `auth.session.userId` es el id de usuario.
- **Páginas admin:** server components, `export const dynamic = 'force-dynamic'`, leen `db` directamente. Ejemplo: `src/app/admin/players/page.tsx`. NO llevan guard propio (el patrón actual deja la auth de páginas al middleware/sesión; replicamos players: sin guard en la página, mutaciones protegidas en la API).
- **Route handlers (Next 16):** `export async function POST(request: NextRequest)` y `export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> })`. **Hay que `await params`.** Respuestas con `NextResponse.json(data, { status })`. Ejemplo: `src/app/api/players/route.ts`.
- **DB:** `import { db } from '@/lib/db'` (tipo `LibSQLDatabase<typeof schema>`, el mismo que aceptan las funciones de `store.ts`/`results.ts`). Tablas en `@/lib/db/schema`.
- **Formularios:** `'use client'`, `useState`, `fetch('/api/...')`, `toast.success/error` de `sonner`, `router.push()` + `router.refresh()`. Ejemplo: `src/components/admin/player-form.tsx`.
- **UI:** `Button`/`Input`/`Label` de `@/components/ui/*`, `Card`/`CardHeader`/`CardTitle`/`CardContent`, `Table*`, `Badge`. Clases: `sec-title`, `muted`, `text-ink-3`, `lpt-btn primary`, `space-y-6`. Iconos `lucide-react`.
- **Funciones de librería ya disponibles:**
  - `createTournament(db, CreateTournamentInput): Promise<string>` (devuelve id). `CreateTournamentInput = { name; date; location?; notes?; createdBy?; courts: CreateCourtInput[]; participantPlayerIds: string[]; blocks: CreateBlockInput[] }`. `CreateCourtInput = { label; order; availableFrom; availableTo }`.
  - `generateAndStore(db, id): Promise<{ matchCount; warnings }>`.
  - `recordResult(db, matchId, MatchResultInput): Promise<void>` (lanza `Partido no encontrado: …` o `… tiene participantes sin resolver`). `MatchResultInput = { teamAScore; teamBScore; winner?: 'A'|'B'|null; setsJson?: string|null }`.
- **`players`** (`@/lib/db/schema`): `id`, `name`, `nickname` (nullable), entre otros.
- **Migración:** `POST /api/migrate-tournaments` ya existe (idempotente). En prod hay que ejecutarlo una vez.

---

## File Structure

- **Create:** `src/lib/tournament/validation.ts` — validadores puros de entrada de la API.
- **Create:** `src/lib/tournament/validation.test.ts` — tests de los validadores.
- **Modify:** `src/lib/tournament/store.ts` — añadir `UpdateShellInput` + `updateTournamentShell` (editar cascarón).
- **Modify:** `src/lib/tournament/store.test.ts` — test de `updateTournamentShell`.
- **Create:** `src/app/api/tournaments/route.ts` — `POST` crear.
- **Create:** `src/app/api/tournaments/[id]/route.ts` — `PATCH` editar cascarón.
- **Create:** `src/app/api/tournaments/[id]/generate/route.ts` — `POST` generar parrilla.
- **Create:** `src/app/api/tournaments/[id]/matches/[matchId]/result/route.ts` — `POST` registrar resultado.
- **Create:** `src/app/admin/tournaments/page.tsx` — listado.
- **Create:** `src/app/admin/tournaments/new/page.tsx` — página de crear (server, carga roster).
- **Create:** `src/components/admin/tournament-form.tsx` — formulario `'use client'`.
- **Modify:** `src/components/admin/admin-sidebar.tsx` — enlace "Torneos".

---

## Task 1: Validador `validateTournamentShell` (módulo puro)

**Files:**
- Create: `src/lib/tournament/validation.ts`
- Test: `src/lib/tournament/validation.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crea `src/lib/tournament/validation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateTournamentShell } from './validation';

const roster = new Set(['p1', 'p2', 'p3', 'p4']);

function base() {
  return {
    name: '  Cumple 2026 ',
    date: '2026-06-15',
    location: '  Club  ',
    notes: '',
    courts: [
      { label: ' Pista 1 ', order: 1, availableFrom: '17:00', availableTo: '20:00' },
    ],
    participantPlayerIds: ['p1', 'p2'],
  };
}

describe('validateTournamentShell', () => {
  it('normaliza y acepta una entrada válida', () => {
    const r = validateTournamentShell(base(), roster);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.name).toBe('Cumple 2026');
    expect(r.value.location).toBe('Club');
    expect(r.value.notes).toBeNull();
    expect(r.value.courts[0].label).toBe('Pista 1');
    expect(r.value.participantPlayerIds).toEqual(['p1', 'p2']);
  });

  it('rechaza nombre vacío', () => {
    const r = validateTournamentShell({ ...base(), name: '   ' }, roster);
    expect(r).toEqual({ ok: false, error: 'El nombre es obligatorio' });
  });

  it('rechaza fecha con formato inválido', () => {
    const r = validateTournamentShell({ ...base(), date: '15/06/2026' }, roster);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/Fecha/);
  });

  it('rechaza sin pistas', () => {
    const r = validateTournamentShell({ ...base(), courts: [] }, roster);
    expect(r).toEqual({ ok: false, error: 'Añade al menos una pista' });
  });

  it('rechaza ventana de pista con inicio >= fin', () => {
    const r = validateTournamentShell({
      ...base(),
      courts: [{ label: 'P1', order: 1, availableFrom: '20:00', availableTo: '18:00' }],
    }, roster);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/anterior a la de fin/);
  });

  it('rechaza horario no HH:MM', () => {
    const r = validateTournamentShell({
      ...base(),
      courts: [{ label: 'P1', order: 1, availableFrom: '5pm', availableTo: '20:00' }],
    }, roster);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/HH:MM/);
  });

  it('rechaza sin participantes', () => {
    const r = validateTournamentShell({ ...base(), participantPlayerIds: [] }, roster);
    expect(r).toEqual({ ok: false, error: 'Selecciona al menos un participante' });
  });

  it('rechaza participantes duplicados', () => {
    const r = validateTournamentShell({ ...base(), participantPlayerIds: ['p1', 'p1'] }, roster);
    expect(r).toEqual({ ok: false, error: 'Hay participantes duplicados' });
  });

  it('rechaza participante fuera del roster', () => {
    const r = validateTournamentShell({ ...base(), participantPlayerIds: ['p1', 'zzz'] }, roster);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/no existe en el roster/);
  });

  it('rechaza cuerpo no objeto', () => {
    const r = validateTournamentShell(null, roster);
    expect(r).toEqual({ ok: false, error: 'Cuerpo inválido' });
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/validation.test.ts`
Expected: FAIL — `validateTournamentShell` no existe.

- [ ] **Step 3: Crear `src/lib/tournament/validation.ts`**

```ts
import type { CreateCourtInput } from './store';

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

// Forma del "cascarón" del torneo (sin bloques; los bloques se añaden en el Plan 7).
export interface TournamentShellInput {
  name: string;
  date: string;
  location: string | null;
  notes: string | null;
  courts: CreateCourtInput[];
  participantPlayerIds: string[];
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateTournamentShell(body: unknown, rosterIds: Set<string>): Validated<TournamentShellInput> {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Cuerpo inválido' };
  const b = body as Record<string, unknown>;

  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name) return { ok: false, error: 'El nombre es obligatorio' };

  const date = typeof b.date === 'string' ? b.date : '';
  if (!DATE.test(date)) return { ok: false, error: 'Fecha inválida (formato YYYY-MM-DD)' };

  if (!Array.isArray(b.courts) || b.courts.length === 0) {
    return { ok: false, error: 'Añade al menos una pista' };
  }
  const courts: CreateCourtInput[] = [];
  for (const [i, raw] of b.courts.entries()) {
    if (typeof raw !== 'object' || raw === null) return { ok: false, error: `Pista ${i + 1} inválida` };
    const c = raw as Record<string, unknown>;
    const label = typeof c.label === 'string' ? c.label.trim() : '';
    if (!label) return { ok: false, error: `La pista ${i + 1} necesita nombre` };
    const order = typeof c.order === 'number' ? c.order : i + 1;
    const availableFrom = typeof c.availableFrom === 'string' ? c.availableFrom : '';
    const availableTo = typeof c.availableTo === 'string' ? c.availableTo : '';
    if (!HHMM.test(availableFrom) || !HHMM.test(availableTo)) {
      return { ok: false, error: `Horario inválido en la pista "${label}" (usa HH:MM)` };
    }
    if (availableFrom >= availableTo) {
      return { ok: false, error: `En la pista "${label}", la hora de inicio debe ser anterior a la de fin` };
    }
    courts.push({ label, order, availableFrom, availableTo });
  }

  if (!Array.isArray(b.participantPlayerIds) || b.participantPlayerIds.length === 0) {
    return { ok: false, error: 'Selecciona al menos un participante' };
  }
  const seen = new Set<string>();
  const participantPlayerIds: string[] = [];
  for (const pid of b.participantPlayerIds) {
    if (typeof pid !== 'string') return { ok: false, error: 'Participante inválido' };
    if (seen.has(pid)) return { ok: false, error: 'Hay participantes duplicados' };
    if (!rosterIds.has(pid)) return { ok: false, error: 'Algún participante no existe en el roster' };
    seen.add(pid);
    participantPlayerIds.push(pid);
  }

  const location = typeof b.location === 'string' && b.location.trim() ? b.location.trim() : null;
  const notes = typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim() : null;

  return { ok: true, value: { name, date, location, notes, courts, participantPlayerIds } };
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/validation.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/validation.ts src/lib/tournament/validation.test.ts
git commit -m "feat(tournaments): validador puro del cascarón del torneo"
```

---

## Task 2: Validador `validateResultInput`

**Files:**
- Modify: `src/lib/tournament/validation.ts`
- Test: `src/lib/tournament/validation.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Añade a `src/lib/tournament/validation.test.ts`:

```ts
import { validateResultInput } from './validation';

describe('validateResultInput', () => {
  it('acepta marcador válido y deja winner indefinido', () => {
    const r = validateResultInput({ teamAScore: 6, teamBScore: 3 });
    expect(r).toEqual({ ok: true, value: { teamAScore: 6, teamBScore: 3, winner: undefined, setsJson: undefined } });
  });

  it('acepta winner explícito y setsJson', () => {
    const r = validateResultInput({ teamAScore: 5, teamBScore: 5, winner: 'B', setsJson: '[[6,4]]' });
    expect(r).toEqual({ ok: true, value: { teamAScore: 5, teamBScore: 5, winner: 'B', setsJson: '[[6,4]]' } });
  });

  it('acepta winner null', () => {
    const r = validateResultInput({ teamAScore: 4, teamBScore: 4, winner: null });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.winner).toBeNull();
  });

  it('rechaza marcador no entero o negativo', () => {
    expect(validateResultInput({ teamAScore: -1, teamBScore: 3 }).ok).toBe(false);
    expect(validateResultInput({ teamAScore: 1.5, teamBScore: 3 }).ok).toBe(false);
    expect(validateResultInput({ teamAScore: '6', teamBScore: 3 }).ok).toBe(false);
  });

  it('rechaza winner inválido', () => {
    const r = validateResultInput({ teamAScore: 6, teamBScore: 3, winner: 'X' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/winner/);
  });

  it('rechaza cuerpo no objeto', () => {
    expect(validateResultInput(42)).toEqual({ ok: false, error: 'Cuerpo inválido' });
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/validation.test.ts -t validateResultInput`
Expected: FAIL — `validateResultInput` no existe.

- [ ] **Step 3: Añadir `validateResultInput` a `validation.ts`**

```ts
import type { MatchResultInput } from './results';

export function validateResultInput(body: unknown): Validated<MatchResultInput> {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Cuerpo inválido' };
  const b = body as Record<string, unknown>;

  if (!Number.isInteger(b.teamAScore) || (b.teamAScore as number) < 0) {
    return { ok: false, error: 'teamAScore debe ser un entero ≥ 0' };
  }
  if (!Number.isInteger(b.teamBScore) || (b.teamBScore as number) < 0) {
    return { ok: false, error: 'teamBScore debe ser un entero ≥ 0' };
  }

  let winner: 'A' | 'B' | null | undefined;
  if (b.winner === undefined) winner = undefined;
  else if (b.winner === 'A' || b.winner === 'B' || b.winner === null) winner = b.winner;
  else return { ok: false, error: "winner debe ser 'A', 'B' o null" };

  const setsJson = typeof b.setsJson === 'string' ? b.setsJson : undefined;

  return {
    ok: true,
    value: { teamAScore: b.teamAScore as number, teamBScore: b.teamBScore as number, winner, setsJson },
  };
}
```

> Nota: el import `import type { MatchResultInput } from './results'` va arriba del fichero junto al de `./store`.

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/validation.test.ts`
Expected: PASS (10 + 6 = 16 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/validation.ts src/lib/tournament/validation.test.ts
git commit -m "feat(tournaments): validador de entrada de resultado"
```

---

## Task 3: `updateTournamentShell` en store.ts

**Files:**
- Modify: `src/lib/tournament/store.ts`
- Test: `src/lib/tournament/store.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Añade a `src/lib/tournament/store.test.ts` (dentro del fichero, p. ej. tras el bloque `describe('createTournament', …)`). Reutiliza `sampleInput` ya definido arriba en ese fichero:

```ts
import { updateTournamentShell } from './store';

describe('updateTournamentShell', () => {
  it('actualiza meta y reemplaza pistas y participantes', async () => {
    const db = await createTestDb();
    const id = await createTournament(db, sampleInput);

    await updateTournamentShell(db, id, {
      name: 'Cumple 2026 (editado)',
      date: '2026-06-20',
      location: 'Nuevo Club',
      notes: null,
      courts: [
        { label: 'Central', order: 1, availableFrom: '18:00', availableTo: '21:00' },
      ],
      participantPlayerIds: ['pl1', 'pl2', 'pl3'],
    });

    const [t] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    expect(t.name).toBe('Cumple 2026 (editado)');
    expect(t.date).toBe('2026-06-20');
    expect(t.location).toBe('Nuevo Club');

    const courts = await db.select().from(tournamentCourts).where(eq(tournamentCourts.tournamentId, id));
    expect(courts).toHaveLength(1);
    expect(courts[0].label).toBe('Central');

    const parts = await db.select().from(tournamentParticipants).where(eq(tournamentParticipants.tournamentId, id));
    expect(parts).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/store.test.ts -t updateTournamentShell`
Expected: FAIL — `updateTournamentShell` no existe.

- [ ] **Step 3: Añadir `UpdateShellInput` + `updateTournamentShell` a `store.ts`**

Justo después de `CreateTournamentInput` (cerca de la línea 44) añade el tipo, y al final del fichero la función:

```ts
export interface UpdateShellInput {
  name: string;
  date: string;
  location: string | null;
  notes: string | null;
  courts: CreateCourtInput[];
  participantPlayerIds: string[];
}

// Edita el "cascarón" del torneo: meta + reemplazo completo de pistas y participantes.
// No toca bloques (eso es el Plan 7). No transaccional (misma razón que createTournament).
export async function updateTournamentShell(db: Db, id: string, input: UpdateShellInput): Promise<void> {
  await db.update(tournaments).set({
    name: input.name,
    date: input.date,
    location: input.location,
    notes: input.notes,
  }).where(eq(tournaments.id, id));

  await db.delete(tournamentCourts).where(eq(tournamentCourts.tournamentId, id));
  for (const c of input.courts) {
    await db.insert(tournamentCourts).values({
      tournamentId: id, label: c.label, order: c.order,
      availableFrom: c.availableFrom, availableTo: c.availableTo,
    });
  }

  await db.delete(tournamentParticipants).where(eq(tournamentParticipants.tournamentId, id));
  for (const playerId of input.participantPlayerIds) {
    await db.insert(tournamentParticipants).values({ tournamentId: id, playerId });
  }
}
```

> `tournaments`, `tournamentCourts`, `tournamentParticipants`, `eq` y `Db`/`CreateCourtInput` ya están importados/definidos en `store.ts`.

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/store.test.ts`
Expected: PASS (los existentes + 1 nuevo).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/store.ts src/lib/tournament/store.test.ts
git commit -m "feat(tournaments): updateTournamentShell (editar cascarón del torneo)"
```

---

## Task 4: Rutas `POST /api/tournaments` y `PATCH /api/tournaments/[id]`

**Files:**
- Create: `src/app/api/tournaments/route.ts`
- Create: `src/app/api/tournaments/[id]/route.ts`

- [ ] **Step 1: Crear `src/app/api/tournaments/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/guard';
import { createTournament } from '@/lib/tournament/store';
import { validateTournamentShell } from '@/lib/tournament/validation';

// POST /api/tournaments — crea el cascarón del torneo (sin bloques). Devuelve { id }.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const body = await request.json();
    const roster = await db.select({ id: players.id }).from(players);
    const rosterIds = new Set(roster.map((p) => p.id));

    const v = validateTournamentShell(body, rosterIds);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

    const id = await createTournament(db, {
      name: v.value.name,
      date: v.value.date,
      location: v.value.location ?? undefined,
      notes: v.value.notes ?? undefined,
      createdBy: auth.session.userId,
      courts: v.value.courts,
      participantPlayerIds: v.value.participantPlayerIds,
      blocks: [],
    });

    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al crear el torneo' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Crear `src/app/api/tournaments/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { players, tournaments } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/guard';
import { updateTournamentShell } from '@/lib/tournament/store';
import { validateTournamentShell } from '@/lib/tournament/validation';

// PATCH /api/tournaments/[id] — edita el cascarón (meta + pistas + participantes).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const [existing] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    if (!existing) return NextResponse.json({ error: 'Torneo no encontrado' }, { status: 404 });

    const body = await request.json();
    const roster = await db.select({ id: players.id }).from(players);
    const rosterIds = new Set(roster.map((p) => p.id));

    const v = validateTournamentShell(body, rosterIds);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

    await updateTournamentShell(db, id, v.value);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al actualizar el torneo' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verificar tipos y lint**

Run: `npx tsc --noEmit && npx eslint src/app/api/tournaments`
Expected: sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/tournaments/route.ts src/app/api/tournaments/[id]/route.ts
git commit -m "feat(tournaments): API crear (POST) y editar cascarón (PATCH)"
```

---

## Task 5: Rutas `generate` y `result`

**Files:**
- Create: `src/app/api/tournaments/[id]/generate/route.ts`
- Create: `src/app/api/tournaments/[id]/matches/[matchId]/result/route.ts`

- [ ] **Step 1: Crear `src/app/api/tournaments/[id]/generate/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tournaments } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/guard';
import { generateAndStore } from '@/lib/tournament/store';

// POST /api/tournaments/[id]/generate — genera y persiste la parrilla. Devuelve { matchCount, warnings }.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const [existing] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    if (!existing) return NextResponse.json({ error: 'Torneo no encontrado' }, { status: 404 });

    const result = await generateAndStore(db, id);
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al generar la parrilla' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Crear `src/app/api/tournaments/[id]/matches/[matchId]/result/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/guard';
import { recordResult } from '@/lib/tournament/results';
import { validateResultInput } from '@/lib/tournament/validation';

// POST /api/tournaments/[id]/matches/[matchId]/result — registra resultado + progresión.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; matchId: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { matchId } = await params;
    const body = await request.json();
    const v = validateResultInput(body);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

    await recordResult(db, matchId, v.value);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error al registrar el resultado';
    const status = msg.includes('no encontrado') ? 404 : msg.includes('sin resolver') ? 409 : 500;
    if (status === 500) console.error(error);
    return NextResponse.json({ error: msg }, { status });
  }
}
```

- [ ] **Step 3: Verificar tipos y lint**

Run: `npx tsc --noEmit && npx eslint src/app/api/tournaments`
Expected: sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/tournaments/[id]/generate/route.ts" "src/app/api/tournaments/[id]/matches/[matchId]/result/route.ts"
git commit -m "feat(tournaments): API generar parrilla y registrar resultado"
```

---

## Task 6: Listado admin + enlace en el sidebar

**Files:**
- Create: `src/app/admin/tournaments/page.tsx`
- Modify: `src/components/admin/admin-sidebar.tsx`

- [ ] **Step 1: Crear `src/app/admin/tournaments/page.tsx`**

```tsx
import { db } from '@/lib/db';
import { tournaments, tournamentParticipants } from '@/lib/db/schema';
import { desc, sql } from 'drizzle-orm';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  scheduled: 'Programado',
  running: 'En juego',
  completed: 'Finalizado',
};

export default async function TournamentsAdminPage() {
  const rows = await db.select().from(tournaments).orderBy(desc(tournaments.date));
  const counts = await db
    .select({ tournamentId: tournamentParticipants.tournamentId, n: sql<number>`count(*)` })
    .from(tournamentParticipants)
    .groupBy(tournamentParticipants.tournamentId);
  const countById = new Map(counts.map((c) => [c.tournamentId, Number(c.n)]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="sec-title">Torneos</h1>
          <p className="muted text-sm mt-1.5">{rows.length} torneo{rows.length !== 1 ? 's' : ''}</p>
        </div>
        <Link href="/admin/tournaments/new" className="lpt-btn primary shrink-0" style={{ minHeight: 38, padding: '7px 13px', fontSize: 12.5 }}>
          <Plus size={15} /> Nuevo torneo
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-12 text-ink-3">
          <p className="text-4xl mb-2">🏆</p>
          <p>No hay torneos todavía.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Torneo</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-center">Jugadores</TableHead>
                <TableHead className="text-center">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <p className="font-medium">{t.name}</p>
                    {t.location && <p className="text-xs text-ink-3">{t.location}</p>}
                  </TableCell>
                  <TableCell className="text-sm">{t.date}</TableCell>
                  <TableCell className="text-center text-sm">{countById.get(t.id) ?? 0}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline">{STATUS_LABEL[t.status] ?? t.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
```

> Nota: aún no hay página de detalle `[id]` (Plan 7), por eso las filas no enlazan. Se añadirá el enlace cuando exista el panel.

- [ ] **Step 2: Añadir el enlace "Torneos" al sidebar**

En `src/components/admin/admin-sidebar.tsx`, añade `Trophy` al import de `lucide-react` y una entrada al array `adminLinks` (tras "Partidos"):

```tsx
import { LayoutDashboard, Users, Swords, Bell, Gift, Ticket, Coins, Trophy, type LucideIcon } from 'lucide-react';
```

```tsx
  { href: '/admin/matches', label: 'Partidos', icon: Swords },
  { href: '/admin/tournaments', label: 'Torneos', icon: Trophy },
  { href: '/admin/notifications', label: 'Avisos', icon: Bell },
```

- [ ] **Step 3: Verificar tipos y lint**

Run: `npx tsc --noEmit && npx eslint src/app/admin/tournaments src/components/admin/admin-sidebar.tsx`
Expected: sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/tournaments/page.tsx src/components/admin/admin-sidebar.tsx
git commit -m "feat(tournaments): listado admin + enlace en el sidebar"
```

---

## Task 7: Formulario de crear torneo

**Files:**
- Create: `src/components/admin/tournament-form.tsx`
- Create: `src/app/admin/tournaments/new/page.tsx`

- [ ] **Step 1: Crear `src/components/admin/tournament-form.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface RosterPlayer {
  id: string;
  name: string;
  nickname: string | null;
}

interface CourtRow {
  label: string;
  availableFrom: string;
  availableTo: string;
}

export function TournamentForm({ roster }: { roster: RosterPlayer[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [courts, setCourts] = useState<CourtRow[]>([
    { label: 'Pista 1', availableFrom: '17:00', availableTo: '20:00' },
  ]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function addCourt() {
    setCourts((cs) => [...cs, { label: `Pista ${cs.length + 1}`, availableFrom: '17:00', availableTo: '20:00' }]);
  }
  function removeCourt(i: number) {
    setCourts((cs) => cs.filter((_, idx) => idx !== i));
  }
  function setCourt(i: number, patch: Partial<CourtRow>) {
    setCourts((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const body = {
      name,
      date,
      location,
      notes,
      courts: courts.map((c, i) => ({ label: c.label, order: i + 1, availableFrom: c.availableFrom, availableTo: c.availableTo })),
      participantPlayerIds: [...selected],
    };

    const res = await fetch('/api/tournaments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      toast.success('Torneo creado');
      router.push('/admin/tournaments');
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || 'Error al crear el torneo');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card className="max-w-2xl">
        <CardHeader><CardTitle>Datos del torneo</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre *</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Torneo de cumpleaños" required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Fecha *</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Lugar</Label>
              <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Club de pádel" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
          </div>
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader><CardTitle>Pistas y horarios</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {courts.map((c, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Nombre</Label>
                <Input value={c.label} onChange={(e) => setCourt(i, { label: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Desde</Label>
                <Input type="time" value={c.availableFrom} onChange={(e) => setCourt(i, { availableFrom: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Hasta</Label>
                <Input type="time" value={c.availableTo} onChange={(e) => setCourt(i, { availableTo: e.target.value })} />
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeCourt(i)} disabled={courts.length === 1} aria-label="Quitar pista">
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addCourt}>
            <Plus size={15} /> Añadir pista
          </Button>
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader><CardTitle>Participantes ({selected.size})</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto">
            {roster.map((p) => (
              <label key={p.id} className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5 hover:bg-surface">
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 rounded border-line" />
                <span className="text-sm">{p.name}{p.nickname ? ` (${p.nickname})` : ''}</span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2 max-w-2xl">
        <Button type="submit" disabled={loading} className="min-h-[40px] px-4 text-sm">
          {loading ? 'Creando...' : 'Crear torneo'}
        </Button>
        <Button type="button" variant="outline" className="min-h-[40px] px-4 text-sm" onClick={() => router.push('/admin/tournaments')}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Crear `src/app/admin/tournaments/new/page.tsx`**

```tsx
import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { asc } from 'drizzle-orm';
import { TournamentForm } from '@/components/admin/tournament-form';

export const dynamic = 'force-dynamic';

export default async function NewTournamentPage() {
  const roster = await db
    .select({ id: players.id, name: players.name, nickname: players.nickname })
    .from(players)
    .orderBy(asc(players.name));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">Nuevo torneo</h1>
        <p className="muted text-sm mt-1.5">Define jugadores y pistas. Los bloques se configuran después.</p>
      </div>
      <TournamentForm roster={roster} />
    </div>
  );
}
```

- [ ] **Step 3: Verificar tipos y lint**

Run: `npx tsc --noEmit && npx eslint src/app/admin/tournaments src/components/admin/tournament-form.tsx`
Expected: sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/tournament-form.tsx src/app/admin/tournaments/new/page.tsx
git commit -m "feat(tournaments): formulario de crear torneo (admin)"
```

---

## Task 8: Verificación final del plan

- [ ] **Step 1: Suite completa de tournament**

Run: `npx vitest run src/lib/tournament`
Expected: PASS — incluye `validation` (16) y `store` (con el nuevo test), más todo lo anterior.

- [ ] **Step 2: Tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Lint de todo lo tocado**

Run: `npx eslint src/lib/tournament src/app/api/tournaments src/app/admin/tournaments src/components/admin/tournament-form.tsx src/components/admin/admin-sidebar.tsx`
Expected: sin errores.

---

## Self-review (cubierto en este plan vs. spec/alcance acordado)

- **`POST /api/tournaments` crear (+ pistas + participantes)**: Task 4 + validación Task 1. ✓
- **`PATCH /api/tournaments/[id]` editar config (cascarón: meta/pistas/participantes)**: Task 4 + Task 3. ✓ *(bloques → Plan 7)*
- **`POST /api/tournaments/[id]/generate`**: Task 5. ✓
- **`POST /api/tournaments/[id]/matches/[matchId]/result`**: Task 5 + validación Task 2. ✓
- **Mutaciones protegidas con `requireAdmin()`**: todas las rutas. ✓
- **`/admin/tournaments` listado + botón crear**: Task 6. ✓
- **`/admin/tournaments/new` crear (nombre, fecha, jugadores, pistas con ventanas)**: Task 7. ✓
- **Validaciones de entrada de la API** (nombre, fecha, ventanas HH:MM, participantes ⊆ roster, sin duplicados; marcador entero ≥ 0): Tasks 1–2. ✓

**Fuera de este plan (planes posteriores):**
- Plan 7: panel `/admin/tournaments/[id]` + editor de bloques (`/admin/tournaments/[id]/blocks`) con parejas/grupos a mano; aquí va la validación de bloques (`advancePerGroup ≥ 1` con grupos+cuadro, `participantOrder ⊆ participantes`, jugadores de cada pareja ∈ participantes) y un PATCH/endpoint de bloques. Enlace de las filas del listado al detalle.
- Plan 8: parrilla `/admin/tournaments/[id]/schedule` **editable con drag & drop** (revalidación de conflictos en vivo + endpoint de reasignación pista/hora), entrada de resultados desde la UI, clasificaciones y cuadro en vivo (usando `getPozoStandings`/`getGroupStandings`).
- Plan 9: vista pública de solo lectura `/tournaments/[id]`.

**Despliegue:** ejecutar `POST /api/migrate-tournaments` una vez en producción antes de usar estas rutas (crea las tablas `tournament*`).
