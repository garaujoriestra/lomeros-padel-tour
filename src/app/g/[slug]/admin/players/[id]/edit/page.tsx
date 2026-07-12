import { notFound } from 'next/navigation';
import { resolvePageContext } from '@/lib/auth/page-context';
import { getLinkedUserEmail } from '@/lib/auth/users';
import { getPlayerInGroup } from '@/lib/players/queries';
import { PlayerForm } from '@/components/admin/player-form';

export const dynamic = 'force-dynamic';

export default async function GroupEditPlayerPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const ctx = await resolvePageContext(slug);
  const player = await getPlayerInGroup(ctx.groupId, id);
  if (!player) notFound();
  const email = await getLinkedUserEmail(ctx.groupId, id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">Editar jugador</h1>
        <p className="muted text-sm mt-1.5">{player.name}</p>
      </div>
      <PlayerForm initialData={{ ...player, email }} groupSlug={slug} />
    </div>
  );
}
