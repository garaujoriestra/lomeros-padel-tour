# Plan 8 — Constructor de torneos: parrilla + resultados + clasificaciones en vivo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pantalla de parrilla del torneo (`/admin/tournaments/[id]/schedule`) que muestra los partidos por bloque (hora · pista · equipos), permite registrar resultados desde la UI (disparando la progresión ya existente) y muestra las clasificaciones de pozo/grupos y el cuadro en vivo — dejando el torneo jugable de punta a punta.

**Architecture:** Un módulo puro `display.ts` resuelve cada `SlotRef` a texto legible (nombre de jugador / "Ana / Beto" / "1º A" / "BYE") — compartido con la vista pública del Plan 9. La página de parrilla (server component) carga torneo/pistas/bloques/partidos/jugadores/parejas, arma el contexto de nombres y renderiza por bloque la lista de partidos + la clasificación calculada (`getPozoStandings`/`getGroupStandings`, ya existentes). Cada fila de partido es un client component que mete el resultado contra el endpoint del Plan 6 (`POST .../result`) y refresca.

**Tech Stack:** Next.js 16 App Router, Drizzle/libSQL, React 19 client components, shadcn/ui + kit `lpt`, `sonner`, Vitest.

**Alcance (acordado en brainstorming):** parrilla (lectura) + resultados desde UI + clasificaciones/cuadro en vivo. Lista por bloque (no rejilla literal pistas×tiempo; más usable en táctil). **Fuera de este plan:** reasignar partidos (mecanismo "tocar y elegir", sin drag) → Plan 8b; vista pública → Plan 9; edición del cascarón → pendiente.

---

## Contexto del repo (lo construido y los patrones)

- **Datos de partido** (`tournamentMatches`, `@/lib/db/schema`): `id`, `blockId`, `courtId` (FK a `tournamentCourts`, nullable), `round`, `phaseTag` (`'pozo'|'group:A'|'ko:r0'…`), `scheduledStart`/`scheduledEnd` ("HH:MM" o null), `status` (`'pending'|'completed'`), `slotA1/slotA2/slotB1/slotB2` (JSON de `SlotRef` o null), `teamAScore`/`teamBScore` (int o null), `winner` (`'A'|'B'|null`).
- **`SlotRef`** (`@/lib/tournament/types`): `{type:'participant';participantId}` (participantId = **playerId**) | `{type:'pair';pairId}` (pairId = `tournamentPairs.id`) | `{type:'placeholder';desc}` | `{type:'matchWinner';matchId}` | `{type:'matchLoser';matchId}` | `{type:'bye'}`.
- **Clasificaciones** (`@/lib/tournament/results`): `getPozoStandings(db, blockId): Promise<PozoStanding[]>` (`{participantId, games, wins, rank}`; participantId = playerId); `getGroupStandings(db, blockId): Promise<Record<string, GroupStanding[]>>` (`{pairId, played, wins, draws, losses, gamesFor, gamesAgainst, gameDiff, points, rank}`).
- **Endpoint de resultado** (Plan 6): `POST /api/tournaments/[id]/matches/[matchId]/result` con cuerpo `{ teamAScore, teamBScore, winner?: 'A'|'B'|null, setsJson? }`. Hace la progresión (pozo/cuadro/clasificación) en el servidor. Devuelve 400 (validación), 404 (no existe), 409 (slots sin resolver).
- **UI**: páginas server-component con `export const dynamic = 'force-dynamic'` que leen `db`; client components con `'use client'` + `fetch` + `toast` (sonner) + `useRouter().refresh()`. Componentes `@/components/ui/*` (`Button`, `Input`, `Badge`, `Card*`, `Table*`). Clases `sec-title`, `muted`, `text-ink-3`, `bg-surface`. El panel del torneo está en `src/app/admin/tournaments/[id]/page.tsx` (Plan 7).
- **Drizzle helpers**: `eq`, `asc`, `inArray` de `drizzle-orm`.

---

## File Structure

- **Create:** `src/lib/tournament/display.ts` — resolución de slots a texto (puro).
- **Create:** `src/lib/tournament/display.test.ts` — tests.
- **Create:** `src/components/admin/schedule-match.tsx` — fila de partido + entrada de resultado (client).
- **Create:** `src/app/admin/tournaments/[id]/schedule/page.tsx` — parrilla + clasificaciones (server).
- **Modify:** `src/app/admin/tournaments/[id]/page.tsx` — enlace "Ver parrilla".

---

## Task 1: Módulo de display (resolver slots a texto)

**Files:**
- Create: `src/lib/tournament/display.ts`
- Test: `src/lib/tournament/display.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crea `src/lib/tournament/display.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { slotLabel, matchTeamLabels, isMatchPlayable, type DisplayContext } from './display';

