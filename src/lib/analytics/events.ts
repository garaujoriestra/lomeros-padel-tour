import { track } from '@vercel/analytics/server';

// Eventos server-side del funnel de captación (Fase 0 de comercialización):
// grupo creado → jugadores añadidos → partidos registrados. Best-effort SIEMPRE:
// en local/e2e no hay backend de Analytics y en Vercel los eventos custom pueden
// no estar habilitados según plan — un fallo aquí jamás debe romper la request.
export type FunnelEvent = 'grupo_creado' | 'jugador_anadido' | 'partido_creado';

export async function trackFunnel(
  event: FunnelEvent,
  props?: Record<string, string | number>,
): Promise<void> {
  try {
    await track(event, props);
  } catch {
    // Silencioso a propósito (ver arriba).
  }
}
