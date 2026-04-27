'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface MatchSidesFormProps {
  matchId: string;
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

export function MatchSidesForm(props: MatchSidesFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [sides, setSides] = useState({
    team1Player1Side: props.initialSides.team1Player1Side ?? '',
    team1Player2Side: props.initialSides.team1Player2Side ?? '',
    team2Player1Side: props.initialSides.team2Player1Side ?? '',
    team2Player2Side: props.initialSides.team2Player2Side ?? '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch(`/api/matches/${props.matchId}/sides`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        team1Player1Side: sides.team1Player1Side || null,
        team1Player2Side: sides.team1Player2Side || null,
        team2Player1Side: sides.team2Player1Side || null,
        team2Player2Side: sides.team2Player2Side || null,
      }),
    });
    if (res.ok) {
      toast.success('Lados actualizados ✓');
      router.push('/admin/matches');
      router.refresh();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Error al guardar lados');
      setLoading(false);
    }
  }

  const playerRow = (label: string, sideKey: keyof typeof sides, color: string) => (
    <div className={`grid grid-cols-[1fr_auto] gap-3 items-center py-2 ${color}`}>
      <span className="text-sm font-medium truncate">{label}</span>
      <select
        className="border rounded-md px-3 py-2 text-sm bg-white min-w-[120px]"
        value={sides[sideKey]}
        onChange={(e) => setSides({ ...sides, [sideKey]: e.target.value })}
      >
        <option value="">— Sin registrar</option>
        <option value="drive">🟦 Drive</option>
        <option value="reves">🟪 Revés</option>
      </select>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-md">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <p className="text-xs font-black text-gray-500 uppercase tracking-widest">🔵 Equipo 1</p>
        {playerRow(props.team1Player1Name, 'team1Player1Side', 'text-blue-900')}
        {playerRow(props.team1Player2Name, 'team1Player2Side', 'text-blue-900')}
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <p className="text-xs font-black text-gray-500 uppercase tracking-widest">🔴 Equipo 2</p>
        {playerRow(props.team2Player1Name, 'team2Player1Side', 'text-red-900')}
        {playerRow(props.team2Player2Name, 'team2Player2Side', 'text-red-900')}
      </div>
      <div className="flex gap-3">
        <Button type="submit" disabled={loading} className="flex-1 min-h-[40px] px-4 text-sm bg-green-600 hover:bg-green-700 text-white font-bold">
          {loading ? 'Guardando...' : '✓ Guardar lados'}
        </Button>
        <Button type="button" variant="outline" className="min-h-[40px] px-4 text-sm" onClick={() => router.push('/admin/matches')}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
