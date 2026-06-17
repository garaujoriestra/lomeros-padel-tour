# Rediseño visual del Pozo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la UI del Pozo (tablas planas) por la "escalera viva" con identidad LPT: una vista única con scrubber de rondas, carriles por pista (mejor arriba 👑), puesto + juegos por equipo, sube/baja, y entrada de resultado del admin integrada.

**Architecture:** Capa de presentación nueva sobre view-models y motores **intactos**. Una función pura nueva (`buildEscaleraView`) transforma `listPozoMatches` en carriles por ronda; un componente cliente (`PozoEscalera`) la renderiza con los tokens de `globals.css`. Se expone `games` en `LadderStanding` (valor ya calculado). Se reconectan la página admin y la pública; se retiran `pozo-grid`/`pozo-standings`.

**Tech Stack:** Next.js App Router (Server Components + un cliente para interacción), TypeScript, Tailwind v4 + tokens LPT, Vitest (unit), Playwright (e2e en `npm run e2e`).

**Referencia visual aprobada:** `docs/superpowers/specs/assets/2026-06-17-pozo-hifi-dark.html` (oscuro, principal) y `...-pozo-hifi.html` (claro). **Spec:** `docs/superpowers/specs/2026-06-17-pozo-torneo-ui-redesign-design.md`.

---

## Alcance de ESTE plan

- **Dentro:** vista en vivo del pozo (escalera) admin + pública, entrada de resultado restyle, helper de view-model, restyle del área de borrador (parejas + generar) con identidad LPT, actualización de e2e.
- **Fuera (otro plan):** todo el Torneo. **Sin tocar:** motores (`pozo-run`, `pozo-pairs-run`, `pozo-engine`, `pozo`), esquema, API. La config de pistas/rondas en la **creación** (`event-form.tsx`) se restyla mínimamente en la Tarea 7 pero su lógica no cambia.

## Estructura de archivos

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `src/lib/tournament/ladder.ts` | Añadir `games` a `LadderStanding` | Modificar |
| `src/lib/tournament/pozo-view.ts` | `buildEscaleraView` + tipos `Escalera*` (puro) | Modificar (añadir) |
| `src/lib/tournament/pozo-view.test.ts` | Tests de `buildEscaleraView` | Crear (o ampliar el existente) |
| `src/lib/tournament/ladder.test.ts` | Test del campo `games` | Modificar/crear |
| `src/components/tournament/pozo-escalera.tsx` | Componente estrella (scrubber + carriles + sube/baja) | Crear |
| `src/components/tournament/result-entry.tsx` | Restyle LPT de la entrada de resultado | Modificar |
| `src/components/tournament/pozo-grid.tsx` | Se retira | Borrar |
| `src/components/tournament/pozo-standings.tsx` | Se retira (absorbida en la escalera) | Borrar |
| `src/components/tournament/next-match-card.tsx` | Restyle a banda secundaria | Modificar |
| `src/components/admin/event-panel.tsx` | `PozoSection` usa `PozoEscalera`; borrador con identidad LPT | Modificar |
| `src/components/admin/pairs-editor.tsx` | Restyle LPT (constructor de parejas) | Modificar |
| `src/components/admin/generate-button.tsx` | Restyle LPT | Modificar |
| `src/app/(public)/pozos/[id]/page.tsx` | Render con `PozoEscalera` | Modificar |
| `e2e/pozo-fixed-pairs.spec.ts`, `pozo-americano.spec.ts`, `pozo-public.spec.ts` | Selectores nuevos | Modificar |

