# Plan 7 — Constructor de torneos: panel + editor de bloques (admin)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar al admin el panel de un torneo (`/admin/tournaments/[id]`) y un editor de bloques (`/admin/tournaments/[id]/blocks`) para configurar la secuencia de bloques —pozo y fixed_pairs con parejas/grupos a mano— y generar la parrilla, dejando el torneo de cumpleaños totalmente montable desde la UI.

**Architecture:** API `PUT /api/tournaments/[id]/blocks` (reemplazo total) → validación pura (`validateBlocks` en `validation.ts`) → `replaceBlocks` (store) que borra explícitamente parrilla+parejas+grupos+bloques previos y reinserta vía un helper `insertBlocks` extraído de `createTournament` (DRY), dejando el torneo en `draft`. UI con el patrón del repo: páginas server-component que leen `db` + un editor `'use client'` que hace `fetch` a la API. El botón "Generar parrilla" reusa el endpoint del Plan 6.

**Tech Stack:** Next.js 16 App Router, Drizzle/libSQL, React 19 client components, shadcn/ui + kit `lpt`, `sonner`, Vitest.

**Alcance (acordado en brainstorming):** panel + editor completo (ambos tipos de bloque). Siembra del pozo **automática** = orden de la lista de participantes (sin reordenar manual en v1). **Fuera de este plan:** parrilla editable drag&drop + resultados desde UI + clasificaciones en vivo → Plan 8; vista pública → Plan 9; UI de edición del cascarón (pistas/participantes) sigue pendiente (el `PATCH` existe desde Plan 6).

---

## Contexto del repo (lo ya construido y los patrones)

- **Tipos de entrada** (`src/lib/tournament/store.ts`): `CreateBlockInput = { order; type: 'pozo'|'fixed_pairs'; name; durationMinutes; config: BlockConfig; groupNames?: string[]; pairs?: CreatePairInput[] }`. `BlockConfig = { matchFormat; bufferMinutes; roundMinutes?; participantOrder?; advancePerGroup?; knockout? }`. `CreatePairInput = { player1Id; player2Id; seed?; groupName? }`. `MatchFormat` (en `types.ts`) = `{kind:'timed';minutes;tieRule:'golden_point'|'allow_draw'} | {kind:'first_to_set'} | {kind:'games';target} | {kind:'best_of_3'}`.
- **store.ts**: `createTournament` inserta meta+courts+participants+blocks (loop de bloques con grupos/parejas). `generateAndStore(db,id)` genera la parrilla y pone `status='scheduled'`. `updateTournamentShell` (Plan 6).
- **validation.ts** (Plan 6): patrón `Validated<T> = {ok:true;value} | {ok:false;error}`; `validateTournamentShell`, `validateResultInput`.
- **API** (Plan 6): rutas bajo `src/app/api/tournaments/**` con `requireAdmin()` (`const auth = await requireAdmin(); if ('response' in auth) return auth.response;`) y params `Promise` con `await`. `POST .../generate` ya existe.
- **UI** (Plan 6): `src/app/admin/tournaments/page.tsx` (listado), `src/components/admin/tournament-form.tsx` (form cliente con `fetch`+`toast`+`router.refresh()`). Componentes `@/components/ui/*` (`Button`, `Input`, `Label`, `Card*`, `Badge`, `Table*`). Clases `sec-title`, `muted`, `text-ink-3`, `bg-surface`, `lpt-btn primary`.
- **Esquema** (`@/lib/db/schema`): `tournaments`, `tournamentCourts`, `tournamentParticipants`, `tournamentBlocks`, `tournamentGroups`, `tournamentPairs`, `tournamentMatches`, `players`.
- **Importante (FK):** las foreign keys están **OFF** en Turso y en el harness de test → los `ON DELETE CASCADE` **no** se disparan. Por eso `replaceBlocks` borra a mano matches+pairs+groups+blocks.

---

## File Structure

- **Modify:** `src/lib/tournament/store.ts` — extraer `insertBlocks`; añadir `replaceBlocks`.
- **Modify:** `src/lib/tournament/store.test.ts` — test de `replaceBlocks`.
- **Modify:** `src/lib/tournament/validation.ts` — añadir `validateBlocks` (+ helper `validMatchFormat`).
- **Modify:** `src/lib/tournament/validation.test.ts` — tests de `validateBlocks`.
- **Create:** `src/app/api/tournaments/[id]/blocks/route.ts` — `PUT`.
- **Create:** `src/app/admin/tournaments/[id]/page.tsx` — panel (lectura + acciones).
- **Create:** `src/components/admin/generate-button.tsx` — botón "Generar parrilla" (client).
- **Modify:** `src/app/admin/tournaments/page.tsx` — enlazar filas al panel.
- **Create:** `src/app/admin/tournaments/[id]/blocks/page.tsx` — carga datos del editor (server).
- **Create:** `src/components/admin/blocks-editor.tsx` — editor de bloques (client).

---

## Task 1: Refactor `insertBlocks` + `replaceBlocks` en store.ts

**Files:**
- Modify: `src/lib/tournament/store.ts`
- Test: `src/lib/tournament/store.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Añade a `src/lib/tournament/store.test.ts` (importa `replaceBlocks` y `generateAndStore` ya está importado). Reutiliza `sampleInput`:

```ts
import { replaceBlocks } from './store';

