# Pozo 2c — API HTTP + UI admin + vista pública + e2e

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar al pozo (ambas variantes) su UI y API completas: definir parejas, generar, registrar resultados, ver parrilla pista×ronda y clasificación por escalera en admin, y una vista pública de solo lectura con "tu próximo partido". Todo cubierto por e2e Playwright.

**Architecture:** La lógica/persistencia vive ya tras la fachada `pozo-engine.ts` (Plan 2b-2). Este plan añade: (1) endpoints `POST .../generate` y `POST .../matches/[matchId]/result`; (2) un view-model puro `pozo-view.ts` (contexto de nombres + rejilla pista×ronda) reutilizable por admin y pública; (3) componentes cliente para las mutaciones (`PairsEditor`, `GenerateButton`, `ResultEntry`) y componentes server de presentación (`PozoGrid`, `PozoStandings`, `NextMatchCard`); (4) páginas de detalle **por tipo** (`/admin/pozos/[id]`, `/admin/torneos/[id]`) que comparten `<EventPanel>`, retirando `/admin/tournaments/[id]`; (5) vista pública `/(public)/pozos/[id]`.

**Tech Stack:** Next.js App Router (server components + client islands), Drizzle (libSQL), Playwright. Helpers de presentación ya existentes en `src/lib/tournament/display.ts` (`slotLabel`, `matchTeamLabels`, `isMatchPlayable`, `involvesPlayer`, `nextMatchForPlayer`). UI: `@/components/ui/{button,input,label}`.

**Depende de:** Plan 2b-2 (fachada `pozo-engine`, `pair-store`, `validatePairsInput`, endpoint `PUT .../pairs`), ya hecho en esta rama.

---

## File Structure

- **Crear** `src/lib/tournament/pozo-view.ts` — view-model puro (contexto de display + rejilla + etiquetas de clasificación).
- **Crear** `src/lib/tournament/pozo-view.test.ts` — unit del view-model.
- **Crear** `src/app/api/tournaments/[id]/generate/route.ts` — `POST` generar.
- **Crear** `src/app/api/tournaments/[id]/matches/[matchId]/result/route.ts` — `POST` resultado.
- **Crear** `src/components/admin/pairs-editor.tsx` — editor de parejas (cliente).
- **Crear** `src/components/admin/generate-button.tsx` — botón generar (cliente).
- **Crear** `src/components/tournament/result-entry.tsx` — entrada de resultado por partido (cliente).
- **Crear** `src/components/tournament/pozo-grid.tsx` — parrilla pista×ronda (server; admin añade `ResultEntry`).
- **Crear** `src/components/tournament/pozo-standings.tsx` — clasificación por escalera (server).
- **Crear** `src/components/tournament/next-match-card.tsx` — "tu próximo partido" (server).
- **Crear** `src/components/admin/event-panel.tsx` — panel de detalle admin compartido pozo/torneo (server).
- **Crear** `src/app/admin/pozos/[id]/page.tsx` — detalle de pozo.
- **Crear** `src/app/admin/torneos/[id]/page.tsx` — detalle de torneo (placeholder de torneo + reusa panel).
- **Borrar** `src/app/admin/tournaments/[id]/page.tsx` y su carpeta.
- **Modificar** `src/app/admin/pozos/page.tsx` y `src/app/admin/torneos/page.tsx` — enlaces de listado a las rutas por tipo.
- **Crear** `src/app/(public)/pozos/[id]/page.tsx` — vista pública del pozo.
- **Crear** `e2e/pozo-fixed-pairs.spec.ts`, `e2e/pozo-americano.spec.ts`, `e2e/pozo-public.spec.ts`.

Referencias (leer antes): `src/components/admin/event-form.tsx` (convenciones de componente cliente + fetch + `router`), `src/app/admin/pozos/page.tsx` (listado actual), `src/app/admin/tournaments/[id]/page.tsx` (stub a sustituir), `e2e/event-create.spec.ts` + `e2e/global-setup.ts` (infra e2e: `pl1..pl8` = "Jugador 1..8", auth admin/player forjada).

---

## Task 1: View-model puro de la parrilla (`pozo-view.ts`)

