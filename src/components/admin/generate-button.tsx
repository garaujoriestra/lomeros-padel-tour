'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function GenerateButton({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    const res = await fetch(`/api/tournaments/${tournamentId}/generate`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      toast.error(data.error || 'Error al generar la parrilla');
      return;
    }
    toast.success(`${data.matchCount} partidos generados`);
    if (Array.isArray(data.warnings) && data.warnings.length > 0) {
      for (const w of data.warnings) toast.warning(w);
    }
    router.refresh();
  }

  return (
    <Button onClick={handleGenerate} disabled={loading} className="min-h-[40px] px-4 text-sm">
      <Zap size={15} /> {loading ? 'Generando...' : 'Generar parrilla'}
    </Button>
  );
}
