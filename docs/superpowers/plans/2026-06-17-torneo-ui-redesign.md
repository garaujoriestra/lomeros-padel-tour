# Rediseño visual del Torneo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la UI del Torneo (tablas planas + cuadro de `<div>`) por el **árbol clásico** del cuadro (ganador que fluye, partido en vivo, byes "pasa directo", caja de campeón) y la **fase de grupos** rediseñada (conmutador Grupos/Cuadro, tablas en ancho / filas en móvil, clasificados en verde + línea de corte, banda de cruces grupo→cuadro), todo con identidad LPT y consistente con la escalera del Pozo.

**Architecture:** Capa de presentación nueva sobre view-models y motores **intactos**, con dos excepciones acotadas: (1) **fix de idempotencia** del motor (`torneo-run.ts`: ids deterministas + `onConflictDoNothing`, mismo patrón ya aplicado al pozo); (2) **extensiones aditivas mínimas** del view-model (`torneo-view.ts`): flag `isBye` y los `teamAId/teamBId` por celda + helper puro `seedLabelByPair`. Un componente cliente `TorneoBoard` orquesta el conmutador; `BracketView` (árbol) y `GroupsTable` (tablas/filas) se reescriben in situ. Se reconectan la página admin y la pública.

**Tech Stack:** Next.js App Router (Server Components + clientes para interacción/scroll), TypeScript, Drizzle (libSQL), Tailwind v4 + tokens LPT, Vitest (unit), Playwright (e2e en `npm run e2e`).

**Referencia visual aprobada:** `docs/superpowers/specs/assets/2026-06-17-pozo-hifi-dark.html` (oscuro, identidad principal — el Torneo reutiliza sus tokens/clases). **Spec:** `docs/superpowers/specs/2026-06-17-pozo-torneo-ui-redesign-design.md` (§6 Torneo). **Plantilla:** `docs/superpowers/plans/2026-06-17-pozo-ui-redesign.md`.

---

## Alcance de ESTE plan

- **Dentro:** árbol del cuadro (admin + pública) con scroll 2 ejes + auto-centrado en móvil, ganador resaltado/fluye, byes en discontinuo, caja de campeón; fase de grupos rediseñada (conmutador, tablas/filas, top-N verde + corte, partidos plegables en móvil, banda de cruces); entrada de resultado del admin integrada (reutiliza `ResultEntry`, ya restyle LPT); vista jugador/espectador (solo lectura, pareja del que mira resaltada); fix de idempotencia del motor; extensiones aditivas del view-model; actualización de los e2e del torneo.
- **Fuera (no en este plan):** **Sorteo/siembra arrastrable** (§6.2/§6.4 "🎲 Sortear de nuevo" + drag ⠿). Requiere que el motor acepte un **orden de siembra explícito** (hoy `generateTorneo(db, id, seed)` solo recibe un seed numérico y baraja en servidor) **y** una librería de DnD (no hay ninguna en el repo). Ambas cosas violan la restricción "no tocar motores / solo presentación". Se difiere como follow-up (extensión aditiva del motor `generateTorneo(..., order?: string[])` + DnD), igual que el Pozo difirió el DnD de pistas. **Sí** se mantiene la **banda de cruces** (1º A vs 2º B), que es 100% derivable en presentación. **Sin tocar:** resto de motores (`fixed-pairs`, `seeding`, `scheduler`, `event-engine`), esquema, API. `event-form.tsx` (creación: formato/nº de grupos) no se toca; el formato/grupos ya se eligen ahí.

## Estructura de archivos

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `src/lib/tournament/torneo-run.ts` | Ids deterministas + `onConflictDoNothing` en `writeBracket`, `generateGroups` (grupo + partidos) | Modificar |
| `src/lib/tournament/torneo-run.test.ts` | Tests de idempotencia (generar 2× sin duplicar) | Modificar (añadir) |
| `src/lib/tournament/torneo-view.ts` | Aditivo: `isBye`/`teamAId`/`teamBId` en `MatchCell`; helper puro `seedLabelByPair` | Modificar (añadir) |
| `src/lib/tournament/torneo-view.test.ts` | Tests de los añadidos aditivos | Modificar (añadir) |
| `src/components/tournament/bracket-view.tsx` | Árbol clásico responsive (scroll 2 ejes, auto-centra, ganador fluye, byes, campeón) | Reescribir |
| `src/components/tournament/groups-table.tsx` | Tablas (ancho) / filas (móvil) + top-N verde + corte + partidos plegables | Reescribir |
| `src/components/tournament/crosses-band.tsx` | Banda "🔀 Del grupo al cuadro" (cruces 1ºA vs 2ºB) | Crear |
| `src/components/tournament/torneo-board.tsx` | Conmutador `Grupos / Cuadro` (cliente) que orquesta grupos + banda + cuadro | Crear |
| `src/components/admin/event-panel.tsx` | `TorneoSection` usa `TorneoBoard` | Modificar |
| `src/app/(public)/torneos/[id]/page.tsx` | Render con `TorneoBoard`; "Tu próximo partido" como banda LPT; resaltar pareja | Modificar |
| `e2e/torneo-single-elim.spec.ts`, `torneo-groups-elim.spec.ts`, `torneo-public.spec.ts` | Selectores nuevos (conmutador, árbol, campeón) | Modificar |

**Decisiones de presentación cerradas:**
- **Ganador "fluye":** ya lo resuelve el view-model (`resolveBracket` rellena el slot de la ronda siguiente). El árbol solo resalta el lado ganador (verde/lima) y lee la etiqueta resuelta. **Sin lógica nueva.**
- **Byes "pasa directo":** se marcan con el flag aditivo `MatchCell.isBye` (un lado es `{type:'bye'}`); tarjeta en discontinuo.
- **Pareja del que mira:** resaltada vía los `teamAId/teamBId` aditivos (no se exponen pairIds hoy).
- **Conmutador Grupos/Cuadro:** solo en `groups_elim` (hay dos fases). En `single_elim` se muestra solo el árbol bajo el encabezado "Cuadro".
- **Ronda "en juego" (auto-centra):** la primera ronda del cuadro con un partido `playable`.
- **Textos preservados para e2e:** títulos de ronda "Semifinales"/"Final"/"Cuartos"/"Ronda N"; encabezados "Grupos"/"Grupo A"/"Cuadro"; "Tu próximo partido"; `aria-label` "Juegos equipo A"/"Juegos equipo B"; botón "Guardar".