**Files:**
- Create: `src/lib/tournament/pozo-view.ts`
- Test: `src/lib/tournament/pozo-view.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/tournament/pozo-view.test.ts
import { describe, it, expect } from 'vitest';
import { buildDisplayContext, buildPozoGrid, standingLabel } from './pozo-view';
import type { PozoMatchRow } from './pozo-run';

function row(partial: Partial<PozoMatchRow>): PozoMatchRow {
  return {
    id: 'm', round: 0, phaseTag: 'pozo', status: 'pending', courtId: 'c1',
    scheduledStart: '17:00', scheduledEnd: '17:15',
    slotA1: null, slotA2: null, slotB1: null, slotB2: null,
    teamAScore: null, teamBScore: null, winner: null, ...partial,
  };
}
const part = (id: string) => JSON.stringify({ type: 'participant', participantId: id });
const pair = (id: string) => JSON.stringify({ type: 'pair', pairId: id });

describe('buildDisplayContext', () => {
  it('mapea nombres de jugador y etiqueta de pareja', () => {
    const ctx = buildDisplayContext(
      [{ id: 'p1', name: 'Ana' }, { id: 'p2', name: 'Luis' }],
      [{ id: 'pr1', player1Id: 'p1', player2Id: 'p2' }],
    );
    expect(ctx.playerName.get('p1')).toBe('Ana');
    expect(ctx.pairLabel.get('pr1')).toBe('Ana / Luis');
  });
});

describe('buildPozoGrid', () => {
  const ctx = buildDisplayContext(
    [{ id: 'p1', name: 'Ana' }, { id: 'p2', name: 'Luis' }, { id: 'p3', name: 'Eva' }, { id: 'p4', name: 'Jon' }],
    [],
  );
  it('coloca cada partido en su fila (pista) y columna (ronda) y etiqueta los equipos', () => {
    const matches: PozoMatchRow[] = [
      row({ id: 'a', round: 0, courtId: 'c1', slotA1: part('p1'), slotA2: part('p2'), slotB1: part('p3'), slotB2: part('p4') }),
      row({ id: 'b', round: 1, courtId: 'c1', status: 'pending', slotA1: part('p1'), slotA2: part('p2'), slotB1: part('p3'), slotB2: part('p4') }),
    ];
    const grid = buildPozoGrid(matches, [{ id: 'c1', label: 'Central' }, { id: 'c2', label: 'Pista 2' }], ctx);
    expect(grid.rounds).toEqual([0, 1]);
    expect(grid.rows.length).toBe(2);
    const c1 = grid.rows.find((r) => r.court.id === 'c1')!;
    expect(c1.cells[0]?.teamA).toBe('Ana / Luis');
    expect(c1.cells[0]?.playable).toBe(true);
    expect(c1.cells[1]?.matchId).toBe('b');
    const c2 = grid.rows.find((r) => r.court.id === 'c2')!;
    expect(c2.cells[0]).toBeNull(); // c2 no tiene partido en la ronda 0
  });
});

describe('standingLabel', () => {
  it('usa nombre de jugador o etiqueta de pareja según el id', () => {
    const ctx = buildDisplayContext(
      [{ id: 'p1', name: 'Ana' }, { id: 'p2', name: 'Luis' }],
      [{ id: 'pr1', player1Id: 'p1', player2Id: 'p2' }],
    );
    expect(standingLabel('p1', ctx)).toBe('Ana');
    expect(standingLabel('pr1', ctx)).toBe('Ana / Luis');
    expect(standingLabel('zzz', ctx)).toBe('—');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tournament/pozo-view.test.ts`
Expected: FAIL — módulo `pozo-view` no existe.

- [ ] **Step 3: Write implementation**

```ts
// src/lib/tournament/pozo-view.ts
import type { PozoMatchRow } from './pozo-run';
import { matchTeamLabels, isMatchPlayable, type DisplayContext, type MatchSlots } from './display';
import type { SlotRef } from './types';

function parseSlot(s: string | null): SlotRef | null {
  if (!s) return null;
  try { return JSON.parse(s) as SlotRef; } catch { return null; }
}
export function matchSlots(m: PozoMatchRow): MatchSlots {
  return {
    slotA1: parseSlot(m.slotA1), slotA2: parseSlot(m.slotA2),
    slotB1: parseSlot(m.slotB1), slotB2: parseSlot(m.slotB2),
  };
}

export function buildDisplayContext(
  players: { id: string; name: string }[],
  pairs: { id: string; player1Id: string; player2Id: string }[],
): DisplayContext {
  const playerName = new Map(players.map((p) => [p.id, p.name]));
  const pairLabel = new Map(pairs.map((pr) =>
    [pr.id, `${playerName.get(pr.player1Id) ?? '—'} / ${playerName.get(pr.player2Id) ?? '—'}`] as const));
  return { playerName, pairLabel };
}

export interface GridCell {
  matchId: string; round: number; courtId: string | null; scheduledStart: string | null;
  teamA: string; teamB: string;
  teamAScore: number | null; teamBScore: number | null;
  winner: string | null; status: string; playable: boolean;
}
export interface PozoGridView {
  rounds: number[];
  rows: { court: { id: string; label: string }; cells: (GridCell | null)[] }[];
}

export function buildPozoGrid(
  matches: PozoMatchRow[],
  courtsByOrder: { id: string; label: string }[],
  ctx: DisplayContext,
): PozoGridView {
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  const toCell = (m: PozoMatchRow): GridCell => {
    const ms = matchSlots(m);
    const { teamA, teamB } = matchTeamLabels(ms, ctx);
    return {
      matchId: m.id, round: m.round, courtId: m.courtId, scheduledStart: m.scheduledStart,
      teamA, teamB, teamAScore: m.teamAScore, teamBScore: m.teamBScore,
      winner: m.winner, status: m.status, playable: isMatchPlayable(ms),
    };
  };
  const rows = courtsByOrder.map((court) => ({
    court,
    cells: rounds.map((r) => {
      const m = matches.find((mm) => mm.courtId === court.id && mm.round === r);
      return m ? toCell(m) : null;
    }),
  }));
  return { rounds, rows };
}

// La clasificación usa entityId que puede ser playerId (americano) o pairId (parejas fijas).
export function standingLabel(entityId: string, ctx: DisplayContext): string {
  return ctx.playerName.get(entityId) ?? ctx.pairLabel.get(entityId) ?? '—';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tournament/pozo-view.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tournament/pozo-view.ts src/lib/tournament/pozo-view.test.ts
git commit -m "feat(pozo): view-model puro de parrilla (contexto de display + rejilla + etiquetas)"
```

---

## Task 2: Endpoint `POST .../generate`

**Files:**
- Create: `src/app/api/tournaments/[id]/generate/route.ts`

- [ ] **Step 1: Write the route**

