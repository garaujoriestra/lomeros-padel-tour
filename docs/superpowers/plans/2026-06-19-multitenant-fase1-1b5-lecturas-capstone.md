# Fase 1 · Paso 1B-5 — Lecturas scopeadas + capstone (quitar .default + guard de CI)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar 1B: scopear por `group_id` TODA lectura directa de las 4 tablas tenant raíz (`players`, `matches`, `rewards`, `tournaments`) que aún viva en `src/app/**` (páginas públicas, admin, "me" y rutas API) + la lectura del cron; **quitar el `.default(LOMEROS_GROUP_ID)`** de esas 4 columnas en el schema Drizzle (contrato: cualquier insert que olvide `groupId` falla en TS); y añadir un **guard de CI** que falla si reaparece acceso directo a esas tablas en `src/app`.

**Architecture:** Patrón DAL ya establecido: las páginas/rutas resuelven `groupId` (público → `getDefaultGroupId()`, autenticado → `getGroupContext()?.groupId ?? getDefaultGroupId()`) y llaman funciones `src/lib/<dominio>/queries.ts` que inyectan el filtro. Se añaden ~22 funciones de LECTURA scopeada (la mayoría triviales). Las tablas hijas sin `group_id` (matchSets, ratingHistory, pairStats, penalties, playerAchievements, bets) se scopean vía JOIN al padre con `group_id` (matches/players) cuando se listan globalmente, o se leen por FK desde un padre ya verificado in-grupo. El guard es un script Node que grepea `src/app/**` por `.from/.insert/.update/.delete/.join(<tabla raíz>)`, con allowlist solo para los endpoints de migración (mantenimiento global legítimo).

**Tech Stack:** Next.js (App Router, server components) · Drizzle ORM · libSQL/Turso · Vitest · Playwright · GitHub Actions.

**Alcance:** capstone de 1B. Scopea las lecturas restantes de `src/app` (públicas + admin + me + api), el cron, quita el `.default`, añade el guard. **Fuera (siguientes pasos):** iteración del cron POR grupo, push/blob/branding por grupo → 1D; roles desde memberships → 1C. La tabla `users` y `pushSubscriptions` NO son tenant (identidad global) → no se tocan. `tournamentPairs.groupId` es FK a `tournamentGroups` (grupo de cuadro), NO es la columna tenant → NO se toca.

---

## Decisiones clave

1. **Guard acotado a las 4 tablas RAÍZ en `src/app/**`.** Son las que tienen `group_id`; un acceso sin filtro = fuga directa. Las hijas (matchSets/ratingHistory/pairStats/penalties/playerAchievements/bets/tokenLedger) NO entran en el guard (se scopean vía FK al padre; su acceso está distribuido en motores y algún flujo transaccional legítimo —p.ej. `tx.insert(bets)` en `POST /api/bets`—). El motor (`src/lib/**`) queda fuera del guard por construcción (solo mira `src/app`).
2. **Allowlist del guard = endpoints de migración** (`api/migrate-db`, `api/migrate-avatars`, `api/init-db`): hacen backfill/mantenimiento GLOBAL a propósito (no son lecturas de usuario). Se documentan en el script.
3. **Quitar el `.default` es seguro:** los 4 inserts a tablas raíz en `src/` ya viven en DALs y fijan `groupId` (`createPlayerInGroup`/`createMatchInGroup`/`createRewardInGroup`/`createEvent`). Quitar el `.default` solo afecta a los TIPOS de Drizzle (`$inferInsert` exige `groupId`); el DEFAULT FÍSICO de la columna en prod queda como backstop de SQL crudo. `tsc` enumerará cualquier insert que lo olvide. Hoy solo rompe **1 test** (`tournament/test-db.test.ts`), que se arregla aquí.
4. **Hijas listadas globalmente → JOIN al padre.** `ratingHistory`/`matchSets` se scopean por `matches.groupId`; `pairStats`/`penalties`/`playerAchievements` por `players.groupId`. Las hijas leídas por id desde un padre ya verificado in-grupo (sets/bets/eloDeltas de un partido cargado con `getMatchInGroup`) se dejan como están (transitivamente in-grupo).
5. **Perfil:** `loadPlayerProfile(id)` → `loadPlayerProfile(groupId, id)`; gatekeepea con `getPlayerInGroup` (null si de otro grupo → la página `notFound()`/`redirect`), y scopea sus dos lecturas globales (`allPlayers`, `globalHistory`). Las lecturas por `playerId` (matches/history/pairs/achievements del jugador) son in-grupo. `profile-data.ts` vive en `src/lib` (no lo toca el guard), pero se scopea por corrección.
6. **Comportamiento idéntico para Lomeros:** un solo grupo real → filtrar por su grupo devuelve exactamente lo mismo en toda página. La suite (unit + e2e + las page-specs existentes) lo verifica.

---

## File Structure

**Crear:**
- `src/lib/rating/queries.ts` — `ratingHistory`/`pairStats` scopeados vía JOIN al padre.
- `scripts/check-direct-db-access.mjs` — guard (exporta `findRootTableAccess()` + ejecuta en CLI).
- `src/lib/db/no-direct-db-access.test.ts` — test que asegura que el guard no encuentra nada hoy.
- `e2e/no-fuga-lecturas.spec.ts` — aislamiento de las páginas de lectura.

**Modificar (DAL):**
- `src/lib/players/queries.ts` — +9 lecturas scopeadas.
- `src/lib/matches/queries.ts` — +6 lecturas scopeadas.
- `src/lib/betting/queries.ts` — +1 (`listPendingPenaltiesInGroup`).
- `src/lib/rewards/queries.ts` — +1 (`listActiveRewardsInGroup`).
- `src/lib/players/profile-data.ts` — `groupId` + gate + scope.