describe('replaceBlocks', () => {
  it('reemplaza los bloques, borra la parrilla previa y vuelve a draft', async () => {
    const db = await createTestDb();
    const id = await createTournament(db, sampleInput); // tiene 2 bloques
    await generateAndStore(db, id); // crea matches y pone status scheduled

    const before = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
    expect(before.length).toBeGreaterThan(0);

    await replaceBlocks(db, id, [
      {
        order: 1, type: 'pozo', name: 'Solo pozo', durationMinutes: 60,
        config: {
          matchFormat: { kind: 'timed', minutes: 15, tieRule: 'golden_point' },
          bufferMinutes: 0, roundMinutes: 15, participantOrder: ['pl1', 'pl2', 'pl3', 'pl4'],
        },
      },
    ]);

    const blocks = await db.select().from(tournamentBlocks).where(eq(tournamentBlocks.tournamentId, id));
    expect(blocks).toHaveLength(1);
    expect(blocks[0].name).toBe('Solo pozo');

    // La parrilla previa se borró.
    const after = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));
    expect(after).toHaveLength(0);

    // Las parejas/grupos del bloque fixed_pairs anterior desaparecieron.
    const [t] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    expect(t.status).toBe('draft');
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/store.test.ts -t replaceBlocks`
Expected: FAIL — `replaceBlocks` no existe.

- [ ] **Step 3: Extraer `insertBlocks` y añadir `replaceBlocks`**

En `store.ts`, sustituye el bucle `for (const block of input.blocks) { … }` dentro de `createTournament` por una llamada al helper:

```ts
  await insertBlocks(db, tournament.id, input.blocks);

  return tournament.id;
}

// Inserta bloques (con sus grupos y parejas) bajo un torneo ya existente.
async function insertBlocks(db: Db, tournamentId: string, blocks: CreateBlockInput[]): Promise<void> {
  for (const block of blocks) {
    const [blockRow] = await db.insert(tournamentBlocks).values({
      tournamentId, order: block.order, type: block.type,
      name: block.name, durationMinutes: block.durationMinutes,
      config: JSON.stringify(block.config),
    }).returning();

    if (block.type === 'fixed_pairs') {
      const groupIdByName = new Map<string, string>();
      for (const name of block.groupNames ?? []) {
        const [g] = await db.insert(tournamentGroups).values({ blockId: blockRow.id, name }).returning();
        groupIdByName.set(name, g.id);
      }
      for (const p of block.pairs ?? []) {
        await db.insert(tournamentPairs).values({
          blockId: blockRow.id, player1Id: p.player1Id, player2Id: p.player2Id,
          seed: p.seed ?? null,
          groupId: p.groupName ? (groupIdByName.get(p.groupName) ?? null) : null,
        });
      }
    }
  }
}

// Reemplaza TODOS los bloques de un torneo. Borra explícitamente la parrilla y los
// bloques/grupos/parejas previos (las FK están OFF en Turso, no me fío del cascade),
// reinserta los nuevos y devuelve el torneo a 'draft' (la parrilla anterior ya no vale).
export async function replaceBlocks(db: Db, tournamentId: string, blocks: CreateBlockInput[]): Promise<void> {
  const existing = await db.select({ id: tournamentBlocks.id }).from(tournamentBlocks)
    .where(eq(tournamentBlocks.tournamentId, tournamentId));

  await db.delete(tournamentMatches).where(eq(tournamentMatches.tournamentId, tournamentId));
  for (const b of existing) {
    await db.delete(tournamentPairs).where(eq(tournamentPairs.blockId, b.id));
    await db.delete(tournamentGroups).where(eq(tournamentGroups.blockId, b.id));
  }
  await db.delete(tournamentBlocks).where(eq(tournamentBlocks.tournamentId, tournamentId));

  await insertBlocks(db, tournamentId, blocks);

  await db.update(tournaments).set({ status: 'draft' }).where(eq(tournaments.id, tournamentId));
}
```

> `tournamentMatches` debe estar en el import de `@/lib/db/schema` al principio de `store.ts` (ya lo está; lo usa `generateAndStore`). `tournamentBlocks`, `tournamentGroups`, `tournamentPairs`, `tournaments`, `eq` también.

- [ ] **Step 4: Ejecutar tests para verlos pasar**

Run: `npx vitest run src/lib/tournament/store.test.ts`
Expected: PASS — los existentes (createTournament sigue usando `insertBlocks`) + el nuevo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/store.ts src/lib/tournament/store.test.ts
git commit -m "refactor(tournaments): insertBlocks compartido + replaceBlocks"
```

---

## Task 2: `validateBlocks` (validación pura de bloques)

**Files:**
- Modify: `src/lib/tournament/validation.ts`
- Test: `src/lib/tournament/validation.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Añade a `src/lib/tournament/validation.test.ts`:

```ts
import { validateBlocks } from './validation';

const parts = new Set(['a', 'b', 'c', 'd', 'e', 'f']);

function pozoBlock() {
  return {
    type: 'pozo', name: 'Pozo', durationMinutes: 90,
    matchFormat: { kind: 'timed', minutes: 15, tieRule: 'golden_point' },
    bufferMinutes: 0, roundMinutes: 15, participantOrder: ['a', 'b', 'c', 'd'],
  };
}
function fixedBlock() {
  return {
    type: 'fixed_pairs', name: 'Torneo', durationMinutes: 120,
    matchFormat: { kind: 'best_of_3' }, bufferMinutes: 5,
    knockout: true, advancePerGroup: 1, groupNames: ['A', 'B'],
    pairs: [
      { player1Id: 'a', player2Id: 'b', seed: 1, groupName: 'A' },
      { player1Id: 'c', player2Id: 'd', seed: 2, groupName: 'A' },
      { player1Id: 'e', player2Id: 'f', seed: 3, groupName: 'B' },
    ],
  };
}

describe('validateBlocks', () => {
  it('acepta y normaliza pozo + fixed_pairs', () => {
    const r = validateBlocks({ blocks: [pozoBlock(), fixedBlock()] }, parts);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toHaveLength(2);
    expect(r.value[0].order).toBe(1);
    expect(r.value[1].order).toBe(2);
    expect(r.value[0].config.roundMinutes).toBe(15);
    expect(r.value[1].groupNames).toEqual(['A', 'B']);
    expect(r.value[1].pairs).toHaveLength(3);
  });

  it('acepta lista vacía de bloques', () => {
    const r = validateBlocks({ blocks: [] }, parts);
    expect(r).toEqual({ ok: true, value: [] });
  });

  it('rechaza tipo inválido', () => {
    const r = validateBlocks({ blocks: [{ ...pozoBlock(), type: 'mexicano' }] }, parts);
    expect(r.ok).toBe(false);
  });

  it('rechaza duración <= 0', () => {
    const r = validateBlocks({ blocks: [{ ...pozoBlock(), durationMinutes: 0 }] }, parts);
    expect(r.ok).toBe(false);
  });

  it('rechaza ronda de pozo mayor que el bloque', () => {
    const r = validateBlocks({ blocks: [{ ...pozoBlock(), roundMinutes: 120 }] }, parts);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/ronda/);
  });

  it('rechaza matchFormat inválido', () => {
    const r = validateBlocks({ blocks: [{ ...pozoBlock(), matchFormat: { kind: 'timed' } }] }, parts);
    expect(r.ok).toBe(false);
  });

  it('rechaza jugador de pareja fuera de los participantes', () => {
    const fb = fixedBlock();
    fb.pairs[0].player2Id = 'zzz';
    const r = validateBlocks({ blocks: [fb] }, parts);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/fuera de los participantes/);
  });

  it('rechaza un jugador en dos parejas', () => {
    const fb = fixedBlock();
    fb.pairs[1].player1Id = 'a'; // 'a' ya está en la pareja 1
    const r = validateBlocks({ blocks: [fb] }, parts);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/dos parejas/);
  });

  it('rechaza advancePerGroup mayor que el grupo más pequeño', () => {
    const fb = fixedBlock();
    fb.advancePerGroup = 2; // el grupo B sólo tiene 1 pareja
    const r = validateBlocks({ blocks: [fb] }, parts);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/grupo más pequeño/);
  });

  it('rechaza cuadro sin grupos con menos de 2 parejas', () => {
    const r = validateBlocks({ blocks: [{
      type: 'fixed_pairs', name: 'Cuadro', durationMinutes: 60,
      matchFormat: { kind: 'best_of_3' }, bufferMinutes: 0,
      knockout: true, groupNames: [],
      pairs: [{ player1Id: 'a', player2Id: 'b' }],
    }] }, parts);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/al menos 2 parejas/);
  });

  it('rechaza cuerpo sin blocks', () => {
    expect(validateBlocks({}, parts)).toEqual({ ok: false, error: 'Faltan los bloques' });
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/validation.test.ts -t validateBlocks`
Expected: FAIL — `validateBlocks` no existe.

- [ ] **Step 3: Añadir `validateBlocks` a `validation.ts`**

Añade los imports al principio del fichero (junto a los de `./store` y `./results`):

```ts
import type { CreateBlockInput, CreatePairInput, BlockConfig } from './store';
import type { MatchFormat } from './types';
```

Y al final del fichero:

```ts
function validMatchFormat(raw: unknown): MatchFormat | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  switch (m.kind) {
    case 'timed':
      if (Number.isInteger(m.minutes) && (m.minutes as number) > 0 && (m.tieRule === 'golden_point' || m.tieRule === 'allow_draw')) {
        return { kind: 'timed', minutes: m.minutes as number, tieRule: m.tieRule };
      }
      return null;
    case 'first_to_set': return { kind: 'first_to_set' };
    case 'best_of_3': return { kind: 'best_of_3' };
    case 'games':
      if (Number.isInteger(m.target) && (m.target as number) > 0) return { kind: 'games', target: m.target as number };
      return null;
    default: return null;
  }
}

// Valida la lista completa de bloques (cuerpo { blocks: [...] }) contra los participantes.
export function validateBlocks(body: unknown, participantIds: Set<string>): Validated<CreateBlockInput[]> {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Cuerpo inválido' };
  const rawBlocks = (body as Record<string, unknown>).blocks;
  if (!Array.isArray(rawBlocks)) return { ok: false, error: 'Faltan los bloques' };

  const blocks: CreateBlockInput[] = [];
  for (const [i, item] of rawBlocks.entries()) {
    const label = `Bloque ${i + 1}`;
    if (typeof item !== 'object' || item === null) return { ok: false, error: `${label}: inválido` };
    const b = item as Record<string, unknown>;

    if (b.type !== 'pozo' && b.type !== 'fixed_pairs') return { ok: false, error: `${label}: tipo inválido` };
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (!name) return { ok: false, error: `${label}: falta el nombre` };
    if (!Number.isInteger(b.durationMinutes) || (b.durationMinutes as number) <= 0) {
      return { ok: false, error: `${label}: la duración debe ser un entero > 0` };
    }
    const matchFormat = validMatchFormat(b.matchFormat);
    if (!matchFormat) return { ok: false, error: `${label}: formato de partido inválido` };
    if (!Number.isInteger(b.bufferMinutes) || (b.bufferMinutes as number) < 0) {
      return { ok: false, error: `${label}: el descanso debe ser un entero ≥ 0` };
    }
    const duration = b.durationMinutes as number;
    const bufferMinutes = b.bufferMinutes as number;

    if (b.type === 'pozo') {
      if (!Number.isInteger(b.roundMinutes) || (b.roundMinutes as number) <= 0) {
        return { ok: false, error: `${label}: la duración de ronda debe ser un entero > 0` };
      }
      if ((b.roundMinutes as number) > duration) {
        return { ok: false, error: `${label}: la ronda no puede durar más que el bloque` };
      }
      const order = Array.isArray(b.participantOrder) ? b.participantOrder : [];
      const seen = new Set<string>();
      for (const pid of order) {
        if (typeof pid !== 'string' || !participantIds.has(pid)) {
          return { ok: false, error: `${label}: jugador del pozo fuera de los participantes` };
        }
        if (seen.has(pid)) return { ok: false, error: `${label}: jugador repetido en el pozo` };
        seen.add(pid);
      }
      const config: BlockConfig = {
        matchFormat, bufferMinutes,
        roundMinutes: b.roundMinutes as number,
        participantOrder: order as string[],
      };
      blocks.push({ order: i + 1, type: 'pozo', name, durationMinutes: duration, config });
      continue;
    }

    // fixed_pairs
    const knockout = b.knockout === true;
    const groupNamesRaw = Array.isArray(b.groupNames) ? b.groupNames : [];
    const groupNames: string[] = [];
    const groupSeen = new Set<string>();
    for (const g of groupNamesRaw) {
      if (typeof g !== 'string' || !g.trim()) return { ok: false, error: `${label}: nombre de grupo vacío` };
      const gname = g.trim();
      if (groupSeen.has(gname)) return { ok: false, error: `${label}: grupo duplicado "${gname}"` };
      groupSeen.add(gname);
      groupNames.push(gname);
    }

    const pairsRaw = Array.isArray(b.pairs) ? b.pairs : [];
    const pairs: CreatePairInput[] = [];
    const playerSeen = new Set<string>();
    const groupCount = new Map<string, number>();
    for (const [j, pr] of pairsRaw.entries()) {
      if (typeof pr !== 'object' || pr === null) return { ok: false, error: `${label}: pareja ${j + 1} inválida` };
      const p = pr as Record<string, unknown>;
      const p1 = p.player1Id, p2 = p.player2Id;
      if (typeof p1 !== 'string' || typeof p2 !== 'string' || !participantIds.has(p1) || !participantIds.has(p2)) {
        return { ok: false, error: `${label}: pareja ${j + 1} con jugador fuera de los participantes` };
      }
      if (p1 === p2) return { ok: false, error: `${label}: pareja ${j + 1} con el mismo jugador dos veces` };
      if (playerSeen.has(p1) || playerSeen.has(p2)) return { ok: false, error: `${label}: un jugador está en dos parejas` };
      playerSeen.add(p1);
      playerSeen.add(p2);

      let groupName: string | undefined;
      if (groupNames.length > 0) {
        if (typeof p.groupName !== 'string' || !groupNames.includes(p.groupName)) {
          return { ok: false, error: `${label}: pareja ${j + 1} sin grupo válido` };
        }
        groupName = p.groupName;
        groupCount.set(groupName, (groupCount.get(groupName) ?? 0) + 1);
      }
      let seed: number | undefined;
      if (p.seed !== undefined && p.seed !== null) {
        if (!Number.isInteger(p.seed)) return { ok: false, error: `${label}: seed inválido en la pareja ${j + 1}` };
        seed = p.seed as number;
      }
      pairs.push({ player1Id: p1, player2Id: p2, seed, groupName });
    }

    if (knockout && groupNames.length > 0) {
      if (!Number.isInteger(b.advancePerGroup) || (b.advancePerGroup as number) < 1) {
        return { ok: false, error: `${label}: clasifican por grupo debe ser ≥ 1` };
      }
      const smallest = Math.min(...groupNames.map((g) => groupCount.get(g) ?? 0));
      if ((b.advancePerGroup as number) > smallest) {
        return { ok: false, error: `${label}: clasifican por grupo (${b.advancePerGroup}) supera el grupo más pequeño (${smallest})` };
      }
    }
    if (knockout && groupNames.length === 0 && pairs.length < 2) {
      return { ok: false, error: `${label}: un cuadro sin grupos necesita al menos 2 parejas` };
    }

    const config: BlockConfig = {
      matchFormat, bufferMinutes, knockout,
      advancePerGroup: Number.isInteger(b.advancePerGroup) ? (b.advancePerGroup as number) : undefined,
    };
    blocks.push({ order: i + 1, type: 'fixed_pairs', name, durationMinutes: duration, config, groupNames, pairs });
  }

  return { ok: true, value: blocks };
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/validation.test.ts`
Expected: PASS (16 anteriores + 11 nuevos = 27).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/validation.ts src/lib/tournament/validation.test.ts
git commit -m "feat(tournaments): validador de bloques (pozo + fixed_pairs)"
```

---

## Task 3: Ruta `PUT /api/tournaments/[id]/blocks`

**Files:**
- Create: `src/app/api/tournaments/[id]/blocks/route.ts`

- [ ] **Step 1: Crear el route handler**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tournaments, tournamentParticipants } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth/guard';
import { replaceBlocks } from '@/lib/tournament/store';
import { validateBlocks } from '@/lib/tournament/validation';

// PUT /api/tournaments/[id]/blocks — reemplaza todos los bloques del torneo.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const [existing] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    if (!existing) return NextResponse.json({ error: 'Torneo no encontrado' }, { status: 404 });

    const body = await request.json();
    const parts = await db.select({ playerId: tournamentParticipants.playerId })
      .from(tournamentParticipants).where(eq(tournamentParticipants.tournamentId, id));
    const participantIds = new Set(parts.map((p) => p.playerId));

    const v = validateBlocks(body, participantIds);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

    await replaceBlocks(db, id, v.value);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al guardar los bloques' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verificar tipos y lint**

Run: `npx tsc --noEmit && npx eslint src/app/api/tournaments`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/tournaments/[id]/blocks/route.ts"
git commit -m "feat(tournaments): API reemplazar bloques (PUT)"
```

---

## Task 4: Panel del torneo + botón Generar + enlace desde el listado

**Files:**
- Create: `src/components/admin/generate-button.tsx`
- Create: `src/app/admin/tournaments/[id]/page.tsx`
- Modify: `src/app/admin/tournaments/page.tsx`

- [ ] **Step 1: Crear `src/components/admin/generate-button.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function GenerateButton({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    const res = await fetch(`/api/tournaments/${tournamentId}/generate`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      toast.error(data.error || 'Error al generar la parrilla');
      return;
    }
    toast.success(`${data.matchCount} partidos generados`);
    if (Array.isArray(data.warnings) && data.warnings.length > 0) {
      for (const w of data.warnings) toast.warning(w);
    }
    router.refresh();
  }

  return (
    <Button onClick={handleGenerate} disabled={loading} className="min-h-[40px] px-4 text-sm">
      <Zap size={15} /> {loading ? 'Generando...' : 'Generar parrilla'}
    </Button>
  );
}
```

- [ ] **Step 2: Crear `src/app/admin/tournaments/[id]/page.tsx`**

```tsx
import { db } from '@/lib/db';
import {
  tournaments, tournamentCourts, tournamentParticipants, tournamentBlocks, players,
} from '@/lib/db/schema';
import { asc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GenerateButton } from '@/components/admin/generate-button';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador', scheduled: 'Programado', running: 'En juego', completed: 'Finalizado',
};

