'use client';

import { Share2 } from 'lucide-react';
import { toast } from 'sonner';

// La ficha de retransmisión tiene que poder retransmitirse: Web Share nativo
// (el share sheet del móvil) con fallback a copiar el enlace.
export function ShareProfileButton({ title, text }: { title: string; text: string }) {
  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch {
        // Cancelado por el usuario: no es un error.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Enlace copiado');
    } catch {
      toast.error('No se pudo copiar el enlace');
    }
  }

  return (
    <button type="button" onClick={share} className="lpt-badge accent press" style={{ cursor: 'pointer' }}>
      <Share2 size={11} /> Compartir ficha
    </button>
  );
}
