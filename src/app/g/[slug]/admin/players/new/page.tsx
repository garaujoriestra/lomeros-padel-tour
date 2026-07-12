import { PlayerForm } from '@/components/admin/player-form';

export const dynamic = 'force-dynamic';

// Hereda el gate admin-del-grupo del layout de /g/[slug]/admin.
export default async function GroupNewPlayerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">Nuevo jugador</h1>
        <p className="muted text-sm mt-1.5">Añade un nuevo jugador al grupo</p>
      </div>
      <PlayerForm groupSlug={slug} />
    </div>
  );
}
