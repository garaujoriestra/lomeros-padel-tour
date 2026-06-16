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