---

## Task 1: Idempotencia del motor del torneo (fix del bug)

**Files:**
- Modify: `src/lib/tournament/torneo-run.ts`
- Test: `src/lib/tournament/torneo-run.test.ts`

**Problema:** `writeBracket` (cuadro) y `generateGroups` (grupos + partidos) insertan con `id: crypto.randomUUID()` y **sin** `onConflictDoNothing()`. Una doble ejecución concurrente (doble-submit de "Generar" en la ventana TOCTOU antes de marcar `scheduled`, o dos `recordTorneoResult` cerrando a la vez la última jornada de liguilla y disparando `maybeGenerateBracketFromGroups` ambos) duplica filas de partidos. Mismo patrón ya arreglado en el pozo (`pozo-run.ts:35`, `pozo-pairs-run.ts:38`): id determinista + `.onConflictDoNothing()`.

- [ ] **Step 1: Escribir los tests que fallan**

Añade a `src/lib/tournament/torneo-run.test.ts` (al final; reutiliza los helpers `createTestDb`, `makeTorneo`, `KO_CFG`, `GROUPS_CFG`, `playAllGroupMatches` ya presentes en el archivo):

```typescript
describe('idempotencia de generación (sin filas duplicadas)', () => {
  it('single_elim: generar dos veces no duplica el cuadro', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makeTorneo(db, client, 4, 2, 'single_elim', KO_CFG);
    await generateTorneo(db, id, 123);
    await generateTorneo(db, id, 123); // doble-submit / carrera
    const ko = (await loadTorneoMatches(db, id)).filter((m) => m.phaseTag?.startsWith('ko:'));
    expect(ko.length).toBe(3); // 2 semis + 1 final, NO 6
    expect(new Set(ko.map((m) => m.phaseTag)).size).toBe(3); // phaseTags únicos
  });

  it('groups_elim: generar dos veces no duplica grupos ni partidos de liguilla', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makeTorneo(db, client, 8, 2, 'groups_elim', GROUPS_CFG);
    await generateTorneo(db, id, 5);
    await generateTorneo(db, id, 5);
    const groupMatches = (await loadTorneoMatches(db, id)).filter((m) => m.phaseTag?.startsWith('group:'));
    expect(groupMatches.length).toBe(12); // 2 grupos de 4 → 6+6, NO 24
    const groups = await db.select().from(tournamentGroups).where(eq(tournamentGroups.tournamentId, id));
    expect(groups.length).toBe(2); // NO 4
  });

  it('groups_elim: cerrar la liguilla dos veces no duplica el cuadro', async () => {
    const { db, client } = await createTestDb();
    const { id } = await makeTorneo(db, client, 8, 2, 'groups_elim', GROUPS_CFG);
    await generateTorneo(db, id, 5);
    await playAllGroupMatches(db, id);          // dispara la creación del cuadro
    await playAllGroupMatches(db, id);          // re-registra resultados → re-dispara (idempotente)
    const ko = (await loadTorneoMatches(db, id)).filter((m) => m.phaseTag?.startsWith('ko:'));
    expect(ko.length).toBe(3); // semis + final, NO 6
  });
});
```

Asegúrate de que el archivo tiene los imports necesarios en cabecera (ya están `createTestDb`, `generateTorneo`, `recordTorneoResult`, `loadTorneoMatches`). **Añade** los que falten:

```typescript
import { eq } from 'drizzle-orm';
import { tournamentGroups } from './schema'; // si no resuelve, usar: import { tournamentGroups } from '@/lib/db/schema';
```

> Comprueba el import correcto de `tournamentGroups`/`eq` mirando la cabecera del propio test; si ya importa `db`/schema de otra forma, sigue ese estilo. El resto del archivo no se toca.

- [ ] **Step 2: Correr los tests y verlos fallar**

Run: `npx vitest run src/lib/tournament/torneo-run.test.ts`
Expected: FALLAN los 3 nuevos (ko.length = 6, groupMatches = 24, groups = 4). Los tests previos siguen verdes.

- [ ] **Step 3: Implementar ids deterministas + onConflictDoNothing**

En `src/lib/tournament/torneo-run.ts`, en `writeBracket` (el `db.insert` del cuadro), sustituye el `id` aleatorio y añade el `onConflictDoNothing`:

```typescript
  for (const m of bracket) {
    const s = sched.get(m.matchId);
    await db.insert(tournamentMatches).values({
      id: `${tournamentId}-ko-${m.matchId}`, tournamentId, phaseTag: `ko:${m.matchId}`, round: m.round,
      courtId: s?.courtId ?? null,
      scheduledStart: s ? minToHHMM(s.startMin) : null, scheduledEnd: s ? minToHHMM(s.endMin) : null,
      status: 'pending', slotA1: slotJson(m.slotA), slotA2: null, slotB1: slotJson(m.slotB), slotB2: null,
    }).onConflictDoNothing();
  }
```

En `generateGroups`, el `insert` del grupo:

```typescript
    const groupId = `${tournamentId}-grp-${name}`;
    await db.insert(tournamentGroups).values({ id: groupId, tournamentId, name }).onConflictDoNothing();
```

> `groupId` deja de ser `crypto.randomUUID()`. El `db.update(tournamentPairs).set({ groupId })` que sigue es idempotente (mismo `groupId` determinista).

Y el `insert` de los partidos de liguilla (la `key` ya es determinista: `g${gi}r${m.round}m${i}`):

