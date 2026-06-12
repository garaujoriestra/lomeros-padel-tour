'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface PenaltyRow {
  id: string;
  description: string | null;
  status: string;
  rechargeAmount: number;
  createdAt: string;
  playerName: string;
  playerNickname: string | null;
}

export function PenaltiesManager({ penalties }: { penalties: PenaltyRow[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  async function update(id: string, body: object, ok: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/penalties/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      toast.success(ok);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  const pending = penalties.filter((p) => p.status === 'pending');
  const fulfilled = penalties.filter((p) => p.status === 'fulfilled');

  return (
    <div className="space-y-6">
      {/* Card: Bancarrotas pendientes */}
      <div className="lpt-card card-pad space-y-3">
        <h2 className="kicker">💀 Bancarrotas pendientes ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="muted text-sm">Nadie en bancarrota.</p>
        ) : (
          <ul className="space-y-4">
            {pending.map((p) => {
              const draft = drafts[p.id] ?? p.description ?? '';
              return (
                <li key={p.id} className="space-y-2 border-b border-line pb-4 last:border-0 last:pb-0">
                  <div>
                    <span className="font-medium text-sm">{p.playerName}</span>
                    {p.playerNickname && (
                      <span className="text-xs text-ink-3 ml-1.5">({p.playerNickname})</span>
                    )}
                    {p.description && (
                      <p className="text-xs text-ink-3 mt-0.5">{p.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={draft}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      placeholder="Penalización (ej: trae las bolas el viernes)"
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={loading || !draft.trim()}
                      onClick={() =>
                        update(p.id, { description: draft }, 'Penalización asignada')
                      }
                    >
                      Asignar
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    disabled={loading || !p.description}
                    onClick={() =>
                      update(
                        p.id,
                        { status: 'fulfilled' },
                        `+${p.rechargeAmount} tokens recargados`
                      )
                    }
                  >
                    Cumplida
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Card: Histórico */}
      {fulfilled.length > 0 && (
        <div className="lpt-card card-pad space-y-2">
          <h2 className="kicker">Histórico</h2>
          <ul className="space-y-1">
            {fulfilled.map((p) => (
              <li key={p.id} className="muted text-sm">
                {p.playerName}
                {p.playerNickname && (
                  <span className="ml-1">({p.playerNickname})</span>
                )}
                {p.description && <span className="ml-1.5">· {p.description}</span>}
                <span className="ml-1.5">✅</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
