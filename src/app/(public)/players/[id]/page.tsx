import { notFound } from 'next/navigation';
import { getDefaultGroupId } from '@/lib/auth/group-context';
import { loadPlayerProfile } from '@/lib/players/profile-data';
import { PlayerProfileView } from '@/components/players/player-profile-view';

export const dynamic = 'force-dynamic';

export default async function PlayerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const groupId = await getDefaultGroupId();
  const data = await loadPlayerProfile(groupId, id);
  if (!data) notFound();
  return <PlayerProfileView data={data} editable={false} />;
}
