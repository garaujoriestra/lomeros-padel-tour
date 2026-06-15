# Plan 9 — Constructor de torneos: vista pública

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página pública de solo lectura `/tournaments/[id]` (sin login) donde cualquiera ve la parrilla, las clasificaciones y el cuadro del torneo; y si el visitante está logueado y es participante, se le resalta su próximo partido.

**Architecture:** Reutiliza el módulo `display.ts` (resolución de slots a texto) y las tablas de clasificación del Plan 8 — que se extraen a un módulo compartido `src/components/tournament/standings.tsx` (usado por la parrilla admin y por la pública). La página vive bajo el grupo de rutas `(public)` (hereda navbar/contenedor, sin `requireAdmin`). Lógica pura nueva en `display.ts` para encontrar el próximo partido del visitante.

**Tech Stack:** Next.js 16 App Router (route group `(public)`), Drizzle/libSQL, React 19 server components, shadcn/ui + kit `lpt`, Vitest.

**Alcance (acordado en brainstorming):** vista pública total (sin login) + "tu próximo partido" si el visitante logueado es participante. **Fuera de este plan:** Plan 8b (reasignar partidos, "tocar y elegir"); edición de cascarón.

---

## Contexto del repo

- **Grupo `(public)`**: `src/app/(public)/layout.tsx` aporta `Navbar` + `<main class="screen"><div class="lpt-container">…</div></main>` + `BottomNav`, y NO exige auth. Las páginas dentro son server components con `export const dynamic = 'force-dynamic'`.
- **Sesión**: `getSession()` de `@/lib/auth/session` → `Session | null` con `player: Player | null` (`Player` = `typeof players.$inferSelect`, tiene `id`, `name`, …).
- **display.ts** (Plan 8): `slotLabel`, `matchTeamLabels`, `isMatchPlayable`, `type DisplayContext = { playerName: Map<string,string>; pairLabel: Map<string,string> }`, `type MatchSlots = { slotA1; slotA2; slotB1; slotB2 }` (cada uno `SlotRef | null`).
- **Clasificaciones** (`@/lib/tournament/results`): `getPozoStandings(db, blockId)`, `getGroupStandings(db, blockId)`.
- **Parrilla admin** (Plan 8): `src/app/admin/tournaments/[id]/schedule/page.tsx` define hoy `PozoStandings`/`GroupStandingsTables` inline (server components async). Se extraen en la Task 1.
- **Carga de datos del torneo** (patrón ya usado en la parrilla admin): `tournaments`, `tournamentCourts`, `tournamentBlocks`, `tournamentParticipants`+`players` (nombres), `tournamentPairs` (por `inArray(blockIds)`), `tournamentMatches`. Slots en columnas JSON → `JSON.parse` a `SlotRef`.
- **Drizzle**: `eq`, `asc`, `inArray`.

---

## File Structure

- **Create:** `src/components/tournament/standings.tsx` — `PozoStandings` + `GroupStandingsTables` (server, movidos desde la parrilla admin).
- **Modify:** `src/app/admin/tournaments/[id]/schedule/page.tsx` — importar standings del módulo compartido (quitar defs e imports ya no usados).
- **Modify:** `src/lib/tournament/display.ts` — `involvesPlayer` + `nextMatchForPlayer`.
- **Modify:** `src/lib/tournament/display.test.ts` — tests de las dos funciones.
- **Create:** `src/app/(public)/tournaments/[id]/page.tsx` — vista pública.

---

## Task 1: Extraer las tablas de clasificación a un módulo compartido

**Files:**
- Create: `src/components/tournament/standings.tsx`
- Modify: `src/app/admin/tournaments/[id]/schedule/page.tsx`

- [ ] **Step 1: Crear `src/components/tournament/standings.tsx`**

