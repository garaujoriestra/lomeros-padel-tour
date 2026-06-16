# Torneo T2 — view-model + UI admin + vista pública + e2e

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar al torneo su UI: tablas de grupo + cuadro de eliminación en el panel admin (con entrada de resultados), una vista pública de solo lectura `/torneos/[id]` con "tu próximo partido", y cobertura e2e de ambos formatos.

**Architecture:** Un view-model puro `torneo-view.ts` arma la vista de grupos (`groupStandings`) y la del cuadro (resolviendo `matchWinner`→pareja con `resolveBracket`), reutilizando `display.ts` y `buildDisplayContext`. Componentes server `<GroupsTable>` y `<BracketView>` (que reusan `<ResultEntry>` ya existente). Se rellena la rama de torneo del `EventPanel` compartido y se crea la pública `/(public)/torneos/[id]`.

**Tech Stack:** Next.js 16 App Router (server components + client islands), Drizzle, Playwright. Depende de T1 (`torneo-run`, `event-engine`).

---

## File Structure

- **Modificar** `src/lib/tournament/pair-store.ts` — añadir `groupId` a `LoadedPair`/`loadPairs`.
- **Crear** `src/lib/tournament/torneo-view.ts` — view-model puro (grupos + cuadro + próximo partido).
- **Crear** `src/lib/tournament/torneo-view.test.ts` — unit.
- **Crear** `src/components/tournament/groups-table.tsx` — tabla de grupo (server).
- **Crear** `src/components/tournament/bracket-view.tsx` — cuadro por columnas (server).
- **Modificar** `src/components/admin/event-panel.tsx` — rellenar la rama de torneo.
- **Crear** `src/app/(public)/torneos/[id]/page.tsx` — vista pública.
- **Crear** `e2e/torneo-single-elim.spec.ts`, `e2e/torneo-groups-elim.spec.ts`, `e2e/torneo-public.spec.ts`.

Referencias: `src/lib/tournament/pozo-view.ts` (análogo + `buildDisplayContext`/`matchSlots`), `src/lib/tournament/fixed-pairs.ts` (`resolveBracket`/`groupStandings`/tipos), `src/lib/tournament/display.ts`, `src/components/tournament/pozo-grid.tsx` + `pozo-standings.tsx` (estilo), `src/components/admin/event-panel.tsx` (estado actual), `src/app/(public)/pozos/[id]/page.tsx` (pública análoga), `e2e/pozo-fixed-pairs.spec.ts` (patrón e2e).

---

## Task 1: `torneo-view.ts` (view-model puro) + `loadPairs` con groupId

**Files:**
- Modify: `src/lib/tournament/pair-store.ts`
- Create: `src/lib/tournament/torneo-view.ts`
- Test: `src/lib/tournament/torneo-view.test.ts`

- [ ] **Step 1: Add `groupId` to `LoadedPair`**

En `src/lib/tournament/pair-store.ts`, añade `groupId` a la interfaz y al mapeo (cambios mínimos):

```ts
export interface LoadedPair {
  id: string;
  player1Id: string;
  player2Id: string;
  label: string | null;
  groupId: string | null;
}
```
y en `loadPairs`, el `.map`:
```ts
  return rows.map((r) => ({ id: r.id, player1Id: r.player1Id, player2Id: r.player2Id, label: r.label ?? null, groupId: r.groupId ?? null }));
```
Verifica que `npx vitest run src/lib/tournament/pair-store.test.ts` sigue verde (el test no comprueba groupId, el campo extra no rompe nada).

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/tournament/torneo-view.test.ts
import { describe, it, expect } from 'vitest';
import { buildDisplayContext } from './pozo-view';
import { buildGroupsView, buildBracketView, torneoNextMatch } from './torneo-view';
import type { PozoMatchRow } from './pozo-run';

function row(p: Partial<PozoMatchRow>): PozoMatchRow {
  return {
    id: 'm', round: 0, phaseTag: 'ko:r0m0', status: 'pending', courtId: 'c1',
    scheduledStart: '17:00', scheduledEnd: '17:40',
    slotA1: null, slotA2: null, slotB1: null, slotB2: null,
    teamAScore: null, teamBScore: null, winner: null, ...p,
  };
}
const pairSlot = (id: string) => JSON.stringify({ type: 'pair', pairId: id });
const winnerSlot = (mid: string) => JSON.stringify({ type: 'matchWinner', matchId: mid });

const ctx = buildDisplayContext(
  [{ id: 'pA1', name: 'Ana' }, { id: 'pA2', name: 'Luis' }, { id: 'pB1', name: 'Eva' }, { id: 'pB2', name: 'Jon' }],
  [
    { id: 'prA', player1Id: 'pA1', player2Id: 'pA2' },
    { id: 'prB', player1Id: 'pB1', player2Id: 'pB2' },
  ],
);
const courtLabelById = new Map([['c1', 'Central']]);

