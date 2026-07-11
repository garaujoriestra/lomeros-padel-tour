import { cache } from 'react';
import { notFound } from 'next/navigation';
import type { NavSession } from '@/components/shared/navbar';
import type { Player } from '@/lib/db/schema';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { getGroupBySlug } from '@/lib/groups/resolve-slug';
import { getGroupById, type GroupRow } from '@/lib/groups/queries';
import { getPlayerInGroup } from '@/lib/players/queries';

export interface PageContext {
  groupId: string;
  group: GroupRow;
  role: 'admin' | 'player' | 'super_admin' | null;
  player: Player | null;
  isSuperAdmin: boolean;
  basePath: '' | `/g/${string}`;
}

// Resuelve, una vez por request (dedupe con React cache), el grupo de la página y la
// relación del visitante con él. NO autoriza: páginas/layouts que requieran rol lo
// comprueban sobre el `role` devuelto. slug inexistente → notFound().
export const resolvePageContext = cache(async (slug?: string): Promise<PageContext> => {
  let group: GroupRow | null;
  let basePath: '' | `/g/${string}`;

  if (slug) {
    group = await getGroupBySlug(slug);
    if (!group) notFound();
    const defaultId = await getDefaultGroupId();
    // El grupo por defecto es canónico en la raíz; su slug bajo /g/ se trata
    // como si no tuviera basePath propio (el layout lo redirige a '/').
    basePath = group.id === defaultId ? '' : `/g/${slug}`;
  } else {
    const id = await getDefaultGroupId();
    group = await getGroupById(id);
    if (!group) notFound();
    basePath = '';
  }

  const ctx = await getGroupContext({ targetGroupId: group.id });
  const role = ctx ? ctx.role : null;
  const player =
    ctx && ctx.playerId ? ((await getPlayerInGroup(group.id, ctx.playerId)) ?? null) : null;

  return {
    groupId: group.id,
    group,
    role,
    player,
    isSuperAdmin: ctx?.isSuperAdmin ?? false,
    basePath,
  };
});

// Sesión para el <Navbar> a partir del contexto de página: miembro del grupo (admin/player)
// → {role, player}; visitante o super_admin (solo-lectura, sin ficha) → null.
export function navSessionFromContext(ctx: PageContext): NavSession | null {
  if (!ctx.role || ctx.role === 'super_admin') return null;
  return {
    role: ctx.role,
    player: ctx.player
      ? {
          id: ctx.player.id,
          name: ctx.player.name,
          nickname: ctx.player.nickname,
          avatarUrl: ctx.player.avatarUrl,
        }
      : null,
  };
}
