import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { MeProfileForm } from '@/components/me/me-profile-form';

export const dynamic = 'force-dynamic';

export default async function MeEditPage() {
  const session = await getSession();
  if (!session) redirect('/login?from=/me/edit');
  if (!session.player) redirect('/me');

  const { name, nickname, avatarUrl, isLeftHanded } = session.player;
  return (
    <div className="space-y-6">
      <h1 className="sec-title">Mi perfil</h1>
      <MeProfileForm initial={{ name, nickname, avatarUrl, isLeftHanded }} />
    </div>
  );
}
