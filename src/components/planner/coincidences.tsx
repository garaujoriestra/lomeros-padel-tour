import { formatMin } from '@/lib/planner/slots';
import { PLANNER } from '@/lib/planner/config';
import type { WeekView } from '@/lib/planner/week-data';

const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// Tramos con partido posible de la semana (≥4 jugadores + pista efectiva),
// calculados en servidor. Solo lectura, igual para todos los miembros.
export function Coincidences({ view }: { view: WeekView }) {
  return (
    <section className="section">
      <h2 className="sec-title" style={{ fontSize: 17, marginBottom: 8 }}>
        Coincidencias de la semana
      </h2>
      {view.coincidences.length === 0 ? (
        <p className="muted small">
          Aún no hay tramos con partido posible: hacen falta {PLANNER.minPlayers} jugadores
          y una pista (con su dueño disponible) coincidiendo 1,5h.
        </p>
      ) : (
        <ul className="space-y-2" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {view.coincidences.map((c) => (
            <li key={`${c.day}-${c.startMin}`} className="lpt-card" style={{ padding: 12 }}>
              <p style={{ margin: 0, fontWeight: 600 }}>
                {DAY_NAMES[c.day]} {Number(view.dates[c.day].slice(8))} · {formatMin(c.startMin)}–{formatMin(c.endMin)}
              </p>
              <p className="small muted" style={{ margin: '4px 0 0' }}>
                Pista: {c.courtNames.join(', ')} · {c.playerNames.length} disponibles: {c.playerNames.join(', ')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
