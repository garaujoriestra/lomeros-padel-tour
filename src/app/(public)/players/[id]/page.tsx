import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getDefaultGroupId } from '@/lib/auth/group-context';
import { loadPlayerProfile } from '@/lib/players/profile-data';
import { PlayerProfileView } from '@/components/players/player-profile-view';
import { DirectionalTransition } from '@/components/shared/view-transitions';
import { LOMEROS_GROUP_NAME } from '@/lib/groups/constants';

export const dynamic = 'force-dynamic';

export default async function PlayerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const groupId = await getDefaultGroupId();
  const data = await loadPlayerProfile(groupId, id);
  if (!data) notFound();
  return (
    <DirectionalTransition>
      <div>
        <Link href="/rankings" transitionTypes={['nav-back']} className="sec-link" style={{ marginBottom: 14, display: 'inline-flex' }}>
          <ArrowLeft size={14} /> Ranking
        </Link>
        <PlayerProfileView data={data} editable={false} brandName={LOMEROS_GROUP_NAME} />
      </div>
    </DirectionalTransition>
  );
}
