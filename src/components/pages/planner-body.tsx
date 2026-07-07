import Link from 'next/link';
import { AvailabilityGrid } from '@/components/planner/availability-grid';
import { CourtSection } from '@/components/planner/court-section';
import { Coincidences } from '@/components/planner/coincidences';
import { loadWeekView } from '@/lib/planner/week-data';
import { editableWeeks, madridTodayIso } from '@/lib/planner/weeks';
import type { PageContext } from '@/lib/auth/page-context';

const emptyWeek = () => Array.from({ length: 7 }, () => [] as number[]);

// Cuerpo compartido de /planificador (raíz) y /g/[slug]/planificador.
// - Sin ficha en el grupo → bienvenida (el edge ya exigió sesión).
// - Con ficha → coincidencias + mi disponibilidad + mi pista, de la semana
//   actual o la siguiente (?week=<lunes-siguiente>).
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
  const week = weekParam === next ? next : current;
  const view = await loadWeekView(groupId, week);

  const mine = view.players.find((p) => p.id === player.id)?.byDay ?? emptyWeek();
  const myCourt = view.courts.find((c) => c.ownerId === player.id) ?? null;
  const base = `${basePath}/planificador`;

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

      <Coincidences view={view} />

      <section className="section">
        <AvailabilityGrid
          key={`me-${week}`}
          title="Mi disponibilidad"
          dates={view.dates}
          initial={mine}
          week={week}
          g={gSlug}
          endpoint="/api/planner/availability"
        />
      </section>

      <section className="section">
        <CourtSection
          key={`court-${week}`}
          court={myCourt ? { id: myCourt.id, name: myCourt.name } : null}
          dates={view.dates}
          initialByDay={myCourt?.byDay ?? emptyWeek()}
          week={week}
          g={gSlug}
        />
      </section>
    </div>
  );
}
