# Fase 1 · Paso 1B-2 — Scoping del ciclo de partido (matches + motor de rating)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scopear por `group_id` todo el camino de escritura del ciclo de partido — la API de `matches` (crear/resultado/borrar/lados/lesión), `matchSets` vía FK, y el motor de rating `process-match.ts` (elo, `pairStats`, `ratingHistory`, logros) — sin cambiar nada visible para Lomeros.

**Architecture:** Un módulo `src/lib/matches/queries.ts` expone funciones de `matches` scopeadas por `groupId`. Las rutas obtienen `groupId` del contexto (público→`getDefaultGroupId()`, admin→`getGroupContext()`) y validan que los jugadores de un partido pertenecen al grupo. El motor `processMatchRatings` recibe el `groupId` (vía el campo `groupId` del propio match) y scopea sus escaneos globales de logros al grupo. Comportamiento idéntico para Lomeros (un solo grupo).

**Tech Stack:** Next.js (App Router) · Drizzle ORM · libSQL/Turso · Vitest · Playwright.

**Alcance:** SOLO el camino de **escritura/engine** del dominio de partidos: `api/matches/route.ts`, `api/matches/[id]/route.ts`, `api/matches/[id]/sides/route.ts`, `api/matches/[id]/abandon/route.ts`, `lib/rating/process-match.ts`, `lib/push/match-events.ts`. **Fuera (a sus pasos):** betting/`settle.ts` (1B-3); las **páginas de lectura** (matches públicas, rankings, perfiles, home) van al paso de lecturas (1B-5). Los guards/JWT no se tocan.

---

## Decisiones clave

1. **`processMatchRatings` recibe el grupo por el propio match.** Se añade `groupId: string` a `MatchInput`; los dos llamadores ya hacen `processMatchRatings({ ...match, ... })` y `match`/`updated` ahora llevan `groupId`, así que el valor fluye sin cambiar las llamadas. Igual para `notifyMatchResult` (`MatchTeams` gana `groupId`).
2. **El punto caliente es `applyAchievementsForMatch`:** hace 4 escaneos GLOBALES (`ratingHistory`, `matchSets`, `matches`, `players`). Se anclan en `matches.groupId`: se obtienen los partidos del grupo → sus ids → se filtran `ratingHistory`/`matchSets` por esos ids, y `players` por `groupId`. Los detectores (`detectRankChanges`, `detectAllAchievements`) son puros: con datos ya scopeados quedan correctos.
3. **Tablas hijas sin `group_id` (matchSets, ratingHistory, pairStats, playerAchievements):** se scopean vía FK al padre. Los reads/writes por id de los 4 jugadores del partido (o por `match.id`) ya son group-correctos porque esos ids son del grupo. `pairStats` (clave = par de ids de jugador, únicos por grupo) no necesita columna `group_id`.
4. **Validación de jugadores in-group en POST.** Crear un partido acepta 4 ids del body; se valida que los 4 pertenecen al grupo (helper nuevo `getPlayersInGroup`) para que no se cuele un jugador de otro grupo. En PUT el reajuste de parejas ya exige que los ids estén entre los del partido original (in-group), así que no hace falta check extra.
5. **Betting fuera.** Las llamadas a `settle`/`refundOpenBets`/`reverseSettlement` se dejan igual: scopean por `matchId` y son transitivamente in-group una vez verificado el partido. Su tenancy propia es 1B-3.

---

## File Structure

**Crear:**
- `src/lib/matches/queries.ts` — consultas de `matches`/`matchSets` scopeadas.
- `e2e/no-fuga-matches.spec.ts` — aserciones de aislamiento de partidos.

**Modificar:**
- `src/lib/players/queries.ts` — añadir `getPlayersInGroup(groupId, ids)`.
- `src/lib/rating/process-match.ts` — `groupId` en `MatchInput`; scopear `applyAchievementsForMatch`.
- `src/lib/push/match-events.ts` — `groupId` en `MatchTeams`; scopear el select de `players`.
- `src/app/api/matches/route.ts`, `.../[id]/route.ts`, `.../[id]/sides/route.ts`, `.../[id]/abandon/route.ts` — cablear groupId + módulo.
- `e2e/global-setup.ts` — sembrar un partido del 2º grupo.