describe('buildGroupsView', () => {
  it('arma standings por grupo y celdas de partido', () => {
    const groups = [{ id: 'gA', name: 'A' }];
    const pairs = [
      { id: 'prA', player1Id: 'pA1', player2Id: 'pA2', groupId: 'gA' },
      { id: 'prB', player1Id: 'pB1', player2Id: 'pB2', groupId: 'gA' },
    ];
    const matches: PozoMatchRow[] = [
      row({ id: 'gm', phaseTag: 'group:A', round: 0, status: 'completed', slotA1: pairSlot('prA'), slotB1: pairSlot('prB'), teamAScore: 6, teamBScore: 3, winner: 'A' }),
    ];
    const view = buildGroupsView(groups, pairs, matches, ctx, courtLabelById);
    expect(view.length).toBe(1);
    expect(view[0].name).toBe('A');
    expect(view[0].standings[0].pairId).toBe('prA'); // ganador, rank 1
    expect(view[0].standings[0].points).toBe(3);
    expect(view[0].matches[0].teamA).toBe('Ana / Luis');
    expect(view[0].matches[0].status).toBe('completed');
  });
});

describe('buildBracketView', () => {
  it('resuelve matchWinner → pareja concreta y agrupa por ronda', () => {
    const matches: PozoMatchRow[] = [
      row({ id: 's0', phaseTag: 'ko:r0m0', round: 0, status: 'completed', slotA1: pairSlot('prA'), slotB1: pairSlot('prB'), teamAScore: 2, teamBScore: 1, winner: 'A' }),
      row({ id: 'f0', phaseTag: 'ko:r1m0', round: 1, status: 'pending', slotA1: winnerSlot('r0m0'), slotB1: winnerSlot('r0m1') }),
    ];
    const bracket = buildBracketView(matches, ctx, courtLabelById);
    expect(bracket.rounds.map((r) => r.round)).toEqual([0, 1]);
    const final = bracket.rounds.find((r) => r.round === 1)!.matches[0];
    // slotA del final se resolvió al ganador de r0m0 (prA = Ana / Luis)
    expect(final.teamA).toBe('Ana / Luis');
    // r0m1 no existe → slotB sigue pendiente
    expect(final.teamB).toBe('Ganador (pdte.)');
    expect(final.playable).toBe(false); // un lado sin resolver
  });
});

