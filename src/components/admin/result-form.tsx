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
}

export function ResultForm({ matchId, team1Name, team2Name, date, location }: ResultFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [sets, setSets] = useState<SetScore[]>([
    { team1Games: '', team2Games: '' },
    { team1Games: '', team2Games: '' },
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
              <Button type="button" variant="outline" size="sm"
                onClick={() => setSets([...sets, { team1Games: '', team2Games: '' }])}>
                + 3er set
              </Button>
            )}
            {sets.length === 3 && (
              <Button type="button" variant="ghost" size="sm"
                onClick={() => setSets(sets.slice(0, 2))}>
                Quitar 3er set
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs font-medium text-gray-500 text-center">
          <span className="text-left">Set</span>
          <span className="text-blue-700">🔵 {team1Name}</span>
          <span className="text-red-700">🔴 {team2Name}</span>
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

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={loading || !matchResult}
          className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold"
        >
          {loading ? 'Guardando...' : '✓ Guardar resultado y actualizar rankings'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/admin/matches')}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