const ctx: DisplayContext = {
  playerName: new Map([['p1', 'Ana'], ['p2', 'Beto'], ['p3', 'Caro'], ['p4', 'Dani']]),
  pairLabel: new Map([['pairX', 'Ana / Beto'], ['pairY', 'Caro / Dani']]),
};

describe('slotLabel', () => {
  it('resuelve cada tipo de slot', () => {
    expect(slotLabel({ type: 'participant', participantId: 'p1' }, ctx)).toBe('Ana');
    expect(slotLabel({ type: 'pair', pairId: 'pairX' }, ctx)).toBe('Ana / Beto');
    expect(slotLabel({ type: 'placeholder', desc: '1º A' }, ctx)).toBe('1º A');
    expect(slotLabel({ type: 'matchWinner', matchId: 'm1' }, ctx)).toBe('Ganador (pdte.)');
    expect(slotLabel({ type: 'matchLoser', matchId: 'm1' }, ctx)).toBe('Perdedor (pdte.)');
    expect(slotLabel({ type: 'bye' }, ctx)).toBe('BYE');
    expect(slotLabel(null, ctx)).toBe('Por determinar');
  });

  it('usa marcador — si el id no está en el contexto', () => {
    expect(slotLabel({ type: 'participant', participantId: 'zzz' }, ctx)).toBe('—');
    expect(slotLabel({ type: 'pair', pairId: 'zzz' }, ctx)).toBe('—');
  });
});

describe('matchTeamLabels', () => {
  it('pozo: 4 participantes → "A / B" vs "C / D"', () => {
    const r = matchTeamLabels({
      slotA1: { type: 'participant', participantId: 'p1' },
      slotA2: { type: 'participant', participantId: 'p2' },
      slotB1: { type: 'participant', participantId: 'p3' },
      slotB2: { type: 'participant', participantId: 'p4' },
    }, ctx);
    expect(r).toEqual({ teamA: 'Ana / Beto', teamB: 'Caro / Dani' });
  });

  it('parejas: un slot por lado', () => {
    const r = matchTeamLabels({
      slotA1: { type: 'pair', pairId: 'pairX' }, slotA2: null,
      slotB1: { type: 'pair', pairId: 'pairY' }, slotB2: null,
    }, ctx);
    expect(r).toEqual({ teamA: 'Ana / Beto', teamB: 'Caro / Dani' });
  });
});

