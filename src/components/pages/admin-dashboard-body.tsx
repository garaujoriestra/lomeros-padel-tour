import Link from 'next/link';
import { countPlayersInGroup } from '@/lib/players/queries';
import { countMatchesInGroup } from '@/lib/matches/queries';
import { UserPlus, Swords, Users, Bell, BarChart3, ChevronRight } from 'lucide-react';
import type { PageContext } from '@/lib/auth/page-context';

// Cuerpo compartido de /admin (raíz) y /g/[slug]/admin. El gating de rol lo hace el
// layout correspondiente (session.role en raíz; ctx.role del grupo bajo /g/[slug]).
// Bajo grupo se omiten las acciones/enlaces a sub-rutas diferidas del MVP
// (players/new, matches/new, notifications) para no enlazar 404s.
export async function AdminDashboardBody({ ctx }: { ctx: PageContext }) {
  const { groupId, basePath } = ctx;
  const isRoot = basePath === '';
  const [playerCount, matchCount] = await Promise.all([
    countPlayersInGroup(groupId),
    countMatchesInGroup(groupId),
  ]);

  const quickLinks = [
    { href: `${basePath}/admin/players`, icon: Users, label: 'Jugadores', desc: 'Gestionar el equipo y autorizar cuentas' },
    { href: `${basePath}/admin/matches`, icon: Swords, label: 'Partidos', desc: 'Ver, programar o registrar resultados' },
    { href: basePath || '/', icon: BarChart3, label: 'Dashboard público', desc: 'Rankings y estadísticas del tour' },
    ...(isRoot
      ? [{ href: '/admin/notifications', icon: Bell, label: 'Notificaciones', desc: 'Enviar avisos y ver quién las tiene activadas' }]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">Administración</h1>
        <p className="muted text-sm mt-1.5">Gestiona jugadores y partidos</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {([
          [playerCount, 'Jugadores'],
          [matchCount, 'Partidos jugados'],
        ] as [number, string][]).map(([n, label]) => (
          <div key={label} className="lpt-card card-pad">
            <div className="kicker">{label}</div>
            <div className="display num" style={{ fontSize: 'clamp(28px, 6vw, 38px)', marginTop: 6 }}>{n}</div>
          </div>
        ))}
      </div>

      {isRoot && (
        <div className="flex flex-wrap gap-2.5">
          <Link href="/admin/players/new" className="lpt-btn primary">
            <UserPlus size={15} /> Añadir jugador
          </Link>
          <Link href="/admin/matches/new" className="lpt-btn">
            <Swords size={15} /> Registrar partido
          </Link>
        </div>
      )}

      <div className="lpt-card">
        {quickLinks.map((q) => {
          const Icon = q.icon;
          return (
            <Link key={q.href} href={q.href} className="feed-row items-center" style={{ padding: 'calc(13px * var(--sp)) calc(16px * var(--sp))' }}>
              <span className="feed-ico"><Icon size={16} /></span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-sm">{q.label}</span>
                <span className="block small muted">{q.desc}</span>
              </span>
              <ChevronRight size={16} className="muted shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