```tsx
import { db } from '@/lib/db';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { getPozoStandings, getGroupStandings } from '@/lib/tournament/results';

export async function PozoStandings({ blockId, playerName }: { blockId: string; playerName: Map<string, string> }) {
  const rows = await getPozoStandings(db, blockId);
  if (rows.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">Clasificación</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">#</TableHead>
            <TableHead>Jugador</TableHead>
            <TableHead className="text-center">Juegos</TableHead>
            <TableHead className="text-center">Victorias</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.participantId}>
              <TableCell>{r.rank}</TableCell>
              <TableCell>{playerName.get(r.participantId) ?? '—'}</TableCell>
              <TableCell className="text-center">{r.games}</TableCell>
              <TableCell className="text-center">{r.wins}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export async function GroupStandingsTables({ blockId, pairLabel }: { blockId: string; pairLabel: Map<string, string> }) {
  const tables = await getGroupStandings(db, blockId);
  const names = Object.keys(tables);
  if (names.length === 0) return null;
  return (
    <div className="space-y-3">
      {names.map((g) => (
        <div key={g}>
          <h3 className="text-sm font-semibold mb-2">Grupo {g}</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Pareja</TableHead>
                <TableHead className="text-center">PJ</TableHead>
                <TableHead className="text-center">Pts</TableHead>
                <TableHead className="text-center">Dif</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tables[g].map((r) => (
                <TableRow key={r.pairId}>
                  <TableCell>{r.rank}</TableCell>
                  <TableCell>{pairLabel.get(r.pairId) ?? '—'}</TableCell>
                  <TableCell className="text-center">{r.played}</TableCell>
                  <TableCell className="text-center">{r.points}</TableCell>
                  <TableCell className="text-center">{r.gameDiff}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Refactorizar la parrilla admin para usar el módulo compartido**

En `src/app/admin/tournaments/[id]/schedule/page.tsx`:

1. Elimina el import de `Table*` y el de `getPozoStandings`/`getGroupStandings` (ya no se usan directamente en este fichero), y añade el import del módulo compartido. Es decir, sustituye estas líneas:

```tsx
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ScheduleMatch } from '@/components/admin/schedule-match';
import { matchTeamLabels, isMatchPlayable, type DisplayContext } from '@/lib/tournament/display';
import { getPozoStandings, getGroupStandings } from '@/lib/tournament/results';
```

por:

```tsx
import { ScheduleMatch } from '@/components/admin/schedule-match';
import { matchTeamLabels, isMatchPlayable, type DisplayContext } from '@/lib/tournament/display';
import { PozoStandings, GroupStandingsTables } from '@/components/tournament/standings';
```

2. Borra del final del fichero las dos funciones `async function PozoStandings(...)` y `async function GroupStandingsTables(...)` (todo su cuerpo). La llamada en el JSX (`block.type === 'pozo' ? <PozoStandings .../> : <GroupStandingsTables .../>`) se mantiene igual.

- [ ] **Step 3: Verificar tipos y lint**

Run: `npx tsc --noEmit && npx eslint "src/app/admin/tournaments/[id]/schedule/page.tsx" src/components/tournament/standings.tsx`
Expected: sin errores (ni imports sin usar).

- [ ] **Step 4: Commit**

```bash
git add src/components/tournament/standings.tsx "src/app/admin/tournaments/[id]/schedule/page.tsx"
git commit -m "refactor(tournaments): tablas de clasificación a módulo compartido"
```

---

## Task 2: Próximo partido del visitante (lógica pura)

**Files:**
- Modify: `src/lib/tournament/display.ts`
- Test: `src/lib/tournament/display.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Añade a `src/lib/tournament/display.test.ts`:

```ts
import { involvesPlayer, nextMatchForPlayer, type PlayerScheduleMatch } from './display';

describe('involvesPlayer', () => {
  const myPairs = new Set(['pairX']);
  it('detecta al jugador como participante (pozo)', () => {
    expect(involvesPlayer({
      slotA1: { type: 'participant', participantId: 'p1' }, slotA2: null,
      slotB1: { type: 'participant', participantId: 'p2' }, slotB2: null,
    }, 'p1', myPairs)).toBe(true);
  });
  it('detecta al jugador por su pareja (fixed_pairs)', () => {
    expect(involvesPlayer({
      slotA1: { type: 'pair', pairId: 'pairX' }, slotA2: null,
      slotB1: { type: 'pair', pairId: 'pairY' }, slotB2: null,
    }, 'p1', myPairs)).toBe(true);
  });
  it('false si no aparece', () => {
    expect(involvesPlayer({
      slotA1: { type: 'participant', participantId: 'zzz' }, slotA2: null,
      slotB1: { type: 'pair', pairId: 'pairY' }, slotB2: null,
    }, 'p1', myPairs)).toBe(false);
  });
});

describe('nextMatchForPlayer', () => {
  const myPairs = new Set<string>();
  const base = (over: Partial<PlayerScheduleMatch>): PlayerScheduleMatch => ({
    slotA1: { type: 'participant', participantId: 'p1' }, slotA2: null,
    slotB1: { type: 'participant', participantId: 'p2' }, slotB2: null,
    scheduledStart: null, status: 'pending', ...over,
  });

  it('devuelve el pendiente más temprano que involucra al jugador', () => {
    const m1 = { id: 'm1', ...base({ scheduledStart: '18:00' }) };
    const m2 = { id: 'm2', ...base({ scheduledStart: '17:00' }) };
    const r = nextMatchForPlayer([m1, m2], 'p1', myPairs);
    expect(r?.id).toBe('m2');
  });

  it('ignora completados y partidos sin el jugador', () => {
    const done = { id: 'd', ...base({ scheduledStart: '16:00', status: 'completed' }) };
    const other = { id: 'o', ...base({ scheduledStart: '16:30', slotA1: { type: 'participant', participantId: 'x' } }) };
    const mine = { id: 'mine', ...base({ scheduledStart: '19:00' }) };
    const r = nextMatchForPlayer([done, other, mine], 'p1', myPairs);
    expect(r?.id).toBe('mine');
  });

  it('null si no hay ninguno', () => {
    const other = { id: 'o', ...base({ slotA1: { type: 'participant', participantId: 'x' }, slotB1: { type: 'participant', participantId: 'y' } }) };
    expect(nextMatchForPlayer([other], 'p1', myPairs)).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/display.test.ts -t "involvesPlayer|nextMatchForPlayer"`
