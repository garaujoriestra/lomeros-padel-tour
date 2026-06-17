'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

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
    <div className="flex items-center gap-2">
      <input
        aria-label="Juegos equipo A" type="number" min={0} inputMode="numeric"
        value={a} onChange={(e) => setA(Number(e.target.value))} disabled={disabled || saving}
        className="w-12 h-9 text-center font-display italic font-extrabold text-lg rounded-[9px] border border-line-strong bg-surface-2 text-ink"
      />
      <span className="text-ink-3">–</span>
      <input
        aria-label="Juegos equipo B" type="number" min={0} inputMode="numeric"
        value={b} onChange={(e) => setB(Number(e.target.value))} disabled={disabled || saving}
        className="w-12 h-9 text-center font-display italic font-extrabold text-lg rounded-[9px] border border-line-strong bg-surface-2 text-ink"
      />
      <button onClick={save} disabled={disabled || saving} className="lpt-btn primary">
        {saving ? '...' : 'Guardar'}
      </button>
      {error && <span className="text-xs text-loss">{error}</span>}
    </div>
  );
}