**Modificar (páginas/rutas — cablear groupId + DAL):** home, rankings (x3), matches (lista + detalle + metadata + OG), api/rankings, pozos/[id], torneos/[id], players/[id], me/page, me/tokens, api/me, api/pairings/preview, admin/page, admin/timba, admin/rewards, admin/pozos/new, admin/torneos/new, admin/matches/new, admin/matches, admin/matches/[id]/sides, admin/matches/[id]/result, admin/notifications, cron/match-reminders.

**Modificar (capstone):**
- `src/lib/db/schema.ts` — quitar `.default(LOMEROS_GROUP_ID)` en players/matches/rewards/tournaments.
- `src/lib/tournament/test-db.test.ts` — pasar `groupId` en el insert.
- `package.json` — script `check:db-access`.
- `.github/workflows/ci.yml` — paso del guard.

---

## Task 1: Funciones DAL de lectura scopeada

**Files:**
- Modify: `src/lib/players/queries.ts`
- Modify: `src/lib/matches/queries.ts`
- Modify: `src/lib/betting/queries.ts`
- Modify: `src/lib/rewards/queries.ts`
- Create: `src/lib/rating/queries.ts`

- [ ] **Step 1: `src/lib/players/queries.ts` — imports + 9 funciones**

Cambiar la línea de imports de drizzle:

```ts
import { and, desc, eq, inArray } from 'drizzle-orm';
```

por:

```ts
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
```

Cambiar el import del schema:

```ts
import { players, type NewPlayer, type Player } from '@/lib/db/schema';
```

por:

```ts
import { players, playerAchievements, type NewPlayer, type Player } from '@/lib/db/schema';
```

Y añadir al final del fichero:

```ts
// Todos los jugadores del grupo, por nombre (para playerMaps y rosters de admin).
export async function listAllPlayersInGroup(groupId: string): Promise<Player[]> {
  return db.select().from(players).where(eq(players.groupId, groupId)).orderBy(players.name);
}

// Jugadores con partidos jugados, por Elo desc (rankings); limit opcional.
export async function listRankedPlayers(groupId: string, limit?: number): Promise<Player[]> {
  const base = db.select().from(players)
    .where(and(eq(players.groupId, groupId), sql`${players.matchesPlayed} > 0`))
    .orderBy(desc(players.eloRating));
  return limit ? base.limit(limit) : base;
}

// Jugadores sin partidos, por nombre.
export async function listUnrankedPlayers(groupId: string): Promise<Player[]> {
  return db.select().from(players)
    .where(and(eq(players.groupId, groupId), sql`${players.matchesPlayed} = 0`))
    .orderBy(players.name);
}

// Jugadores recién creados, por createdAt desc.
export async function listRecentPlayers(groupId: string, limit: number): Promise<Player[]> {
  return db.select().from(players).where(eq(players.groupId, groupId))
    .orderBy(desc(players.createdAt)).limit(limit);
}

// Jugadores por saldo de fichas desc, luego nombre (clasificación de La Timba).
export async function listPlayersByTokenBalance(groupId: string): Promise<Player[]> {
  return db.select().from(players).where(eq(players.groupId, groupId))
    .orderBy(desc(players.tokenBalance), players.name);
}

// Jugadores que juegan al pádel, por nombre (formulario de partido).
export async function listPadelPlayers(groupId: string): Promise<Player[]> {
  return db.select().from(players)
    .where(and(eq(players.groupId, groupId), eq(players.juegaPadel, true)))
    .orderBy(players.name);
}

// Nº de jugadores del grupo.
export async function countPlayersInGroup(groupId: string): Promise<number> {
  const [r] = await db.select({ count: sql<number>`count(*)` }).from(players)
    .where(eq(players.groupId, groupId));
  return Number(r.count);
}

// Nº de jugadores con partidos jugados.
export async function countRankedPlayers(groupId: string): Promise<number> {
  const [r] = await db.select({ count: sql<number>`count(*)` }).from(players)
    .where(and(eq(players.groupId, groupId), sql`${players.matchesPlayed} > 0`));
  return Number(r.count);
}

// Logros recientes de los jugadores del grupo (vía JOIN), por earnedAt desc.
export async function listRecentAchievementsInGroup(
  groupId: string,
  limit: number,
): Promise<{ playerId: string; achievementId: string; earnedAt: string }[]> {
  return db.select({
    playerId: playerAchievements.playerId,
    achievementId: playerAchievements.achievementId,
    earnedAt: playerAchievements.earnedAt,
  })
    .from(playerAchievements)
    .innerJoin(players, eq(players.id, playerAchievements.playerId))
    .where(eq(players.groupId, groupId))
    .orderBy(desc(playerAchievements.earnedAt))
    .limit(limit);
}
```

- [ ] **Step 2: `src/lib/matches/queries.ts` — imports + 6 funciones**

Cambiar el import de drizzle:

```ts
import { and, desc, eq } from 'drizzle-orm';
```

por:

```ts
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
```

Añadir al final del fichero:

