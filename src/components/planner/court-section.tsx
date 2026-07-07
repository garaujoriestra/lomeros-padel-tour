'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AvailabilityGrid } from './availability-grid';

// Sección «Mi pista»: sin pista → alta con nombre; con pista → renombre +
// cuadrícula de disponibilidad de la pista (solo la ve/edita su dueño).
export function CourtSection({
  court,
  dates,
  initialByDay,
  week,
  g,
}: {
  court: { id: string; name: string } | null;
  dates: string[];
  initialByDay: number[][];
  week: string;
  g?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(court?.name ?? '');
  const [busy, setBusy] = useState(false);

  async function submitName(method: 'POST' | 'PATCH') {
    const clean = name.trim();
    if (!clean) { toast.error('Ponle un nombre a la pista'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/planner/court', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ g, name: clean }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? 'Error al guardar la pista');
      }
      toast.success(method === 'POST' ? 'Pista declarada' : 'Nombre actualizado');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar la pista');
    } finally {
      setBusy(false);
    }
  }

  if (!court) {
    return (
      <div className="lpt-card" style={{ padding: 14 }}>
        <h2 className="sec-title" style={{ fontSize: 17, marginBottom: 6 }}>🎾 ¿Tienes pista propia?</h2>
        <p className="small muted" style={{ margin: '0 0 10px' }}>
          Si tienes pista en tu urbanización (o similar), declárala y marca cuándo está libre:
          las coincidencias la tendrán en cuenta.
        </p>
        <div className="flex gap-2">
          <input
            className="w-full rounded-lg border border-line px-3 py-2 text-sm"
            style={{ flex: 1, minHeight: 36 }}
            placeholder="Nombre de la pista (p. ej. Urb. Los Olivos)"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="lpt-btn primary"
            style={{ minHeight: 36, padding: '6px 14px' }}
            disabled={busy}
            onClick={() => submitName('POST')}
          >
            Tengo pista
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <AvailabilityGrid
        title={`Mi pista · ${court.name}`}
        dates={dates}
        initial={initialByDay}
        week={week}
        g={g}
        endpoint="/api/planner/court/availability"
      />
      <div className="flex gap-2 items-center">
        <input
          className="w-full rounded-lg border border-line px-3 py-2 text-sm"
          style={{ flex: 1, minHeight: 34 }}
          value={name}
          maxLength={60}
          aria-label="Nombre de la pista"
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="lpt-btn"
          style={{ minHeight: 34, padding: '6px 12px' }}
          disabled={busy || name.trim() === court.name}
          onClick={() => submitName('PATCH')}
        >
          Renombrar
        </button>
      </div>
    </div>
  );
}
