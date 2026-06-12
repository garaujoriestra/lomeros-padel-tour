'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

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
  const [loading, setLoading] = useState(false);

  async function redeem() {
    if (!confirm(`¿Canjear este premio por ${cost} tokens?`)) return;
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
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al canjear');
    } finally {
      setLoading(false);
    }
  }

  const isDisabled = disabled || loading;

  return (
    <button
      type="button"
      onClick={redeem}
      disabled={isDisabled}
      style={{
        padding: 'calc(8px * var(--sp)) calc(14px * var(--sp))',
        borderRadius: 10,
        border: 'none',
        fontWeight: 700,
        fontSize: 13,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.45 : 1,
        background: 'var(--acc)',
        color: 'var(--on-acc)',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      Canjear · {cost} tk
    </button>
  );
}