---

## Task 1: Módulos de consulta (matches + helper de players)

**Files:**
- Create: `src/lib/matches/queries.ts`
- Modify: `src/lib/players/queries.ts`

- [ ] **Step 1: Crear `src/lib/matches/queries.ts`**

```ts
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { matches, matchSets, type Match, type MatchSet, type NewMatch } from '@/lib/db/schema';

export async function listMatchesByDate(groupId: string): Promise<Match[]> {
  return db.select().from(matches).where(eq(matches.groupId, groupId)).orderBy(desc(matches.date));
}

export async function getMatchInGroup(groupId: string, id: string): Promise<Match | undefined> {
  const [m] = await db.select().from(matches).where(and(eq(matches.id, id), eq(matches.groupId, groupId)));
  return m;
}

// matchSets no tiene group_id: se lee por matchId, con el padre ya verificado en-grupo por el caller.
export async function getMatchSetsForMatch(matchId: string): Promise<MatchSet[]> {
  return db.select().from(matchSets).where(eq(matchSets.matchId, matchId)).orderBy(matchSets.setNumber);
}

export async function createMatchInGroup(
  groupId: string,
  values: Omit<NewMatch, 'id' | 'groupId'>,
): Promise<Match> {
  const [m] = await db.insert(matches).values({ ...values, groupId }).returning();
  return m;
}

export async function updateMatchInGroup(
  groupId: string,
  id: string,
  fields: Partial<Omit<NewMatch, 'id' | 'groupId'>>,
): Promise<Match | undefined> {
  const [m] = await db
    .update(matches)
    .set(fields)
    .where(and(eq(matches.id, id), eq(matches.groupId, groupId)))
    .returning();
  return m;
}

export async function deleteMatchInGroup(groupId: string, id: string): Promise<void> {
  await db.delete(matches).where(and(eq(matches.id, id), eq(matches.groupId, groupId)));
}

// matchSets hereda el grupo del partido padre (matchId ya es de un partido del grupo).
export async function insertMatchSets(
  matchId: string,
  sets: { setNumber: number; team1Games: number; team2Games: number }[],
): Promise<void> {
  for (const set of sets) {
    await db.insert(matchSets).values({
      matchId,
      setNumber: set.setNumber,
      team1Games: set.team1Games,
      team2Games: set.team2Games,
    });
  }
}
```

- [ ] **Step 2: Añadir `getPlayersInGroup` a `src/lib/players/queries.ts`**

Cambiar el import superior de drizzle de:

```ts
import { and, desc, eq } from 'drizzle-orm';
```

por:

```ts
import { and, desc, eq, inArray } from 'drizzle-orm';
```

Y añadir al final del fichero:

```ts
// Los jugadores del grupo cuyo id está en `ids` (para validar que un partido no
// referencia jugadores de otro grupo).
export async function getPlayersInGroup(groupId: string, ids: string[]): Promise<Player[]> {
  if (ids.length === 0) return [];
  return db.select().from(players).where(and(inArray(players.id, ids), eq(players.groupId, groupId)));
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/lib/matches/queries.ts src/lib/players/queries.ts
git commit -m "feat(multitenant): módulo de consulta de matches scopeado + getPlayersInGroup (1B-2)"
```

---

## Task 2: Scopear el motor de rating y el push de resultado

**Files:**
- Modify: `src/lib/rating/process-match.ts`
- Modify: `src/lib/push/match-events.ts`

- [ ] **Step 1: `MatchInput` gana `groupId`**

En `src/lib/rating/process-match.ts`, en el type `MatchInput`, añadir tras `id: string;`:

```ts
  groupId: string;
```

- [ ] **Step 2: Scopear el lookup de los 4 jugadores (defensivo)**

En `processMatchRatings`, cambiar el bloque (líneas ~65-69):

```ts
  const playersData = await Promise.all(
    playerIds.map((id) =>
      db.select().from(players).where(eq(players.id, id)).limit(1).then((r) => r[0])
    )
  );
```

por:

```ts
  const playersData = await Promise.all(
    playerIds.map((id) =>
      db
        .select()
        .from(players)
        .where(and(eq(players.id, id), eq(players.groupId, match.groupId)))
        .limit(1)
        .then((r) => r[0])
    )
  );
```