```ts
// src/app/api/tournaments/[id]/generate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/guard';
import { loadEvent } from '@/lib/tournament/event-store';
import { generatePozo } from '@/lib/tournament/pozo-engine';

// POST /api/tournaments/[id]/generate — genera la ronda 0 del pozo (admin). Body: { seed?: number }.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  const { id } = await params;
  try {
    const ev = await loadEvent(db, id);
    if (ev.kind !== 'pozo') return NextResponse.json({ error: 'Solo se puede generar un pozo aquí' }, { status: 400 });
    if (ev.status !== 'draft') return NextResponse.json({ error: 'El pozo ya está generado' }, { status: 409 });

    const body = await request.json().catch(() => ({}));
    const seed = typeof body.seed === 'number' ? body.seed : Math.floor(Math.random() * 0x7fffffff);
    await generatePozo(db, id, seed);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 });
    }
    if (error instanceof Error && error.message === 'NO_PAIRS') {
      return NextResponse.json({ error: 'Define las parejas antes de generar' }, { status: 400 });
    }
    if (error instanceof Error && error.message === 'UNBALANCED_PAIRS') {
      return NextResponse.json({ error: 'Demasiadas parejas para las pistas: como mucho pueden descansar 2 (una pista). Añade pistas o quita parejas.' }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: 'Error al generar' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tournaments/[id]/generate/route.ts
git commit -m "feat(pozo): POST /api/tournaments/[id]/generate (admin, dispatch por formato)"
```

---

## Task 3: Endpoint `POST .../matches/[matchId]/result`

**Files:**
- Create: `src/app/api/tournaments/[id]/matches/[matchId]/result/route.ts`

- [ ] **Step 1: Write the route**

```ts
// src/app/api/tournaments/[id]/matches/[matchId]/result/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth/guard';
import { recordPozoResult } from '@/lib/tournament/pozo-engine';

// POST /api/tournaments/[id]/matches/[matchId]/result — registra marcador (admin). Body: { gamesA, gamesB }.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; matchId: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  const { matchId } = await params;
  try {
    const body = await request.json();
    const gamesA = body?.gamesA;
    const gamesB = body?.gamesB;
    if (!Number.isInteger(gamesA) || !Number.isInteger(gamesB) || gamesA < 0 || gamesB < 0) {
      return NextResponse.json({ error: 'Marcador inválido' }, { status: 400 });
    }
    await recordPozoResult(db, matchId, gamesA, gamesB);
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

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/tournaments/[id]/matches/[matchId]/result/route.ts"
git commit -m "feat(pozo): POST .../matches/[matchId]/result (admin, registra y avanza)"
```

---

## Task 4: Componente `ResultEntry` (cliente)

**Files:**
- Create: `src/components/tournament/result-entry.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/tournament/result-entry.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface Props {
  tournamentId: string;
  matchId: string;
  initialA: number | null;
  initialB: number | null;
  disabled?: boolean;
}

export function ResultEntry({ tournamentId, matchId, initialA, initialB, disabled }: Props) {
  const router = useRouter();
  const [a, setA] = useState(initialA ?? 0);
  const [b, setB] = useState(initialB ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true); setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/matches/${matchId}/result`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gamesA: a, gamesB: b }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error || 'Error'); setSaving(false); return; }
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input aria-label="Juegos equipo A" type="number" min={0} value={a}
        onChange={(e) => setA(Number(e.target.value))} disabled={disabled || saving} className="w-14" />
      <span className="text-ink-3">–</span>
      <Input aria-label="Juegos equipo B" type="number" min={0} value={b}
        onChange={(e) => setB(Number(e.target.value))} disabled={disabled || saving} className="w-14" />
      <Button size="sm" onClick={save} disabled={disabled || saving}>{saving ? '...' : 'Guardar'}</Button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: OK (componente sin usar todavía; el build solo verifica tipos/sintaxis).

- [ ] **Step 3: Commit**

```bash
git add src/components/tournament/result-entry.tsx
git commit -m "feat(pozo): componente ResultEntry (marcador por partido)"
```

---

## Task 5: Componente `GenerateButton` (cliente)

**Files:**
- Create: `src/components/admin/generate-button.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/admin/generate-button.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

interface Props { tournamentId: string; disabled?: boolean; disabledReason?: string }

export function GenerateButton({ tournamentId, disabled, disabledReason }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true); setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error || 'Error'); setLoading(false); return; }
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="space-y-1">
      <Button onClick={generate} disabled={disabled || loading}>{loading ? 'Generando...' : 'Generar'}</Button>
      {disabled && disabledReason && <p className="text-xs text-ink-3">{disabledReason}</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/generate-button.tsx
git commit -m "feat(pozo): componente GenerateButton"
```

---

## Task 6: Componente `PairsEditor` (cliente)

**Files:**
- Create: `src/components/admin/pairs-editor.tsx`

UX dirigible por e2e: dos `<select>` (jugador A / jugador B) sobre los participantes sin emparejar + "Añadir pareja"; lista de parejas formadas con "Quitar"; "Guardar parejas" hace `PUT`.

- [ ] **Step 1: Write the component**

