'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type { Player } from '@/lib/db/schema';

interface MatchFormProps {
  players: Player[];
}

interface SetScore {
  team1Games: number | '';
  team2Games: number | '';
}

type Mode = 'scheduled' | 'completed';

export function MatchForm({ players }: MatchFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>('completed');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [location, setLocation] = useState('');

  const [team1, setTeam1] = useState<[string, string]>(['', '']);
  const [team2, setTeam2] = useState<[string, string]>(['', '']);
  const [team1Sides, setTeam1Sides] = useState<[string, string]>(['', '']); // '' | 'drive' | 'reves'
  const [team2Sides, setTeam2Sides] = useState<[string, string]>(['', '']);

  const [sets, setSets] = useState<SetScore[]>([
    { team1Games: '', team2Games: '' },
    { team1Games: '', team2Games: '' },
  ]);

  const selectedIds = [...team1, ...team2].filter(Boolean);

  function availablePlayers(currentSlot: string) {
    return players.filter(
      (p) => !selectedIds.includes(p.id) || p.id === currentSlot
    );
  }

  function handleSetChange(idx: number, team: 'team1' | 'team2', value: string) {
    const parsed = value === '' ? '' : Math.max(0, Math.min(7, parseInt(value) || 0));
    const updated = [...sets];
    updated[idx] = { ...updated[idx], [`${team}Games`]: parsed };
    setSets(updated);
  }

  function validateSets() {
    let team1SetsWon = 0;
    let team2SetsWon = 0;
    for (const set of sets) {
      if (set.team1Games === '' || set.team2Games === '') return null;
      if (set.team1Games === set.team2Games) return null;
      if (set.team1Games > set.team2Games) team1SetsWon++;
      else team2SetsWon++;
    }
    if (team1SetsWon === 2 || team2SetsWon === 2) {
      return { team1SetsWon, team2SetsWon, winner: team1SetsWon === 2 ? 1 : 2 };
    }
    return null;
  }

  const matchResult = mode === 'completed' ? validateSets() : null;
  const playersComplete = team1[0] && team1[1] && team2[0] && team2[1];

  function getPlayerName(id: string) {
    return players.find((p) => p.id === id)?.name || '—';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!playersComplete) {
      toast.error('Selecciona los 4 jugadores');
      return;
    }
    if (mode === 'completed' && !matchResult) {
      toast.error('El resultado no es válido (alguien debe ganar 2 sets)');
      return;
    }

    setLoading(true);

    if (team1Sides[0] && team1Sides[1] && team1Sides[0] === team1Sides[1]) {
      toast.warning(`Ambos jugadores del Equipo 1 al ${team1Sides[0] === 'drive' ? 'drive' : 'revés'}. ¿Seguro?`);
    }
    if (team2Sides[0] && team2Sides[1] && team2Sides[0] === team2Sides[1]) {
      toast.warning(`Ambos jugadores del Equipo 2 al ${team2Sides[0] === 'drive' ? 'drive' : 'revés'}. ¿Seguro?`);
    }

    const payload = {
      date,
      location: location.trim() || null,
      team1Player1Id: team1[0],
      team1Player2Id: team1[1],
      team2Player1Id: team2[0],
      team2Player2Id: team2[1],
      team1Player1Side: team1Sides[0] || null,
      team1Player2Side: team1Sides[1] || null,
      team2Player1Side: team2Sides[0] || null,
      team2Player2Side: team2Sides[1] || null,
      ...(mode === 'completed' && {
        sets: sets.map((s, i) => ({
          setNumber: i + 1,
          team1Games: Number(s.team1Games),
          team2Games: Number(s.team2Games),
        })),
      }),
    };

    const res = await fetch('/api/matches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      toast.success(
        mode === 'completed'
          ? 'Partido registrado y ratings actualizados ✓'
          : 'Partido programado correctamente 📅'
      );
      router.push('/admin/matches');
      router.refresh();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Error al guardar el partido');
      setLoading(false);
    }
  }

  const playerSlot = (
    team: [string, string],
    setTeam: (v: [string, string]) => void,
    sides: [string, string],
    setSides: (v: [string, string]) => void,
    label: string,
    color: string,
  ) => (
    <div className="space-y-3">
      <p className={`font-semibold text-sm ${color}`}>{label}</p>
      {[0, 1].map((slot) => (
        <div key={slot} className="space-y-1">
          <Label className="text-xs">Jugador {slot + 1}</Label>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
              value={team[slot]}
              onChange={(e) => {
                const next: [string, string] = [...team] as [string, string];
                next[slot] = e.target.value;
                setTeam(next);
              }}
              required
            >
              <option value="">— Seleccionar —</option>
              {availablePlayers(team[slot]).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.nickname ? ` (${p.nickname})` : ''}
                </option>
              ))}
            </select>
            <select
              className="border rounded-md px-2 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring"
              value={sides[slot]}
              onChange={(e) => {
                const next: [string, string] = [...sides] as [string, string];
                next[slot] = e.target.value;
                setSides(next);
              }}
              aria-label={`Lado del jugador ${slot + 1}`}
            >
              <option value="">Lado —</option>
              <option value="drive">Drive</option>
              <option value="reves">Revés</option>
            </select>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">

      {/* Mode toggle */}
      <div className="bg-card rounded-2xl border border-line shadow-sm p-1 flex gap-1">
        <button
          type="button"
          onClick={() => setMode('scheduled')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all ${
            mode === 'scheduled'
              ? 'bg-acc text-white shadow-sm'
              : 'text-ink-3 hover:text-ink-2 hover:bg-surface-2'
          }`}
        >
          📅 Programar partido
        </button>
        <button
          type="button"
          onClick={() => setMode('completed')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold transition-all ${
            mode === 'completed'
              ? 'bg-primary text-white shadow-sm'
              : 'text-ink-3 hover:text-ink-2 hover:bg-surface-2'
          }`}
        >
          🏆 Registrar con resultado
        </button>
      </div>

      {mode === 'scheduled' && (
        <div className="bg-acc/10 border border-acc/30 rounded-xl px-4 py-3 text-sm text-acc-text">
          📅 <strong>Modo programado:</strong> Se crea el partido sin resultado. Podrás añadir el marcador después desde la lista de partidos.
        </div>
      )}

      {/* Fecha y lugar */}
      <div className="bg-card rounded-2xl border border-line shadow-sm p-5 space-y-4">
        <p className="text-xs font-black text-ink-3 uppercase tracking-widest">📅 Datos del partido</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="date">Fecha *</Label>
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">Pista / Club</Label>
            <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ej: Padel Indoor" />
          </div>
        </div>
      </div>

      {/* Equipos */}
      <div className="bg-card rounded-2xl border border-line shadow-sm p-5 space-y-4">
        <p className="text-xs font-black text-ink-3 uppercase tracking-widest">👥 Equipos</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {playerSlot(team1, setTeam1, team1Sides, setTeam1Sides, '🔵 Equipo 1', 'text-acc-text')}
          {playerSlot(team2, setTeam2, team2Sides, setTeam2Sides, '🔴 Equipo 2', 'text-loss')}
        </div>
      </div>

      {/* Sets — only shown in completed mode */}
      {mode === 'completed' && (
        <div className="bg-card rounded-2xl border border-line shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-black text-ink-3 uppercase tracking-widest">🏆 Resultado (sets)</p>
            <div className="flex gap-2">
              {sets.length === 2 && (
                <Button type="button" variant="outline" className="min-h-[40px] px-3 text-xs"
                  onClick={() => setSets([...sets, { team1Games: '', team2Games: '' }])}>
                  + 3er set
                </Button>
              )}
              {sets.length === 3 && (
                <Button type="button" variant="ghost" className="min-h-[40px] px-3 text-xs"
                  onClick={() => setSets(sets.slice(0, 2))}>
                  Quitar 3er set
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs font-medium text-ink-3 text-center">
            <span className="text-left">Set</span>
            <span className="text-acc-text truncate">🔵 {team1[0] ? getPlayerName(team1[0]) + ' / ' + (team1[1] ? getPlayerName(team1[1]) : '?') : 'Equipo 1'}</span>
            <span className="text-loss truncate">🔴 {team2[0] ? getPlayerName(team2[0]) + ' / ' + (team2[1] ? getPlayerName(team2[1]) : '?') : 'Equipo 2'}</span>
          </div>

          {sets.map((set, idx) => (
            <div key={idx} className="grid grid-cols-3 gap-2 items-center">
              <span className="text-sm font-medium">Set {idx + 1}</span>
              <Input type="number" min={0} max={7} className="text-center"
                placeholder="0" value={set.team1Games}
                onChange={(e) => handleSetChange(idx, 'team1', e.target.value)} required />
              <Input type="number" min={0} max={7} className="text-center"
                placeholder="0" value={set.team2Games}
                onChange={(e) => handleSetChange(idx, 'team2', e.target.value)} required />
            </div>
          ))}

          {matchResult && (
            <div className="mt-2 p-3 rounded-xl bg-win/10 border border-win/30 text-sm text-center">
              <p className="font-bold text-win">
                🏆 Gana {matchResult.winner === 1 ? '🔵 Equipo 1' : '🔴 Equipo 2'}{' '}
                <Badge variant="outline" className="ml-1">
                  {matchResult.team1SetsWon} — {matchResult.team2SetsWon}
                </Badge>
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={loading || !playersComplete || (mode === 'completed' && !matchResult)}
          className={`flex-1 min-h-[40px] px-4 text-sm font-bold ${mode === 'scheduled' ? 'bg-acc hover:bg-blue-700' : 'bg-primary hover:bg-primary/90'} text-white`}
        >
          {loading
            ? 'Guardando...'
            : mode === 'scheduled'
            ? '📅 Programar partido'
            : '✓ Guardar resultado'}
        </Button>
        <Button type="button" variant="outline" className="min-h-[40px] px-4 text-sm" onClick={() => router.push('/admin/matches')}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
