'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export interface TimbaPlayerRow {
  id: string;
  name: string;
  nickname: string | null;
  tokenBalance: number;
  hasEntered: boolean;   // tiene algún movimiento de buy-in/rebuy
  bankrupt: boolean;     // penalización pendiente
}

export function TimbaEntries({ players, potEuros }: { players: TimbaPlayerRow[]; potEuros: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function registerEntry(playerId: string) {
    setLoading(playerId);
    try {
      const res = await fetch('/api/timba/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      toast.success(data.kind === 'rebuy' ? 'Recompra registrada (+500)' : 'Entrada registrada (+500)');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="lpt-card" style={{ padding: 16, textAlign: 'center' }}>
        <div className="muted text-sm">💰 Bote actual</div>
        <div className="display" style={{ fontSize: 36 }}>{potEuros.toFixed(2)} €</div>
      </div>
      <div className="lpt-card" style={{ padding: 12 }}>
        {players.map((p) => (
          <div key={p.id} className="flex items-center justify-between py-2 gap-3">
            <div className="text-sm">
              <strong>{p.nickname || p.name}</strong>{' '}
              <span className="muted">· {p.tokenBalance} fichas {p.bankrupt ? '· 💀 en bancarrota' : ''}{!p.hasEntered ? '· (no ha entrado)' : ''}</span>
            </div>
            <Button size="sm" disabled={loading === p.id} onClick={() => registerEntry(p.id)}>
              {p.bankrupt ? 'Recompra 5€' : 'Entrada 5€'}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
