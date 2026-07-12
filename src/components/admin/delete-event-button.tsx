'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface Props { id: string; kind: 'pozo' | 'torneo'; groupSlug?: string }

export function DeleteEventButton({ id, kind, groupSlug }: Props) {
  const router = useRouter();
  const basePath = groupSlug ? `/g/${groupSlug}` : '';
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setLoading(true); setError(null);
    const qs = groupSlug ? `?g=${groupSlug}` : '';
    const res = await fetch(`/api/tournaments/${id}${qs}`, { method: 'DELETE' });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || 'Error al eliminar');
      setLoading(false);
      return;
    }
    router.push(`${basePath}${kind === 'pozo' ? '/admin/pozos' : '/admin/torneos'}`);
    router.refresh();
  }

  return (
    <div className="space-y-1">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<button className="lpt-btn text-loss border-loss" />}>
          Eliminar {kind}
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar este {kind}?</DialogTitle>
            <DialogDescription>
              Se borrará el {kind} <strong>junto con todos sus partidos</strong>. Esta acción no se
              puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={remove} disabled={loading}>
              {loading ? 'Eliminando...' : 'Sí, eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {error && <p className="text-sm text-loss">{error}</p>}
    </div>
  );
}