```ts
// Partidos recientes del grupo, por fecha desc (feed de la home).
export async function listRecentMatches(groupId: string, limit: number): Promise<Match[]> {
  return db.select().from(matches).where(eq(matches.groupId, groupId))
    .orderBy(desc(matches.date)).limit(limit);
}

// Partidos programados del grupo, por fecha (home "próximos" + cron); limit opcional.
export async function listScheduledMatches(groupId: string, limit?: number): Promise<Match[]> {
  const base = db.select().from(matches)
    .where(and(eq(matches.groupId, groupId), eq(matches.status, 'scheduled')))
    .orderBy(matches.date);
  return limit ? base.limit(limit) : base;
}

// Nº de partidos del grupo.
export async function countMatchesInGroup(groupId: string): Promise<number> {
  const [r] = await db.select({ count: sql<number>`count(*)` }).from(matches)
    .where(eq(matches.groupId, groupId));
  return Number(r.count);
}

// Todos los sets de los partidos del grupo (vía JOIN al partido), para listados.
export async function listMatchSetsInGroup(groupId: string): Promise<MatchSet[]> {
  return db.select({
    id: matchSets.id, matchId: matchSets.matchId, setNumber: matchSets.setNumber,
    team1Games: matchSets.team1Games, team2Games: matchSets.team2Games,
  })
    .from(matchSets)
    .innerJoin(matches, eq(matches.id, matchSets.matchId))
    .where(eq(matches.groupId, groupId));
}

// Sets de un conjunto de partidos (el caller ya scopeó los ids in-grupo).
export async function listMatchSetsForMatches(matchIds: string[]): Promise<MatchSet[]> {
  if (matchIds.length === 0) return [];
  return db.select().from(matchSets).where(inArray(matchSets.matchId, matchIds));
}

// Partidos del grupo que involucran a alguno de los jugadores dados (preview de parejas).
export async function listMatchesInvolvingPlayers(groupId: string, ids: string[]): Promise<Match[]> {
  if (ids.length === 0) return [];
  return db.select().from(matches).where(and(
    eq(matches.groupId, groupId),
    or(
      inArray(matches.team1Player1Id, ids),
      inArray(matches.team1Player2Id, ids),
      inArray(matches.team2Player1Id, ids),
      inArray(matches.team2Player2Id, ids),
    ),
  ));
}
```

- [ ] **Step 3: Crear `src/lib/rating/queries.ts`**

```ts
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { matches, players, ratingHistory, pairStats, type RatingHistory, type PairStat } from '@/lib/db/schema';

// Todo el historial de Elo de los partidos del grupo (vía JOIN), por recordedAt asc.
export async function listRatingHistoryInGroup(groupId: string): Promise<RatingHistory[]> {
  return db.select({
    id: ratingHistory.id, playerId: ratingHistory.playerId, matchId: ratingHistory.matchId,
    eloBefore: ratingHistory.eloBefore, eloAfter: ratingHistory.eloAfter,
    eloChange: ratingHistory.eloChange, recordedAt: ratingHistory.recordedAt,
  })
    .from(ratingHistory)
    .innerJoin(matches, eq(matches.id, ratingHistory.matchId))
    .where(eq(matches.groupId, groupId))
    .orderBy(ratingHistory.recordedAt);
}

// Historial de Elo reciente del grupo (desc, limit) para el feed de la home.
export async function listRecentRatingHistoryInGroup(groupId: string, limit: number): Promise<RatingHistory[]> {
  return db.select({
    id: ratingHistory.id, playerId: ratingHistory.playerId, matchId: ratingHistory.matchId,
    eloBefore: ratingHistory.eloBefore, eloAfter: ratingHistory.eloAfter,
    eloChange: ratingHistory.eloChange, recordedAt: ratingHistory.recordedAt,
  })
    .from(ratingHistory)
    .innerJoin(matches, eq(matches.id, ratingHistory.matchId))
    .where(eq(matches.groupId, groupId))
    .orderBy(desc(ratingHistory.recordedAt))
    .limit(limit);
}

// Stats de pareja del grupo (vía JOIN al jugador 1; ambos son del mismo grupo),
// con mínimo de partidos, por Elo de pareja desc.
export async function listPairStatsInGroup(groupId: string, minMatches: number): Promise<PairStat[]> {
  return db.select({
    id: pairStats.id, player1Id: pairStats.player1Id, player2Id: pairStats.player2Id,
    matchesPlayed: pairStats.matchesPlayed, wins: pairStats.wins, losses: pairStats.losses,
    pairElo: pairStats.pairElo, synergyScore: pairStats.synergyScore, lastPlayed: pairStats.lastPlayed,
  })
    .from(pairStats)
    .innerJoin(players, eq(players.id, pairStats.player1Id))
    .where(and(eq(players.groupId, groupId), sql`${pairStats.matchesPlayed} >= ${minMatches}`))
    .orderBy(desc(pairStats.pairElo));
}
```

- [ ] **Step 4: `src/lib/betting/queries.ts` — `listPendingPenaltiesInGroup`**

Añadir al final del fichero:

```ts
// Penalizaciones pendientes de los jugadores del grupo (marcadores de bancarrota de La Timba).
export async function listPendingPenaltiesInGroup(groupId: string): Promise<{ playerId: string }[]> {
  return db.select({ playerId: penalties.playerId })
    .from(penalties)
    .innerJoin(players, eq(players.id, penalties.playerId))
    .where(and(eq(players.groupId, groupId), eq(penalties.status, 'pending')));
}
```

(`and`, `eq`, `penalties`, `players` ya están importados.)

- [ ] **Step 5: `src/lib/rewards/queries.ts` — `listActiveRewardsInGroup`**

Añadir tras `listRewardsInGroup`:

```ts
// Premios ACTIVOS del grupo, por coste (catálogo de canje del jugador).
export async function listActiveRewardsInGroup(groupId: string): Promise<Reward[]> {
  return db.select().from(rewards)
    .where(and(eq(rewards.groupId, groupId), eq(rewards.active, true)))
    .orderBy(rewards.cost);
}
```

(`and`, `eq`, `rewards`, `Reward` ya están importados.)

