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