```typescript
  for (const w of toWrite) {
    const s = schedByKey.get(w.key);
    await db.insert(tournamentMatches).values({
      id: `${tournamentId}-group-${w.key}`, tournamentId, phaseTag: w.phaseTag, round: w.round,
      courtId: s?.courtId ?? null,
      scheduledStart: s ? minToHHMM(s.startMin) : null, scheduledEnd: s ? minToHHMM(s.endMin) : null,
      status: 'pending', slotA1: JSON.stringify({ type: 'pair', pairId: w.pairA } as SlotRef), slotA2: null,
      slotB1: JSON.stringify({ type: 'pair', pairId: w.pairB } as SlotRef), slotB2: null,
    }).onConflictDoNothing();
  }
```

> No se toca `crypto.randomUUID` en ningún otro sitio (no hay más en este archivo). `autoCompleteByes` y `recordTorneoResult` ya son idempotentes (updates por id).

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `npx vitest run src/lib/tournament/torneo-run.test.ts`
Expected: PASS (los 3 nuevos + todos los previos).

- [ ] **Step 5: tsc**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tournament/torneo-run.ts src/lib/tournament/torneo-run.test.ts
git commit -m "fix(torneo): generación idempotente (ids deterministas + onConflictDoNothing)"
```

---

## Task 2: Extensiones aditivas del view-model (`isBye`, `teamAId/teamBId`, `seedLabelByPair`)

**Files:**
- Modify: `src/lib/tournament/torneo-view.ts`
- Test: `src/lib/tournament/torneo-view.test.ts`

Aditivo y puro. `isBye` marca byes ("pasa directo"); `teamAId/teamBId` exponen el `pairId` de cada lado (para resaltar la pareja del que mira y casar etiquetas de cruce); `seedLabelByPair` produce "1º A", "2º B" a partir de los `GroupView` ya calculados.

- [ ] **Step 1: Escribir los tests que fallan**

Añade a `src/lib/tournament/torneo-view.test.ts`:

```typescript
import { seedLabelByPair } from './torneo-view';

describe('MatchCell aditivos (isBye, teamAId/teamBId)', () => {
  it('expone pairId por lado y marca isBye=false en partido normal', () => {
    // Reutiliza el setup del test de buildBracketView ya existente en este archivo:
    // construye 2 parejas reales en R0 y comprueba teamAId/teamBId/ isBye.
    // (Ver el bloque describe('buildBracketView') existente para el helper de filas KO.)
  });
});

