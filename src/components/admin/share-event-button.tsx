'use client';
import { useState } from 'react';
import { Share2 } from 'lucide-react';

interface Props { id: string; kind: 'pozo' | 'torneo'; groupSlug?: string }

export function ShareEventButton({ id, kind, groupSlug }: Props) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function share() {
    const basePath = groupSlug ? `/g/${groupSlug}` : '';
    const url = `${window.location.origin}${basePath}${kind === 'pozo' ? '/pozos/' : '/torneos/'}${id}`;
    setError(null);
    try {
      if (navigator.share) {
        await navigator.share({ url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError('No se pudo copiar el enlace');
    }
  }

  return (
    <div className="space-y-1">
      <button onClick={share} className="lpt-btn flex items-center gap-1">
        <Share2 size={16} />
        Compartir enlace
      </button>
      {copied && <span className="text-win text-sm">Enlace copiado ✓</span>}
      {error && <p className="text-sm text-loss">{error}</p>}
    </div>
  );
}
