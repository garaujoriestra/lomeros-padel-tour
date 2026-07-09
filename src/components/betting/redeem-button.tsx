'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
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

export function RedeemButton({
  rewardId,
  cost,
  disabled,
}: {
  rewardId: string;
  cost: number;
  disabled: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function redeem() {
    setLoading(true);
    try {
      const res = await fetch('/api/redemptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rewardId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al canjear');
      toast.success('Canje solicitado: pendiente de que el admin lo valide');
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al canjear');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            disabled={disabled}
            className="press"
            style={{
              padding: 'calc(8px * var(--sp)) calc(14px * var(--sp))',
              borderRadius: 10,
              border: 'none',
              fontWeight: 700,
              fontSize: 13,
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.45 : 1,
              background: 'var(--acc)',
              color: 'var(--on-acc)',
              whiteSpace: 'nowrap',
            }}
          />
        }
      >
        Canjear · {cost} fichas
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Canjear este premio?</DialogTitle>
          <DialogDescription>
            Se descontarán <strong>{cost} fichas</strong> de tu saldo. El canje queda pendiente
            hasta que el admin lo valide.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={redeem} disabled={loading}>
            {loading ? 'Canjeando...' : `Sí, canjear ${cost} fichas`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
