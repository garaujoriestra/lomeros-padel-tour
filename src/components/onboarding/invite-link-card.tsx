'use client';
import { useState } from 'react';

// Tarjeta de súper-admin en el dashboard raíz: genera enlaces de invitación
// para crear grupo (beta cerrada) y los deja listos para copiar.
export function InviteLinkCard() {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/onboarding/invite-link', { method: 'POST' });
      if (res.ok) setUrl(((await res.json()) as { url: string }).url);
      else setError('No se pudo generar el enlace');
    } catch {
      setError('No se pudo conectar. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="lpt-card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 className="sec-title" style={{ margin: 0 }}>Invitaciones (beta)</h2>
      <p className="small muted" style={{ margin: 0 }}>
        Genera un enlace para que alguien cree su propio grupo. Caduca a los 7 días.
      </p>
      <button type="button" onClick={generate} disabled={busy} className="lpt-btn primary min-h-11" style={{ alignSelf: 'flex-start' }}>
        Generar enlace de invitación
      </button>
      {url && (
        <input readOnly value={url} aria-label="Enlace de invitación" onFocus={(e) => e.currentTarget.select()} />
      )}
      {error && <p role="alert" className="small" style={{ color: 'var(--loss-text, var(--loss))', margin: 0 }}>{error}</p>}
    </section>
  );
}
