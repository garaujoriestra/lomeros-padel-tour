'use client';

import { useState } from 'react';
import { toast } from 'sonner';

export function BroadcastForm({ groupSlug }: { groupSlug?: string }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/push/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, ...(groupSlug ? { g: groupSlug } : {}) }),
      });
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      if (data.sent === 0) {
        toast.warning('Aviso enviado, pero no hay dispositivos suscritos');
      } else {
        toast.success(`Aviso enviado a ${data.sent ?? 0} dispositivo(s)`);
      }
      setTitle('');
      setBody('');
    } catch {
      toast.error('No se pudo enviar el aviso');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={send} className="lpt-card card-pad space-y-3">
      <h2 className="kicker">Enviar aviso a todos</h2>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título (ej. ¡Hueco para jugar!)"
        aria-label="Título del aviso"
        className="w-full rounded-lg border border-line px-3 py-2 text-sm"
        required
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Mensaje"
        aria-label="Mensaje del aviso"
        className="w-full rounded-lg border border-line px-3 py-2 text-sm"
        rows={3}
        required
      />
      <button type="submit" disabled={busy} className="lpt-btn primary disabled:opacity-50">
        {busy ? 'Enviando…' : 'Enviar'}
      </button>
    </form>
  );
}