describe('isMatchPlayable', () => {
  it('true cuando ambos equipos están resueltos', () => {
    expect(isMatchPlayable({
      slotA1: { type: 'pair', pairId: 'pairX' }, slotA2: null,
      slotB1: { type: 'pair', pairId: 'pairY' }, slotB2: null,
    })).toBe(true);
  });

  it('false con placeholder, matchWinner o null sin resolver', () => {
    expect(isMatchPlayable({
      slotA1: { type: 'placeholder', desc: '1º A' }, slotA2: null,
      slotB1: { type: 'pair', pairId: 'pairY' }, slotB2: null,
    })).toBe(false);
    expect(isMatchPlayable({
      slotA1: null, slotA2: null, slotB1: null, slotB2: null,
    })).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run: `npx vitest run src/lib/tournament/display.test.ts`
Expected: FAIL — `./display` no existe.

- [ ] **Step 3: Crear `src/lib/tournament/display.ts`**

```ts
import type { SlotRef } from './types';

export interface DisplayContext {
  playerName: Map<string, string>;   // playerId -> nombre
  pairLabel: Map<string, string>;    // pairId -> "N1 / N2"
}

export function slotLabel(slot: SlotRef | null, ctx: DisplayContext): string {
  if (!slot) return 'Por determinar';
  switch (slot.type) {
    case 'participant': return ctx.playerName.get(slot.participantId) ?? '—';
    case 'pair': return ctx.pairLabel.get(slot.pairId) ?? '—';
    case 'placeholder': return slot.desc;
    case 'matchWinner': return 'Ganador (pdte.)';
    case 'matchLoser': return 'Perdedor (pdte.)';
    case 'bye': return 'BYE';
  }
}

export interface MatchSlots {
  slotA1: SlotRef | null;
  slotA2: SlotRef | null;
  slotB1: SlotRef | null;
  slotB2: SlotRef | null;
}

export function matchTeamLabels(m: MatchSlots, ctx: DisplayContext): { teamA: string; teamB: string } {
  const side = (s1: SlotRef | null, s2: SlotRef | null) => {
    const a = slotLabel(s1, ctx);
    return s2 ? `${a} / ${slotLabel(s2, ctx)}` : a;
  };
  return { teamA: side(m.slotA1, m.slotA2), teamB: side(m.slotB1, m.slotB2) };
}

// Un partido es jugable (se puede meter resultado) si ambos equipos están resueltos.
// Espeja la regla de recordResult: participant/pair/bye resueltos; placeholder/matchWinner/null no.
export function isMatchPlayable(m: MatchSlots): boolean {
  const resolved = (s: SlotRef | null) => !!s && (s.type === 'participant' || s.type === 'pair' || s.type === 'bye');
  if (!resolved(m.slotA1) || !resolved(m.slotB1)) return false;
  if (m.slotA2 && !resolved(m.slotA2)) return false;
  if (m.slotB2 && !resolved(m.slotB2)) return false;
  return true;
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run: `npx vitest run src/lib/tournament/display.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/display.ts src/lib/tournament/display.test.ts
git commit -m "feat(tournaments): display — resolución de slots a texto"
```

---

## Task 2: Fila de partido + entrada de resultado (client)

**Files:**
- Create: `src/components/admin/schedule-match.tsx`

- [ ] **Step 1: Crear `src/components/admin/schedule-match.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface ScheduleMatchProps {
  tournamentId: string;
  matchId: string;
  time: string | null;
  court: string | null;
  teamA: string;
  teamB: string;
  status: string;
  teamAScore: number | null;
  teamBScore: number | null;
  playable: boolean;
}

export function ScheduleMatch(props: ScheduleMatchProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [winner, setWinner] = useState<'A' | 'B' | ''>('');
  const [loading, setLoading] = useState(false);

  const completed = props.status === 'completed';
  const tie = a !== '' && b !== '' && Number(a) === Number(b);

  async function save() {
    setLoading(true);
    const body: { teamAScore: number; teamBScore: number; winner?: 'A' | 'B' } = {
      teamAScore: Number(a), teamBScore: Number(b),
    };
    if (tie && winner) body.winner = winner;

    const res = await fetch(`/api/tournaments/${props.tournamentId}/matches/${props.matchId}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) { toast.error(data.error || 'Error al guardar el resultado'); return; }
    toast.success('Resultado guardado');
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="border border-line rounded-md px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-ink-3 mr-2">{props.time ?? '—'}{props.court ? ` · ${props.court}` : ''}</span>
          <span className="font-medium">{props.teamA}</span>
          <span className="text-ink-3"> vs </span>
          <span className="font-medium">{props.teamB}</span>
        </div>
        <div className="shrink-0">
          {completed ? (
            <Badge variant="outline">{props.teamAScore}–{props.teamBScore}</Badge>
          ) : props.playable ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
              {editing ? 'Cerrar' : 'Resultado'}
            </Button>
          ) : (
            <span className="text-ink-3 text-xs">Pendiente</span>
          )}
        </div>
      </div>

      {editing && !completed && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input type="number" value={a} onChange={(e) => setA(e.target.value)} placeholder="A" className="w-16 h-9" aria-label="Marcador equipo A" />
          <span className="text-ink-3">–</span>
          <Input type="number" value={b} onChange={(e) => setB(e.target.value)} placeholder="B" className="w-16 h-9" aria-label="Marcador equipo B" />
          {tie && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-ink-3">Gana:</span>
              <button type="button" onClick={() => setWinner('A')} className={winner === 'A' ? 'font-bold underline' : ''}>A</button>
              <button type="button" onClick={() => setWinner('B')} className={winner === 'B' ? 'font-bold underline' : ''}>B</button>
            </div>
          )}
          <Button type="button" size="sm" onClick={save} disabled={loading || a === '' || b === ''} className="min-h-[36px]">
            {loading ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos y lint**

Run: `npx tsc --noEmit && npx eslint src/components/admin/schedule-match.tsx`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/schedule-match.tsx
git commit -m "feat(tournaments): fila de partido con entrada de resultado"
```

---

## Task 3: Página de parrilla + clasificaciones + enlace desde el panel

**Files:**
- Create: `src/app/admin/tournaments/[id]/schedule/page.tsx`
- Modify: `src/app/admin/tournaments/[id]/page.tsx`

- [ ] **Step 1: Crear `src/app/admin/tournaments/[id]/schedule/page.tsx`**

```tsx
import { db } from '@/lib/db';
import {
  tournaments, tournamentCourts, tournamentBlocks, tournamentParticipants,
  tournamentPairs, tournamentMatches, players,
} from '@/lib/db/schema';
import { asc, eq, inArray } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ScheduleMatch } from '@/components/admin/schedule-match';
import { matchTeamLabels, isMatchPlayable, type DisplayContext } from '@/lib/tournament/display';
import { getPozoStandings, getGroupStandings } from '@/lib/tournament/results';
import type { SlotRef } from '@/lib/tournament/types';

export const dynamic = 'force-dynamic';

const parse = (s: string | null): SlotRef | null => (s ? (JSON.parse(s) as SlotRef) : null);

export default async function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="sec-title">Parrilla · {tournament.name}</h1>
          <p className="muted text-sm mt-1.5">{tournament.date}</p>
        </div>
        <Link href={`/admin/tournaments/${id}`} className="lpt-btn" style={{ minHeight: 38, padding: '7px 13px', fontSize: 12.5 }}>
          ← Panel
        </Link>
      </div>

      {allMatches.length === 0 ? (
        <p className="text-sm text-ink-3">Aún no hay parrilla. Genera los partidos desde el panel.</p>
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
                    return (
                      <ScheduleMatch
                        key={m.id}
                        tournamentId={id}
                        matchId={m.id}
                        time={m.scheduledStart}
                        court={m.courtId ? (courtLabel.get(m.courtId) ?? null) : null}
                        teamA={teamA}
                        teamB={teamB}
                        status={m.status}
                        teamAScore={m.teamAScore}
                        teamBScore={m.teamBScore}
                        playable={isMatchPlayable(slots)}
                      />
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

async function PozoStandings({ blockId, playerName }: { blockId: string; playerName: Map<string, string> }) {
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

async function GroupStandingsTables({ blockId, pairLabel }: { blockId: string; pairLabel: Map<string, string> }) {
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

- [ ] **Step 2: Enlazar "Ver parrilla" desde el panel**

En `src/app/admin/tournaments/[id]/page.tsx`, dentro del `<div className="flex gap-2 shrink-0">` de la cabecera (donde están "Editar bloques" y `GenerateButton`), añade tras el `GenerateButton` un enlace que aparece cuando el torneo ya no es borrador:

```tsx
          {tournament.status !== 'draft' && (
            <Link href={`/admin/tournaments/${id}/schedule`} className="lpt-btn primary" style={{ minHeight: 38, padding: '7px 13px', fontSize: 12.5 }}>
              Ver parrilla
            </Link>
          )}
```

> `Link` ya está importado en ese fichero.

- [ ] **Step 3: Verificar tipos y lint**

Run: `npx tsc --noEmit && npx eslint "src/app/admin/tournaments/[id]/schedule/page.tsx" "src/app/admin/tournaments/[id]/page.tsx"`
Expected: sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add "src/app/admin/tournaments/[id]/schedule/page.tsx" "src/app/admin/tournaments/[id]/page.tsx"
git commit -m "feat(tournaments): parrilla con resultados y clasificaciones en vivo + enlace en panel"
```

---

## Task 4: Verificación final del plan

- [ ] **Step 1: Suite completa de tournament**

Run: `npx vitest run src/lib/tournament`
Expected: PASS — incluye `display` (6) y todo lo anterior.

- [ ] **Step 2: Tipos**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Lint de todo lo tocado**

Run: `npx eslint src/lib/tournament src/app/admin/tournaments src/components/admin`
Expected: sin errores.

---

## Self-review (cubierto vs. alcance acordado)

- **Parrilla por bloque (hora · pista · equipos)**: `SchedulePage` + `matchTeamLabels` (Tasks 1, 3). ✓
- **Resolución de slots a nombres** (compartible con Plan 9): `display.ts` (Task 1). ✓
- **Entrada de resultados desde UI** (endpoint Plan 6 + progresión server): `ScheduleMatch` (Task 2). ✓
- **Partidos no jugables deshabilitados** (placeholder/matchWinner sin resolver): `isMatchPlayable` (Tasks 1, 3). ✓
- **Clasificaciones en vivo** (pozo + grupos): `PozoStandings`/`GroupStandingsTables` con `getPozoStandings`/`getGroupStandings` (Task 3). ✓
- **Cuadro en vivo**: los partidos KO se listan por ronda dentro del bloque (ordenados por `round`); los nombres se resuelven conforme la progresión rellena los slots (Task 3). ✓
- **Enlace desde el panel**: Task 3. ✓

**Fuera de este plan:** Plan 8b = reasignar partidos ("tocar y elegir": tocar un partido → elegir pista + hueco; endpoint de reasignación + revalidación de conflictos). Plan 9 = vista pública `/tournaments/[id]` (reutiliza `display.ts` + las clasificaciones). UI de edición del cascarón sigue pendiente. **Despliegue:** `POST /api/migrate-tournaments` en prod si no se hizo.