Expected: FAIL — funciones no existen.

- [ ] **Step 3: Añadir las funciones a `display.ts`**

Al final de `src/lib/tournament/display.ts`:

```ts
export interface PlayerScheduleMatch extends MatchSlots {
  scheduledStart: string | null;
  status: string;
}

// ¿El jugador participa en este partido? (participante directo, o vía una de sus parejas)
export function involvesPlayer(m: MatchSlots, playerId: string, myPairIds: Set<string>): boolean {
  const slots = [m.slotA1, m.slotA2, m.slotB1, m.slotB2];
  return slots.some((s) =>
    (s?.type === 'participant' && s.participantId === playerId) ||
    (s?.type === 'pair' && myPairIds.has(s.pairId)));
}

// Próximo partido pendiente del jugador, el más temprano por hora. null si no hay.
export function nextMatchForPlayer<T extends PlayerScheduleMatch>(
  matches: T[], playerId: string, myPairIds: Set<string>,
): T | null {
  const mine = matches.filter((m) => m.status !== 'completed' && involvesPlayer(m, playerId, myPairIds));
  if (mine.length === 0) return null;
  mine.sort((a, b) => (a.scheduledStart ?? '99:99').localeCompare(b.scheduledStart ?? '99:99'));
  return mine[0];
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/display.test.ts`
Expected: PASS (6 anteriores + 6 nuevos = 12).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/display.ts src/lib/tournament/display.test.ts
git commit -m "feat(tournaments): display — próximo partido del jugador"
```

---

## Task 3: Página pública del torneo

**Files:**
- Create: `src/app/(public)/tournaments/[id]/page.tsx`

- [ ] **Step 1: Crear `src/app/(public)/tournaments/[id]/page.tsx`**

```tsx
import { db } from '@/lib/db';
import {
  tournaments, tournamentCourts, tournamentBlocks, tournamentParticipants,
  tournamentPairs, tournamentMatches, players,
} from '@/lib/db/schema';
import { asc, eq, inArray } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PozoStandings, GroupStandingsTables } from '@/components/tournament/standings';
import {
  matchTeamLabels, nextMatchForPlayer, type DisplayContext, type PlayerScheduleMatch,
} from '@/lib/tournament/display';
import type { SlotRef } from '@/lib/tournament/types';

export const dynamic = 'force-dynamic';

const parse = (s: string | null): SlotRef | null => (s ? (JSON.parse(s) as SlotRef) : null);