describe('torneoNextMatch', () => {
  it('devuelve el próximo partido pendiente del jugador (por su pareja)', () => {
    const matches: PozoMatchRow[] = [
      row({ id: 's0', phaseTag: 'ko:r0m0', round: 0, status: 'pending', slotA1: pairSlot('prA'), slotB1: pairSlot('prB') }),
    ];
    const next = torneoNextMatch(matches, ctx, courtLabelById, 'pA1', ['prA']);
    expect(next).not.toBeNull();
    expect(next!.teamA).toBe('Ana / Luis');
    expect(next!.courtLabel).toBe('Central');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/tournament/torneo-view.test.ts`
Expected: FAIL — `torneo-view` no existe.

- [ ] **Step 4: Write implementation**

```ts
// src/lib/tournament/torneo-view.ts
import type { PozoMatchRow } from './pozo-run';
import { matchTeamLabels, isMatchPlayable, nextMatchForPlayer, type DisplayContext, type MatchSlots } from './display';
import { matchSlots } from './pozo-view';
import { groupStandings, resolveBracket, type BracketMatch, type PairMatchResult } from './fixed-pairs';
import type { SlotRef } from './types';

export interface MatchCell {
  matchId: string;
  teamA: string; teamB: string;
  teamAScore: number | null; teamBScore: number | null;
  winner: string | null; status: string; playable: boolean;
  scheduledStart: string | null; courtLabel: string | null;
}
export interface StandingRow {
  pairId: string; label: string;
  played: number; wins: number; draws: number; losses: number; gameDiff: number; points: number; rank: number;
}
export interface GroupView { name: string; standings: StandingRow[]; matches: MatchCell[] }
export interface BracketRound { round: number; matches: MatchCell[] }
export interface BracketView { rounds: BracketRound[] }

function pairIdOf(slot: string | null): string | undefined {
  const s = slot ? (JSON.parse(slot) as SlotRef) : null;
  return s && s.type === 'pair' ? s.pairId : undefined;
}
function cellFrom(m: PozoMatchRow, slots: MatchSlots, ctx: DisplayContext, courtLabelById: Map<string, string>): MatchCell {
  const { teamA, teamB } = matchTeamLabels(slots, ctx);
  return {
    matchId: m.id, teamA, teamB, teamAScore: m.teamAScore, teamBScore: m.teamBScore,
    winner: m.winner, status: m.status, playable: isMatchPlayable(slots) && m.status !== 'completed',
    scheduledStart: m.scheduledStart, courtLabel: m.courtId ? (courtLabelById.get(m.courtId) ?? null) : null,
  };
}

export function buildGroupsView(
  groups: { id: string; name: string }[],
  pairs: { id: string; player1Id: string; player2Id: string; groupId: string | null }[],
  matches: PozoMatchRow[],
  ctx: DisplayContext,
  courtLabelById: Map<string, string>,
): GroupView[] {
  return groups.slice().sort((a, b) => a.name.localeCompare(b.name)).map((g) => {
    const groupPairIds = pairs.filter((p) => p.groupId === g.id).map((p) => p.id);
    const groupMatches = matches.filter((m) => m.phaseTag === `group:${g.name}`);
    const results: PairMatchResult[] = groupMatches
      .filter((m) => m.status === 'completed')
      .map((m) => ({
        pairA: pairIdOf(m.slotA1)!, pairB: pairIdOf(m.slotB1)!,
        gamesA: m.teamAScore ?? 0, gamesB: m.teamBScore ?? 0,
        winner: m.winner === 'A' || m.winner === 'B' ? m.winner : 'draw',
      }));
    const standings: StandingRow[] = groupStandings(groupPairIds, results).map((s) => ({
      pairId: s.pairId, label: ctx.pairLabel.get(s.pairId) ?? '—',
      played: s.played, wins: s.wins, draws: s.draws, losses: s.losses, gameDiff: s.gameDiff, points: s.points, rank: s.rank,
    }));
    const cells = groupMatches.map((m) => cellFrom(m, matchSlots(m), ctx, courtLabelById));
    return { name: g.name, standings, matches: cells };
  });
}

// Reconstruye el cuadro desde las filas ko:* y lo resuelve para mostrar.
function resolvedBracketCells(matches: PozoMatchRow[]): { resolvedSlots: Map<string, MatchSlots>; rowByEngine: Map<string, PozoMatchRow> } {
  const koRows = matches.filter((m) => m.phaseTag?.startsWith('ko:'));
  const rowByEngine = new Map<string, PozoMatchRow>();
  const bracket: BracketMatch[] = koRows.map((m) => {
    const engineId = m.phaseTag!.slice(3);
    rowByEngine.set(engineId, m);
    return {
      matchId: engineId, round: m.round,
      slotA: JSON.parse(m.slotA1 ?? '{}') as SlotRef, slotB: JSON.parse(m.slotB1 ?? '{}') as SlotRef,
    };
  });
  const results = new Map<string, 'A' | 'B'>();
  for (const m of koRows) {
    if (m.status === 'completed' && (m.winner === 'A' || m.winner === 'B')) results.set(m.phaseTag!.slice(3), m.winner);
  }
  const resolved = resolveBracket(bracket, results);
  const resolvedSlots = new Map<string, MatchSlots>();
  for (const r of resolved) resolvedSlots.set(r.matchId, { slotA1: r.slotA, slotA2: null, slotB1: r.slotB, slotB2: null });
  return { resolvedSlots, rowByEngine };
}

export function buildBracketView(
  matches: PozoMatchRow[], ctx: DisplayContext, courtLabelById: Map<string, string>,
): BracketView {
  const { resolvedSlots, rowByEngine } = resolvedBracketCells(matches);
  const byRound = new Map<number, MatchCell[]>();
  for (const [engineId, slots] of resolvedSlots) {
    const m = rowByEngine.get(engineId)!;
    const cell = cellFrom(m, slots, ctx, courtLabelById);
    const arr = byRound.get(m.round) ?? []; arr.push(cell); byRound.set(m.round, arr);
  }
  const rounds = [...byRound.keys()].sort((a, b) => a - b).map((round) => ({ round, matches: byRound.get(round)! }));
  return { rounds };
}

export interface NextMatchInfo { teamA: string; teamB: string; courtLabel: string | null; scheduledStart: string | null }

// Próximo partido del jugador entre TODOS los partidos del torneo (grupos concretos +
// cuadro resuelto). Usa los slots resueltos para que valgan también los del cuadro.
export function torneoNextMatch(
  matches: PozoMatchRow[],
  ctx: DisplayContext,
  courtLabelById: Map<string, string>,
  playerId: string,
  myPairIds: string[],
): NextMatchInfo | null {
  type Sched = MatchSlots & { scheduledStart: string | null; status: string; courtId: string | null };
  const groupSched: Sched[] = matches
    .filter((m) => m.phaseTag?.startsWith('group:'))
    .map((m) => ({ ...matchSlots(m), scheduledStart: m.scheduledStart, status: m.status, courtId: m.courtId }));
  const { resolvedSlots, rowByEngine } = resolvedBracketCells(matches);
  const koSched: Sched[] = [...resolvedSlots].map(([engineId, slots]) => {
    const m = rowByEngine.get(engineId)!;
    return { ...slots, scheduledStart: m.scheduledStart, status: m.status, courtId: m.courtId };
  });
  const next = nextMatchForPlayer<Sched>([...groupSched, ...koSched], playerId, new Set(myPairIds));
  if (!next) return null;
  const { teamA, teamB } = matchTeamLabels(next, ctx);
  return { teamA, teamB, courtLabel: next.courtId ? (courtLabelById.get(next.courtId) ?? null) : null, scheduledStart: next.scheduledStart };
}
```

> Nota: `torneoNextMatch` NO recibe `pairs` ni `groups` — usa `matches` (con su `phaseTag`) y el `myPairIds` que ya calcula el llamador. Mantén la firma exactamente como arriba para no dejar parámetros sin usar (serían error de lint).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/tournament/torneo-view.test.ts`
Expected: PASS (3 tests). `npx eslint src/lib/tournament/torneo-view.ts src/lib/tournament/pair-store.ts` → 0 errores.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tournament/torneo-view.ts src/lib/tournament/torneo-view.test.ts src/lib/tournament/pair-store.ts
git commit -m "feat(torneo): view-model puro (grupos + cuadro resuelto + próximo partido) + groupId en loadPairs"
```

---

## Task 2: Componentes `<GroupsTable>` y `<BracketView>`

**Files:**
- Create: `src/components/tournament/groups-table.tsx`
- Create: `src/components/tournament/bracket-view.tsx`

- [ ] **Step 1: Write `<GroupsTable>`**

```tsx
// src/components/tournament/groups-table.tsx
import type { GroupView } from '@/lib/tournament/torneo-view';
import { ResultEntry } from './result-entry';

interface Props { tournamentId: string; group: GroupView; editable: boolean }

export function GroupsTable({ tournamentId, group, editable }: Props) {
  return (
    <div className="space-y-2">
      <h3 className="font-medium">Grupo {group.name}</h3>
      <table className="text-sm w-full max-w-lg">
        <thead>
          <tr className="text-left text-ink-3">
            <th className="p-1.5">#</th><th className="p-1.5">Pareja</th>
            <th className="p-1.5">PJ</th><th className="p-1.5">V</th><th className="p-1.5">E</th>
            <th className="p-1.5">D</th><th className="p-1.5">Dif</th><th className="p-1.5">Pts</th>
          </tr>
        </thead>
        <tbody>
          {group.standings.map((s) => (
            <tr key={s.pairId} className="border-t border-line">
              <td className="p-1.5">{s.rank}</td><td className="p-1.5">{s.label}</td>
              <td className="p-1.5">{s.played}</td><td className="p-1.5">{s.wins}</td><td className="p-1.5">{s.draws}</td>
              <td className="p-1.5">{s.losses}</td><td className="p-1.5">{s.gameDiff}</td><td className="p-1.5 font-medium">{s.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="space-y-1 text-sm">
        {group.matches.map((m) => (
          <li key={m.matchId} className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink-3 w-24">{m.courtLabel ?? ''}{m.scheduledStart ? ` · ${m.scheduledStart}` : ''}</span>
            <span className={m.winner === 'A' ? 'font-semibold' : ''}>{m.teamA}</span>
            <span className="text-ink-3">vs</span>
            <span className={m.winner === 'B' ? 'font-semibold' : ''}>{m.teamB}</span>
            {m.status === 'completed' ? (
              <span className="text-xs">{m.teamAScore}–{m.teamBScore}</span>
            ) : editable && m.playable ? (
              <ResultEntry tournamentId={tournamentId} matchId={m.matchId} initialA={m.teamAScore} initialB={m.teamBScore} />
            ) : (
              <span className="text-xs text-ink-3">Pendiente</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Write `<BracketView>`**

```tsx
// src/components/tournament/bracket-view.tsx
import type { BracketView as BracketViewModel } from '@/lib/tournament/torneo-view';
import { ResultEntry } from './result-entry';

interface Props { tournamentId: string; bracket: BracketViewModel; editable: boolean }

const roundTitle = (round: number, total: number) => {
  const fromEnd = total - 1 - round; // 0 = final
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semifinales';
  if (fromEnd === 2) return 'Cuartos';
  return `Ronda ${round + 1}`;
};

export function BracketView({ tournamentId, bracket, editable }: Props) {
  if (bracket.rounds.length === 0) return null;
  const total = bracket.rounds.length;
  return (
    <div className="flex gap-6 overflow-x-auto">
      {bracket.rounds.map(({ round, matches }) => (
        <div key={round} className="space-y-3 min-w-48">
          <p className="font-medium text-sm">{roundTitle(round, total)}</p>
          {matches.map((m) => (
            <div key={m.matchId} className="border border-line rounded-md p-2 space-y-1">
              <div className="text-xs text-ink-3">{m.courtLabel ?? ''}{m.scheduledStart ? ` · ${m.scheduledStart}` : ''}</div>
              <div className={m.winner === 'A' ? 'font-semibold' : ''}>{m.teamA}</div>
              <div className={m.winner === 'B' ? 'font-semibold' : ''}>{m.teamB}</div>
              {m.status === 'completed' ? (
                <div className="text-xs">{m.teamAScore}–{m.teamBScore}</div>
              ) : editable && m.playable ? (
                <ResultEntry tournamentId={tournamentId} matchId={m.matchId} initialA={m.teamAScore} initialB={m.teamBScore} />
              ) : (
                <div className="text-xs text-ink-3">Pendiente</div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Verify build/lint**

Run: `npx eslint src/components/tournament/groups-table.tsx src/components/tournament/bracket-view.tsx` → 0 errores.

- [ ] **Step 4: Commit**

```bash
git add src/components/tournament/groups-table.tsx src/components/tournament/bracket-view.tsx
git commit -m "feat(torneo): componentes GroupsTable y BracketView"
```

---

## Task 3: Rellenar la rama de torneo en `EventPanel`

**Files:**
- Modify: `src/components/admin/event-panel.tsx`

- [ ] **Step 1: Replace the full file**

Sustituye `src/components/admin/event-panel.tsx` por (añade carga de partidos/grupos del torneo y su render; mantiene intacta la rama del pozo):

```tsx
import { db } from '@/lib/db';
import { players, tournamentGroups } from '@/lib/db/schema';
import { inArray, eq, asc } from 'drizzle-orm';
import { loadEvent } from '@/lib/tournament/event-store';
import { loadPairs } from '@/lib/tournament/pair-store';
import { listPozoMatches, pozoStandingsLive } from '@/lib/tournament/pozo-engine';
import { loadTorneoMatches } from '@/lib/tournament/torneo-run';
import { buildDisplayContext, buildPozoGrid } from '@/lib/tournament/pozo-view';
import { buildGroupsView, buildBracketView } from '@/lib/tournament/torneo-view';
import { PairsEditor } from './pairs-editor';
import { GenerateButton } from './generate-button';
import { PozoGrid } from '@/components/tournament/pozo-grid';
import { PozoStandings } from '@/components/tournament/pozo-standings';
import { GroupsTable } from '@/components/tournament/groups-table';
import { BracketView } from '@/components/tournament/bracket-view';

export async function EventPanel({ id }: { id: string }) {
  const ev = await loadEvent(db, id);
  const roster = ev.participantPlayerIds.length
    ? await db.select({ id: players.id, name: players.name }).from(players).where(inArray(players.id, ev.participantPlayerIds))
    : [];
  const pairs = await loadPairs(db, id);
  const ctx = buildDisplayContext(roster, pairs);
  const courtsByOrder = ev.courts.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((c) => ({ id: c.id, label: c.label }));
  const courtLabelById = new Map(courtsByOrder.map((c) => [c.id, c.label]));

  const isPozo = ev.kind === 'pozo';
  const isDraft = ev.status === 'draft';
  // Parejas fijas: el pozo fixed_pairs y TODOS los torneos las requieren.
  const needsPairs = isPozo ? ev.format === 'fixed_pairs' : true;
  const pairsComplete = pairs.length > 0 && pairs.length * 2 === ev.participantPlayerIds.length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="sec-title">{ev.name}</h1>
        <p className="muted text-sm mt-1">
          {ev.date}{ev.location ? ` · ${ev.location}` : ''} · {isPozo ? 'Pozo' : 'Torneo'} · {ev.format}
        </p>
      </div>

      <div className="text-sm">
        <p className="font-medium">Pistas{isPozo ? ' (escalera)' : ''}:</p>
        <ol className="list-decimal ml-5">{courtsByOrder.map((c) => <li key={c.id}>{c.label}</li>)}</ol>
        <p className="font-medium mt-2">Participantes: {ev.participantPlayerIds.length}</p>
      </div>

      {isDraft && (
        <div className="space-y-3">
          {needsPairs && (
            <PairsEditor tournamentId={id} participants={roster}
              initialPairs={pairs.map((p) => [p.player1Id, p.player2Id] as [string, string])} />
          )}
          <GenerateButton tournamentId={id}
            disabled={needsPairs && !pairsComplete}
            disabledReason={needsPairs && !pairsComplete ? 'Define todas las parejas antes de generar.' : undefined} />
        </div>
      )}

      {isPozo && !isDraft && <PozoSection id={id} courtsByOrder={courtsByOrder} ctx={ctx} />}
      {!isPozo && !isDraft && <TorneoSection id={id} ctx={ctx} courtLabelById={courtLabelById} />}
    </div>
  );
}

async function PozoSection({ id, courtsByOrder, ctx }: {
  id: string; courtsByOrder: { id: string; label: string }[]; ctx: ReturnType<typeof buildDisplayContext>;
}) {
  const matches = await listPozoMatches(db, id);
  const standings = await pozoStandingsLive(db, id);
  const grid = buildPozoGrid(matches, courtsByOrder, ctx);
  return (
    <div className="space-y-6">
      <section><h2 className="font-medium mb-2">Parrilla</h2><PozoGrid tournamentId={id} grid={grid} editable /></section>
      <section><h2 className="font-medium mb-2">Clasificación</h2><PozoStandings standings={standings} courtsByOrder={courtsByOrder} ctx={ctx} /></section>
    </div>
  );
}

async function TorneoSection({ id, ctx, courtLabelById }: {
  id: string; ctx: ReturnType<typeof buildDisplayContext>; courtLabelById: Map<string, string>;
}) {
  const matches = await loadTorneoMatches(db, id);
  const pairs = await loadPairs(db, id);
  const groupRows = await db.select({ id: tournamentGroups.id, name: tournamentGroups.name })
    .from(tournamentGroups).where(eq(tournamentGroups.tournamentId, id)).orderBy(asc(tournamentGroups.name));
  const groupsView = buildGroupsView(groupRows, pairs, matches, ctx, courtLabelById);
  const bracket = buildBracketView(matches, ctx, courtLabelById);
  return (
    <div className="space-y-6">
      {groupsView.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-medium">Grupos</h2>
          {groupsView.map((g) => <GroupsTable key={g.name} tournamentId={id} group={g} editable />)}
        </section>
      )}
      {bracket.rounds.length > 0 && (
        <section><h2 className="font-medium mb-2">Cuadro</h2><BracketView tournamentId={id} bracket={bracket} editable /></section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build + lint**

Run: `npx eslint src/components/admin/event-panel.tsx` → 0 errores.
Run (build con env, valida tipos y colección de rutas):
`rm -f /tmp/tb.db && TURSO_DATABASE_URL=file:/tmp/tb.db TURSO_AUTH_TOKEN= AUTH_SECRET=x npm run build 2>&1 | grep -E "Compiled successfully|Finished TypeScript|Failed|error" | head`
Expected: "Compiled successfully" + "Finished TypeScript" (sin errores). (Si el entorno bloquea `/tmp`, usa `$CLAUDE_JOB_DIR/tmp/tb.db` o cualquier ruta de fichero escribible.)

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/event-panel.tsx
git commit -m "feat(torneo): rellena la rama de torneo del EventPanel (grupos + cuadro + entrada de resultados)"
```

---

## Task 4: Vista pública `/(public)/torneos/[id]`

**Files:**
- Create: `src/app/(public)/torneos/[id]/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// src/app/(public)/torneos/[id]/page.tsx
import { db } from '@/lib/db';
import { players, tournamentGroups } from '@/lib/db/schema';
import { inArray, eq, asc } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { loadEvent } from '@/lib/tournament/event-store';
import { loadPairs } from '@/lib/tournament/pair-store';
import { loadTorneoMatches } from '@/lib/tournament/torneo-run';
import { buildDisplayContext } from '@/lib/tournament/pozo-view';
import { buildGroupsView, buildBracketView, torneoNextMatch } from '@/lib/tournament/torneo-view';
import { getSession } from '@/lib/auth/session';
import { GroupsTable } from '@/components/tournament/groups-table';
import { BracketView } from '@/components/tournament/bracket-view';

export const dynamic = 'force-dynamic';

export default async function PublicTorneoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let ev;
  try { ev = await loadEvent(db, id); } catch { notFound(); }
  if (ev.kind !== 'torneo') notFound();

  const roster = ev.participantPlayerIds.length
    ? await db.select({ id: players.id, name: players.name }).from(players).where(inArray(players.id, ev.participantPlayerIds))
    : [];
  const pairs = await loadPairs(db, id);
  const ctx = buildDisplayContext(roster, pairs);
  const courtLabelById = new Map(ev.courts.map((c) => [c.id, c.label]));
  const matches = ev.status !== 'draft' ? await loadTorneoMatches(db, id) : [];
  const groupRows = ev.status !== 'draft'
    ? await db.select({ id: tournamentGroups.id, name: tournamentGroups.name })
        .from(tournamentGroups).where(eq(tournamentGroups.tournamentId, id)).orderBy(asc(tournamentGroups.name))
    : [];
  const groupsView = buildGroupsView(groupRows, pairs, matches, ctx, courtLabelById);
  const bracket = buildBracketView(matches, ctx, courtLabelById);

  const session = await getSession();
  const myPlayerId = session?.player?.id ?? null;
  const myPairIds = myPlayerId ? pairs.filter((p) => p.player1Id === myPlayerId || p.player2Id === myPlayerId).map((p) => p.id) : [];
  const next = myPlayerId ? torneoNextMatch(matches, ctx, courtLabelById, myPlayerId, myPairIds) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">{ev.name}</h1>
        <p className="muted text-sm mt-1">{ev.date}{ev.location ? ` · ${ev.location}` : ''} · Torneo</p>
      </div>

      {ev.status === 'draft' && <p className="text-ink-3 text-sm">El torneo aún no se ha generado.</p>}

      {next && (
        <div className="border border-line rounded-md p-3 bg-surface">
          <p className="font-medium">Tu próximo partido</p>
          <p className="text-sm">{next.teamA} vs {next.teamB}</p>
          <p className="text-xs text-ink-3">{next.courtLabel ?? ''}{next.scheduledStart ? ` · ${next.scheduledStart}` : ''}</p>
        </div>
      )}

      {groupsView.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-medium">Grupos</h2>
          {groupsView.map((g) => <GroupsTable key={g.name} tournamentId={id} group={g} editable={false} />)}
        </section>
      )}
      {bracket.rounds.length > 0 && (
        <section><h2 className="font-medium mb-2">Cuadro</h2><BracketView tournamentId={id} bracket={bracket} editable={false} /></section>
      )}
    </div>
  );
}
```

> Nota: la llamada usa la firma `torneoNextMatch(matches, ctx, courtLabelById, myPlayerId, myPairIds)` (ver Task 1).

- [ ] **Step 2: Verify build + lint**

Run: `npx eslint "src/app/(public)/torneos/[id]/page.tsx"` → 0 errores.
Run: build con env (como en Task 3) y confirma que `/torneos/[id]` aparece en el árbol de rutas sin errores.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(public)/torneos/[id]/page.tsx"
git commit -m "feat(torneo): vista pública /torneos/[id] (grupos + cuadro + tu próximo partido)"
```

---

## Task 5: E2E (single_elim + groups_elim + pública)

**Files:**
- Create: `e2e/torneo-single-elim.spec.ts`
- Create: `e2e/torneo-groups-elim.spec.ts`
- Create: `e2e/torneo-public.spec.ts`

- [ ] **Step 1: Write `torneo-single-elim.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/admin.json' });

const BASE = {
  date: '2026-08-01', location: null, kind: 'torneo', format: 'single_elim',
  config: { matchFormat: { kind: 'best_of_3' }, thirdPlace: false },
  courts: [
    { label: 'Central', order: 1, availableFrom: '17:00', availableTo: '23:00' },
    { label: 'Pista 2', order: 2, availableFrom: '17:00', availableTo: '23:00' },
  ],
  participantPlayerIds: ['pl1', 'pl2', 'pl3', 'pl4', 'pl5', 'pl6', 'pl7', 'pl8'],
};

test('torneo eliminación directa: parejas → generar → cuadro → resultados → final', async ({ page }) => {
  const create = await page.request.post('/api/tournaments', { data: { ...BASE, name: 'E2E KO' } });
  expect(create.ok()).toBeTruthy();
  const { id } = await create.json();
  await page.request.put(`/api/tournaments/${id}/pairs`, {
    data: { pairs: [['pl1', 'pl2'], ['pl3', 'pl4'], ['pl5', 'pl6'], ['pl7', 'pl8']] },
  });

  await page.goto(`/admin/torneos/${id}`);
  await page.getByRole('button', { name: 'Generar' }).click();

  // El cuadro aparece (Semifinales + Final).
  await expect(page.getByText('Semifinales')).toBeVisible();
  await expect(page.getByText('Final')).toBeVisible();

  // Registrar las 2 semifinales (los Guardar visibles de ronda 0).
  for (let i = 0; i < 2; i++) {
    const btn = page.getByRole('button', { name: 'Guardar' }).first();
    if (!(await btn.isVisible())) break;
    await page.getByLabel('Juegos equipo A').first().fill('2');
    await page.getByLabel('Juegos equipo B').first().fill('0');
    await btn.click();
    await expect(page.getByText(/2.0/).first()).toBeVisible();
  }

  // Tras las semis, la final queda jugable: aparece un Guardar.
  await expect(page.getByRole('button', { name: 'Guardar' })).toBeVisible();
});
```

- [ ] **Step 2: Write `torneo-groups-elim.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/admin.json' });

test('torneo grupos→eliminación: liguilla → cuadro automático', async ({ page }) => {
  const create = await page.request.post('/api/tournaments', {
    data: {
      name: 'E2E Grupos', date: '2026-08-02', location: null, kind: 'torneo', format: 'groups_elim',
      config: { matchFormat: { kind: 'best_of_3' }, thirdPlace: false, numGroups: 2, advancePerGroup: 2 },
      courts: [
        { label: 'Central', order: 1, availableFrom: '17:00', availableTo: '23:00' },
        { label: 'Pista 2', order: 2, availableFrom: '17:00', availableTo: '23:00' },
      ],
      participantPlayerIds: ['pl1', 'pl2', 'pl3', 'pl4', 'pl5', 'pl6', 'pl7', 'pl8'],
    },
  });
  const { id } = await create.json();
  await page.request.put(`/api/tournaments/${id}/pairs`, {
    data: { pairs: [['pl1', 'pl2'], ['pl3', 'pl4'], ['pl5', 'pl6'], ['pl7', 'pl8']] },
  });

  await page.goto(`/admin/torneos/${id}`);
  await page.getByRole('button', { name: 'Generar' }).click();

  // Aparecen los grupos.
  await expect(page.getByText('Grupos')).toBeVisible();
  await expect(page.getByText('Grupo A')).toBeVisible();

  // Cierra toda la liguilla por API (rápido y estable), luego refresca.
  const matchesRes = await page.request.get(`/api/tournaments/${id}`);
  // No hay endpoint de listado de partidos: registramos vía resultados navegando por los Guardar de la UI.
  // Recorremos todos los Guardar visibles de grupo hasta que no queden.
  for (let guard = 0; guard < 30; guard++) {
    const btn = page.getByRole('button', { name: 'Guardar' }).first();
    if (!(await btn.isVisible().catch(() => false))) break;
    await page.getByLabel('Juegos equipo A').first().fill('6');
    await page.getByLabel('Juegos equipo B').first().fill('3');
    await btn.click();
    await page.waitForTimeout(150); // deja que router.refresh repinte
  }

  // Al cerrarse la liguilla, aparece el Cuadro.
  await expect(page.getByText('Cuadro')).toBeVisible();
});
```

> Nota: el bucle de 30 iteraciones recorre los partidos de grupo (12) y se detiene cuando ya no hay botón Guardar de grupo; al cerrarse la liguilla, el cuadro aparece (sus partidos también muestran Guardar, por eso comprobamos el texto 'Cuadro' como señal de transición). Si resulta inestable, sustituye el bucle por llamadas directas a la API de resultado tras descubrir los matchId con una consulta (no hay endpoint GET de partidos hoy; el bucle por UI es el camino estable con la superficie actual).

- [ ] **Step 3: Write `torneo-public.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test('vista pública del torneo: solo lectura + tu próximo partido', async ({ browser }) => {
  const adminCtx = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
  const adminPage = await adminCtx.newPage();
  const create = await adminPage.request.post('/api/tournaments', {
    data: {
      name: 'E2E Torneo Público', date: '2026-08-03', location: null, kind: 'torneo', format: 'single_elim',
      config: { matchFormat: { kind: 'best_of_3' }, thirdPlace: false },
      courts: [{ label: 'Central', order: 1, availableFrom: '17:00', availableTo: '23:00' }],
      participantPlayerIds: ['pl1', 'pl2', 'pl3', 'pl4', 'pl5', 'pl6', 'pl7', 'pl8'],
    },
  });
  const { id } = await create.json();
  await adminPage.request.put(`/api/tournaments/${id}/pairs`, {
    data: { pairs: [['pl1', 'pl2'], ['pl3', 'pl4'], ['pl5', 'pl6'], ['pl7', 'pl8']] },
  });
  await adminPage.request.post(`/api/tournaments/${id}/generate`, { data: { seed: 1 } });
  await adminCtx.close();

  const playerCtx = await browser.newContext({ storageState: 'e2e/.auth/player.json' });
  const page = await playerCtx.newPage();
  await page.goto(`/torneos/${id}`);

  await expect(page.getByRole('heading', { name: 'E2E Torneo Público' }).first()).toBeVisible();
  await expect(page.getByText('Cuadro').first()).toBeVisible();
  await expect(page.getByText('Tu próximo partido').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar' })).toHaveCount(0); // solo lectura

  await playerCtx.close();
});
```

> Nota Next/SSR: como en los e2e del pozo, la pública puede renderizar headings duplicados con `<div hidden>`; por eso `.first()` y `getByRole('heading', ...)`. Si algún `getByText` falla por modo estricto, añade `.first()`.

- [ ] **Step 4: Run the e2e**

Run: `npm run e2e -- torneo-single-elim torneo-groups-elim torneo-public`
Expected: PASS (3 specs). Si un selector falla por texto real distinto, ajusta SOLO el test (no el código de app); si falla por un bug real de app, marca BLOCKED con el detalle.

- [ ] **Step 5: Commit**

```bash
git add e2e/torneo-single-elim.spec.ts e2e/torneo-groups-elim.spec.ts e2e/torneo-public.spec.ts
git commit -m "test(e2e): torneo eliminación directa + grupos→eliminación + pública"
```

---

## Task 6: Verificación final

- [ ] **Step 1: Unit completa** — `npm test` → todo verde (incluye torneo-run, event-engine, torneo-view).
- [ ] **Step 2: Build con env** — `rm -f $CLAUDE_JOB_DIR/tmp/tb.db && TURSO_DATABASE_URL=file:$CLAUDE_JOB_DIR/tmp/tb.db TURSO_AUTH_TOKEN= AUTH_SECRET=x npm run build` → "Compiled successfully" + TypeScript OK; rutas `/admin/torneos/[id]` y `/torneos/[id]` presentes.
- [ ] **Step 3: Lint** — `npm run lint` → sin errores nuevos (solo los 2 preexistentes ajenos: navbar.tsx, event-form.tsx).
- [ ] **Step 4: E2E completa** — `npm run e2e` → todo verde (pozo + torneo + event-create).
- [ ] **Step 5: Commit de cierre** — `git commit -m "chore(torneo): verificación final (unit+build+lint+e2e)" --allow-empty`.

---

## Self-review (cobertura vs. spec)

- **view-model grupos + cuadro resuelto + próximo partido** → Task 1 (`torneo-view`). ✓
- **UI: GroupsTable + BracketView con entrada de resultados** → Tasks 2-3. ✓
- **EventPanel torneo (sustituye placeholder); reusa PairsEditor/GenerateButton/ResultEntry** → Task 3. ✓
- **Vista pública /torneos/[id] solo lectura + tu próximo partido** → Task 4. ✓
- **Nombre real de pista + hora** → `courtLabelById` en celdas. ✓
- **E2E ambos formatos + pública** → Task 5. ✓
- **Reutilización** (no duplicar): motor en `fixed-pairs`, run en `torneo-run` (T1), display helpers, buildDisplayContext. ✓
- **Fuera de v1**: 3er/4º puesto, ajuste manual de siembra, doble eliminación. ✓