**Decisiones de presentación cerradas:**
- El **puesto (#) y los juegos** salen de `pozoStandingsLive` (live), unidos por `entityId`. Más significativos en la última ronda (= clasificación), visibles siempre.
- El **sube/baja** se deriva del **ganador del partido** de cada pista (ganador ▲, perdedor ▼; la pista de arriba el ganador "se queda", la de abajo el perdedor "se queda"). No requiere comparar rondas.
- **Americano:** un lado = 2 jugadores (cada uno con su #+juegos); **parejas fijas:** un lado = 1 pareja. Unificado en `EscaleraSide.members` (1 o 2 elementos).

---

## Task 1: Exponer `games` en `LadderStanding`

**Files:**
- Modify: `src/lib/tournament/ladder.ts`
- Test: `src/lib/tournament/ladder.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Añade a `ladder.test.ts` (créalo si no existe, con el import `import { ladderStandings } from './ladder';` y `import { describe, it, expect } from 'vitest';`):

```typescript
describe('ladderStandings · games', () => {
  it('expone los juegos acumulados de cada entidad', () => {
    const games = new Map<string, number>([['a', 12], ['b', 9], ['c', 4]]);
    const out = ladderStandings([['a', 'b']], games, ['c']);
    expect(out.find((s) => s.entityId === 'a')).toMatchObject({ rank: 1, court: 0, games: 12 });
    expect(out.find((s) => s.entityId === 'b')).toMatchObject({ rank: 2, court: 0, games: 9 });
    expect(out.find((s) => s.entityId === 'c')).toMatchObject({ rank: 3, court: null, games: 4 });
  });
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `npx vitest run src/lib/tournament/ladder.test.ts`
Expected: FAIL — `games` no existe en el objeto (propiedad ausente).

- [ ] **Step 3: Implementar (cambio aditivo)**

En `ladder.ts`, añade `games: number;` a la interfaz y pásalo en ambos `push`:

```typescript
export interface LadderStanding {
  entityId: string;
  court: number | null;
  rank: number;
  games: number; // juegos acumulados (para mostrar y desempate)
}
```

```typescript
    for (const s of sorted) out.push({ entityId: s.entityId, court: courtIdx, rank: 0, games: s.games });
  });
  for (const entityId of restingFinal) out.push({ entityId, court: null, rank: 0, games: gamesByEntity.get(entityId) ?? 0 });
```

- [ ] **Step 4: Correr el test y verlo pasar**

Run: `npx vitest run src/lib/tournament/ladder.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar que no rompe tipos ni consumidores**

Run: `npx tsc --noEmit`
Expected: 0 errores (los consumidores actuales solo leen `rank`/`court`/`entityId`; el campo nuevo es aditivo).

- [ ] **Step 6: Commit**

```bash
git add src/lib/tournament/ladder.ts src/lib/tournament/ladder.test.ts
git commit -m "feat(pozo): exponer juegos acumulados en LadderStanding"
```

---

## Task 2: `buildEscaleraView` (transformación pura por rondas)

**Files:**
- Modify: `src/lib/tournament/pozo-view.ts`
- Test: `src/lib/tournament/pozo-view.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crea/añade en `pozo-view.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildEscaleraView, buildDisplayContext } from './pozo-view';
import type { PozoMatchRow } from './pozo-run';

const pairSlot = (id: string) => JSON.stringify({ type: 'pair', pairId: id });

function fixedPairMatch(over: Partial<PozoMatchRow>): PozoMatchRow {
  return {
    id: 'm', round: 0, phaseTag: 'pozo', status: 'pending',
    courtId: null, scheduledStart: null, scheduledEnd: null,
    slotA1: null, slotA2: null, slotB1: null, slotB2: null,
    teamAScore: null, teamBScore: null, winner: null, ...over,
  };
}

describe('buildEscaleraView', () => {
  const courts = [{ id: 'c0', label: 'Central' }, { id: 'c1', label: 'Pista 2' }];
  const ctx = buildDisplayContext([], [
    { id: 'p1', player1Id: 'x', player2Id: 'y' },
    { id: 'p2', player1Id: 'z', player2Id: 'w' },
    { id: 'p3', player1Id: 'm', player2Id: 'n' },
    { id: 'p4', player1Id: 'o', player2Id: 'q' },
  ]);

  it('ordena carriles por pista (top primero) y marca ganador y miembros', () => {
    const matches: PozoMatchRow[] = [
      fixedPairMatch({ id: 'm1', round: 0, courtId: 'c1', slotA1: pairSlot('p3'), slotB1: pairSlot('p4') }),
      fixedPairMatch({ id: 'm0', round: 0, courtId: 'c0', status: 'completed',
        slotA1: pairSlot('p1'), slotB1: pairSlot('p2'), teamAScore: 6, teamBScore: 3, winner: 'A' }),
    ];
    const v = buildEscaleraView(matches, courts, ctx, ['p1', 'p2', 'p3', 'p4']);
    expect(v.rounds).toEqual([0]);
    expect(v.latestRound).toBe(0);
    const lanes = v.byRound[0].lanes;
    expect(lanes.map((l) => l.courtLabel)).toEqual(['Central', 'Pista 2']); // top primero
    expect(lanes[0].isTop).toBe(true);
    expect(lanes[1].isBottom).toBe(true);
    expect(lanes[0].sideA.members).toEqual([{ entityId: 'p1', label: 'x / y' }]);
    expect(lanes[0].sideA.isWinner).toBe(true);
    expect(lanes[0].sideA.score).toBe(6);
    expect(v.byRound[0].restingLabels).toEqual([]);
  });

  it('lista a los que descansan esa ronda', () => {
    const matches = [fixedPairMatch({ id: 'm0', round: 0, courtId: 'c0', slotA1: pairSlot('p1'), slotB1: pairSlot('p2') })];
    const v = buildEscaleraView(matches, courts, ctx, ['p1', 'p2', 'p3', 'p4']);
    expect(v.byRound[0].restingLabels.sort()).toEqual(['m / n', 'o / q']); // p3, p4 (pair labels)
  });
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `npx vitest run src/lib/tournament/pozo-view.test.ts`
Expected: FAIL — `buildEscaleraView` no existe.

- [ ] **Step 3: Implementar `buildEscaleraView`**

En `pozo-view.ts`: asegúrate de tener los imports `import { isMatchPlayable } from './display';` y `import type { SlotRef } from './types';` (ya hay `matchSlots` en este archivo). Añade al final:

```typescript
export interface EscaleraMember { entityId: string; label: string; }
export interface EscaleraSide { members: EscaleraMember[]; score: number | null; isWinner: boolean; }
export interface EscaleraLane {
  courtIndex: number; courtLabel: string; isTop: boolean; isBottom: boolean;
  matchId: string; status: string; playable: boolean; scheduledStart: string | null;
  sideA: EscaleraSide; sideB: EscaleraSide;
}
export interface EscaleraRound { round: number; lanes: EscaleraLane[]; restingLabels: string[]; }
export interface EscaleraView { rounds: number[]; latestRound: number; byRound: Record<number, EscaleraRound>; }

function slotMember(slot: SlotRef | null, ctx: DisplayContext): EscaleraMember | null {
  if (!slot) return null;
  if (slot.type === 'participant') return { entityId: slot.participantId, label: ctx.playerName.get(slot.participantId) ?? '—' };
  if (slot.type === 'pair') return { entityId: slot.pairId, label: ctx.pairLabel.get(slot.pairId) ?? '—' };
  return null; // bye/placeholder no son miembros con clasificación
}

// Transforma los partidos del pozo en carriles por ronda (pista top primero).
// `allEntityIds`: todas las entidades que clasifican (playerIds en americano, pairIds en parejas fijas),
// para deducir quién descansa cada ronda.
export function buildEscaleraView(
  matches: PozoMatchRow[],
  courtsByOrder: { id: string; label: string }[],
  ctx: DisplayContext,
  allEntityIds: string[],
): EscaleraView {
  const courtIndexById = new Map(courtsByOrder.map((c, i) => [c.id, i] as const));
  const lastCourtIdx = courtsByOrder.length - 1;
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  const byRound: Record<number, EscaleraRound> = {};

  for (const round of rounds) {
    const lanes: EscaleraLane[] = matches
      .filter((m) => m.round === round)
      .map((m) => {
        const slots = matchSlots(m);
        const sideA = [slotMember(slots.slotA1, ctx), slotMember(slots.slotA2, ctx)].filter(Boolean) as EscaleraMember[];
        const sideB = [slotMember(slots.slotB1, ctx), slotMember(slots.slotB2, ctx)].filter(Boolean) as EscaleraMember[];
        const courtIndex = m.courtId ? (courtIndexById.get(m.courtId) ?? 0) : 0;
        return {
          courtIndex,
          courtLabel: courtsByOrder[courtIndex]?.label ?? `Pista ${courtIndex + 1}`,
          isTop: courtIndex === 0,
          isBottom: courtIndex === lastCourtIdx,
          matchId: m.id, status: m.status, playable: isMatchPlayable(slots),
          scheduledStart: m.scheduledStart,
          sideA: { members: sideA, score: m.teamAScore, isWinner: m.winner === 'A' },
          sideB: { members: sideB, score: m.teamBScore, isWinner: m.winner === 'B' },
        };
      })
      .sort((a, b) => a.courtIndex - b.courtIndex);

    const playing = new Set<string>();
    for (const lane of lanes) for (const side of [lane.sideA, lane.sideB]) for (const mem of side.members) playing.add(mem.entityId);
    const restingLabels = allEntityIds
      .filter((id) => !playing.has(id))
      .map((id) => ctx.playerName.get(id) ?? ctx.pairLabel.get(id) ?? '—');

    byRound[round] = { round, lanes, restingLabels };
  }

  return { rounds, latestRound: rounds.length ? rounds[rounds.length - 1] : 0, byRound };
}
```

- [ ] **Step 4: Correr el test y verlo pasar**

Run: `npx vitest run src/lib/tournament/pozo-view.test.ts`
Expected: PASS (ambos casos).

- [ ] **Step 5: tsc**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tournament/pozo-view.ts src/lib/tournament/pozo-view.test.ts
git commit -m "feat(pozo): buildEscaleraView (carriles por ronda, puro)"
```

---

## Task 3: Restyle de `ResultEntry` con identidad LPT

**Files:**
- Modify: `src/components/tournament/result-entry.tsx`

Mantiene props, fetch y `aria-label`s (los e2e dependen de "Juegos equipo A/B" y "Guardar"). Solo cambia el aspecto.

- [ ] **Step 1: Reescribir el render (mantener lógica)**

Sustituye el JSX devuelto por (conserva el resto del componente: estado, `save()`, fetch):

```tsx
  return (
    <div className="flex items-center gap-2">
      <input
        aria-label="Juegos equipo A" type="number" min={0} inputMode="numeric"
        value={a} onChange={(e) => setA(Number(e.target.value))} disabled={disabled || saving}
        className="w-12 h-9 text-center font-display italic font-extrabold text-lg rounded-[9px] border border-line-strong bg-surface-2 text-ink"
      />
      <span className="text-ink-3">–</span>
      <input
        aria-label="Juegos equipo B" type="number" min={0} inputMode="numeric"
        value={b} onChange={(e) => setB(Number(e.target.value))} disabled={disabled || saving}
        className="w-12 h-9 text-center font-display italic font-extrabold text-lg rounded-[9px] border border-line-strong bg-surface-2 text-ink"
      />
      <button onClick={save} disabled={disabled || saving} className="lpt-btn primary">
        {saving ? '...' : 'Guardar'}
      </button>
      {error && <span className="text-xs text-loss">{error}</span>}
    </div>
  );
```

> Nota: `font-display`, `text-loss`, `bg-surface-2`, `border-line-strong`, `lpt-btn primary` ya existen como utilidades/clases LPT (ver `globals.css`). Si `font-display` no está mapeada como utilidad Tailwind, usa `style={{ fontFamily: 'var(--font-display)' }}`.

- [ ] **Step 2: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/tournament/result-entry.tsx
git commit -m "style(pozo): result-entry con identidad LPT (sin cambiar lógica/labels)"
```

---

## Task 4: Componente `PozoEscalera` (la pieza estrella)

**Files:**
- Create: `src/components/tournament/pozo-escalera.tsx`

Cliente (usa `useState` para la ronda activa del scrubber). Consume `EscaleraView` + `LadderStanding[]` (con `games`). Sigue la maqueta hi-fi (`assets/2026-06-17-pozo-hifi-dark.html`).

- [ ] **Step 1: Crear el componente**

```tsx
'use client';

import { useState } from 'react';
import type { EscaleraView, EscaleraLane, EscaleraSide } from '@/lib/tournament/pozo-view';
import type { LadderStanding } from '@/lib/tournament/ladder';
import { ResultEntry } from './result-entry';

interface Props {
  tournamentId: string;
  view: EscaleraView;
  standings: LadderStanding[];
  editable: boolean;            // admin true; público false
  myEntityIds?: string[];       // pareja/jugador del que mira (resalta su carril)
}

const D = { fontFamily: 'var(--font-display)' as const };

export function PozoEscalera({ tournamentId, view, standings, editable, myEntityIds = [] }: Props) {
  const [round, setRound] = useState(view.latestRound);
  const data = view.byRound[round];
  const stand = new Map(standings.map((s) => [s.entityId, s] as const));
  const mine = new Set(myEntityIds);

  if (!data) return <p className="muted text-sm">El pozo aún no se ha generado.</p>;

  const memberRow = (entityId: string, label: string) => {
    const s = stand.get(entityId);
    return (
      <div key={entityId} className="flex items-center gap-3 py-0.5">
        <span style={D} className={`italic font-extrabold text-lg w-6 text-center tabular-nums ${s?.rank === 1 ? 'text-acc-text' : 'text-ink-3'}`}>
          {s ? s.rank : '·'}
        </span>
        <span className="flex-1 font-bold text-[14.5px] min-w-0 truncate">{label}</span>
        {s && <span className="text-xs text-ink-3 tabular-nums">{s.games} <span className="opacity-60">jg</span></span>}
      </div>
    );
  };

  const sideScore = (side: EscaleraSide) => (
    <span style={D} className={`italic font-extrabold text-[22px] w-9 text-center tabular-nums rounded-md ${side.isWinner ? 'text-acc-text bg-[color-mix(in_oklab,var(--acc)_12%,transparent)]' : 'text-ink-3'}`}>
      {side.score ?? '·'}
    </span>
  );

  const sideBlock = (side: EscaleraSide) => (
    <div className="flex items-center gap-2">
      <div className="flex-1">{side.members.map((m) => memberRow(m.entityId, m.label))}</div>
      {sideScore(side)}
    </div>
  );

  const movement = (lane: EscaleraLane) => {
    if (lane.status !== 'completed') {
      return <div className="flex justify-center text-[11px] text-ink-3 py-1">▲▼ se decide al guardar</div>;
    }
    const up = lane.isTop ? 'se quedan arriba' : 'suben';
    const down = lane.isBottom ? 'se quedan' : 'bajan';
    return (
      <div className="flex justify-center gap-4 py-1 text-[11px] font-extrabold">
        <span className="text-win">▲ {up}</span>
        <span className="text-loss">▼ {down}</span>
      </div>
    );
  };

  const statusPill = (lane: EscaleraLane) => {
    if (lane.status === 'completed') return <span className="status-pill completed">Final</span>;
    if (lane.playable) return <span className="status-pill" style={{ background: 'color-mix(in oklab, var(--win) 16%, transparent)', color: 'var(--win)' }}>● Jugándose</span>;
    return <span className="status-pill scheduled">Pendiente</span>;
  };

  const laneIsMine = (lane: EscaleraLane) =>
    [...lane.sideA.members, ...lane.sideB.members].some((m) => mine.has(m.entityId));

  return (
    <div>
      {/* Scrubber */}
      <div className="flex items-center gap-2.5 mb-4 flex-wrap">
        <span className="kicker">Ronda</span>
        <div className="seg">
          {view.rounds.map((r) => (
            <button key={r} onClick={() => setRound(r)} className={r === round ? 'on' : (r < view.latestRound ? 'text-acc-text' : '')} style={D}>
              {r + 1}
            </button>
          ))}
        </div>
        <span className="text-[12.5px] text-ink-3">{round + 1} de {view.rounds.length}</span>
      </div>

      {/* Carriles */}
      <div className="flex flex-col gap-2">
        {data.lanes.map((lane) => (
          <div key={lane.matchId}>
            <div className={`lpt-card card-pad ${lane.isTop ? 'podium-gold' : ''} ${laneIsMine(lane) ? 'ring-2 ring-[color-mix(in_oklab,var(--win)_42%,var(--line))]' : ''}`}>
              <div className="flex justify-between items-center mb-2">
                <span className="kicker">{lane.isTop ? '👑 ' : ''}{lane.courtLabel}</span>
                {statusPill(lane)}
              </div>
              {sideBlock(lane.sideA)}
              {sideBlock(lane.sideB)}
              {editable && lane.playable && lane.status !== 'completed' && (
                <div className="mt-2 pt-2 border-t border-line">
                  <ResultEntry tournamentId={tournamentId} matchId={lane.matchId} initialA={lane.sideA.score} initialB={lane.sideB.score} />
                </div>
              )}
            </div>
            {movement(lane)}
          </div>
        ))}

        {data.restingLabels.length > 0 && (
          <div className="lpt-card card-pad opacity-70">
            <div className="flex justify-between items-center mb-1">
              <span className="kicker">Descanso</span>
            </div>
            <p className="text-sm text-ink-2">😴 {data.restingLabels.join(', ')} {data.restingLabels.length === 1 ? 'descansa' : 'descansan'} esta ronda</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

> Si alguna utilidad Tailwind (`text-acc-text`, `text-win`, `text-loss`, `bg-surface-2`, `ring-...`) no está generada, sustitúyela por `style={{ color: 'var(--win)' }}` etc. Las clases de componente (`lpt-card`, `card-pad`, `kicker`, `seg`, `status-pill`, `podium-gold`, `muted`) están en `globals.css`.

- [ ] **Step 2: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/tournament/pozo-escalera.tsx
git commit -m "feat(pozo): componente PozoEscalera (escalera viva LPT)"
```

---

## Task 5: Reconectar admin (`PozoSection`) y pública a `PozoEscalera`

**Files:**
- Modify: `src/components/admin/event-panel.tsx`
- Modify: `src/app/(public)/pozos/[id]/page.tsx`
- Delete: `src/components/tournament/pozo-grid.tsx`, `src/components/tournament/pozo-standings.tsx`

- [ ] **Step 1: Admin — reescribir `PozoSection`**

En `event-panel.tsx`, sustituye el cuerpo de `PozoSection` por:

```tsx
async function PozoSection({ id, courtsByOrder, ctx }: {
  id: string; courtsByOrder: { id: string; label: string }[]; ctx: ReturnType<typeof buildDisplayContext>;
}) {
  const ev = await loadEvent(db, id);
  const matches = await listPozoMatches(db, id);
  const standings = await pozoStandingsLive(db, id);
  const allEntityIds = ev.format === 'americano'
    ? ev.participantPlayerIds
    : (await loadPairs(db, id)).map((p) => p.id);
  const view = buildEscaleraView(matches, courtsByOrder, ctx, allEntityIds);
  return (
    <section>
      <h2 className="sec-title mb-3">Escalera</h2>
      <PozoEscalera tournamentId={id} view={view} standings={standings} editable />
    </section>
  );
}
```

Ajusta imports en `event-panel.tsx`: quita `PozoGrid`/`PozoStandings`, añade `import { PozoEscalera } from '@/components/tournament/pozo-escalera';`, `import { buildEscaleraView } from '@/lib/tournament/pozo-view';`, y asegúrate de tener `loadPairs` y `loadEvent` importados (ya se usan en el panel).

- [ ] **Step 2: Pública — reescribir el render del pozo**

En `(public)/pozos/[id]/page.tsx`, sustituye el bloque de `matches.length > 0` y el `NextMatchCard`/`PozoGrid`/`PozoStandings` por:

```tsx
  const allEntityIds = ev.format === 'americano' ? ev.participantPlayerIds : pairs.map((p) => p.id);
  const view = buildEscaleraView(matches, courtsByOrder, ctx, allEntityIds);
  const myEntityIds = ev.format === 'americano' ? (myPlayerId ? [myPlayerId] : []) : myPairIds;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">{ev.name}</h1>
        <p className="muted text-sm mt-1">{ev.date}{ev.location ? ` · ${ev.location}` : ''} · Pozo</p>
      </div>

      {ev.status === 'draft' && <p className="text-ink-3 text-sm">El pozo aún no se ha generado.</p>}

      {matches.length > 0 && myPlayerId && (
        <NextMatchCard matches={matches} playerId={myPlayerId} myPairIds={myPairIds} courtLabelById={courtLabelById} ctx={ctx} />
      )}

      {matches.length > 0 && (
        <PozoEscalera tournamentId={id} view={view} standings={standings} editable={false} myEntityIds={myEntityIds} />
      )}
    </div>
  );
```

Añade los imports `buildEscaleraView`, `PozoEscalera`; quita `PozoGrid`, `PozoStandings`, `buildPozoGrid`.

- [ ] **Step 3: Borrar los componentes muertos**

```bash
git rm src/components/tournament/pozo-grid.tsx src/components/tournament/pozo-standings.tsx
```

- [ ] **Step 4: Verificar que no quedan referencias**

Run: `grep -rn "pozo-grid\|PozoGrid\|pozo-standings\|PozoStandings\|buildPozoGrid" src/`
Expected: sin resultados.
Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(pozo): admin y pública usan PozoEscalera; retira grid/standings"
```

---

## Task 6: Restyle del borrador (parejas + generar) y `NextMatchCard`

**Files:**
- Modify: `src/components/admin/pairs-editor.tsx`
- Modify: `src/components/admin/generate-button.tsx`
- Modify: `src/components/tournament/next-match-card.tsx`

Solo aspecto. **Conserva** `aria-label`s, textos de botón ("Añadir pareja", "Guardar parejas", "Generar"), y el "Guardado ✓" (los e2e dependen de ellos).

- [ ] **Step 1: `pairs-editor.tsx` — envolver en tarjeta LPT**

Cambia el contenedor raíz y los controles a clases LPT (mantén lógica/labels):

```tsx
    <div className="lpt-card card-pad space-y-3 max-w-xl">
      <p className="kicker">Definir parejas</p>
      {/* ...lista de parejas: cada <li> con className="flex items-center gap-2 text-sm" y el botón ✕ como className="text-ink-3 hover:text-loss" ... */}
      {/* selects con className="bg-surface-2 border border-line rounded-md px-2 h-9 text-sm" y aria-label="Jugador A" / "Jugador B" (mantener) */}
      {/* botones con className="lpt-btn" y el de guardar className="lpt-btn primary" */}
    </div>
```

> Mantén exactamente `aria-label="Jugador A"`, `aria-label="Jugador B"`, los textos "Añadir pareja", "Guardar parejas", y el `<span>` "Guardado ✓" con `className="text-sm text-win"`.

- [ ] **Step 2: `generate-button.tsx` — botón primario LPT**

```tsx
    <div className="space-y-1">
      <button onClick={generate} disabled={disabled || loading} className="lpt-btn primary">
        {loading ? 'Generando...' : 'Generar'}
      </button>
      {disabled && disabledReason && <p className="text-xs text-ink-3">{disabledReason}</p>}
      {error && <p className="text-sm text-loss">{error}</p>}
    </div>
```

- [ ] **Step 3: `next-match-card.tsx` — banda secundaria (no hero)**

Cambia solo el render (mantén la lógica de `next`/labels):

```tsx
  return (
    <div className="lpt-card card-pad flex items-center gap-3">
      <span className="status-pill scheduled">Tu próximo</span>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm truncate">{teamA} vs {teamB}</p>
        <p className="text-xs text-ink-3">{court}{next.scheduledStart ? ` · ${next.scheduledStart}` : ''}</p>
      </div>
    </div>
  );
```

- [ ] **Step 4: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/pairs-editor.tsx src/components/admin/generate-button.tsx src/components/tournament/next-match-card.tsx
git commit -m "style(pozo): borrador (parejas/generar) y próximo partido con identidad LPT"
```

---

## Task 7: Restyle mínimo de la config de creación (pistas/rondas)

**Files:**
- Modify: `src/components/admin/event-form.tsx` (solo el bloque del pozo)

> El orden de pistas y nº de rondas se definen aquí. **No cambies la lógica ni los nombres de campos** (el motor depende de `sortOrder`, `rounds`, `matchFormat`). Solo: envolver las secciones en `lpt-card card-pad`, títulos con `kicker`/`sec-title`, y la selección de formato con la clase `seg`. Si ya hay drag de pistas, mantenlo; si no, deja la reordenación como esté (no introducir DnD nuevo en este plan).

- [ ] **Step 1: Aplicar clases LPT a las secciones del pozo en `event-form.tsx`**

Envuelve cada grupo de campos (datos, formato, pistas, rondas) en `<div className="lpt-card card-pad space-y-3">` con su `<p className="kicker">…</p>`. Sustituye el toggle de formato por la clase `seg` (botones `on`/no-`on`). No toques handlers ni `name`s.

- [ ] **Step 2: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/event-form.tsx
git commit -m "style(pozo): config de creación con identidad LPT (sin cambiar lógica)"
```

---

## Task 8: Actualizar los e2e del pozo a la UI nueva

**Files:**
- Modify: `e2e/pozo-fixed-pairs.spec.ts`, `e2e/pozo-americano.spec.ts`, `e2e/pozo-public.spec.ts`

La nueva UI ya no tiene "Parrilla"/"Clasificación" como títulos ni tabla; el scrubber muestra "Ronda" + número, y la escalera muestra la pista 👑.

- [ ] **Step 1: `pozo-fixed-pairs.spec.ts` — ajustar aserciones de UI**

Reemplaza las aserciones que dependen de la tabla vieja. Manteniendo el flujo (montar por API, generar, meter resultado):

```typescript
await page.getByRole('button', { name: 'Generar' }).click();
// scrubber de rondas: "Ronda" visible
await expect(page.getByText('Ronda', { exact: false }).first()).toBeVisible();
// la pista líder muestra la corona
await expect(page.getByText('👑', { exact: false }).first()).toBeVisible();

// entrada de resultado (labels intactos)
await page.getByLabel('Juegos equipo A').first().fill('4');
await page.getByLabel('Juegos equipo B').first().fill('2');
await page.getByRole('button', { name: 'Guardar' }).first().click();
await expect(page.getByText('4', { exact: false }).first()).toBeVisible();
```

> Quita `expect(page.getByText('Clasificación'))` (ya no existe ese título). Mantén las aserciones del editor de parejas (labels y "Guardado ✓" no cambian).

- [ ] **Step 2: `pozo-americano.spec.ts` — mismo ajuste**

```typescript
await page.getByRole('button', { name: 'Generar' }).click();
await expect(page.getByText('Ronda', { exact: false }).first()).toBeVisible();
await page.getByLabel('Juegos equipo A').first().fill('4');
await page.getByLabel('Juegos equipo B').first().fill('1');
await page.getByRole('button', { name: 'Guardar' }).first().click();
await expect(page.getByText('👑', { exact: false }).first()).toBeVisible();
```

(Quita la aserción de "Clasificación".)

- [ ] **Step 3: `pozo-public.spec.ts` — aserciones de solo lectura**

```typescript
await page.goto(`/pozos/${id}`);
await expect(page.getByRole('heading', { name: 'E2E Pozo Público' }).first()).toBeVisible();
await expect(page.getByText('Ronda', { exact: false }).first()).toBeVisible();
await expect(page.getByText('👑', { exact: false }).first()).toBeVisible();
await expect(page.getByText('Tu próximo', { exact: false }).first()).toBeVisible();
await expect(page.getByRole('button', { name: 'Guardar' })).toHaveCount(0); // sin edición en pública
```

(Cambia "Parrilla"/"Clasificación" por "Ronda"/"👑"; "Tu próximo partido" → "Tu próximo".)

- [ ] **Step 4: Correr los e2e del pozo**

Run: `npx playwright install chromium` (si no está) y luego `npm run e2e -- pozo`
Expected: los 3 specs del pozo en verde.

- [ ] **Step 5: Commit**

```bash
git add e2e/pozo-fixed-pairs.spec.ts e2e/pozo-americano.spec.ts e2e/pozo-public.spec.ts
git commit -m "test(e2e): pozo apunta a la UI nueva (escalera/scrubber)"
```

---

## Task 9: Verificación final

- [ ] **Step 1: Unit + tipos**

Run: `npx vitest run && npx tsc --noEmit`
Expected: toda la suite unit en verde, 0 errores de tipos.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build OK (recordar: Next 16 no corre eslint en build; los 2 warnings preexistentes son ajenos).

- [ ] **Step 3: e2e completo**

Run: `npm run e2e`
Expected: suite e2e en verde (incluidos los del torneo, que no se han tocado).

- [ ] **Step 4: Revisión visual manual (admin + pública, claro y oscuro)**

Montar un pozo de prueba y comparar contra `docs/superpowers/specs/assets/2026-06-17-pozo-hifi-dark.html`. Verificar: escalera con 👑 arriba, scrubber navega rondas, sube/baja con verde/naranja, puesto+juegos por equipo, tu carril resaltado en la pública, entrada de resultado solo en admin.

- [ ] **Step 5: Commit final si hubo ajustes**

```bash
git add -A && git commit -m "chore(pozo): ajustes de verificación visual"
```

---

## Self-review (cobertura del spec)

- §5.2 Configuración → Tareas 6 y 7 (parejas/generar + creación). *Nota:* la consolidación total en "una página" se limita a restyle; la lógica de creación sigue en `event-form`. Si se desea fusionar a una sola página, es un refactor aparte.
- §5.3 Escalera en vivo (scrubber, carriles, 👑, puesto+juegos, sube/baja, status, tu carril, entrada admin) → Tareas 2, 4, 5.
- §5.4 Clasificación = última ronda → emergente de §5.3 (la escalera en `latestRound` con puesto+juegos).
- §5.5 Vista jugador (solo lectura, próximo partido secundario) → Tareas 5 y 6.
- §5.6 Americano vs parejas fijas → `EscaleraSide.members` (1/2) + `allEntityIds` por formato (Tareas 2, 5).
- §10 Testing → Tareas 1, 2 (unit) + 8, 9 (e2e/build).

**Pendiente explícito (no en este plan):** scrubber con clasificación cumulativa "por ronda" (se muestra la live); DnD de pistas en config. Ambos como mejoras futuras.
