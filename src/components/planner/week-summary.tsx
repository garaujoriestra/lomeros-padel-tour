import { formatMin } from '@/lib/planner/slots';
import type { DaySegment } from '@/lib/planner/summary';
import { EmptyState } from '@/components/shared/empty-state';

const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// «Quién puede esta semana»: por día, tramos con la gente disponible en cada uno.
// Sin umbrales: esto enseña dónde hay interés y el partido se cuadra por fuera.
export function WeekSummary({ dates, summary }: { dates: string[]; summary: DaySegment[][] }) {
  const hasAny = summary.some((d) => d.length > 0);
  return (
    <section className="section">
      <h2 className="sec-title" style={{ fontSize: 17, marginBottom: 8 }}>Quién puede esta semana</h2>
      {!hasAny ? (
        <EmptyState
          emoji="🗓️"
          title="Aún no hay disponibilidad"
          hint="Cuando los jugadores marquen sus horas, verás aquí quién puede jugar esta semana."
        />
      ) : (
        <div className="space-y-3">
          {summary.map((segments, day) =>
            segments.length === 0 ? null : (
              <div key={day} className="lpt-card" style={{ padding: 12 }}>
                <p style={{ margin: 0, fontWeight: 600 }}>
                  {DAY_NAMES[day]} {Number(dates[day].slice(8))}
                </p>
                {segments.map((s) => (
                  <p key={s.startMin} className="small muted" style={{ margin: '4px 0 0' }}>
                    {formatMin(s.startMin)}–{formatMin(s.endMin)} · {s.names.join(', ')}
                  </p>
                ))}
              </div>
            ),
          )}
        </div>
      )}
    </section>
  );
}
