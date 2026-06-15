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
