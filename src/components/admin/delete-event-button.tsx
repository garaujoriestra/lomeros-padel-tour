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

interface Props { id: string; kind: 'pozo' | 'torneo' }

export function DeleteEventButton({ id, kind }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
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