export default async function PublicTournamentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
  if (!tournament) notFound();

  const courts = await db.select().from(tournamentCourts).where(eq(tournamentCourts.tournamentId, id));
  const courtLabel = new Map(courts.map((c) => [c.id, c.label]));

  const blocks = await db.select().from(tournamentBlocks)
    .where(eq(tournamentBlocks.tournamentId, id)).orderBy(asc(tournamentBlocks.order));
  const blockIds = blocks.map((b) => b.id);

  const parts = await db
    .select({ id: players.id, name: players.name })
    .from(tournamentParticipants)
    .innerJoin(players, eq(players.id, tournamentParticipants.playerId))
    .where(eq(tournamentParticipants.tournamentId, id));
  const playerName = new Map(parts.map((p) => [p.id, p.name]));

  const pairRows = blockIds.length > 0
    ? await db.select().from(tournamentPairs).where(inArray(tournamentPairs.blockId, blockIds))
    : [];
  const pairLabel = new Map(pairRows.map((p) => [
    p.id, `${playerName.get(p.player1Id) ?? '—'} / ${playerName.get(p.player2Id) ?? '—'}`,
  ]));

  const ctx: DisplayContext = { playerName, pairLabel };

  const allMatches = await db.select().from(tournamentMatches).where(eq(tournamentMatches.tournamentId, id));

  // "Tu próximo partido" si el visitante está logueado y es participante.
  const session = await getSession();
  const viewerId = session?.player?.id;
  let nextMine: (PlayerScheduleMatch & { id: string; courtId: string | null }) | null = null;
  if (viewerId && playerName.has(viewerId)) {
    const myPairIds = new Set(
      pairRows.filter((p) => p.player1Id === viewerId || p.player2Id === viewerId).map((p) => p.id),
    );
    const enriched = allMatches.map((m) => ({
      id: m.id,
      courtId: m.courtId,
      slotA1: parse(m.slotA1), slotA2: parse(m.slotA2),
      slotB1: parse(m.slotB1), slotB2: parse(m.slotB2),
      scheduledStart: m.scheduledStart,
      status: m.status,
    }));
    nextMine = nextMatchForPlayer(enriched, viewerId, myPairIds);
  }

  return (
    <div className="space-y-6 py-2">
      <div>
        <h1 className="sec-title">{tournament.name}</h1>
        <p className="muted text-sm mt-1.5">{tournament.date}{tournament.location ? ` · ${tournament.location}` : ''}</p>
      </div>

      {nextMine && (() => {
        const { teamA, teamB } = matchTeamLabels(nextMine, ctx);
        const court = nextMine.courtId ? courtLabel.get(nextMine.courtId) : null;
        return (
          <Card className="border-acc">
            <CardHeader><CardTitle>Tu próximo partido</CardTitle></CardHeader>
            <CardContent className="text-sm">
              <p className="font-medium">{teamA} vs {teamB}</p>
              <p className="text-ink-3 mt-1">{nextMine.scheduledStart ?? '—'}{court ? ` · ${court}` : ''}</p>
            </CardContent>
          </Card>
        );
      })()}

      {allMatches.length === 0 ? (
        <p className="text-sm text-ink-3">La parrilla aún no está disponible.</p>
      ) : (
        blocks.map((block) => {
          const blockMatches = allMatches
            .filter((m) => m.blockId === block.id)
            .sort((x, y) =>
              x.round - y.round ||
              (x.scheduledStart ?? '99:99').localeCompare(y.scheduledStart ?? '99:99'));

          return (
            <Card key={block.id}>
              <CardHeader><CardTitle>{block.order}. {block.name}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {blockMatches.map((m) => {
                    const slots = {
                      slotA1: parse(m.slotA1), slotA2: parse(m.slotA2),
                      slotB1: parse(m.slotB1), slotB2: parse(m.slotB2),
                    };
                    const { teamA, teamB } = matchTeamLabels(slots, ctx);
                    const court = m.courtId ? courtLabel.get(m.courtId) : null;
                    return (
                      <div key={m.id} className="flex items-center justify-between gap-2 border border-line rounded-md px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <span className="text-ink-3 mr-2">{m.scheduledStart ?? '—'}{court ? ` · ${court}` : ''}</span>
                          <span className="font-medium">{teamA}</span>
                          <span className="text-ink-3"> vs </span>
                          <span className="font-medium">{teamB}</span>
                        </div>
                        <div className="shrink-0">
                          {m.status === 'completed'
                            ? <Badge variant="outline">{m.teamAScore}–{m.teamBScore}</Badge>
                            : <span className="text-ink-3 text-xs">Pendiente</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {block.type === 'pozo'
                  ? <PozoStandings blockId={block.id} playerName={playerName} />
                  : <GroupStandingsTables blockId={block.id} pairLabel={pairLabel} />}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos y lint**

Run: `npx tsc --noEmit && npx eslint "src/app/(public)/tournaments/[id]/page.tsx"`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(public)/tournaments/[id]/page.tsx"
git commit -m "feat(tournaments): vista pública del torneo (parrilla + clasificación + tu próximo partido)"
```

---

## Task 4: Verificación final del plan

- [ ] **Step 1: Suite completa de tournament**

Run: `npx vitest run src/lib/tournament`
Expected: PASS — `display` (12) y todo lo anterior.

- [ ] **Step 2: Tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Lint de todo lo tocado**

Run: `npx eslint src/lib/tournament src/app/admin/tournaments "src/app/(public)/tournaments" src/components/tournament src/components/admin`
Expected: sin errores.

---

## Self-review (cubierto vs. spec/alcance acordado)

- **Vista pública de solo lectura `/tournaments/[id]` (sin admin/login)**: bajo `(public)`, Task 3. ✓
- **Parrilla + clasificación + cuadro visibles**: lista por bloque + standings compartidas (Tasks 1, 3). ✓
- **"Tu próxima pista/hora"** (si el visitante logueado es participante): `nextMatchForPlayer` + tarjeta (Tasks 2, 3). ✓
- **Reutiliza `display.ts` y las clasificaciones** (DRY): extracción a `standings.tsx` compartido (Task 1). ✓
- **Solo lectura** (sin botones de resultado): filas estáticas en la pública (Task 3). ✓

**Fuera de este plan:** Plan 8b (opcional) = reasignar partidos ("tocar y elegir"). Edición de cascarón sigue pendiente. **Despliegue:** `POST /api/migrate-tournaments` en prod si no se hizo. Con el Plan 9, la feature está completa para v1 (admin de punta a punta + vista pública) y lista para valorar el merge a `main`.