(`and` ya está importado.)

- [ ] **Step 3: Pasar `groupId` a `applyAchievementsForMatch`**

En `processMatchRatings`, cambiar la llamada:

```ts
  const newAchievements = await applyAchievementsForMatch(match.id);
```

por:

```ts
  const newAchievements = await applyAchievementsForMatch(match.id, match.groupId);
```

- [ ] **Step 4: Scopear los escaneos globales de `applyAchievementsForMatch`**

Cambiar la firma y el bloque de carga inicial. De:

```ts
async function applyAchievementsForMatch(matchId: string): Promise<{ playerId: string; achievementId: string }[]> {
  // Load history + sets + matches + players. We need globals to compute
  // bagel/doubleBagel and rank changes correctly.
  const allHistory = await db.select().from(ratingHistory);
  const allSetsRows = await db.select().from(matchSetsTable);
  const allMatchesRows = await db.select().from(matchesTable);
  const allPlayersSnapshot = await db.select().from(players);
```

a:

```ts
async function applyAchievementsForMatch(
  matchId: string,
  groupId: string,
): Promise<{ playerId: string; achievementId: string }[]> {
  // Cargamos historial + sets + partidos + jugadores DEL GRUPO. Se ancla en
  // matches.groupId: los ids de partido del grupo scopean ratingHistory y matchSets
  // (que no tienen group_id), y players se filtra por groupId. Los detectores son
  // puros, así que con estos datos ya scopeados quedan correctos y sin fuga.
  const allMatchesRows = await db.select().from(matchesTable).where(eq(matchesTable.groupId, groupId));
  const groupMatchIds = allMatchesRows.map((m) => m.id);
  const allHistory = groupMatchIds.length
    ? await db.select().from(ratingHistory).where(inArray(ratingHistory.matchId, groupMatchIds))
    : [];
  const allSetsRows = groupMatchIds.length
    ? await db.select().from(matchSetsTable).where(inArray(matchSetsTable.matchId, groupMatchIds))
    : [];
  const allPlayersSnapshot = await db.select().from(players).where(eq(players.groupId, groupId));
```

(`eq`, `and`, `inArray` ya están importados en la línea 3.)

- [ ] **Step 5: `match-events.ts` — `groupId` en `MatchTeams` + scopear players**

En `src/lib/push/match-events.ts`:

Cambiar el import (línea 2):

```ts
import { players } from '@/lib/db/schema';
```

por:

```ts
import { players } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
```

Añadir `groupId` a la interfaz `MatchTeams`, tras `id: string;`:

```ts
  groupId: string;
```

Scopear el select de `players` (líneas ~28-30): cambiar

```ts
    const allPlayers = await db
      .select({ id: players.id, eloRating: players.eloRating, matchesPlayed: players.matchesPlayed })
      .from(players);
```

por:

```ts
    const allPlayers = await db
      .select({ id: players.id, eloRating: players.eloRating, matchesPlayed: players.matchesPlayed })
      .from(players)
      .where(eq(players.groupId, match.groupId));
```

- [ ] **Step 6: Verificar tipos y suite unit**

Run: `npx tsc --noEmit`
Expected: sin errores. (Confirma que los dos llamadores de `processMatchRatings`/`notifyMatchResult` pasan `groupId` vía el spread del match.)

Run: `npx vitest run`
Expected: toda la suite unit verde (los tests del motor de elo/logros son puros y no se ven afectados).

- [ ] **Step 7: Commit**

```bash
git add src/lib/rating/process-match.ts src/lib/push/match-events.ts
git commit -m "feat(multitenant): process-match y push de resultado scopeados por grupo (1B-2)"
```

---

## Task 3: Cablear las rutas de partidos

**Files:**
- Modify: `src/app/api/matches/route.ts`
- Modify: `src/app/api/matches/[id]/route.ts`
- Modify: `src/app/api/matches/[id]/sides/route.ts`
- Modify: `src/app/api/matches/[id]/abandon/route.ts`

- [ ] **Step 1: `api/matches/route.ts`**

