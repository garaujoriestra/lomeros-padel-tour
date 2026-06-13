'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Reward } from '@/lib/db/schema';
import { BETTING } from '@/lib/betting/config';

export function RewardsManager({ rewards }: { rewards: Reward[] }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState(100);
  const [loading, setLoading] = useState(false);

  async function call(path: string, init: RequestInit, ok: string): Promise<boolean> {
    setLoading(true);
    try {
      const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...init });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      toast.success(ok);
      router.refresh();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    const ok = await call(
      '/api/rewards',
      { method: 'POST', body: JSON.stringify({ title, description, cost }) },
      'Premio creado'
    );
    if (ok) {
      setTitle('');
      setDescription('');
      setCost(100);
    }
  }

  return (
    <div className="space-y-6">
      {/* Card: Nuevo premio */}
      <div className="lpt-card card-pad space-y-4">
        <h2 className="kicker">Nuevo premio</h2>
        <div className="space-y-1.5">
          <Label htmlFor="reward-title">Título</Label>
          <Input
            id="reward-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Los demás te pagan la pista"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reward-desc">Descripción</Label>
          <Input
            id="reward-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detalle opcional del premio"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reward-cost">Coste (tokens)</Label>
          <Input
            id="reward-cost"
            type="number"
            min={1}
            value={cost}
            onChange={(e) => setCost(Number(e.target.value))}
          />
          <p className="muted text-xs">
            Valor recomendado del premio: <b>{(cost * BETTING.centsPerToken) / 100} €</b> (1 ficha = 1 céntimo).
            Mantén esta relación para que el bote cuadre.
          </p>
        </div>
        <Button
          disabled={loading || !title.trim() || cost <= 0}
          onClick={handleCreate}
        >
          Crear premio
        </Button>
      </div>

      {/* Card: Catálogo */}
      <div className="lpt-card card-pad space-y-3">
        <h2 className="kicker">Catálogo</h2>
        {rewards.length === 0 ? (
          <p className="muted text-sm">Sin premios todavía.</p>
        ) : (
          <ul className="space-y-2">
            {rewards.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3">
                <div>
                  <span className="font-medium text-sm">{r.title}</span>
                  <span className="text-xs text-ink-3 ml-1.5">{r.cost} tk</span>
                  {!r.active && (
                    <span className="text-xs text-ink-3 ml-1.5">(inactivo)</span>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loading}
                  onClick={() =>
                    call(
                      `/api/rewards/${r.id}`,
                      { method: 'PUT', body: JSON.stringify({ active: !r.active }) },
                      r.active ? 'Premio desactivado' : 'Premio activado'
                    )
                  }
                >
                  {r.active ? 'Desactivar' : 'Activar'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
