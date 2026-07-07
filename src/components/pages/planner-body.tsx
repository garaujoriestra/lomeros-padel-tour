import Link from 'next/link';
import { AvailabilityGrid } from '@/components/planner/availability-grid';
import { loadWeekView } from '@/lib/planner/week-data';
import { allSlotStarts } from '@/lib/planner/slots';
import { editableWeeks, madridTodayIso } from '@/lib/planner/weeks';
import type { PageContext } from '@/lib/auth/page-context';

const emptyWeek = () => Array.from({ length: 7 }, () => [] as number[]);

// Cuerpo compartido de /planificador (raíz) y /g/[slug]/planificador.
// - Sin ficha en el grupo → bienvenida (el edge ya exigió sesión).
// - Con ficha → mi disponibilidad, de la semana actual o la siguiente
//   (?week=<lunes-siguiente>). (v1.1: sin pistas ni coincidencias.)
export async function PlannerBody({ ctx, weekParam }: { ctx: PageContext; weekParam?: string }) {
  const { player, groupId, basePath } = ctx;
  const gSlug = basePath === '' ? undefined : ctx.group.slug;
  const home = basePath || '/';

  if (!player) {
    return (
      <div className="max-w-md mx-auto mt-10 text-center space-y-4">
        <div className="text-4xl">📅</div>
        <h1 className="display" style={{ fontSize: 28 }}>Planificador semanal</h1>
        <p className="muted">
          Tu cuenta no está vinculada a un jugador de este grupo. Pide al organizador
          que te vincule a tu ficha para marcar tu disponibilidad.
        </p>
        <Link href={home} className="sec-link" style={{ justifyContent: 'center' }}>
          Volver →
        </Link>
      </div>
    );
  }

  const [current, next] = editableWeeks(madridTodayIso());
  // A diferencia del GET de la API (400 si no es lunes), la página corrige en
  // silencio cualquier ?week= inválido a la semana actual: mejor que una página de error.
  const week = weekParam === next ? next : current;
  const view = await loadWeekView(groupId, week);

  const mine = view.players.find((p) => p.id === player.id)?.byDay ?? emptyWeek();
  const base = `${basePath}/planificador`;

  const starts = allSlotStarts();
  // Mapa de calor: cuántos OTROS pueden en cada celda (mi propia celda ya se ve al pintarla).
  const others = view.players.filter((p) => p.id !== player.id);
  const counts = Array.from({ length: 7 }, (_, day) =>
    starts.map((min) => others.filter((p) => p.byDay[day].includes(min)).length),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="sec-title">Planificador semanal</h1>
        <div className="flex gap-2">
          <Link href={base} className={`lpt-btn ${week === current ? 'primary' : ''}`}
            style={{ minHeight: 34, padding: '6px 12px' }}>
            Esta semana
          </Link>
          <Link href={`${base}?week=${next}`} className={`lpt-btn ${week === next ? 'primary' : ''}`}
            style={{ minHeight: 34, padding: '6px 12px' }}>
            Próxima
          </Link>
        </div>
      </div>

      <section className="section">
        <AvailabilityGrid
          key={`me-${week}`}
          title="Mi disponibilidad"
          dates={view.dates}
          initial={mine}
          week={week}
          g={gSlug}
          endpoint="/api/planner/availability"
          counts={counts}
        />
      </section>
    </div>
  );
}
