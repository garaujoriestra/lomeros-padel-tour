'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props { tournamentId: string; disabled?: boolean; disabledReason?: string; groupSlug?: string }

export function GenerateButton({ tournamentId, disabled, disabledReason, groupSlug }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true); setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(groupSlug && { g: groupSlug }) }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error || 'Error'); setLoading(false); return; }
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="space-y-1">
      <button onClick={generate} disabled={disabled || loading} className="lpt-btn primary">
        {loading ? 'Generando...' : 'Generar'}
      </button>
      {disabled && disabledReason && <p className="text-xs text-ink-3">{disabledReason}</p>}
      {error && <p className="text-sm text-loss">{error}</p>}
    </div>
  );
}
