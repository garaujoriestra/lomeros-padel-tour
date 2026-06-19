import Link from 'next/link';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { countPlayersInGroup } from '@/lib/players/queries';
import { countMatchesInGroup } from '@/lib/matches/queries';
import { UserPlus, Swords, Users, Bell, BarChart3, ChevronRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

const quickLinks = [
  { href: '/admin/players', icon: Users, label: 'Jugadores', desc: 'Gestionar el equipo y autorizar cuentas' },
  { href: '/admin/matches', icon: Swords, label: 'Partidos', desc: 'Ver, programar o registrar resultados' },
  { href: '/', icon: BarChart3, label: 'Dashboard público', desc: 'Rankings y estadísticas del tour' },
  { href: '/admin/notifications', icon: Bell, label: 'Notificaciones', desc: 'Enviar avisos y ver quién las tiene activadas' },
];

export default async function AdminDashboard() {
  const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
  const [playerCount, matchCount] = await Promise.all([
    countPlayersInGroup(groupId),
    countMatchesInGroup(groupId),
  ]);

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

      <div className="flex flex-wrap gap-2.5">
        <Link href="/admin/players/new" className="lpt-btn primary">
          <UserPlus size={15} /> Añadir jugador
        </Link>
        <Link href="/admin/matches/new" className="lpt-btn">
          <Swords size={15} /> Registrar partido
        </Link>
      </div>

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