describe('seedLabelByPair', () => {
  it('etiqueta cada pareja con "<rank>º <grupo>"', () => {
    const groups = [
      { name: 'A', standings: [
        { pairId: 'pa1', label: 'A1', played: 2, wins: 2, draws: 0, losses: 0, gameDiff: 6, points: 6, rank: 1 },
        { pairId: 'pa2', label: 'A2', played: 2, wins: 0, draws: 0, losses: 2, gameDiff: -6, points: 0, rank: 2 },
      ], matches: [] },
      { name: 'B', standings: [
        { pairId: 'pb1', label: 'B1', played: 2, wins: 2, draws: 0, losses: 0, gameDiff: 6, points: 6, rank: 1 },
        { pairId: 'pb2', label: 'B2', played: 2, wins: 0, draws: 0, losses: 2, gameDiff: -6, points: 0, rank: 2 },
      ], matches: [] },
    ];
    const m = seedLabelByPair(groups);
    expect(m.get('pa1')).toBe('1º A');
    expect(m.get('pb2')).toBe('2º B');
    expect(m.get('desconocida')).toBeUndefined();
  });
});
```

> Para el primer `describe`, mira cómo el test existente de `buildBracketView` monta filas KO (mismo helper/factory que ya usa el archivo) y añade aserciones: `cell.teamAId` = pairId de la pareja, `cell.isBye === false`. Si el archivo existente no tiene un caso con bye, añade uno con un slot `{type:'bye'}` y comprueba `cell.isBye === true`. **Completa el cuerpo del test** con ese factory; no lo dejes vacío.

- [ ] **Step 2: Correr los tests y verlos fallar**

Run: `npx vitest run src/lib/tournament/torneo-view.test.ts`
Expected: FAIL — `seedLabelByPair` no existe; `teamAId`/`isBye` ausentes en `MatchCell`.

- [ ] **Step 3: Implementar los añadidos**

En `src/lib/tournament/torneo-view.ts`, amplía la interfaz `MatchCell`:

```typescript
export interface MatchCell {
  matchId: string;
  teamA: string; teamB: string;
  teamAId: string | null; teamBId: string | null;   // pairId por lado (null si no es pareja resuelta)
  isBye: boolean;                                    // un lado es un bye ("pasa directo")
  teamAScore: number | null; teamBScore: number | null;
  winner: string | null; status: string; playable: boolean;
  scheduledStart: string | null; courtLabel: string | null;
}
```

Añade un helper y amplía `cellFrom` (justo encima de `cellFrom`):

```typescript
function slotPairId(slot: SlotRef | null): string | null {
  return slot && slot.type === 'pair' ? slot.pairId : null;
}
```

En `cellFrom`, devuelve los campos nuevos (lee de `slots`):

```typescript
function cellFrom(m: PozoMatchRow, slots: MatchSlots, ctx: DisplayContext, courtLabelById: Map<string, string>): MatchCell {
  const { teamA, teamB } = matchTeamLabels(slots, ctx);
  return {
    matchId: m.id, teamA, teamB,
    teamAId: slotPairId(slots.slotA1), teamBId: slotPairId(slots.slotB1),
    isBye: slots.slotA1?.type === 'bye' || slots.slotB1?.type === 'bye',
    teamAScore: m.teamAScore, teamBScore: m.teamBScore,
    winner: m.winner, status: m.status, playable: isMatchPlayable(slots) && m.status !== 'completed',
    scheduledStart: m.scheduledStart, courtLabel: m.courtId ? (courtLabelById.get(m.courtId) ?? null) : null,
  };
}
```

Y al final del archivo, el helper puro de etiquetas de siembra:

```typescript
// "1º A", "2º B", … por pareja, a partir de las clasificaciones de grupo ya calculadas.
export function seedLabelByPair(groups: GroupView[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const g of groups) for (const s of g.standings) out.set(s.pairId, `${s.rank}º ${g.name}`);
  return out;
}
```

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `npx vitest run src/lib/tournament/torneo-view.test.ts`
Expected: PASS (incluye los previos de `buildGroupsView`/`buildBracketView`/`torneoNextMatch`).

- [ ] **Step 5: tsc**

Run: `npx tsc --noEmit`
Expected: 0 errores (los consumidores actuales de `MatchCell` solo leen campos previos; los nuevos son aditivos).

- [ ] **Step 6: Commit**

```bash
git add src/lib/tournament/torneo-view.ts src/lib/tournament/torneo-view.test.ts
git commit -m "feat(torneo): view-model aditivo (isBye, pairId por lado, seedLabelByPair)"
```

---

## Task 3: `BracketView` — árbol clásico responsive

**Files:**
- Rewrite: `src/components/tournament/bracket-view.tsx`

Cliente (necesita `useRef`/`useEffect` para auto-centrar en móvil). Rondas en columnas izquierda→derecha; ganador resaltado (lima/verde) que "fluye" (el view-model ya rellena la celda siguiente); partido en vivo con `ResultEntry`; byes en discontinuo; caja de campeón a la derecha; scroll horizontal (rondas) y vertical por columna (partidos). Resalta la pareja del que mira con `myPairIds`.

- [ ] **Step 1: Reescribir el componente**

Sustituye **todo** `src/components/tournament/bracket-view.tsx` por:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import type { BracketView as BracketViewModel, MatchCell } from '@/lib/tournament/torneo-view';
import { ResultEntry } from './result-entry';

const D = { fontFamily: 'var(--font-display)' as const };

const roundTitle = (round: number, total: number) => {
  const fromEnd = total - 1 - round; // 0 = final
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semifinales';
  if (fromEnd === 2) return 'Cuartos';
  return `Ronda ${round + 1}`;
};

interface Props { tournamentId: string; bracket: BracketViewModel; editable: boolean; myPairIds?: string[]; }

export function BracketView({ tournamentId, bracket, editable, myPairIds = [] }: Props) {
  const mine = new Set(myPairIds);
  const scroller = useRef<HTMLDivElement>(null);
  const liveCol = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-centra la ronda en juego en móvil al abrir.
    if (liveCol.current) liveCol.current.scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' });
  }, []);

  if (bracket.rounds.length === 0) return null;
  const total = bracket.rounds.length;
  const liveRound = bracket.rounds.find((r) => r.matches.some((m) => m.playable))?.round ?? -1;
  const finalMatch = bracket.rounds[total - 1]?.matches[0];
  const champion = finalMatch && finalMatch.status === 'completed'
    ? (finalMatch.winner === 'A' ? finalMatch.teamA : finalMatch.teamB)
    : null;

  const sideRow = (label: string, id: string | null, score: number | null, isWinner: boolean, isBye: boolean) => (
    <div className={`flex items-center gap-2 px-2.5 py-1.5 ${isWinner ? 'bg-[color-mix(in_oklab,var(--win)_14%,transparent)]' : ''}`}>
      <span className={`flex-1 min-w-0 truncate text-[13.5px] ${isWinner ? 'font-extrabold text-win' : 'font-medium'} ${id && mine.has(id) ? 'underline decoration-dotted' : ''}`}>
        {isBye ? <span className="text-ink-3 italic">pasa directo</span> : label}
      </span>
      <span style={D} className={`italic font-extrabold text-base w-6 text-center tabular-nums ${isWinner ? 'text-win' : 'text-ink-3'}`}>
        {score ?? '·'}
      </span>
    </div>
  );

  const matchCard = (m: MatchCell) => {
    const isMine = (m.teamAId && mine.has(m.teamAId)) || (m.teamBId && mine.has(m.teamBId));
    const pending = m.status !== 'completed';
    return (
      <div key={m.matchId} className={`lpt-card overflow-hidden ${m.isBye ? 'border-dashed opacity-80' : ''} ${isMine ? 'ring-2 ring-[color-mix(in_oklab,var(--win)_42%,var(--line))]' : ''}`}>
        <div className="flex justify-between items-center px-2.5 pt-1.5 text-[11px] text-ink-3">
          <span className="truncate">{m.courtLabel ?? ''}{m.scheduledStart ? ` · ${m.scheduledStart}` : ''}</span>
          {m.status === 'completed'
            ? <span className="status-pill completed">Final</span>
            : m.playable
              ? <span className="status-pill" style={{ background: 'color-mix(in oklab, var(--win) 16%, transparent)', color: 'var(--win)' }}>● En juego</span>
              : <span className="status-pill scheduled">Pendiente</span>}
        </div>
        {sideRow(m.teamA, m.teamAId, m.teamAScore, m.winner === 'A', m.isBye && m.teamAId === null)}
        <div className="border-t border-line" />
        {sideRow(m.teamB, m.teamBId, m.teamBScore, m.winner === 'B', m.isBye && m.teamBId === null)}
        {editable && m.playable && pending && (
          <div className="px-2.5 py-2 border-t border-line">
            <ResultEntry tournamentId={tournamentId} matchId={m.matchId} initialA={m.teamAScore} initialB={m.teamBScore} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div ref={scroller} className="flex gap-5 overflow-x-auto pb-2 -mx-1 px-1">
      {bracket.rounds.map(({ round, matches }) => (
        <div
          key={round}
          ref={round === liveRound ? liveCol : undefined}
          className="flex flex-col gap-3 min-w-[230px] max-h-[70vh] overflow-y-auto snap-start"
        >
          <p className="kicker sticky top-0 z-[1] py-0.5 bg-surface">{roundTitle(round, total)}</p>
          {matches.map((m) => matchCard(m))}
        </div>
      ))}
      {champion && (
        <div className="flex flex-col justify-center min-w-[200px]">
          <p className="kicker mb-2">Campeón</p>
          <div className="lpt-card card-pad podium-gold text-center">
            <p className="text-2xl mb-1">👑</p>
            <p style={D} className="italic font-extrabold text-lg leading-tight">{champion}</p>
          </div>
        </div>
      )}
    </div>
  );
}
```

