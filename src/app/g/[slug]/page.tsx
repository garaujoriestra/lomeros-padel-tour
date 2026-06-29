import { notFound, permanentRedirect } from 'next/navigation';
import { getDefaultGroupId } from '@/lib/auth/group-context';
import { getGroupBySlug } from '@/lib/groups/resolve-slug';
import { listAllPlayersInGroup } from '@/lib/players/queries';

export const dynamic = 'force-dynamic';

export default async function GroupHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const group = await getGroupBySlug(slug);
  if (!group) notFound();

  // El grupo por defecto (Lomeros) es canónico en la raíz: /g/lomeros → 308 a '/'.
  const defaultGroupId = await getDefaultGroupId();
  if (group.id === defaultGroupId) permanentRedirect('/');

  // Datos scopeados al grupo resuelto (vía helper de dominio, no acceso directo a DB).
  const players = await listAllPlayersInGroup(group.id);

  return (
    <div className="section" style={{ padding: 'calc(26px * var(--sp))' }}>
      <h1 className="display" style={{ fontSize: 'clamp(30px, 6vw, 48px)', margin: '0 0 8px' }}>
        {group.name}
      </h1>
      <p className="small muted" style={{ margin: '0 0 24px' }}>
        {players.length} {players.length === 1 ? 'jugador' : 'jugadores'}
      </p>
      <ul className="stagger" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {players.map((p) => (
          <li
            key={p.id}
            style={{ padding: '8px 0', borderBottom: '1px solid color-mix(in oklab, currentcolor 12%, transparent)' }}
          >
            {p.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
