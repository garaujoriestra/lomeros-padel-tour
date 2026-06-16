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