Reemplazar el contenido por:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { processMatchRatings } from '@/lib/rating/process-match';
import { coerceSide } from '@/lib/rating/side-stats';
import { requireAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { listMatchesByDate, createMatchInGroup, insertMatchSets } from '@/lib/matches/queries';
import { getPlayersInGroup } from '@/lib/players/queries';
import { notifyMatchResult } from '@/lib/push/match-events';
import { notifyBettingOpen } from '@/lib/push/bet-events';

// GET /api/matches (público; grupo por defecto)
export async function GET() {
  try {
    const groupId = await getDefaultGroupId();
    const all = await listMatchesByDate(groupId);
    return NextResponse.json(all);
  } catch {
    return NextResponse.json({ error: 'Error al obtener partidos' }, { status: 500 });
  }
}

// POST /api/matches (admin)
//   - With sets  → status='completed', calculates winner, triggers Elo
//   - Without sets → status='scheduled', winnerTeam=null, no Elo yet
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    const body = await request.json();
    const {
      date,
      time,
      location,
      team1Player1Id,
      team1Player2Id,
      team2Player1Id,
      team2Player2Id,
      team1Player1Side,
      team1Player2Side,
      team2Player1Side,
      team2Player2Side,
      sets, // optional: [{setNumber, team1Games, team2Games}]
    } = body;

    // 4 distinct players always required
    const playerIds = [team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id];
    if (playerIds.some((id) => !id) || new Set(playerIds).size !== 4) {
      return NextResponse.json({ error: 'Se necesitan 4 jugadores distintos' }, { status: 400 });
    }

    // Los 4 jugadores deben pertenecer al grupo (no se cuela un jugador de otro grupo).
    const inGroup = await getPlayersInGroup(groupId, playerIds);
    if (inGroup.length !== 4) {
      return NextResponse.json({ error: 'Jugadores no válidos para este grupo' }, { status: 400 });
    }

    const isScheduled = !sets || sets.length === 0;

    if (!isScheduled && (sets.length < 2 || sets.length > 3)) {
      return NextResponse.json({ error: 'El partido necesita 2 o 3 sets' }, { status: 400 });
    }

    let winnerTeam: 1 | 2 | null = null;
    if (!isScheduled) {
      let team1SetsWon = 0;
      let team2SetsWon = 0;
      for (const set of sets) {
        if (set.team1Games > set.team2Games) team1SetsWon++;
        else team2SetsWon++;
      }
      winnerTeam = team1SetsWon > team2SetsWon ? 1 : 2;
    }

    const match = await createMatchInGroup(groupId, {
      date,
      time: typeof time === 'string' && /^\d{2}:\d{2}$/.test(time) ? time : null,
      location: location?.trim() || null,
      team1Player1Id,
      team1Player2Id,
      team2Player1Id,
      team2Player2Id,
      team1Player1Side: coerceSide(team1Player1Side),
      team1Player2Side: coerceSide(team1Player2Side),
      team2Player1Side: coerceSide(team2Player1Side),
      team2Player2Side: coerceSide(team2Player2Side),
      winnerTeam,
      status: isScheduled ? 'scheduled' : 'completed',
    });

    if (isScheduled) {
      // Apuestas abiertas: avisa a todos los suscritos de La Timba. Best-effort.
      await notifyBettingOpen(match);
    } else {
      await insertMatchSets(match.id, sets);

      const ratingResult = await processMatchRatings({
        ...match,
        winnerTeam: winnerTeam as 1 | 2,
        sets,
      });

      await notifyMatchResult({ ...match, winnerTeam: winnerTeam as 1 | 2 }, ratingResult);
    }

    return NextResponse.json(match, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al crear partido' }, { status: 500 });
  }
}
```

- [ ] **Step 2: `api/matches/[id]/route.ts`**

Reemplazar el contenido por:

```ts
import { NextRequest, NextResponse } from 'next/server';
import type { NewMatch } from '@/lib/db/schema';
import { processMatchRatings } from '@/lib/rating/process-match';
import { coerceSide } from '@/lib/rating/side-stats';
import { requireAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import {
  getMatchInGroup,
  getMatchSetsForMatch,
  updateMatchInGroup,
  deleteMatchInGroup,
  insertMatchSets,
} from '@/lib/matches/queries';
import { notifyMatchResult } from '@/lib/push/match-events';
import { settleMatchBets, refundOpenBets, reverseSettlement } from '@/lib/betting/settle';
import { notifyBetSettlements } from '@/lib/push/bet-events';

// GET /api/matches/[id] (público)
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const groupId = await getDefaultGroupId();
    const match = await getMatchInGroup(groupId, id);
    if (!match) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
    const sets = await getMatchSetsForMatch(id);
    return NextResponse.json({ ...match, sets });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// DELETE /api/matches/[id] (admin)
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    const match = await getMatchInGroup(groupId, id);
    if (match) {
      if (match.status === 'completed') {
        await reverseSettlement(id);
      }
      const refunded = await refundOpenBets(id);
      await notifyBetSettlements(id, refunded);
    }
    // Los sets se borran en cascada (ON DELETE CASCADE). Scopeado por grupo.
    await deleteMatchInGroup(groupId, id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// PUT /api/matches/[id] — add result to a scheduled match (admin)
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    const body = await request.json();
    const {
      sets,
      team1Player1Id,
      team1Player2Id,
      team2Player1Id,
      team2Player2Id,
      team1Player1Side,
      team1Player2Side,
      team2Player1Side,
      team2Player2Side,
      photoUrl,
    } = body;

    if (!sets || sets.length < 2 || sets.length > 3) {
      return NextResponse.json({ error: 'El partido necesita 2 o 3 sets' }, { status: 400 });
    }

    const match = await getMatchInGroup(groupId, id);
    if (!match) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
    if (match.status === 'completed') {
      return NextResponse.json({ error: 'Este partido ya tiene resultado' }, { status: 400 });
    }

    // Reajuste opcional de parejas: los 4 ids deben coincidir con los del partido programado (in-group).
    const newPairingIds = [team1Player1Id, team1Player2Id, team2Player1Id, team2Player2Id];
    const pairingProvided = newPairingIds.every((v) => typeof v === 'string' && v.length > 0);
    if (pairingProvided) {
      if (new Set(newPairingIds).size !== 4) {
        return NextResponse.json({ error: 'Las parejas deben incluir 4 jugadores distintos' }, { status: 400 });
      }
      const originalIds = new Set([
        match.team1Player1Id,
        match.team1Player2Id,
        match.team2Player1Id,
        match.team2Player2Id,
      ]);
      if (!newPairingIds.every((pid) => originalIds.has(pid as string))) {
        return NextResponse.json(
          { error: 'Los jugadores deben coincidir con los del partido programado' },
          { status: 400 },
        );
      }
    }

    const sameTeam = (a: [string, string], b: [string, string]) =>
      [...a].sort().join() === [...b].sort().join();
    const pairingChanged = pairingProvided && !(
      sameTeam([match.team1Player1Id, match.team1Player2Id], [team1Player1Id, team1Player2Id]) &&
      sameTeam([match.team2Player1Id, match.team2Player2Id], [team2Player1Id, team2Player2Id])
    );

    let team1SetsWon = 0;
    let team2SetsWon = 0;
    for (const set of sets) {
      if (set.team1Games > set.team2Games) team1SetsWon++;
      else team2SetsWon++;
    }
    const winnerTeam: 1 | 2 = team1SetsWon > team2SetsWon ? 1 : 2;

    await insertMatchSets(id, sets);

    const updateFields: Partial<NewMatch> = { winnerTeam, status: 'completed' };
    if (pairingProvided) {
      updateFields.team1Player1Id = team1Player1Id;
      updateFields.team1Player2Id = team1Player2Id;
      updateFields.team2Player1Id = team2Player1Id;
      updateFields.team2Player2Id = team2Player2Id;
    }
    if (team1Player1Side !== undefined) updateFields.team1Player1Side = coerceSide(team1Player1Side);
    if (team1Player2Side !== undefined) updateFields.team1Player2Side = coerceSide(team1Player2Side);
    if (team2Player1Side !== undefined) updateFields.team2Player1Side = coerceSide(team2Player1Side);
    if (team2Player2Side !== undefined) updateFields.team2Player2Side = coerceSide(team2Player2Side);
    if (typeof photoUrl === 'string' && photoUrl.length > 0) updateFields.photoUrl = photoUrl;

    const updated = await updateMatchInGroup(groupId, id, updateFields);
    if (!updated) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });

    const ratingResult = await processMatchRatings({ ...updated, winnerTeam, sets });

    await notifyMatchResult({ ...updated, winnerTeam }, ratingResult);

    const betOutcomes = pairingChanged
      ? await refundOpenBets(id)
      : await settleMatchBets(id, winnerTeam, sets);
    await notifyBetSettlements(id, betOutcomes);

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al guardar resultado' }, { status: 500 });
  }
}
```

- [ ] **Step 3: `api/matches/[id]/sides/route.ts`**

Reemplazar el contenido por:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { coerceSide } from '@/lib/rating/side-stats';
import { requireAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { updateMatchInGroup } from '@/lib/matches/queries';

// PATCH /api/matches/[id]/sides — update only the side columns (admin)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    const body = await request.json();
    const { team1Player1Side, team1Player2Side, team2Player1Side, team2Player2Side } = body;

    const updated = await updateMatchInGroup(groupId, id, {
      team1Player1Side: coerceSide(team1Player1Side),
      team1Player2Side: coerceSide(team1Player2Side),
      team2Player1Side: coerceSide(team2Player1Side),
      team2Player2Side: coerceSide(team2Player2Side),
    });

    if (!updated) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al actualizar lados' }, { status: 500 });
  }
}
```

