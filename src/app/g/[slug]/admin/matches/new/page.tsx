import { resolvePageContext } from '@/lib/auth/page-context';
import { listPadelPlayers } from '@/lib/players/queries';
import { MatchForm } from '@/components/admin/match-form';

export const dynamic = 'force-dynamic';

export default async function GroupNewMatchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await resolvePageContext(slug);
  const allPlayers = await listPadelPlayers(ctx.groupId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">Registrar partido</h1>
        <p className="muted text-sm mt-1.5">Selecciona los jugadores, asigna equipos e introduce el resultado set a set</p>
      </div>
      {allPlayers.length < 4 ? (
        <div className="text-center py-12 text-ink-3">
          <p className="text-4xl mb-2">⚠️</p>
          <p>Necesitas al menos 4 jugadores para registrar un partido.</p>
        </div>
      ) : (
        <MatchForm players={allPlayers} groupSlug={slug} />
      )}
    </div>
  );
}
