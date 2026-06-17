'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props { id: string; kind: 'pozo' | 'torneo' }

export function DeleteEventButton({ id, kind }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!confirm('¿Eliminar este evento? Se borrará junto con sus partidos.')) return;
    setLoading(true); setError(null);
    const res = await fetch(`/api/tournaments/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || 'Error al eliminar');
      setLoading(false);
      return;
    }
    router.push(kind === 'pozo' ? '/admin/pozos' : '/admin/torneos');
    router.refresh();
  }

  return (
    <div className="space-y-1">
      <button onClick={remove} disabled={loading} className="lpt-btn text-loss border-loss">
        {loading ? 'Eliminando...' : `Eliminar ${kind}`}
      </button>
      {error && <p className="text-sm text-loss">{error}</p>}
    </div>
  );
}
