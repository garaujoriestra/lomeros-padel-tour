'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface SetScore {
  team1Games: number | '';
  team2Games: number | '';
}

interface ResultFormProps {
  matchId: string;
  team1Name: string;
  team2Name: string;
  date: string;
  location?: string | null;
  team1Player1Name: string;
  team1Player2Name: string;
  team2Player1Name: string;
  team2Player2Name: string;
  initialSides: {
    team1Player1Side: string | null;
    team1Player2Side: string | null;
    team2Player1Side: string | null;
    team2Player2Side: string | null;
  };
}

export function ResultForm({ matchId, team1Name, team2Name, date, location, team1Player1Name, team1Player2Name, team2Player1Name, team2Player2Name, initialSides }: ResultFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [sets, setSets] = useState<SetScore[]>([
    { team1Games: '', team2Games: '' },
    { team1Games: '', team2Games: '' },
  ]);
  const [team1Sides, setTeam1Sides] = useState<[string, string]>([
    initialSides.team1Player1Side ?? '',
    initialSides.team1Player2Side ?? '',
  ]);
  const [team2Sides, setTeam2Sides] = useState<[string, string]>([
    initialSides.team2Player1Side ?? '',
    initialSides.team2Player2Side ?? '',
  ]);

  function handleSetChange(idx: number, team: 'team1' | 'team2', value: string) {
    const parsed = value === '' ? '' : Math.max(0, Math.min(7, parseInt(value) || 0));
    const updated = [...sets];
    updated[idx] = { ...updated[idx], [`${team}Games`]: parsed };
    setSets(updated);
  }

  function validateSets() {
    let t1 = 0, t2 = 0;
    for (const set of sets) {
      if (set.team1Games === '' || set.team2Games === '') return null;
      if (set.team1Games === set.team2Games) return null;
      if (set.team1Games > set.team2Games) t1++;
      else t2++;
    }
    if (t1 === 2 || t2 === 2) return { t1, t2, winner: t1 === 2 ? 1 : 2 };
    return null;
  }

  const matchResult = validateSets();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!matchResult) {
      toast.error('El resultado no es válido');
      return;
    }
    setLoading(true);

    const res = await fetch(`/api/matches/${matchId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sets: sets.map((s, i) => ({
          setNumber: i + 1,
          team1Games: Number(s.team1Games),
          team2Games: Number(s.team2Games),
        })),
        team1Player1Side: team1Sides[0] || null,
        team1Player2Side: team1Sides[1] || null,
        team2Player1Side: team2Sides[0] || null,
        team2Player2Side: team2Sides[1] || null,
      }),
    });

    if (res.ok) {
      toast.success('Resultado guardado y ratings actualizados ✓');
      router.push('/admin/matches');
      router.refresh();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Error al guardar el resultado');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {/* Match info */}
      <div className="bg-gradient-to-r from-green-950 to-emerald-900 rounded-2xl p-6 text-white">
        <p className="text-green-300 text-xs uppercase tracking-widest mb-3">Añadir resultado a</p>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-black text-xl">🔵 {team1Name}</p>
          </div>
          <span className="text-2xl font-black text-green-400">VS</span>
          <div className="text-right">
            <p className="font-black text-xl">🔴 {team2Name}</p>
          </div>
        </div>
        <div className="flex gap-4 mt-3 text-green-300 text-sm">
          <span>📅 {date}</span>
          {location && <span>📍 {location}</span>}
        </div>
      </div>

      {/* Sets */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-black text-gray-500 uppercase tracking-widest">🏆 Resultado (sets)</p>
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

        <div className="grid grid-cols-3 gap-2 text-xs font-medium text-gray-500 text-center">
          <span className="text-left">Set</span>
          <span className="text-blue-700 truncate">🔵 {team1Name}</span>
          <span className="text-red-700 truncate">🔴 {team2Name}</span>
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
          <div className="mt-2 p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-center">
            <p className="font-bold text-green-800">
              🏆 Gana {matchResult.winner === 1 ? `🔵 ${team1Name}` : `🔴 ${team2Name}`}{' '}
              <Badge variant="outline" className="ml-1">
                {matchResult.t1} — {matchResult.t2}
              </Badge>
            </p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <p className="text-xs font-black text-gray-500 uppercase tracking-widest">🎾 Lado de pista (opcional)</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-3">
            <p className="font-semibold text-sm text-blue-700">🔵 {team1Name}</p>
            {[
              { name: team1Player1Name, value: team1Sides[0], onChange: (v: string) => setTeam1Sides([v, team1Sides[1]]) },
              { name: team1Player2Name, value: team1Sides[1], onChange: (v: string) => setTeam1Sides([team1Sides[0], v]) },
            ].map((row, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] gap-2 items-center">
                <span className="text-sm text-gray-700 truncate">{row.name}</span>
                <select
                  className="border rounded-md px-2 py-1 text-sm bg-white"
                  value={row.value}
                  onChange={(e) => row.onChange(e.target.value)}
                >
                  <option value="">—</option>
                  <option value="drive">Drive</option>
                  <option value="reves">Revés</option>
                </select>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <p className="font-semibold text-sm text-red-700">🔴 {team2Name}</p>
            {[
              { name: team2Player1Name, value: team2Sides[0], onChange: (v: string) => setTeam2Sides([v, team2Sides[1]]) },
              { name: team2Player2Name, value: team2Sides[1], onChange: (v: string) => setTeam2Sides([team2Sides[0], v]) },
            ].map((row, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] gap-2 items-center">
                <span className="text-sm text-gray-700 truncate">{row.name}</span>
                <select
                  className="border rounded-md px-2 py-1 text-sm bg-white"
                  value={row.value}
                  onChange={(e) => row.onChange(e.target.value)}
                >
                  <option value="">—</option>
                  <option value="drive">Drive</option>
                  <option value="reves">Revés</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={loading || !matchResult}
          className="flex-1 min-h-[40px] px-4 text-sm bg-green-600 hover:bg-green-700 text-white font-bold"
        >
          {loading ? 'Guardando...' : '✓ Guardar resultado y actualizar rankings'}
        </Button>
        <Button type="button" variant="outline" className="min-h-[40px] px-4 text-sm" onClick={() => router.push('/admin/matches')}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
