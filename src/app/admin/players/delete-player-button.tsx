'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
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

export function DeletePlayerButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    const res = await fetch(`/api/players/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success(`${name} eliminado`);
      setOpen(false);
      router.refresh();
    } else {
      toast.error('Error al eliminar el jugador');
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="ghost" size="sm" className="text-loss hover:text-loss hover:bg-loss/15" aria-label={`Eliminar a ${name}`} />}
      >
        <Trash2 size={16} />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Eliminar jugador?</DialogTitle>
          <DialogDescription>
            Vas a eliminar a <strong>{name}</strong>. Esta acción no se puede deshacer.
            Sus partidos y estadísticas se conservarán pero el jugador no aparecerá en nuevos partidos.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? 'Eliminando...' : 'Sí, eliminar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