```tsx
// src/components/admin/pairs-editor.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface Participant { id: string; name: string }
interface Props {
  tournamentId: string;
  participants: Participant[];
  initialPairs: [string, string][];
}

export function PairsEditor({ tournamentId, participants, initialPairs }: Props) {
  const router = useRouter();
  const [pairs, setPairs] = useState<[string, string][]>(initialPairs);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const nameOf = (id: string) => participants.find((p) => p.id === id)?.name ?? id;
  const pairedIds = new Set(pairs.flat());
  const available = participants.filter((p) => !pairedIds.has(p.id));

  function addPair() {
    if (!a || !b || a === b) return;
    setPairs((ps) => [...ps, [a, b]]);
    setA(''); setB(''); setSaved(false);
  }
  function removePair(i: number) {
    setPairs((ps) => ps.filter((_, j) => j !== i)); setSaved(false);
  }

  async function save() {
    setSaving(true); setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/pairs`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairs }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error || 'Error'); setSaving(false); return; }
    setSaving(false); setSaved(true);
    router.refresh();
  }

  return (
    <div className="space-y-3 max-w-xl border border-line rounded-md p-3">
      <p className="font-medium">Definir parejas</p>
      <ul className="space-y-1">
        {pairs.map((pr, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span>{nameOf(pr[0])} + {nameOf(pr[1])}</span>
            <button type="button" aria-label={`Quitar pareja ${i + 1}`} className="text-red-500"
              onClick={() => removePair(i)}>✕</button>
          </li>
        ))}
        {pairs.length === 0 && <li className="text-sm text-ink-3">Aún no hay parejas.</li>}
      </ul>

      {available.length >= 2 && (
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-xs">Jugador A</Label>
            <select aria-label="Jugador A" value={a} onChange={(e) => setA(e.target.value)}
              className="border border-line rounded-md px-2 py-1.5 block">
              <option value="">—</option>
              {available.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-xs">Jugador B</Label>
            <select aria-label="Jugador B" value={b} onChange={(e) => setB(e.target.value)}
              className="border border-line rounded-md px-2 py-1.5 block">
              <option value="">—</option>
              {available.filter((p) => p.id !== a).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addPair}>Añadir pareja</Button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar parejas'}</Button>
        {saved && <span className="text-sm text-green-600">Guardado ✓</span>}
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/pairs-editor.tsx
git commit -m "feat(pozo): componente PairsEditor (definir parejas fijas)"
```

---

## Task 7: Componentes de presentación `PozoGrid` y `PozoStandings` (server)

**Files:**
- Create: `src/components/tournament/pozo-grid.tsx`
- Create: `src/components/tournament/pozo-standings.tsx`

- [ ] **Step 1: Write `PozoGrid`**

```tsx
// src/components/tournament/pozo-grid.tsx
import type { PozoGridView } from '@/lib/tournament/pozo-view';
import { ResultEntry } from './result-entry';

interface Props {
  tournamentId: string;
  grid: PozoGridView;
  editable: boolean; // admin = true; pública = false
}

export function PozoGrid({ tournamentId, grid, editable }: Props) {
  if (grid.rounds.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="text-sm border-collapse">
        <thead>
          <tr>
            <th className="text-left p-2">Pista (escalera)</th>
            {grid.rounds.map((r) => <th key={r} className="text-left p-2">Ronda {r + 1}</th>)}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map(({ court, cells }, idx) => (
            <tr key={court.id} className="border-t border-line">
              <td className="p-2 font-medium whitespace-nowrap">{idx === 0 ? '👑 ' : ''}{court.label}</td>
              {cells.map((cell, j) => (
                <td key={j} className="p-2 align-top">
                  {!cell ? <span className="text-ink-3">—</span> : (
                    <div className="space-y-1">
                      <div className="text-xs text-ink-3">{cell.scheduledStart ?? ''}</div>
                      <div className={cell.winner === 'A' ? 'font-semibold' : ''}>{cell.teamA}</div>
                      <div className={cell.winner === 'B' ? 'font-semibold' : ''}>{cell.teamB}</div>
                      {cell.status === 'completed' ? (
                        <div className="text-xs">{cell.teamAScore}–{cell.teamBScore}</div>
                      ) : editable && cell.playable ? (
                        <ResultEntry tournamentId={tournamentId} matchId={cell.matchId}
                          initialA={cell.teamAScore} initialB={cell.teamBScore} />
                      ) : (
                        <div className="text-xs text-ink-3">Pendiente</div>
                      )}
                    </div>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Write `PozoStandings`**

```tsx
// src/components/tournament/pozo-standings.tsx
import type { LadderStanding } from '@/lib/tournament/ladder';
import type { DisplayContext } from '@/lib/tournament/display';
import { standingLabel } from '@/lib/tournament/pozo-view';

interface Props {
  standings: LadderStanding[];
  courtsByOrder: { id: string; label: string }[];
  ctx: DisplayContext;
}

export function PozoStandings({ standings, courtsByOrder, ctx }: Props) {
  if (standings.length === 0) return null;
  const courtLabel = (court: number | null) =>
    court === null ? 'Descansa' : (courtsByOrder[court]?.label ?? `Pista ${court + 1}`);
  return (
    <table className="text-sm w-full max-w-md">
      <thead>
        <tr className="text-left text-ink-3">
          <th className="p-1.5">#</th><th className="p-1.5">Participante</th><th className="p-1.5">Pista</th>
        </tr>
      </thead>
      <tbody>
        {standings.map((s) => (
          <tr key={s.entityId} className="border-t border-line">
            <td className="p-1.5">{s.rank}</td>
            <td className="p-1.5">{standingLabel(s.entityId, ctx)}</td>
            <td className="p-1.5">{s.rank === 1 ? '👑 ' : ''}{courtLabel(s.court)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 4: Commit**

```bash
git add src/components/tournament/pozo-grid.tsx src/components/tournament/pozo-standings.tsx
git commit -m "feat(pozo): presentación de parrilla y clasificación por escalera"
```

---

## Task 8: `NextMatchCard` (server)

**Files:**
- Create: `src/components/tournament/next-match-card.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/tournament/next-match-card.tsx
import type { PozoMatchRow } from '@/lib/tournament/pozo-run';
import type { DisplayContext } from '@/lib/tournament/display';
import { matchTeamLabels, nextMatchForPlayer, type PlayerScheduleMatch } from '@/lib/tournament/display';
import { matchSlots } from '@/lib/tournament/pozo-view';

interface Props {
  matches: PozoMatchRow[];
  playerId: string;
  myPairIds: string[];
  courtLabelById: Map<string, string>;
  ctx: DisplayContext;
}

export function NextMatchCard({ matches, playerId, myPairIds, courtLabelById, ctx }: Props) {
  const scheduleMatches: (PlayerScheduleMatch & { id: string; courtId: string | null })[] = matches.map((m) => ({
    ...matchSlots(m), scheduledStart: m.scheduledStart, status: m.status, id: m.id, courtId: m.courtId,
  }));
  const next = nextMatchForPlayer(scheduleMatches, playerId, new Set(myPairIds));
  if (!next) return null;
  const { teamA, teamB } = matchTeamLabels(next, ctx);
  const court = next.courtId ? (courtLabelById.get(next.courtId) ?? '') : '';
  return (
    <div className="border border-line rounded-md p-3 bg-surface">
      <p className="font-medium">Tu próximo partido</p>
      <p className="text-sm">{teamA} vs {teamB}</p>
      <p className="text-xs text-ink-3">{court}{next.scheduledStart ? ` · ${next.scheduledStart}` : ''}</p>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 3: Commit**

```bash
git add src/components/tournament/next-match-card.tsx
git commit -m "feat(pozo): NextMatchCard (tu próximo partido)"
```

---

## Task 9: Panel de detalle compartido + rutas por tipo

**Files:**
- Create: `src/components/admin/event-panel.tsx`
- Create: `src/app/admin/pozos/[id]/page.tsx`
- Create: `src/app/admin/torneos/[id]/page.tsx`
- Delete: `src/app/admin/tournaments/[id]/page.tsx` (y la carpeta `[id]`)
- Modify: `src/app/admin/pozos/page.tsx`, `src/app/admin/torneos/page.tsx`

- [ ] **Step 1: Write the shared `EventPanel`**

```tsx
// src/components/admin/event-panel.tsx
import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { inArray } from 'drizzle-orm';
import { loadEvent } from '@/lib/tournament/event-store';
import { loadPairs } from '@/lib/tournament/pair-store';
import { listPozoMatches, pozoStandingsLive } from '@/lib/tournament/pozo-engine';
import { buildDisplayContext, buildPozoGrid } from '@/lib/tournament/pozo-view';
import { PairsEditor } from './pairs-editor';
import { GenerateButton } from './generate-button';
import { PozoGrid } from '@/components/tournament/pozo-grid';
import { PozoStandings } from '@/components/tournament/pozo-standings';

export async function EventPanel({ id }: { id: string }) {
  const ev = await loadEvent(db, id);
  const roster = ev.participantPlayerIds.length
    ? await db.select({ id: players.id, name: players.name }).from(players).where(inArray(players.id, ev.participantPlayerIds))
    : [];
  const pairs = await loadPairs(db, id);
  const ctx = buildDisplayContext(roster, pairs);
  const courtsByOrder = ev.courts.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((c) => ({ id: c.id, label: c.label }));

  const isPozo = ev.kind === 'pozo';
  const isDraft = ev.status === 'draft';
  const needsPairs = isPozo && ev.format === 'fixed_pairs';
  const pairsComplete = pairs.length > 0 && pairs.length * 2 === ev.participantPlayerIds.length;

  const matches = ev.status !== 'draft' ? await listPozoMatches(db, id) : [];
  const standings = ev.status !== 'draft' ? await pozoStandingsLive(db, id) : [];
  const grid = buildPozoGrid(matches, courtsByOrder, ctx);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="sec-title">{ev.name}</h1>
        <p className="muted text-sm mt-1">
          {ev.date}{ev.location ? ` · ${ev.location}` : ''} · {isPozo ? 'Pozo' : 'Torneo'} · {ev.format}
        </p>
      </div>

      <div className="text-sm">
        <p className="font-medium">Pistas (escalera):</p>
        <ol className="list-decimal ml-5">
          {courtsByOrder.map((c) => <li key={c.id}>{c.label}</li>)}
        </ol>
        <p className="font-medium mt-2">Participantes: {ev.participantPlayerIds.length}</p>
      </div>

      {!isPozo && (
        <p className="text-ink-3 text-sm">La UI del torneo llega en la siguiente tanda.</p>
      )}

      {isPozo && isDraft && (
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

      {isPozo && !isDraft && (
        <div className="space-y-6">
          <section>
            <h2 className="font-medium mb-2">Parrilla</h2>
            <PozoGrid tournamentId={id} grid={grid} editable />
          </section>
          <section>
            <h2 className="font-medium mb-2">Clasificación</h2>
            <PozoStandings standings={standings} courtsByOrder={courtsByOrder} ctx={ctx} />
          </section>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write the per-type detail pages**

```tsx
// src/app/admin/pozos/[id]/page.tsx
import { db } from '@/lib/db';
import { loadEvent } from '@/lib/tournament/event-store';
import { notFound } from 'next/navigation';
import { EventPanel } from '@/components/admin/event-panel';

export const dynamic = 'force-dynamic';

export default async function PozoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const ev = await loadEvent(db, id);
    if (ev.kind !== 'pozo') notFound();
  } catch { notFound(); }
  return <EventPanel id={id} />;
}
```

```tsx
// src/app/admin/torneos/[id]/page.tsx
import { db } from '@/lib/db';
import { loadEvent } from '@/lib/tournament/event-store';
import { notFound } from 'next/navigation';
import { EventPanel } from '@/components/admin/event-panel';

export const dynamic = 'force-dynamic';

export default async function TorneoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const ev = await loadEvent(db, id);
    if (ev.kind !== 'torneo') notFound();
  } catch { notFound(); }
  return <EventPanel id={id} />;
}
```

- [ ] **Step 3: Delete the old unified detail route**

Run: `git rm -r "src/app/admin/tournaments/[id]"`
Expected: borra `src/app/admin/tournaments/[id]/page.tsx`.

- [ ] **Step 4: Update list links to per-type detail**

En `src/app/admin/pozos/page.tsx`, cambia el enlace del listado:

```tsx
              <Link href={`/admin/pozos/${p.id}`} className="block border border-line rounded-md px-3 py-2 hover:bg-surface">
```

En `src/app/admin/torneos/page.tsx`, cambia análogamente el enlace a:

```tsx
              <Link href={`/admin/torneos/${p.id}`} className="block border border-line rounded-md px-3 py-2 hover:bg-surface">
```

> Verifica que ninguna otra referencia apunta a `/admin/tournaments/`:
> Run: `grep -rn "admin/tournaments/" src/` → no debe devolver nada.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: OK; no quedan referencias a la ruta borrada.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(pozo): panel de detalle compartido + rutas /admin/pozos|torneos/[id] (retira /admin/tournaments/[id])"
```

---

## Task 10: Vista pública `/(public)/pozos/[id]`

**Files:**
- Create: `src/app/(public)/pozos/[id]/page.tsx`

- [ ] **Step 1: Write the public page**

```tsx
// src/app/(public)/pozos/[id]/page.tsx
import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { inArray } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { loadEvent } from '@/lib/tournament/event-store';
import { loadPairs } from '@/lib/tournament/pair-store';
import { listPozoMatches, pozoStandingsLive } from '@/lib/tournament/pozo-engine';
import { buildDisplayContext, buildPozoGrid } from '@/lib/tournament/pozo-view';
import { getSession } from '@/lib/auth/session';
import { PozoGrid } from '@/components/tournament/pozo-grid';
import { PozoStandings } from '@/components/tournament/pozo-standings';
import { NextMatchCard } from '@/components/tournament/next-match-card';

export const dynamic = 'force-dynamic';

export default async function PublicPozoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let ev;
  try { ev = await loadEvent(db, id); } catch { notFound(); }
  if (ev.kind !== 'pozo') notFound();

  const roster = ev.participantPlayerIds.length
    ? await db.select({ id: players.id, name: players.name }).from(players).where(inArray(players.id, ev.participantPlayerIds))
    : [];
  const pairs = await loadPairs(db, id);
  const ctx = buildDisplayContext(roster, pairs);
  const courtsByOrder = ev.courts.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((c) => ({ id: c.id, label: c.label }));
  const courtLabelById = new Map(courtsByOrder.map((c) => [c.id, c.label]));

  const matches = ev.status !== 'draft' ? await listPozoMatches(db, id) : [];
  const standings = ev.status !== 'draft' ? await pozoStandingsLive(db, id) : [];
  const grid = buildPozoGrid(matches, courtsByOrder, ctx);

  // "Tu próximo partido" para el jugador logueado, si participa.
  const session = await getSession();
  const myPlayerId = session?.player?.id ?? null;
  const myPairIds = myPlayerId
    ? pairs.filter((p) => p.player1Id === myPlayerId || p.player2Id === myPlayerId).map((p) => p.id)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">{ev.name}</h1>
        <p className="muted text-sm mt-1">{ev.date}{ev.location ? ` · ${ev.location}` : ''} · Pozo</p>
      </div>

      {ev.status === 'draft' && <p className="text-ink-3 text-sm">El pozo aún no se ha generado.</p>}

      {myPlayerId && matches.length > 0 && (
        <NextMatchCard matches={matches} playerId={myPlayerId} myPairIds={myPairIds}
          courtLabelById={courtLabelById} ctx={ctx} />
      )}

      {matches.length > 0 && (
        <>
          <section>
            <h2 className="font-medium mb-2">Parrilla</h2>
            <PozoGrid tournamentId={id} grid={grid} editable={false} />
          </section>
          <section>
            <h2 className="font-medium mb-2">Clasificación</h2>
            <PozoStandings standings={standings} courtsByOrder={courtsByOrder} ctx={ctx} />
          </section>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: OK.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(public)/pozos/[id]/page.tsx"
git commit -m "feat(pozo): vista pública /pozos/[id] (parrilla + clasificación + tu próximo partido)"
```

---

## Task 11: E2E — pozo de parejas fijas (flujo completo)

**Files:**
- Create: `e2e/pozo-fixed-pairs.spec.ts`

Patrón del repo: montar estado por API (`page.request`, que comparte la cookie de sesión admin del storageState), interactuar/asertar por UI.

- [ ] **Step 1: Write the spec**

```ts
// e2e/pozo-fixed-pairs.spec.ts
import { test, expect } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/admin.json' });

const POZO = {
  name: 'E2E Pozo PF', date: '2026-07-10', location: null, kind: 'pozo', format: 'fixed_pairs',
  config: { rounds: 2, matchFormat: { kind: 'timed', minutes: 12, tieRule: 'golden_point' } },
  courts: [
    { label: 'Central', order: 1, availableFrom: '17:00', availableTo: '20:00' },
    { label: 'Pista 2', order: 2, availableFrom: '17:00', availableTo: '20:00' },
  ],
  participantPlayerIds: ['pl1', 'pl2', 'pl3', 'pl4', 'pl5', 'pl6', 'pl7', 'pl8'],
};

test('pozo parejas fijas: crear → parejas → generar → resultados → clasificación', async ({ page }) => {
  // Montar el evento por API.
  const create = await page.request.post('/api/tournaments', { data: POZO });
  expect(create.ok()).toBeTruthy();
  const { id } = await create.json();

  // Definir las 4 parejas por API (la UI del editor se prueba abajo en otra aserción).
  const putPairs = await page.request.put(`/api/tournaments/${id}/pairs`, {
    data: { pairs: [['pl1', 'pl2'], ['pl3', 'pl4'], ['pl5', 'pl6'], ['pl7', 'pl8']] },
  });
  expect(putPairs.ok()).toBeTruthy();

  // Ir al detalle y generar.
  await page.goto(`/admin/pozos/${id}`);
  await page.getByRole('button', { name: 'Generar' }).click();

  // Aparece la parrilla con la cabecera de ronda 1.
  await expect(page.getByText('Ronda 1')).toBeVisible();

  // Registrar el resultado de los partidos visibles de la ronda 0 (2 pistas → 2 partidos).
  const saveButtons = page.getByRole('button', { name: 'Guardar' });
  const count = await saveButtons.count();
  expect(count).toBeGreaterThanOrEqual(2);
  for (let i = 0; i < count; i++) {
    // Re-consultar tras cada refresh (router.refresh re-renderiza la parrilla).
    const btn = page.getByRole('button', { name: 'Guardar' }).first();
    if (!(await btn.isVisible())) break;
    // marcador por defecto 0-0 → ponemos 4-2
    const a = page.getByLabel('Juegos equipo A').first();
    await a.fill('4');
    const b = page.getByLabel('Juegos equipo B').first();
    await b.fill('2');
    await btn.click();
    await expect(page.getByText(/4–2/).first()).toBeVisible();
  }

  // La clasificación muestra a las 4 parejas (etiqueta "N1 / N2") y la cima con 👑.
  await expect(page.getByText('Clasificación')).toBeVisible();
  await expect(page.getByText('👑', { exact: false }).first()).toBeVisible();
});

test('el editor de parejas guarda desde la UI', async ({ page }) => {
  const create = await page.request.post('/api/tournaments', {
    data: { ...POZO, name: 'E2E Pozo PF UI', participantPlayerIds: ['pl1', 'pl2', 'pl3', 'pl4'] },
  });
  const { id } = await create.json();
  await page.goto(`/admin/pozos/${id}`);

  // Formar 2 parejas vía los selects.
  await page.getByLabel('Jugador A').selectOption('pl1');
  await page.getByLabel('Jugador B').selectOption('pl2');
  await page.getByRole('button', { name: 'Añadir pareja' }).click();
  await page.getByLabel('Jugador A').selectOption('pl3');
  await page.getByLabel('Jugador B').selectOption('pl4');
  await page.getByRole('button', { name: 'Añadir pareja' }).click();
  await page.getByRole('button', { name: 'Guardar parejas' }).click();
  await expect(page.getByText('Guardado ✓')).toBeVisible();

  // Con las parejas completas, "Generar" se habilita.
  await expect(page.getByRole('button', { name: 'Generar' })).toBeEnabled();
});
```

- [ ] **Step 2: Run the spec**

Run: `npm run e2e -- pozo-fixed-pairs`
Expected: PASS (2 tests).

- [ ] **Step 3: Commit**

```bash
git add e2e/pozo-fixed-pairs.spec.ts
git commit -m "test(e2e): pozo parejas fijas (parejas → generar → resultados → clasificación)"
```

---

## Task 12: E2E — pozo americano + vista pública

**Files:**
- Create: `e2e/pozo-americano.spec.ts`
- Create: `e2e/pozo-public.spec.ts`

- [ ] **Step 1: Write `pozo-americano.spec.ts`**

```ts
// e2e/pozo-americano.spec.ts
import { test, expect } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/admin.json' });

test('pozo americano: generar → resultado → clasificación por jugador', async ({ page }) => {
  const create = await page.request.post('/api/tournaments', {
    data: {
      name: 'E2E Pozo Am', date: '2026-07-11', location: null, kind: 'pozo', format: 'americano',
      config: { rounds: 2, matchFormat: { kind: 'timed', minutes: 12, tieRule: 'golden_point' } },
      courts: [
        { label: 'Central', order: 1, availableFrom: '17:00', availableTo: '20:00' },
        { label: 'Pista 2', order: 2, availableFrom: '17:00', availableTo: '20:00' },
      ],
      participantPlayerIds: ['pl1', 'pl2', 'pl3', 'pl4', 'pl5', 'pl6', 'pl7', 'pl8'],
    },
  });
  const { id } = await create.json();

  await page.goto(`/admin/pozos/${id}`);
  // En americano no hay editor de parejas: Generar está disponible directamente.
  await page.getByRole('button', { name: 'Generar' }).click();
  await expect(page.getByText('Ronda 1')).toBeVisible();

  // Registrar un resultado.
  await page.getByLabel('Juegos equipo A').first().fill('4');
  await page.getByLabel('Juegos equipo B').first().fill('1');
  await page.getByRole('button', { name: 'Guardar' }).first().click();
  await expect(page.getByText(/4–1/).first()).toBeVisible();

  // Clasificación con 8 jugadores.
  await expect(page.getByText('Clasificación')).toBeVisible();
});
```

- [ ] **Step 2: Write `pozo-public.spec.ts`**

```ts
// e2e/pozo-public.spec.ts
import { test, expect } from '@playwright/test';

// Montar como admin (request con cookie admin), ver como jugador (storageState player).
test('vista pública del pozo: solo lectura + tu próximo partido', async ({ browser }) => {
  // 1) Crear y generar como admin.
  const adminCtx = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
  const adminPage = await adminCtx.newPage();
  const create = await adminPage.request.post('/api/tournaments', {
    data: {
      name: 'E2E Pozo Público', date: '2026-07-12', location: null, kind: 'pozo', format: 'fixed_pairs',
      config: { rounds: 2, matchFormat: { kind: 'timed', minutes: 12, tieRule: 'golden_point' } },
      courts: [
        { label: 'Central', order: 1, availableFrom: '17:00', availableTo: '20:00' },
        { label: 'Pista 2', order: 2, availableFrom: '17:00', availableTo: '20:00' },
      ],
      participantPlayerIds: ['pl1', 'pl2', 'pl3', 'pl4', 'pl5', 'pl6', 'pl7', 'pl8'],
    },
  });
  const { id } = await create.json();
  // pl1 (jugador de la sesión player) emparejado con pl2.
  await adminPage.request.put(`/api/tournaments/${id}/pairs`, {
    data: { pairs: [['pl1', 'pl2'], ['pl3', 'pl4'], ['pl5', 'pl6'], ['pl7', 'pl8']] },
  });
  await adminPage.request.post(`/api/tournaments/${id}/generate`, { data: { seed: 1 } });
  await adminCtx.close();

  // 2) Ver la pública como el jugador pl1.
  const playerCtx = await browser.newContext({ storageState: 'e2e/.auth/player.json' });
  const page = await playerCtx.newPage();
  await page.goto(`/pozos/${id}`);

  await expect(page.getByText('E2E Pozo Público')).toBeVisible();
  await expect(page.getByText('Parrilla')).toBeVisible();
  await expect(page.getByText('Clasificación')).toBeVisible();
  // "Tu próximo partido" porque pl1 participa (pareja pl1/pl2).
  await expect(page.getByText('Tu próximo partido')).toBeVisible();
  // Es solo lectura: no hay botones de Guardar marcador.
  await expect(page.getByRole('button', { name: 'Guardar' })).toHaveCount(0);

  await playerCtx.close();
});
```

- [ ] **Step 3: Run both specs**

Run: `npm run e2e -- pozo-americano pozo-public`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/pozo-americano.spec.ts e2e/pozo-public.spec.ts
git commit -m "test(e2e): pozo americano + vista pública (solo lectura + tu próximo partido)"
```

---

## Task 13: Verificación final

- [ ] **Step 1: Unit completa**

Run: `npm test`
Expected: PASS (incluye `pozo-view` y todo lo de 2b-2).

- [ ] **Step 2: Build + lint**

Run: `npm run build && npm run lint`
Expected: ambos OK.

- [ ] **Step 3: Suite e2e completa**

Run: `npm run e2e`
Expected: PASS (event-create + pozo-fixed-pairs + pozo-americano + pozo-public).

- [ ] **Step 4: Commit de cierre**

```bash
git add -A
git commit -m "chore(pozo): verificación 2c (unit + build + e2e verdes)" --allow-empty
```

---

## Self-review (cobertura vs. spec)

- **API `generate` / `result` (admin)** → Tasks 2, 3 (dispatch vía `pozo-engine`). ✓
- **Editor de parejas en el detalle; "Generar" deshabilitado hasta parejas válidas** → Task 6 (`PairsEditor`) + Task 9 (`disabled` cuando `needsPairs && !pairsComplete`). ✓
- **Rutas por tipo `/admin/pozos|torneos/[id]` con panel compartido; retira `/admin/tournaments/[id]`** → Task 9. ✓
- **Parrilla pista×ronda (cima 👑, nombre real de pista) + entrada de resultados** → Tasks 7 (`PozoGrid` + `ResultEntry`), 4. ✓
- **Clasificación por escalera en vivo (jugador o pareja según variante)** → Task 7 (`PozoStandings` + `standingLabel`). ✓
- **Vista pública `/pozos/[id]` solo lectura + "tu próximo partido"** → Tasks 10, 8 (`NextMatchCard` reusa `nextMatchForPlayer`/`involvesPlayer` de `display.ts`). ✓
- **Nombre real de pista en todas partes** → `courtsByOrder`/`courtLabelById` desde `ev.courts`. ✓
- **E2E de los flujos reales (ambas variantes + pública)** → Tasks 11, 12. ✓
- **Reutilización (no duplicar lógica)**: motores/persistencia tras `pozo-engine` (2b-2); presentación y view-model puros compartidos admin/pública. ✓
- **Fuera de alcance:** UI del Torneo (placeholder en `EventPanel`), que es la siguiente tanda. ✓
