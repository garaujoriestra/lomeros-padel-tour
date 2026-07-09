'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export interface RedemptionRow {
  id: string;
  status: string;
  cost: number;
  requestedAt: string;
  rewardTitle: string;
  playerName: string;
  playerNickname: string | null;
}

export function RedemptionsManager({ redemptions }: { redemptions: RedemptionRow[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function resolve(id: string, status: 'fulfilled' | 'cancelled') {
    setLoading(true);
    try {
      const res = await fetch(`/api/redemptions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      toast.success(
        status === 'fulfilled'
          ? 'Canje marcado como entregado'
          : 'Canje cancelado y fichas devueltas'
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  const pending = redemptions.filter((r) => r.status === 'pending');
  const resolved = redemptions.filter((r) => r.status !== 'pending');

  return (
    <div className="space-y-6">
      {/* Card: Pendientes */}
      <div className="lpt-card card-pad space-y-3">
        <h2 className="kicker">Pendientes ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="muted text-sm">Nada pendiente. 🎉</p>
        ) : (
          <ul className="space-y-3">
            {pending.map((r) => (
              <li key={r.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-line pb-3 last:border-0 last:pb-0">
                <div>
                  <span className="font-medium text-sm">
                    {r.playerName}
                    {r.playerNickname && (
                      <span className="text-xs text-ink-3 ml-1">({r.playerNickname})</span>
                    )}
                  </span>
                  <span className="text-sm text-ink-3"> → </span>
                  <span className="text-sm">{r.rewardTitle}</span>
                  <span className="text-xs text-ink-3 ml-1.5">({r.cost} fichas)</span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    disabled={loading}
                    onClick={() => resolve(r.id, 'fulfilled')}
                  >
                    Entregado
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loading}
                    onClick={() => resolve(r.id, 'cancelled')}
                  >
                    Cancelar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Card: Histórico */}
      {resolved.length > 0 && (
        <div className="lpt-card card-pad space-y-2">
          <h2 className="kicker">Histórico</h2>
          <ul className="space-y-1">
            {resolved.map((r) => (
              <li key={r.id} className="muted text-sm flex items-center gap-1.5">
                <span>
                  {r.playerName} → {r.rewardTitle}
                </span>
                <span>{r.status === 'fulfilled' ? '✅' : '❌'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