- [ ] **Step 6: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/lib/players/queries.ts src/lib/matches/queries.ts src/lib/rating/queries.ts src/lib/betting/queries.ts src/lib/rewards/queries.ts
git commit -m "feat(multitenant): DAL de lecturas scopeadas (rankings/perfil/feed/timba) (1B-5)"
```

---

## Task 2: Cablear páginas públicas

Para cada página: resolver `const groupId = await getDefaultGroupId();` (import desde `@/lib/auth/group-context`) y reemplazar las lecturas globales por llamadas al DAL. Quitar los imports de `db`/tablas que queden sin uso (tsc avisa).

**Files + mapeo exacto:**

- [ ] **Step 1: `src/app/(public)/page.tsx` (home)**

Añadir `import { getDefaultGroupId } from '@/lib/auth/group-context';` (ya está de 1B-4) y al inicio del cuerpo, antes del `Promise.all`, `const groupId = await getDefaultGroupId();`. Reemplazar dentro del `Promise.all`:
- `db.select().from(players).where(sql\`${players.matchesPlayed} > 0\`).orderBy(desc(players.eloRating)).limit(20)` → `listRankedPlayers(groupId, 20)`
- `db.select().from(matches).orderBy(desc(matches.date)).limit(30)` → `listRecentMatches(groupId, 30)`
- `db.select().from(matches).where(eq(matches.status, 'scheduled')).orderBy(matches.date).limit(3)` → `listScheduledMatches(groupId, 3)`
- `db.select({ count: sql<number>\`count(*)\` }).from(matches)` (→ `[totalMatchesRow]`) → reemplazar el destructuring: en vez de `[totalMatchesRow]` usar `totalMatches` directo con `countMatchesInGroup(groupId)`. (Ajustar: cambiar la fila del array a `countMatchesInGroup(groupId)` y abajo `const totalMatches = totalMatchesRow.count;` → `const totalMatches = totalMatchesCount;` con el nombre que toque.)
- `db.select({ count: sql<number>\`count(*)\` }).from(players).where(sql\`${players.matchesPlayed} > 0\`)` (→ `[totalPlayersRow]`) → `countRankedPlayers(groupId)` (idem, devuelve number).
- `db.select().from(players).orderBy(desc(players.createdAt)).limit(5)` → `listRecentPlayers(groupId, 5)`
- `db.select().from(ratingHistory).orderBy(desc(ratingHistory.recordedAt)).limit(100)` → `listRecentRatingHistoryInGroup(groupId, 100)`
- `db.select().from(playerAchievements).orderBy(desc(playerAchievements.earnedAt)).limit(20)` → `listRecentAchievementsInGroup(groupId, 20)`

Fuera del `Promise.all`:
- línea 64 `db.select().from(matchSets).where(inArray(matchSets.matchId, matchIds))` → `listMatchSetsForMatches(matchIds)`
- línea 67 `db.select().from(players)` (`allPlayers`) → `listAllPlayersInGroup(groupId)`

Imports DAL: `import { listRankedPlayers, listRecentPlayers, listAllPlayersInGroup, countRankedPlayers, listRecentAchievementsInGroup } from '@/lib/players/queries';` · `import { listRecentMatches, listScheduledMatches, countMatchesInGroup, listMatchSetsForMatches } from '@/lib/matches/queries';` · `import { listRecentRatingHistoryInGroup } from '@/lib/rating/queries';`. Cambiar las dos cuentas: `const totalMatches = await countMatchesInGroup(...)` ya devuelve number → en el `Promise.all` quedan como `totalMatches` y `totalPlayers` directos (number); eliminar `const totalMatches = totalMatchesRow.count;` y `const totalPlayers = totalPlayersRow.count;` y renombrar las posiciones del destructuring a `totalMatches`/`totalPlayers`.

- [ ] **Step 2: `src/app/(public)/rankings/page.tsx`**

`const groupId = await getDefaultGroupId();` y:
- `ranked` → `listRankedPlayers(groupId)`
- `unranked` → `listUnrankedPlayers(groupId)`
- `history` → `listRatingHistoryInGroup(groupId)`

Imports: `import { getDefaultGroupId } from '@/lib/auth/group-context';` · `import { listRankedPlayers, listUnrankedPlayers } from '@/lib/players/queries';` · `import { listRatingHistoryInGroup } from '@/lib/rating/queries';`. Quitar imports `db`, `players`, `ratingHistory`, `sql`, `desc` si quedan sin uso.

- [ ] **Step 3: `src/app/(public)/rankings/pairs/page.tsx`**

`const groupId = await getDefaultGroupId();` y:
- `pairs` (pairStats matchesPlayed>=1) → `listPairStatsInGroup(groupId, 1)`
- `allPlayers` → `listAllPlayersInGroup(groupId)`

Imports: `getDefaultGroupId`, `listPairStatsInGroup`, `listAllPlayersInGroup`. Quitar `db`, `pairStats`, `players`, `sql`, `desc` sin uso.

- [ ] **Step 4: `src/app/(public)/rankings/tokens/page.tsx`**

`const groupId = await getDefaultGroupId();` y en el `Promise.all`:
- `ranked` → `listPlayersByTokenBalance(groupId)`
- `pendingPenalties` → `listPendingPenaltiesInGroup(groupId)`

Imports: `getDefaultGroupId`, `listPlayersByTokenBalance`, `listPendingPenaltiesInGroup` (de betting/queries). Quitar `db`, `players`, `penalties`, `desc`, `eq` sin uso.

- [ ] **Step 5: `src/app/(public)/matches/page.tsx`**

`const groupId = await getDefaultGroupId();` y:
- `allMatches` → `listMatchesByDate(groupId)` (ya existe)
- `allSets` → `listMatchSetsInGroup(groupId)`
- `allPlayers` → `listAllPlayersInGroup(groupId)`

Imports: `getDefaultGroupId`, `listMatchesByDate, listMatchSetsInGroup` (matches/queries), `listAllPlayersInGroup` (players/queries). Quitar `db`, `matches`, `matchSets`, `players`, `desc` sin uso.

- [ ] **Step 6: `src/app/(public)/matches/[id]/page.tsx` (página + generateMetadata)**

En **ambos** (`generateMetadata` y el default export): `const groupId = await getDefaultGroupId();`, y:
- `const [match] = await db.select().from(matches).where(eq(matches.id, id))` → `const match = await getMatchInGroup(groupId, id);` (en metadata, si `!match` devolver `{ title: 'Partido no encontrado · LPT' }`; en la página, `if (!match) notFound();`)
- `const allPlayers = await db.select().from(players)` → `await listAllPlayersInGroup(groupId)`
- En la página, el bloque de bets (`db.select(...).from(bets).innerJoin(players...).where(eq(bets.matchId, match.id))`) → `await getBetsWithBettorForMatch(match.id) as PublicBet[]`
- Dejar IGUAL (hijas por id, in-grupo vía partido verificado): `pairStats where inArray(...)`, `matchSets where matchId`, `ratingHistory where matchId`, y en metadata el `matchSets where matchId`.

Imports: `getDefaultGroupId`; `getMatchInGroup` (matches/queries); `listAllPlayersInGroup` (players/queries); `getBetsWithBettorForMatch` (betting/queries). Mantener `db`, `matchSets`, `pairStats`, `ratingHistory` (se siguen usando por id). Quitar `matches`, `bets` de los imports de schema si quedan sin uso (players sigue usándose en `.innerJoin`? ya no — se quita el join; comprobar).

- [ ] **Step 7: `src/app/(public)/matches/[id]/opengraph-image.tsx`**

`const groupId = await getDefaultGroupId();` y:
- `const [match] = await db.select().from(matches).where(eq(matches.id, id))` → `const match = await getMatchInGroup(groupId, id);` (mantener el fallback `if (!match)` ya existente)
- `const allPlayers = await db.select().from(players)` → `await listAllPlayersInGroup(groupId)`
- Dejar `matchSets where matchId` igual.

Imports: `getDefaultGroupId`, `getMatchInGroup`, `listAllPlayersInGroup`. Quitar `matches`, `players` de schema si sin uso.

- [ ] **Step 8: `src/app/api/rankings/route.ts`**

`const groupId = await getDefaultGroupId();` y:
- `individualRanking` → `listRankedPlayers(groupId)`
- `pairsRanking` (pairStats matchesPlayed>=3) → `listPairStatsInGroup(groupId, 3)`

Reemplazar contenido por:

```ts
import { NextResponse } from 'next/server';
import { getDefaultGroupId } from '@/lib/auth/group-context';
import { listRankedPlayers } from '@/lib/players/queries';
import { listPairStatsInGroup } from '@/lib/rating/queries';

// GET /api/rankings - ranking individual + parejas (grupo por defecto)
export async function GET() {
  try {
    const groupId = await getDefaultGroupId();
    const [individual, pairs] = await Promise.all([
      listRankedPlayers(groupId),
      listPairStatsInGroup(groupId, 3),
    ]);
    return NextResponse.json({ individual, pairs });
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
```

- [ ] **Step 9: `src/app/(public)/pozos/[id]/page.tsx` y `src/app/(public)/torneos/[id]/page.tsx`**

Estas ya resuelven `const groupId = await getDefaultGroupId();` (gate de 1B-4). Reemplazar la línea del roster:
- `await db.select({ id: players.id, name: players.name }).from(players).where(inArray(players.id, ev.participantPlayerIds))` → `await getPlayersInGroup(groupId, ev.participantPlayerIds)`

Imports: añadir `getPlayersInGroup` desde `@/lib/players/queries`. Quitar `players`, `inArray` (pozos) si quedan sin uso (en torneos `inArray`/`eq`/`asc` se siguen usando para `tournamentGroups`; comprobar por fichero). `getPlayersInGroup` devuelve `Player[]` (más columnas), compatible con el uso `{id, name}`.

- [ ] **Step 10: `src/app/(public)/players/[id]/page.tsx` (perfil público)**

`const groupId = await getDefaultGroupId();` y `loadPlayerProfile(id)` → `loadPlayerProfile(groupId, id)`.

Imports: `import { getDefaultGroupId } from '@/lib/auth/group-context';`.

- [ ] **Step 11: Verificar tipos + unit + commit**

Run: `npx tsc --noEmit` (Expected: sin errores — ojo: `profile-data.ts` cambia firma en la Task 3; si esta task se ejecuta antes, dejar `loadPlayerProfile(groupId, id)` ya escrito y la firma se actualiza en Task 3. Para evitar romper el build entre tasks, **ejecutar el Step 1 de la Task 3 (profile-data) junto con este Step 10**.)

Para no romper el build, **mover aquí** el cambio de `profile-data.ts` (ver Task 3 Step 1) y el de `me/page.tsx`. Es decir: el cambio de firma de `loadPlayerProfile` y sus 2 callers (`players/[id]` y `me/page`) van juntos.

Run: `npx vitest run` (Expected: verde.)

```bash
git add "src/app/(public)/page.tsx" "src/app/(public)/rankings/page.tsx" "src/app/(public)/rankings/pairs/page.tsx" "src/app/(public)/rankings/tokens/page.tsx" "src/app/(public)/matches/page.tsx" "src/app/(public)/matches/[id]/page.tsx" "src/app/(public)/matches/[id]/opengraph-image.tsx" src/app/api/rankings/route.ts "src/app/(public)/pozos/[id]/page.tsx" "src/app/(public)/torneos/[id]/page.tsx" "src/app/(public)/players/[id]/page.tsx" src/lib/players/profile-data.ts src/app/me/page.tsx
git commit -m "feat(multitenant): lecturas públicas (home/rankings/matches/perfil/OG) scopeadas por grupo (1B-5)"
```

---

## Task 3: Perfil + páginas admin + me + api

- [ ] **Step 1: `src/lib/players/profile-data.ts` — `groupId` + gate + scope**

Cambiar la firma: `export async function loadPlayerProfile(id: string)` → `export async function loadPlayerProfile(groupId: string, id: string)`. Reemplazar:
- `const [player] = await db.select().from(players).where(eq(players.id, id)); if (!player) return null;` → `const player = await getPlayerInGroup(groupId, id); if (!player) return null;`
- `const allPlayers = await db.select().from(players);` → `const allPlayers = await listAllPlayersInGroup(groupId);`
- `const globalHistory = await db.select().from(ratingHistory).orderBy(ratingHistory.recordedAt);` → `const globalHistory = await listRatingHistoryInGroup(groupId);`
- Dejar IGUAL las lecturas por `id` (playerMatches por `or(team...)`, history por playerId, pairs por playerId, earnedGrants por playerId): el jugador es in-grupo → in-grupo.

Imports: `import { getPlayerInGroup, listAllPlayersInGroup } from '@/lib/players/queries';` · `import { listRatingHistoryInGroup } from '@/lib/rating/queries';`. (Nota: `profile-data.ts` sigue usando `db` para las lecturas por id — está en `src/lib`, fuera del guard.)

`src/app/me/page.tsx`: `const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());` y `loadPlayerProfile(session.player.id)` → `loadPlayerProfile(groupId, session.player.id)`. Import `getDefaultGroupId, getGroupContext`. (Este fichero y `players/[id]` se commitean en la Task 2 junto al cambio de firma — ver Task 2 Step 11.)

- [ ] **Step 2: páginas admin (groupId = `(await getGroupContext())?.groupId ?? (await getDefaultGroupId())`)**

Para cada una, añadir el import de `getDefaultGroupId, getGroupContext` y resolver `groupId`, luego reemplazar:
- `admin/page.tsx`: `count players` → `countPlayersInGroup(groupId)`, `count matches` → `countMatchesInGroup(groupId)`. (Devuelven number → ajustar el `[playerCount]`/`[matchCount]` a valores directos.)
- `admin/timba/page.tsx`: `players orderBy name` → `listAllPlayersInGroup(groupId)`. (`penalties`/`tokenLedger` son hijas filtradas por los jugadores del grupo en memoria → dejar igual.)
- `admin/rewards/page.tsx`: `rewards orderBy cost` → `listRewardsInGroup(groupId)` (existe).
- `admin/pozos/new/page.tsx` y `admin/torneos/new/page.tsx`: `players {id,name,nickname} orderBy name` → `listAllPlayersInGroup(groupId)` y mapear `roster = (...).map((p) => ({ id: p.id, name: p.name, nickname: p.nickname }))`.
- `admin/matches/new/page.tsx`: `players where juegaPadel orderBy name` → `listPadelPlayers(groupId)`.
- `admin/matches/page.tsx`: `matches by date` → `listMatchesByDate(groupId)`; `matchSets` → `listMatchSetsInGroup(groupId)`; `players` → `listAllPlayersInGroup(groupId)`.
- `admin/matches/[id]/sides/page.tsx` y `admin/matches/[id]/result/page.tsx`: `[match] by id` → `getMatchInGroup(groupId, id)` (si `!match` → `notFound()`); `players` → `listAllPlayersInGroup(groupId)`.
- `admin/notifications/page.tsx`: `players` → `listAllPlayersInGroup(groupId)`. (`users`/`pushSubscriptions` NO son tenant → dejar igual.)

Imports DAL por fichero según lo usado (`countPlayersInGroup`, `countMatchesInGroup`, `listAllPlayersInGroup`, `listPadelPlayers`, `listMatchesByDate`, `listMatchSetsInGroup`, `getMatchInGroup`, `listRewardsInGroup`). Quitar imports de schema/db sin uso.

- [ ] **Step 3: `src/app/me/tokens/page.tsx`**

`const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());` y `db.select().from(rewards).where(eq(rewards.active, true)).orderBy(rewards.cost)` → `listActiveRewardsInGroup(groupId)`. (bets/tokenLedger/redemptions/penalties son por `player.id` → in-grupo, dejar igual.)

Imports: `getDefaultGroupId, getGroupContext`, `listActiveRewardsInGroup`. Quitar `rewards` de schema si queda sin uso (lo usa el `.innerJoin(rewards, ...)` del bloque de redemptions → se mantiene).

- [ ] **Step 4: `src/app/api/me/route.ts`**

`const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());` y reemplazar el `db.update(players).set({...}).where(eq(players.id, session.player.id)).returning()` por:

```ts
  const updated = await updatePlayerInGroup(groupId, session.player.id, {
    nickname: nickname?.trim() || null,
    avatarUrl: avatarUrl?.trim() || null,
    isLeftHanded: !!isLeftHanded,
  });
```

Imports: `getDefaultGroupId, getGroupContext`, `updatePlayerInGroup` (players/queries). Quitar `db`, `players`, `eq` si sin uso.

- [ ] **Step 5: `src/app/api/pairings/preview/route.ts`**

`const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());` y:
- `const found = await db.select().from(players).where(inArray(players.id, ids))` → `const found = await getPlayersInGroup(groupId, ids)` (existe). El check `found.length !== 4` ya cubre "jugador de otro grupo no cuenta".
- `const involved = await db.select().from(matches).where(or(...))` → `const involved = await listMatchesInvolvingPlayers(groupId, ids)`.
- `pairStats where inArray` (hija) → dejar igual.

Imports: `getDefaultGroupId, getGroupContext`, `getPlayersInGroup` (players/queries), `listMatchesInvolvingPlayers` (matches/queries). Quitar `players`, `matches` de schema si sin uso (pairStats sigue).

- [ ] **Step 6: Verificar tipos + unit**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npx vitest run`
Expected: verde.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/page.tsx src/app/admin/timba/page.tsx src/app/admin/rewards/page.tsx src/app/admin/pozos/new/page.tsx src/app/admin/torneos/new/page.tsx src/app/admin/matches/new/page.tsx src/app/admin/matches/page.tsx "src/app/admin/matches/[id]/sides/page.tsx" "src/app/admin/matches/[id]/result/page.tsx" src/app/admin/notifications/page.tsx src/app/me/tokens/page.tsx src/app/api/me/route.ts src/app/api/pairings/preview/route.ts
git commit -m "feat(multitenant): lecturas de admin/me/api scopeadas por grupo (1B-5)"
```

---

## Task 4: Cron de recordatorios

**Files:**
- Modify: `src/app/api/cron/match-reminders/route.ts`

- [ ] **Step 1: Scopear la lectura de `matches`**

Añadir `import { getDefaultGroupId } from '@/lib/auth/group-context';` y `import { listScheduledMatches } from '@/lib/matches/queries';`. Reemplazar:

```ts
  const scheduled = await db.select().from(matches).where(eq(matches.status, 'scheduled'));
```

por:

```ts
  const groupId = await getDefaultGroupId();
  const scheduled = await listScheduledMatches(groupId);
```

Quitar `matches` y `eq` de los imports si quedan sin uso (`notificationLog` sigue usándose con `db.insert`; `eq` ya no — comprobar). (Iterar el cron POR grupo es 1D; aquí solo se scopea la lectura al grupo por defecto.)

- [ ] **Step 2: Verificar + commit**

Run: `npx tsc --noEmit` (Expected: sin errores.)

```bash
git add src/app/api/cron/match-reminders/route.ts
git commit -m "feat(multitenant): cron de recordatorios lee partidos del grupo por defecto (1B-5)"
```

---

## Task 5: Capstone — quitar el `.default` de `groupId`

**Files:**
- Modify: `src/lib/db/schema.ts`
- Modify: `src/lib/tournament/test-db.test.ts`

- [ ] **Step 1: Arreglar el test que inserta sin `groupId`**

En `src/lib/tournament/test-db.test.ts` línea 8, cambiar:

```ts
    const [t] = await db.insert(tournaments).values({ name: 'Cumple', date: '2026-06-13', kind: 'pozo', format: 'americano' }).returning();
```

por:

```ts
    const [t] = await db.insert(tournaments).values({ groupId: 'lomeros', name: 'Cumple', date: '2026-06-13', kind: 'pozo', format: 'americano' }).returning();
```

- [ ] **Step 2: Quitar el `.default(LOMEROS_GROUP_ID)` en las 4 tablas raíz**

En `src/lib/db/schema.ts`, en las 4 líneas (players ~23, matches ~62, rewards ~189, tournaments ~223), cambiar:

```ts
  groupId: text('group_id').notNull().default(LOMEROS_GROUP_ID).references(() => groups.id),
```

por (en las 4):

```ts
  groupId: text('group_id').notNull().references(() => groups.id),
```

Y actualizar el comentario `// TEMPORAL 1B: default = Lomeros...` que precede a cada una por: `// 1B-5: groupId obligatorio en inserts (TS). El DEFAULT físico de la columna sigue en prod como backstop de SQL crudo.`

Nota: `LOMEROS_GROUP_ID` puede quedar usado aún por `getDefaultGroupId`/constantes; NO quitar el import salvo que tsc avise de que quedó sin uso en `schema.ts` (comprobar: el schema ya no lo usa → quitar el import de `LOMEROS_GROUP_ID` en `schema.ts` si tsc/eslint avisa).

- [ ] **Step 3: Verificar que TODO insert fija `groupId`**

Run: `npx tsc --noEmit`
Expected: sin errores. (Esto PRUEBA que ningún insert a las 4 tablas raíz olvida `groupId`: si alguno lo hiciera, TS fallaría aquí. Si falla, el error apunta al insert culpable → añadirle `groupId`.)

Run: `npx vitest run`
Expected: verde (incluido `test-db.test.ts` arreglado).

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts src/lib/tournament/test-db.test.ts
git commit -m "feat(multitenant): quita el .default de groupId — inserts obligan groupId en TS (1B-5)"
```

---

## Task 6: Guard de CI (grep) contra acceso directo a tablas tenant

**Files:**
- Create: `scripts/check-direct-db-access.mjs`
- Create: `src/lib/db/no-direct-db-access.test.ts`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Crear `scripts/check-direct-db-access.mjs`**

```js
// Guard: prohíbe acceso DIRECTO a las tablas tenant RAÍZ (players/matches/rewards/tournaments)
// vía Drizzle en src/app/**. La capa app debe ir por src/lib/<dominio>/queries.ts (o motores en
// src/lib). Allowlist: endpoints de migración (backfill/mantenimiento global a propósito).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT_TABLES = ['players', 'matches', 'rewards', 'tournaments'];
const PATTERN = new RegExp(
  `\\.(from|innerJoin|leftJoin|rightJoin|fullJoin|insert|update|delete)\\(\\s*(${ROOT_TABLES.join('|')})\\s*[\\),]`,
);
const ALLOWLIST = new Set([
  'src/app/api/migrate-db/route.ts',
  'src/app/api/migrate-avatars/route.ts',
  'src/app/api/init-db/route.ts',
]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

export function findRootTableAccess(root = 'src/app') {
  const offenders = [];
  for (const file of walk(root)) {
    const rel = file.replace(/\\/g, '/');
    if (ALLOWLIST.has(rel)) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (PATTERN.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
  }
  return offenders;
}

// Ejecutado directamente (node scripts/check-direct-db-access.mjs): falla si hay infractores.
if (import.meta.url === `file://${process.argv[1]}`) {
  const offenders = findRootTableAccess();
  if (offenders.length) {
    console.error('❌ Acceso directo a tablas tenant raíz en src/app (usa src/lib/<dominio>/queries.ts):');
    for (const o of offenders) console.error('  ' + o);
    process.exit(1);
  }
  console.log('✅ Sin acceso directo a tablas tenant raíz en src/app.');
}
```

- [ ] **Step 2: Crear `src/lib/db/no-direct-db-access.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { findRootTableAccess } from '../../../scripts/check-direct-db-access.mjs';

describe('guard multi-tenant: sin acceso directo a tablas raíz en src/app', () => {
  it('no encuentra ningún acceso directo (salvo allowlist de migraciones)', () => {
    const offenders = findRootTableAccess('src/app');
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 3: `package.json` — script `check:db-access`**

En `"scripts"`, añadir tras `"lint": "eslint",`:

```json
    "check:db-access": "node scripts/check-direct-db-access.mjs",
```

- [ ] **Step 4: `.github/workflows/ci.yml` — paso del guard**

Tras el paso `- run: npm run lint` y antes de `- run: npm test`, añadir:

```yaml
      - run: npm run check:db-access
```

- [ ] **Step 5: Ejecutar el guard y la suite unit**

Run: `npm run check:db-access`
Expected: `✅ Sin acceso directo a tablas tenant raíz en src/app.` (exit 0). Si lista infractores, scopear esos ficheros (Tasks 2-4) hasta que quede limpio.

Run: `npx vitest run`
Expected: verde, incluido `no-direct-db-access.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add scripts/check-direct-db-access.mjs src/lib/db/no-direct-db-access.test.ts package.json .github/workflows/ci.yml
git commit -m "test(ci): guard que prohíbe acceso directo a tablas tenant raíz en src/app (1B-5)"
```

---

## Task 7: Test e2e de no-fuga (lecturas públicas)

**Files:**
- Create: `e2e/no-fuga-lecturas.spec.ts`

El global-setup ya siembra el 2º grupo con `gt-pl1` ("Jugador GT"), `gt-reward1` ("Premio GT"), `gt-tournament1` ("Torneo GT"). Como esos jugadores no tienen partidos en Lomeros, las páginas de Lomeros nunca deben mostrarlos.

- [ ] **Step 1: Crear `e2e/no-fuga-lecturas.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

// Las páginas de lectura del grupo por defecto (Lomeros) nunca muestran datos del 2º grupo.
// Verificación por CONTENIDO (el nombre del jugador/premio ajeno no aparece en el HTML).
test.describe('no-fuga · lecturas públicas', () => {
  test('el ranking individual no muestra jugadores de otro grupo', async ({ request }) => {
    const res = await request.get('/rankings');
    expect(res.ok()).toBeTruthy();
    expect(await res.text()).not.toContain('Jugador GT');
  });

  test('la clasificación de La Timba no muestra jugadores de otro grupo', async ({ request }) => {
    const res = await request.get('/rankings/tokens');
    expect(res.ok()).toBeTruthy();
    expect(await res.text()).not.toContain('Jugador GT');
  });

  test('la lista de partidos no muestra partidos de otro grupo', async ({ request }) => {
    const res = await request.get('/matches');
    expect(res.ok()).toBeTruthy();
    expect(await res.text()).not.toContain('Jugador GT');
  });

  test('el perfil de un jugador de otro grupo no se expone (no muestra su nombre)', async ({ request }) => {
    const res = await request.get('/players/gt-pl1');
    expect(await res.text()).not.toContain('Jugador GT');
  });

  test('GET /api/rankings no incluye jugadores de otro grupo', async ({ request }) => {
    const res = await request.get('/api/rankings');
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { individual: Array<{ id: string }> };
    expect(body.individual.map((p) => p.id)).not.toContain('gt-pl1');
  });
});
```

- [ ] **Step 2: Ejecutar la suite e2e completa**

Run: `npm run e2e`
Expected: PASS — todos los specs verdes, incluido `no-fuga-lecturas` (5 tests) y los previos. Las páginas de Lomeros siguen renderizando sus datos (comportamiento idéntico).

- [ ] **Step 3: Commit**

```bash
git add e2e/no-fuga-lecturas.spec.ts
git commit -m "test(e2e): no-fuga de las páginas de lectura públicas (1B-5)"
```

---

## Self-review (cobertura del spec 1B para 1B-5)

- **Cablear `getDefaultGroupId()` en home/OG/páginas públicas (spec §2 fila 1B-5):** Task 2 (home, rankings x3, matches lista+detalle+metadata+OG, api/rankings, pozos/torneos [id], perfil). ✔
- **Scopear la lectura de `matches` del cron (spec §2):** Task 4. ✔
- **Capstone: quitar el `.default()` de `groupId` (spec §1, §2):** Task 5; tsc prueba que todos los inserts fijan `groupId`; arreglado el test roto. ✔
- **Guard de CI por grep (spec §2, §3):** Task 6 — script + npm script + paso CI + test vitest; allowlist solo migraciones. ✔
- **Cobertura COMPLETA (decisión del usuario): también admin + me + api**, no solo público: Task 3. El guard verifica que no queda acceso directo a tablas raíz en `src/app`. ✔
- **Hijas sin group_id scopeadas vía JOIN al padre (spec §1):** `rating/queries.ts` (ratingHistory/pairStats), `listMatchSetsInGroup`, `listPendingPenaltiesInGroup`, `listRecentAchievementsInGroup`. ✔
- **`users`/`pushSubscriptions`/`tournamentPairs.groupId` NO tocados (no tenant / FK distinto):** respetado. ✔
- **Iteración del cron por grupo, push/blob/branding → 1D; roles → 1C:** fuera de alcance. ✔
- **Comportamiento idéntico para Lomeros (spec §0):** un solo grupo → filtrar no cambia nada; suite verde + no-fuga-lecturas. ✔

Sin placeholders. Nombres consistentes entre DAL, páginas y specs. Orden de tasks pensado para build-verde en cada commit (el cambio de firma de `loadPlayerProfile` y sus 2 callers van en el mismo commit — Task 2 Step 11 / Task 3 Step 1).