> Clases LPT confirmadas en uso por `pozo-escalera.tsx`: `lpt-card`, `card-pad`, `kicker`, `status-pill`/`.completed`/`.scheduled`, `podium-gold`, utilidades `text-win`/`text-ink-3`, `bg-surface`, `border-line`. No introducir clases nuevas; si alguna utilidad Tailwind no estuviera generada, usar `style={{ color: 'var(--win)' }}` como hace la escalera.

- [ ] **Step 2: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: 0 errores. (Los callers actuales pasan `tournamentId`/`bracket`/`editable`; `myPairIds` es opcional, así que no rompen hasta la Task 6/7 que lo añaden.)

- [ ] **Step 3: Commit**

```bash
git add src/components/tournament/bracket-view.tsx
git commit -m "feat(torneo): cuadro como árbol clásico LPT (ganador fluye, byes, campeón, auto-centra)"
```

---

## Task 4: `GroupsTable` — tablas (ancho) / filas (móvil)

**Files:**
- Rewrite: `src/components/tournament/groups-table.tsx`

Una tarjeta por grupo. En ancho (`≥760px`): tabla `# · pareja · PJ · G-P · Dif · Pts` con los clasificados (top-N) en verde y **línea de corte** discontinua. En móvil: filas (`dorsal + nombre` arriba, `PJ n · v-d · ±dif` fino debajo, **Pts en grande** a la derecha). Partidos **plegables** en móvil (`<details>`). Resalta la pareja del que mira.

- [ ] **Step 1: Reescribir el componente**

Sustituye **todo** `src/components/tournament/groups-table.tsx` por:

```tsx
import type { GroupView, StandingRow } from '@/lib/tournament/torneo-view';
import { ResultEntry } from './result-entry';

const D = { fontFamily: 'var(--font-display)' as const };

interface Props { tournamentId: string; group: GroupView; advance: number; editable: boolean; myPairIds?: string[]; }

export function GroupsTable({ tournamentId, group, advance, editable, myPairIds = [] }: Props) {
  const mine = new Set(myPairIds);
  const qualifies = (s: StandingRow) => s.rank <= advance;

  const standRow = (s: StandingRow) => {
    const isMine = mine.has(s.pairId);
    const q = qualifies(s);
    return (
      <div
        key={s.pairId}
        className={`flex items-center gap-3 px-3 py-2 border-b border-line last:border-b-0 ${q ? 'bg-[color-mix(in_oklab,var(--win)_8%,transparent)]' : ''} ${s.rank === advance ? 'border-b-2 border-dashed border-[color-mix(in_oklab,var(--win)_45%,var(--line))]' : ''}`}
      >
        <span style={D} className={`italic font-extrabold text-lg w-7 text-center tabular-nums ${q ? 'text-win' : 'text-ink-3'}`}>{s.rank}</span>
        <div className="flex-1 min-w-0">
          <p className={`font-bold text-[14px] truncate ${isMine ? 'underline decoration-dotted' : ''}`}>{s.label}</p>
          <p className="text-[11.5px] text-ink-3 tabular-nums">PJ {s.played} · {s.wins}-{s.losses}{s.draws ? `-${s.draws}` : ''} · {s.gameDiff >= 0 ? '+' : ''}{s.gameDiff}</p>
        </div>
        <span style={D} className={`italic font-extrabold text-xl tabular-nums ${q ? 'text-win' : 'text-ink'}`}>{s.points}</span>
      </div>
    );
  };

  return (
    <div className="lpt-card overflow-hidden">
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <h3 className="kicker">Grupo {group.name}</h3>
        <span className="text-[11px] text-ink-3">clasifican {advance}</span>
      </div>
      <div>{group.standings.map(standRow)}</div>
      <details className="border-t border-line">
        <summary className="px-3 py-2 text-[12.5px] text-ink-3 cursor-pointer select-none">Ver los {group.matches.length} partidos ▾</summary>
        <ul className="px-3 pb-3 space-y-1.5">
          {group.matches.map((m) => (
            <li key={m.matchId} className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="text-[11px] text-ink-3 w-20 shrink-0">{m.courtLabel ?? ''}{m.scheduledStart ? ` · ${m.scheduledStart}` : ''}</span>
              <span className={m.winner === 'A' ? 'font-extrabold text-win' : ''}>{m.teamA}</span>
              <span className="text-ink-3">vs</span>
              <span className={m.winner === 'B' ? 'font-extrabold text-win' : ''}>{m.teamB}</span>
              {m.status === 'completed'
                ? <span style={D} className="italic font-extrabold tabular-nums">{m.teamAScore}–{m.teamBScore}</span>
                : editable && m.playable
                  ? <ResultEntry tournamentId={tournamentId} matchId={m.matchId} initialA={m.teamAScore} initialB={m.teamBScore} />
                  : <span className="text-[11px] text-ink-3">Pendiente</span>}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
```

> `advance` (clasifican por grupo) viene del config (`cfg.advancePerGroup ?? 2`); se pasará desde `TorneoBoard`/secciones (Task 6/7). La "tabla en ancho" se logra con la misma estructura de filas (legible en ambos anchos); no se necesita un `<table>` aparte — las filas ya muestran todas las columnas (`#`, pareja, PJ/G-P/Dif, Pts). Mantiene el texto "Grupo A" para los e2e.