- [ ] **Step 4: `api/matches/[id]/abandon/route.ts`**

Reemplazar el contenido por:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { getMatchInGroup, updateMatchInGroup } from '@/lib/matches/queries';
import { refundOpenBets } from '@/lib/betting/settle';
import { notifyBetSettlements } from '@/lib/push/bet-events';

// POST /api/matches/[id]/abandon (admin)
// Marca un partido programado como no disputado por lesión. Body: { injuredPlayerId }.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    const body = await req.json();
    const { injuredPlayerId } = body as { injuredPlayerId?: string };

    if (!injuredPlayerId) {
      return NextResponse.json({ error: 'Falta injuredPlayerId' }, { status: 400 });
    }

    const match = await getMatchInGroup(groupId, id);
    if (!match) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
    if (match.status === 'completed') {
      return NextResponse.json({ error: 'El partido ya está completado' }, { status: 400 });
    }

    const matchPlayers = [
      match.team1Player1Id,
      match.team1Player2Id,
      match.team2Player1Id,
      match.team2Player2Id,
    ];
    if (!matchPlayers.includes(injuredPlayerId)) {
      return NextResponse.json(
        { error: 'El jugador lesionado debe ser uno de los 4 del partido' },
        { status: 400 },
      );
    }

    const updated = await updateMatchInGroup(groupId, id, {
      status: 'injury_aborted',
      injuredPlayerId,
      winnerTeam: null,
    });

    // «La Timba»: partido anulado → devolución íntegra
    const refunded = await refundOpenBets(id);
    await notifyBetSettlements(id, refunded);

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al marcar lesión' }, { status: 500 });
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
git add src/app/api/matches/route.ts "src/app/api/matches/[id]/route.ts" "src/app/api/matches/[id]/sides/route.ts" "src/app/api/matches/[id]/abandon/route.ts"
git commit -m "feat(multitenant): rutas de partidos scopeadas por grupo (1B-2)"
```

---

## Task 4: Arnés y test e2e de no-fuga (partidos)

**Files:**
- Modify: `e2e/global-setup.ts`
- Create: `e2e/no-fuga-matches.spec.ts`

- [ ] **Step 1: Sembrar un partido del 2º grupo**

En `e2e/global-setup.ts`, justo después del bloque que siembra el 2º grupo y `gt-pl1` (los dos `INSERT OR IGNORE` de `groups`/`players` de "Grupo Test" añadidos en 1B-1), añadir:

```ts
  // 3 jugadores más del grupo de test + un partido programado suyo, para no-fuga de partidos.
  for (let i = 2; i <= 4; i++) {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO players (id, group_id, name) VALUES (?, ?, ?)',
      args: [`gt-pl${i}`, 'grupo-test', `Jugador GT ${i}`],
    });
  }
  await db.execute({
    sql: `INSERT OR IGNORE INTO matches
      (id, group_id, date, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: ['gt-match1', 'grupo-test', '2026-01-01', 'gt-pl1', 'gt-pl2', 'gt-pl3', 'gt-pl4', 'scheduled'],
  });
```

- [ ] **Step 2: Crear el spec de no-fuga (fallará sin el scoping de la Task 3)**

`e2e/no-fuga-matches.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

// Aislamiento entre grupos para el dominio de partidos. El global-setup crea un
// partido `gt-match1` en "Grupo Test"; Lomeros (grupo por defecto) nunca debe verlo ni tocarlo.
test.describe('no-fuga · partidos (público)', () => {
  test('la lista pública no incluye partidos de otro grupo', async ({ request }) => {
    const res = await request.get('/api/matches');
    expect(res.ok()).toBeTruthy();
    const list = (await res.json()) as Array<{ id: string }>;
    expect(list.map((m) => m.id)).not.toContain('gt-match1');
  });

  test('GET de un partido de otro grupo da 404', async ({ request }) => {
    const res = await request.get('/api/matches/gt-match1');
    expect(res.status()).toBe(404);
  });
});

test.describe('no-fuga · partidos (admin de Lomeros)', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('un admin de Lomeros no puede registrar resultado en un partido de otro grupo (404)', async ({ request }) => {
    const res = await request.put('/api/matches/gt-match1', {
      data: { sets: [{ setNumber: 1, team1Games: 6, team2Games: 0 }, { setNumber: 2, team1Games: 6, team2Games: 0 }] },
    });
    expect(res.status()).toBe(404);
  });

  test('un admin de Lomeros no puede cambiar los lados de un partido de otro grupo (404)', async ({ request }) => {
    const res = await request.patch('/api/matches/gt-match1/sides', {
      data: { team1Player1Side: 'drive' },
    });
    expect(res.status()).toBe(404);
  });
});
```

- [ ] **Step 3: Ejecutar la suite e2e completa**

Run: `npm run e2e`
Expected: PASS — todos los specs verdes, incluido `no-fuga-matches` (4 tests) y el `no-fuga-players` previo. El resto sigue verde (comportamiento idéntico para Lomeros).

(Nota TDD: sin la Task 3, la lista pública incluiría `gt-match1` y el PUT/PATCH no darían 404 → el test fallaría, confirmando que verifica el scoping real.)

- [ ] **Step 4: Commit**

```bash
git add e2e/global-setup.ts e2e/no-fuga-matches.spec.ts
git commit -m "test(e2e): no-fuga del dominio de partidos + seed de partido del 2º grupo (1B-2)"
```

---

## Self-review (cobertura del spec 1B para 1B-2)

- **Módulo de consulta de `matches` que inyecta groupId + `matchSets` vía FK (spec §1):** Task 1. ✔
- **Motor `process-match` recibe groupId y scopea sus escaneos globales de logros (spec §1, §2):** Task 2 (`MatchInput.groupId`, `applyAchievementsForMatch` anclado en `matches.groupId`). ✔
- **Rutas dejan de tocar `db` directo para `matches`; groupId del contexto (spec §1):** Task 3, 4 rutas migradas. ✔
- **Validación de jugadores in-group en POST (cierra inyección cross-grupo):** Task 3 + `getPlayersInGroup`. ✔
- **Betting fuera de alcance (settle por matchId, transitivo) (spec §2 fila 1B-3):** llamadas a settle/refund intactas. ✔
- **Test e2e de no-fuga + seed de partido del 2º grupo (spec §3):** Task 4, 4 aserciones de aislamiento. ✔
- **Páginas de lectura → 1B-5:** no se tocan aquí. ✔
- **Comportamiento idéntico para Lomeros (spec §0):** un solo grupo real; suite existente verde. ✔

Sin placeholders. Nombres consistentes: `listMatchesByDate`/`getMatchInGroup`/`getMatchSetsForMatch`/`createMatchInGroup`/`updateMatchInGroup`/`deleteMatchInGroup`/`insertMatchSets`/`getPlayersInGroup`/`applyAchievementsForMatch(matchId, groupId)` usados igual en módulos, rutas, motor y referidos por el e2e.