const FORMAT_LABEL: Record<string, string> = {
  timed: 'A tiempo', first_to_set: 'Primer set', games: 'A juegos', best_of_3: 'Al mejor de 3',
};

export default async function TournamentPanelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
  if (!tournament) notFound();

  const courts = await db.select().from(tournamentCourts)
    .where(eq(tournamentCourts.tournamentId, id)).orderBy(asc(tournamentCourts.order));

  const participants = await db
    .select({ name: players.name })
    .from(tournamentParticipants)
    .innerJoin(players, eq(players.id, tournamentParticipants.playerId))
    .where(eq(tournamentParticipants.tournamentId, id))
    .orderBy(asc(players.name));

  const blocks = await db.select().from(tournamentBlocks)
    .where(eq(tournamentBlocks.tournamentId, id)).orderBy(asc(tournamentBlocks.order));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="sec-title">{tournament.name}</h1>
            <Badge variant="outline">{STATUS_LABEL[tournament.status] ?? tournament.status}</Badge>
          </div>
          <p className="muted text-sm mt-1.5">{tournament.date}{tournament.location ? ` · ${tournament.location}` : ''}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link href={`/admin/tournaments/${id}/blocks`} className="lpt-btn" style={{ minHeight: 38, padding: '7px 13px', fontSize: 12.5 }}>
            <Pencil size={15} /> Editar bloques
          </Link>
          {blocks.length > 0 && <GenerateButton tournamentId={id} />}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Pistas ({courts.length})</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {courts.map((c) => (
              <div key={c.id} className="flex justify-between">
                <span>{c.label}</span>
                <span className="text-ink-3">{c.availableFrom}–{c.availableTo}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Participantes ({participants.length})</CardTitle></CardHeader>
          <CardContent className="text-sm text-ink-3">
            {participants.map((p) => p.name).join(', ') || '—'}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Bloques ({blocks.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {blocks.length === 0 ? (
            <p className="text-sm text-ink-3">Sin bloques. Pulsa &quot;Editar bloques&quot; para configurarlos.</p>
          ) : (
            blocks.map((b) => {
              const config = JSON.parse(b.config) as { matchFormat?: { kind?: string } };
              return (
                <div key={b.id} className="flex items-center justify-between border rounded-md px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium">{b.order}. {b.name}</span>
                    <span className="text-ink-3"> · {b.type === 'pozo' ? 'Pozo' : 'Parejas fijas'}</span>
                  </div>
                  <span className="text-ink-3">{b.durationMinutes} min · {FORMAT_LABEL[config.matchFormat?.kind ?? ''] ?? '—'}</span>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Enlazar las filas del listado al panel**

En `src/app/admin/tournaments/page.tsx`, importa `Link` (si no está) y envuelve el nombre del torneo con un enlace al panel. Sustituye la celda del nombre:

```tsx
                  <TableCell>
                    <Link href={`/admin/tournaments/${t.id}`} className="font-medium hover:underline">{t.name}</Link>
                    {t.location && <p className="text-xs text-ink-3">{t.location}</p>}
                  </TableCell>
```

> `Link` ya está importado en ese fichero (se usa para "Nuevo torneo").

- [ ] **Step 4: Verificar tipos y lint**

Run: `npx tsc --noEmit && npx eslint src/app/admin/tournaments src/components/admin/generate-button.tsx`
Expected: sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/tournaments/[id]/page.tsx" src/components/admin/generate-button.tsx src/app/admin/tournaments/page.tsx
git commit -m "feat(tournaments): panel del torneo + botón generar + enlace desde el listado"
```

---

## Task 5: Editor de bloques

**Files:**
- Create: `src/app/admin/tournaments/[id]/blocks/page.tsx`
- Create: `src/components/admin/blocks-editor.tsx`

- [ ] **Step 1: Crear `src/app/admin/tournaments/[id]/blocks/page.tsx` (carga datos)**

```tsx
import { db } from '@/lib/db';
import {
  tournaments, tournamentParticipants, tournamentBlocks, tournamentGroups, tournamentPairs, players,
} from '@/lib/db/schema';
import { asc, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { BlocksEditor, type EditorBlock } from '@/components/admin/blocks-editor';
import type { BlockConfig } from '@/lib/tournament/store';

export const dynamic = 'force-dynamic';

export default async function BlocksEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
  if (!tournament) notFound();

  const participants = await db
    .select({ id: players.id, name: players.name })
    .from(tournamentParticipants)
    .innerJoin(players, eq(players.id, tournamentParticipants.playerId))
    .where(eq(tournamentParticipants.tournamentId, id))
    .orderBy(asc(players.name));

  const blockRows = await db.select().from(tournamentBlocks)
    .where(eq(tournamentBlocks.tournamentId, id)).orderBy(asc(tournamentBlocks.order));

  const initial: EditorBlock[] = [];
  for (const b of blockRows) {
    const config = JSON.parse(b.config) as BlockConfig;
    if (b.type === 'pozo') {
      initial.push({
        type: 'pozo', name: b.name, durationMinutes: b.durationMinutes,
        matchFormat: config.matchFormat, bufferMinutes: config.bufferMinutes,
        roundMinutes: config.roundMinutes ?? 15,
        knockout: false, advancePerGroup: 1, groupNames: [], pairs: [],
      });
    } else {
      const groups = await db.select().from(tournamentGroups).where(eq(tournamentGroups.blockId, b.id));
      const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
      const prs = await db.select().from(tournamentPairs).where(eq(tournamentPairs.blockId, b.id));
      initial.push({
        type: 'fixed_pairs', name: b.name, durationMinutes: b.durationMinutes,
        matchFormat: config.matchFormat, bufferMinutes: config.bufferMinutes,
        roundMinutes: 15,
        knockout: config.knockout ?? false,
        advancePerGroup: config.advancePerGroup ?? 1,
        groupNames: groups.map((g) => g.name),
        pairs: prs.map((p) => ({
          player1Id: p.player1Id, player2Id: p.player2Id,
          seed: p.seed ?? null,
          groupName: p.groupId ? (groupNameById.get(p.groupId) ?? '') : '',
        })),
      });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">Bloques · {tournament.name}</h1>
        <p className="muted text-sm mt-1.5">Configura la secuencia de bloques. Guardar reemplaza la parrilla generada.</p>
      </div>
      <BlocksEditor tournamentId={id} participants={participants} initial={initial} />
    </div>
  );
}
```

- [ ] **Step 2: Crear `src/components/admin/blocks-editor.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { MatchFormat } from '@/lib/tournament/types';

interface Participant { id: string; name: string; }

interface EditorPair { player1Id: string; player2Id: string; seed: number | null; groupName: string; }

export interface EditorBlock {
  type: 'pozo' | 'fixed_pairs';
  name: string;
  durationMinutes: number;
  matchFormat: MatchFormat;
  bufferMinutes: number;
  roundMinutes: number;        // pozo
  knockout: boolean;           // fixed_pairs
  advancePerGroup: number;     // fixed_pairs
  groupNames: string[];        // fixed_pairs
  pairs: EditorPair[];         // fixed_pairs
}

function emptyBlock(type: 'pozo' | 'fixed_pairs'): EditorBlock {
  return {
    type, name: type === 'pozo' ? 'Pozo' : 'Torneo', durationMinutes: 90,
    matchFormat: { kind: 'timed', minutes: 15, tieRule: 'golden_point' },
    bufferMinutes: 0, roundMinutes: 15,
    knockout: false, advancePerGroup: 1, groupNames: [], pairs: [],
  };
}

export function BlocksEditor({ tournamentId, participants, initial }: {
  tournamentId: string;
  participants: Participant[];
  initial: EditorBlock[];
}) {
  const router = useRouter();
  const [blocks, setBlocks] = useState<EditorBlock[]>(initial);
  const [loading, setLoading] = useState(false);

  function update(i: number, patch: Partial<EditorBlock>) {
    setBlocks((bs) => bs.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }
  function move(i: number, dir: -1 | 1) {
    setBlocks((bs) => {
      const j = i + dir;
      if (j < 0 || j >= bs.length) return bs;
      const next = [...bs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function setFormat(i: number, kind: MatchFormat['kind']) {
    let mf: MatchFormat;
    if (kind === 'timed') mf = { kind: 'timed', minutes: 15, tieRule: 'golden_point' };
    else if (kind === 'games') mf = { kind: 'games', target: 6 };
    else if (kind === 'first_to_set') mf = { kind: 'first_to_set' };
    else mf = { kind: 'best_of_3' };
    update(i, { matchFormat: mf });
  }

  async function save() {
    setLoading(true);
    const payload = {
      blocks: blocks.map((b) => {
        if (b.type === 'pozo') {
          return {
            type: 'pozo', name: b.name, durationMinutes: b.durationMinutes,
            matchFormat: b.matchFormat, bufferMinutes: b.bufferMinutes,
            roundMinutes: b.roundMinutes,
            participantOrder: participants.map((p) => p.id), // siembra automática = orden de la lista
          };
        }
        return {
          type: 'fixed_pairs', name: b.name, durationMinutes: b.durationMinutes,
          matchFormat: b.matchFormat, bufferMinutes: b.bufferMinutes,
          knockout: b.knockout, advancePerGroup: b.advancePerGroup,
          groupNames: b.groupNames,
          pairs: b.pairs.map((p) => ({
            player1Id: p.player1Id, player2Id: p.player2Id,
            seed: p.seed, groupName: b.groupNames.length > 0 ? p.groupName : undefined,
          })),
        };
      }),
    };

    const res = await fetch(`/api/tournaments/${tournamentId}/blocks`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) { toast.error(data.error || 'Error al guardar'); return; }
    toast.success('Bloques guardados');
    router.push(`/admin/tournaments/${tournamentId}`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {blocks.map((b, i) => (
        <Card key={i} className="max-w-2xl">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>{i + 1}. {b.type === 'pozo' ? 'Pozo' : 'Parejas fijas'}</CardTitle>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir bloque"><ArrowUp size={16} /></Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} aria-label="Bajar bloque"><ArrowDown size={16} /></Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setBlocks((bs) => bs.filter((_, idx) => idx !== i))} aria-label="Eliminar bloque"><Trash2 size={16} /></Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Nombre</Label>
                <Input value={b.name} onChange={(e) => update(i, { name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Duración (min)</Label>
                <Input type="number" value={b.durationMinutes} onChange={(e) => update(i, { durationMinutes: Number(e.target.value) })} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Formato</Label>
                <select className="w-full h-9 rounded-md border border-line bg-transparent px-2 text-sm"
                  value={b.matchFormat.kind} onChange={(e) => setFormat(i, e.target.value as MatchFormat['kind'])}>
                  <option value="timed">A tiempo</option>
                  <option value="first_to_set">Primer set</option>
                  <option value="games">A X juegos</option>
                  <option value="best_of_3">Al mejor de 3</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Descanso entre partidos (min)</Label>
                <Input type="number" value={b.bufferMinutes} onChange={(e) => update(i, { bufferMinutes: Number(e.target.value) })} />
              </div>
            </div>

            {b.matchFormat.kind === 'timed' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Minutos por partido</Label>
                  <Input type="number" value={b.matchFormat.minutes}
                    onChange={(e) => update(i, { matchFormat: { kind: 'timed', minutes: Number(e.target.value), tieRule: (b.matchFormat as Extract<MatchFormat, { kind: 'timed' }>).tieRule } })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Empate</Label>
                  <select className="w-full h-9 rounded-md border border-line bg-transparent px-2 text-sm"
                    value={(b.matchFormat as Extract<MatchFormat, { kind: 'timed' }>).tieRule}
                    onChange={(e) => update(i, { matchFormat: { kind: 'timed', minutes: (b.matchFormat as Extract<MatchFormat, { kind: 'timed' }>).minutes, tieRule: e.target.value as 'golden_point' | 'allow_draw' } })}>
                    <option value="golden_point">Punto de oro</option>
                    <option value="allow_draw">Permitir empate</option>
                  </select>
                </div>
              </div>
            )}

            {b.matchFormat.kind === 'games' && (
              <div className="space-y-1 max-w-[12rem]">
                <Label className="text-xs">Juegos objetivo</Label>
                <Input type="number" value={b.matchFormat.target}
                  onChange={(e) => update(i, { matchFormat: { kind: 'games', target: Number(e.target.value) } })} />
              </div>
            )}

            {b.type === 'pozo' && (
              <div className="space-y-1 max-w-[12rem]">
                <Label className="text-xs">Duración de ronda (min)</Label>
                <Input type="number" value={b.roundMinutes} onChange={(e) => update(i, { roundMinutes: Number(e.target.value) })} />
              </div>
            )}

            {b.type === 'fixed_pairs' && (
              <FixedPairsConfig block={b} participants={participants} onChange={(patch) => update(i, patch)} />
            )}
          </CardContent>
        </Card>
      ))}

      <div className="flex flex-wrap gap-2 max-w-2xl">
        <Button type="button" variant="outline" size="sm" onClick={() => setBlocks((bs) => [...bs, emptyBlock('pozo')])}>
          <Plus size={15} /> Bloque pozo
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setBlocks((bs) => [...bs, emptyBlock('fixed_pairs')])}>
          <Plus size={15} /> Bloque parejas fijas
        </Button>
      </div>

      <div className="flex gap-2 max-w-2xl">
        <Button type="button" onClick={save} disabled={loading} className="min-h-[40px] px-4 text-sm">
          {loading ? 'Guardando...' : 'Guardar bloques'}
        </Button>
        <Button type="button" variant="outline" className="min-h-[40px] px-4 text-sm" onClick={() => router.push(`/admin/tournaments/${tournamentId}`)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function FixedPairsConfig({ block, participants, onChange }: {
  block: EditorBlock;
  participants: Participant[];
  onChange: (patch: Partial<EditorBlock>) => void;
}) {
  const [newGroup, setNewGroup] = useState('');

  function addPair() {
    onChange({ pairs: [...block.pairs, { player1Id: '', player2Id: '', seed: null, groupName: block.groupNames[0] ?? '' }] });
  }
  function setPair(j: number, patch: Partial<EditorPair>) {
    onChange({ pairs: block.pairs.map((p, idx) => (idx === j ? { ...p, ...patch } : p)) });
  }
  function removePair(j: number) {
    onChange({ pairs: block.pairs.filter((_, idx) => idx !== j) });
  }

  return (
    <div className="space-y-4 border-t border-line pt-4">
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={block.knockout} onChange={(e) => onChange({ knockout: e.target.checked })} className="h-4 w-4 rounded border-line" />
        Cuadro eliminatorio tras la liguilla
      </label>

      <div className="space-y-2">
        <Label className="text-xs">Grupos</Label>
        <div className="flex flex-wrap items-center gap-2">
          {block.groupNames.map((g) => (
            <span key={g} className="inline-flex items-center gap-1 rounded-md bg-surface px-2 py-1 text-sm">
              {g}
              <button type="button" onClick={() => onChange({ groupNames: block.groupNames.filter((x) => x !== g), pairs: block.pairs.map((p) => (p.groupName === g ? { ...p, groupName: '' } : p)) })} aria-label={`Quitar grupo ${g}`}>×</button>
            </span>
          ))}
          <Input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="Grupo A" className="w-28 h-8" />
          <Button type="button" variant="outline" size="sm" onClick={() => {
            const name = newGroup.trim();
            if (name && !block.groupNames.includes(name)) onChange({ groupNames: [...block.groupNames, name] });
            setNewGroup('');
          }}>Añadir</Button>
        </div>
        <p className="text-xs text-ink-3">Sin grupos = cuadro directo.</p>
      </div>

      {block.knockout && block.groupNames.length > 0 && (
        <div className="space-y-1 max-w-[12rem]">
          <Label className="text-xs">Clasifican por grupo</Label>
          <Input type="number" value={block.advancePerGroup} onChange={(e) => onChange({ advancePerGroup: Number(e.target.value) })} />
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-xs">Parejas ({block.pairs.length})</Label>
        {block.pairs.map((p, j) => (
          <div key={j} className="flex flex-wrap items-end gap-2 border border-line rounded-md p-2">
            <PlayerSelect label="Jugador 1" value={p.player1Id} participants={participants} onChange={(v) => setPair(j, { player1Id: v })} />
            <PlayerSelect label="Jugador 2" value={p.player2Id} participants={participants} onChange={(v) => setPair(j, { player2Id: v })} />
            {block.groupNames.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">Grupo</Label>
                <select className="h-9 rounded-md border border-line bg-transparent px-2 text-sm" value={p.groupName} onChange={(e) => setPair(j, { groupName: e.target.value })}>
                  <option value="">—</option>
                  {block.groupNames.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            )}
            <div className="space-y-1 w-20">
              <Label className="text-xs">Seed</Label>
              <Input type="number" value={p.seed ?? ''} onChange={(e) => setPair(j, { seed: e.target.value === '' ? null : Number(e.target.value) })} />
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => removePair(j)} aria-label="Quitar pareja"><Trash2 size={16} /></Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addPair}><Plus size={15} /> Añadir pareja</Button>
      </div>
    </div>
  );
}

function PlayerSelect({ label, value, participants, onChange }: {
  label: string; value: string; participants: Participant[]; onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <select className="h-9 rounded-md border border-line bg-transparent px-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  );
}
```

- [ ] **Step 3: Verificar tipos y lint**

Run: `npx tsc --noEmit && npx eslint "src/app/admin/tournaments/[id]/blocks/page.tsx" src/components/admin/blocks-editor.tsx`
Expected: sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/tournaments/[id]/blocks/page.tsx" src/components/admin/blocks-editor.tsx
git commit -m "feat(tournaments): editor de bloques (pozo + parejas fijas/grupos a mano)"
```

---

## Task 6: Verificación final del plan

- [ ] **Step 1: Suite completa de tournament**

Run: `npx vitest run src/lib/tournament`
Expected: PASS — `validation` (27), `store` (con `replaceBlocks`) y todo lo anterior.

- [ ] **Step 2: Tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Lint de todo lo tocado**

Run: `npx eslint src/lib/tournament src/app/api/tournaments src/app/admin/tournaments src/components/admin`
Expected: sin errores.

---

## Self-review (cubierto vs. spec/alcance acordado)

- **Panel `/admin/tournaments/[id]`** (estado, pistas, participantes, bloques, acciones): Task 4. ✓
- **Botón Generar parrilla** (reusa endpoint Plan 6, muestra matchCount + avisos): Task 4. ✓
- **Enlace listado → detalle**: Task 4. ✓
- **Editor de bloques `/admin/tournaments/[id]/blocks`** (añadir/ordenar/configurar; pozo y fixed_pairs; parejas y grupos a mano): Task 5. ✓
- **Siembra pozo automática** (orden de la lista de participantes): `participantOrder` en `BlocksEditor.save` (Task 5). ✓
- **API reemplazo de bloques** (`PUT`) con `requireAdmin`: Task 3. ✓
- **Validación de bloques** (advancePerGroup ≥1 y ≤ grupo más pequeño, participantOrder ⊆ participantes, jugadores de pareja ∈ participantes, sin repetir jugador, cuadro directo ≥2 parejas): Task 2. ✓
- **replaceBlocks borra parrilla previa y vuelve a draft** (FK OFF → borrado explícito): Task 1. ✓

**Fuera de este plan:** Plan 8 = parrilla editable drag&drop + resultados desde UI + clasificaciones/cuadro en vivo. Plan 9 = vista pública. UI de edición del cascarón (pistas/participantes) sigue pendiente. **Despliegue:** `POST /api/migrate-tournaments` en prod (si no se hizo ya).