- [ ] **Step 2: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: ERROR esperado en los callers (`event-panel.tsx`, public page) porque ahora falta la prop `advance`. **Se arregla en Task 6/7.** Verifica que el error es solo "falta `advance`" y no otra cosa. (Si prefieres 0 errores entre tareas, salta directo a aplicar Task 6/7 antes de `tsc`; el orden recomendado es Task 3→4→5→6→7 y luego `tsc`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/tournament/groups-table.tsx
git commit -m "feat(torneo): grupos como tarjeta LPT (filas, top-N verde + línea de corte, partidos plegables)"
```

---

## Task 5: `CrossesBand` — banda "🔀 Del grupo al cuadro"

**Files:**
- Create: `src/components/tournament/crosses-band.tsx`

Muestra los cruces de **1ª ronda** del cuadro con etiquetas de siembra (1º A vs 2º B), usando `seedLabelByPair`. Solo aplica a `groups_elim` y solo cuando el cuadro ya existe.

- [ ] **Step 1: Crear el componente**

```tsx
import type { BracketView, GroupView } from '@/lib/tournament/torneo-view';
import { seedLabelByPair } from '@/lib/tournament/torneo-view';

interface Props { bracket: BracketView; groups: GroupView[]; }

export function CrossesBand({ bracket, groups }: Props) {
  const r1 = bracket.rounds[0];
  if (!r1 || groups.length === 0) return null;
  const seed = seedLabelByPair(groups);
  const crosses = r1.matches
    .filter((m) => !m.isBye)
    .map((m) => ({
      key: m.matchId,
      a: m.teamAId ? (seed.get(m.teamAId) ?? m.teamA) : m.teamA,
      b: m.teamBId ? (seed.get(m.teamBId) ?? m.teamB) : m.teamB,
    }));
  if (crosses.length === 0) return null;

  return (
    <div className="lpt-card card-pad">
      <p className="kicker mb-2">🔀 Del grupo al cuadro</p>
      <ul className="flex flex-wrap gap-2">
        {crosses.map((c) => (
          <li key={c.key} className="text-[12.5px] px-2.5 py-1 rounded-[var(--r-pill)] bg-surface-2 border border-line">
            <span className="font-bold">{c.a}</span>
            <span className="text-ink-3"> vs </span>
            <span className="font-bold">{c.b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

> Si `--r-pill` no resuelve como clase Tailwind arbitraria, usa `rounded-full`. `bg-surface-2`/`border-line` ya existen.

- [ ] **Step 2: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: el componente compila (los errores de `advance` de Task 4 siguen hasta Task 6/7).

- [ ] **Step 3: Commit**

```bash
git add src/components/tournament/crosses-band.tsx
git commit -m "feat(torneo): banda de cruces grupo→cuadro (1ºA vs 2ºB)"
```

---

## Task 6: `TorneoBoard` — conmutador Grupos / Cuadro

**Files:**
- Create: `src/components/tournament/torneo-board.tsx`

Cliente. Orquesta la vista del torneo ya generado. En `groups_elim`: conmutador segmentado `Grupos / Cuadro` (clase `seg`); en "Grupos" → tarjetas de grupo; en "Cuadro" → banda de cruces + árbol. En `single_elim`: sin conmutador, solo el árbol bajo encabezado "Cuadro". Empieza en "Grupos" si la liguilla sigue abierta, en "Cuadro" si ya hay clasificados.

- [ ] **Step 1: Crear el componente**

```tsx
'use client';

import { useState } from 'react';
import type { BracketView as BracketViewModel, GroupView } from '@/lib/tournament/torneo-view';
import { GroupsTable } from './groups-table';
import { BracketView } from './bracket-view';
import { CrossesBand } from './crosses-band';

interface Props {
  tournamentId: string;
  groups: GroupView[];
  bracket: BracketViewModel;
  advance: number;
  editable: boolean;
  myPairIds?: string[];
}

export function TorneoBoard({ tournamentId, groups, bracket, advance, editable, myPairIds = [] }: Props) {
  const hasGroups = groups.length > 0;
  const hasBracket = bracket.rounds.length > 0;
  const [tab, setTab] = useState<'grupos' | 'cuadro'>(hasBracket ? 'cuadro' : 'grupos');

  if (!hasGroups && !hasBracket) return null;

  // single_elim: solo cuadro.
  if (!hasGroups) {
    return (
      <section className="space-y-3">
        <h2 className="kicker">Cuadro</h2>
        <BracketView tournamentId={tournamentId} bracket={bracket} editable={editable} myPairIds={myPairIds} />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="seg" role="group" aria-label="Fase del torneo">
        <button className={tab === 'grupos' ? 'on' : ''} aria-pressed={tab === 'grupos'} onClick={() => setTab('grupos')}>Grupos</button>
        <button className={tab === 'cuadro' ? 'on' : ''} aria-pressed={tab === 'cuadro'} onClick={() => setTab('cuadro')} disabled={!hasBracket}>Cuadro</button>
      </div>

      {tab === 'grupos' ? (
        <div className="space-y-3">
          <h2 className="kicker">Grupos</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {groups.map((g) => (
              <GroupsTable key={g.name} tournamentId={tournamentId} group={g} advance={advance} editable={editable} myPairIds={myPairIds} />
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="kicker">Cuadro</h2>
          <CrossesBand bracket={bracket} groups={groups} />
          {hasBracket
            ? <BracketView tournamentId={tournamentId} bracket={bracket} editable={editable} myPairIds={myPairIds} />
            : <p className="text-sm text-ink-3">El cuadro se formará al cerrar la fase de grupos.</p>}
        </div>
      )}
    </section>
  );
}
```

> Mantiene los textos "Grupos", "Grupo A" (en `GroupsTable`) y "Cuadro" que los e2e usan. El conmutador `seg` es el mismo patrón que el scrubber de `pozo-escalera.tsx`.

- [ ] **Step 2: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: el componente compila (los errores de los callers se resuelven en Task 7).

- [ ] **Step 3: Commit**

```bash
git add src/components/tournament/torneo-board.tsx
git commit -m "feat(torneo): TorneoBoard con conmutador Grupos/Cuadro"
```

---

## Task 7: Reconectar admin (`TorneoSection`) y página pública

**Files:**
- Modify: `src/components/admin/event-panel.tsx`
- Modify: `src/app/(public)/torneos/[id]/page.tsx`

- [ ] **Step 1: Admin — `TorneoSection` usa `TorneoBoard`**

En `event-panel.tsx`:
- Cambia los imports de tarjeta: quita `import { GroupsTable } from '@/components/tournament/groups-table';` y `import { BracketView } from '@/components/tournament/bracket-view';`, añade `import { TorneoBoard } from '@/components/tournament/torneo-board';`.
- Asegúrate de importar el tipo de config para `advance`. `loadEvent` ya devuelve `ev.config`. Sustituye el cuerpo de `TorneoSection` por:

```tsx
async function TorneoSection({ id, ctx, courtLabelById }: {
  id: string; ctx: ReturnType<typeof buildDisplayContext>; courtLabelById: Map<string, string>;
}) {
  const ev = await loadEvent(db, id);
  const matches = await loadTorneoMatches(db, id);
  const pairs = await loadPairs(db, id);
  const groupRows = await db.select({ id: tournamentGroups.id, name: tournamentGroups.name })
    .from(tournamentGroups).where(eq(tournamentGroups.tournamentId, id)).orderBy(asc(tournamentGroups.name));
  const groupsView = buildGroupsView(groupRows, pairs, matches, ctx, courtLabelById);
  const bracket = buildBracketView(matches, ctx, courtLabelById);
  const advance = (ev.config as { advancePerGroup?: number }).advancePerGroup ?? 2;
  return <TorneoBoard tournamentId={id} groups={groupsView} bracket={bracket} advance={advance} editable />;
}
```

> `loadEvent` ya se importa en `event-panel.tsx`. Si llamar a `loadEvent` otra vez molesta, pásale `ev` desde `EventPanel` como prop; pero re-cargarlo es inocuo (mismo patrón que `PozoSection` que recarga matches/standings).

- [ ] **Step 2: Pública — usar `TorneoBoard` + banda "Tu próximo partido" LPT**

En `(public)/torneos/[id]/page.tsx`:
- Imports: quita `GroupsTable`/`BracketView`, añade `import { TorneoBoard } from '@/components/tournament/torneo-board';`.
- Sustituye el bloque de render (de `{groupsView.length > 0 && ...}` hasta el cierre del cuadro) y la tarjeta "Tu próximo partido" por:

```tsx
      {next && (
        <div className="lpt-card card-pad flex items-center gap-3">
          <span className="status-pill scheduled">Tu próximo partido</span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm truncate">{next.teamA} vs {next.teamB}</p>
            <p className="text-xs text-ink-3">{next.courtLabel ?? ''}{next.scheduledStart ? ` · ${next.scheduledStart}` : ''}</p>
          </div>
        </div>
      )}

      {(groupsView.length > 0 || bracket.rounds.length > 0) && (
        <TorneoBoard
          tournamentId={id}
          groups={groupsView}
          bracket={bracket}
          advance={(ev.config as { advancePerGroup?: number }).advancePerGroup ?? 2}
          editable={false}
          myPairIds={myPairIds}
        />
      )}
```

> `myPairIds` y `next` ya se calculan en la página. Mantiene el texto "Tu próximo partido" (e2e). `ev` ya está cargado en la página.

- [ ] **Step 3: Verificar que no quedan referencias rotas y compila**

Run: `grep -rn "GroupsTable\|BracketView" src/components/admin src/app` 
Expected: solo dentro de `torneo-board.tsx` (no en `event-panel.tsx` ni en la página pública).
Run: `npx tsc --noEmit`
Expected: **0 errores** (ya con `advance` provisto en ambos callers).

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/event-panel.tsx "src/app/(public)/torneos/[id]/page.tsx"
git commit -m "feat(torneo): admin y pública usan TorneoBoard (conmutador + árbol + grupos)"
```

---

## Task 8: Actualizar los e2e del torneo a la UI nueva

**Files:**
- Modify: `e2e/torneo-single-elim.spec.ts`, `e2e/torneo-groups-elim.spec.ts`, `e2e/torneo-public.spec.ts`

Mantener el patrón: montar estado por API (`POST /api/tournaments`, `PUT .../pairs`, `POST .../generate`), aserciones por UI. Conservar `aria-label`s y "Guardar".

- [ ] **Step 1: `torneo-single-elim.spec.ts`**

El árbol mantiene "Semifinales"/"Final" y muestra el marcador como "2–0". Ajusta solo lo que cambie de layout (el botón "Guardar" sigue apareciendo en partidos jugables). Mantén el flujo; asegura que tras registrar las semis aparece la final jugable:

```typescript
  await page.goto(`/admin/torneos/${id}`);
  await page.getByRole('button', { name: 'Generar' }).click();

  await expect(page.getByText('Semifinales')).toBeVisible();
  await expect(page.getByText('Final', { exact: true })).toBeVisible();

  for (let i = 0; i < 2; i++) {
    const btn = page.getByRole('button', { name: 'Guardar' }).first();
    if (!(await btn.isVisible().catch(() => false))) break;
    await page.getByLabel('Juegos equipo A').first().fill('2');
    await page.getByLabel('Juegos equipo B').first().fill('0');
    await btn.click();
    await expect(page.getByText('2–0').first()).toBeVisible();
    await page.waitForTimeout(150);
  }

  // Tras las semis, la final queda jugable → aparece un Guardar.
  await expect(page.getByRole('button', { name: 'Guardar' })).toBeVisible();
```

> Cambia el separador del marcador a "2–0" (guion largo `–`, U+2013, el mismo que renderiza el componente). Si el componente usa otro carácter, alinéalos.

- [ ] **Step 2: `torneo-groups-elim.spec.ts` — adaptar al conmutador**

Con el conmutador, la pestaña "Cuadro" existe desde el principio (deshabilitada hasta que hay cuadro). El bucle ya no puede salir "cuando aparece Cuadro". Nuevo flujo: empezar en "Grupos", cerrar la liguilla, luego cambiar a "Cuadro" y aserción de árbol:

```typescript
  await page.goto(`/admin/torneos/${id}`);
  await page.getByRole('button', { name: 'Generar' }).click();

  await expect(page.getByRole('heading', { name: 'Grupos', exact: true })).toBeVisible();
  await expect(page.getByText('Grupo A')).toBeVisible();

  // Cierra toda la liguilla (12 partidos). Cada Guardar registra un partido del grupo visible.
  for (let guard = 0; guard < 40; guard++) {
    const btn = page.getByRole('button', { name: 'Guardar' }).first();
    if (!(await btn.isVisible().catch(() => false))) break;
    await page.getByLabel('Juegos equipo A').first().fill('6');
    await page.getByLabel('Juegos equipo B').first().fill('3');
    await btn.click();
    await page.waitForTimeout(150);
  }

  // Ya cerrada la liguilla, el conmutador "Cuadro" se habilita → cambiar y ver el árbol.
  const cuadroTab = page.getByRole('button', { name: 'Cuadro' });
  await expect(cuadroTab).toBeEnabled();
  await cuadroTab.click();
  await expect(page.getByText('🔀 Del grupo al cuadro')).toBeVisible();
  await expect(page.getByText('Final', { exact: true })).toBeVisible();
```

> Importante: los `<details>` de partidos en `GroupsTable` empiezan **cerrados** en móvil pero en escritorio (viewport e2e por defecto) `summary` está visible; el `ResultEntry`/"Guardar" vive dentro del `<details>`. Para que Playwright vea el "Guardar", **abre los `<details>` antes del bucle** o renderiza los partidos visibles en escritorio. Añade al inicio del bucle, si hiciera falta, expandir todos los grupos:
> ```typescript
> for (const d of await page.locator('details').all()) { if (!(await d.getAttribute('open'))) await d.locator('summary').click(); }
> ```
> Decide en implementación si abrir `<details>` por defecto en escritorio (mejor UX e2e) o expandir en el test. Mantener la cobertura: liguilla completa → cuadro con "Final" + banda de cruces.

- [ ] **Step 3: `torneo-public.spec.ts`**

`single_elim` público: sin conmutador, encabezado "Cuadro", "Tu próximo partido", 0 "Guardar":

```typescript
  await page.goto(`/torneos/${id}`);
  await expect(page.getByRole('heading', { name: 'E2E Torneo Público' }).first()).toBeVisible();
  await expect(page.getByText('Cuadro').first()).toBeVisible();
  await expect(page.getByText('Tu próximo partido').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar' })).toHaveCount(0);
```

- [ ] **Step 4: Correr los e2e del torneo**

Run: `npx playwright install chromium` (si no está) y luego `npm run e2e -- torneo`
Expected: los 3 specs del torneo en verde.

- [ ] **Step 5: Commit**

```bash
git add e2e/torneo-single-elim.spec.ts e2e/torneo-groups-elim.spec.ts e2e/torneo-public.spec.ts
git commit -m "test(e2e): torneo apunta a la UI nueva (conmutador/árbol/cruces)"
```

---

## Task 9: Verificación final

- [ ] **Step 1: Unit + tipos**

Run: `npx vitest run && npx tsc --noEmit`
Expected: toda la suite unit en verde, 0 errores de tipos.

- [ ] **Step 2: Build de producción local**

Run: `TURSO_DATABASE_URL=file:./build-check.db TURSO_AUTH_TOKEN= AUTH_SECRET=dummy npm run build`
Expected: build OK (Next 16 no corre eslint en build; warnings preexistentes ajenos son aceptables). Borra `build-check.db` al terminar si se creó.

- [ ] **Step 3: e2e completo**

Run: `npm run e2e`
Expected: suite e2e completa en verde (pozo + torneo + públicas).

- [ ] **Step 4: Revisión visual manual (admin + pública, claro y oscuro)**

Montar un torneo `single_elim` (4–8 parejas) y uno `groups_elim` (2 grupos) y comparar la identidad contra `docs/superpowers/specs/assets/2026-06-17-pozo-hifi-dark.html`. Verificar:
- Árbol: rondas en columnas, ganador resaltado en verde y "fluye" a la siguiente, partido en juego con entrada de resultado (solo admin), bye en discontinuo "pasa directo", caja de campeón al cerrar la final, scroll horizontal y auto-centrado en móvil.
- Grupos: tarjetas con clasificados (top-N) en verde + línea de corte, Pts en grande, partidos plegables; conmutador Grupos/Cuadro; banda "🔀 Del grupo al cuadro" con los cruces.
- Pública: solo lectura (sin "Guardar"), pareja del que mira resaltada (subrayado punteado), "Tu próximo partido".

- [ ] **Step 5: Commit final si hubo ajustes**

```bash
git add -A && git commit -m "chore(torneo): ajustes de verificación visual"
```

---

## Self-review (cobertura del spec §6)

- §6.1 Estados/flujo (config→generar→grupos+cuadro→campeón) → Tareas 7 (render según estado) + caja de campeón en Task 3.
- §6.2 Config (una página, formato, parejas) → la elección de formato/grupos vive en `event-form` (creación, no se toca); parejas y "Generar" reutilizan los componentes LPT del Pozo (ya restyle). **Sorteo arrastrable: DIFERIDO** (ver "Alcance de ESTE plan" — requiere extensión del motor + DnD). Decisión a confirmar con el dueño.
- §6.3 Cuadro = árbol clásico (ganador fluye, en vivo con resultado, byes discontinuo, móvil scroll 2 ejes + auto-centra) → Task 3.
- §6.4 Grupos (conmutador, tablas/filas, top-N verde + corte, partidos plegables, banda de cruces) → Tareas 4, 5, 6.
- §6.5 Vista jugador/espectador (solo lectura, pareja resaltada) → Tareas 3/4/6 (`myPairIds`) + Task 7 (pública `editable=false`).
- §7 Extensiones aditivas (etiqueta de siembra/cruce) → Task 2 (`seedLabelByPair`, `teamAId/isBye`).
- §10 Testing → Tareas 1, 2 (unit) + 8, 9 (e2e/build/tsc).
- **Bug conocido (idempotencia del motor)** → Task 1.

**Pendiente explícito (no en este plan, follow-up):** sorteo/siembra arrastrable (`generateTorneo(..., order?: string[])` aditivo + librería DnD); 3er/4º puesto (Fase 2); render híbrido árbol↔stepper en móvil para cuadros de 16+ (mejora futura).
