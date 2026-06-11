import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { loadPlayerProfile } from '@/lib/players/profile-data';
import { PlayerProfileView } from '@/components/players/player-profile-view';

export const dynamic = 'force-dynamic';

export default async function MePage() {
  const session = await getSession();
  if (!session) redirect('/login?from=/me');

  if (!session.player) {
    return (
      <div className="max-w-md mx-auto mt-10 text-center space-y-4">
        <div className="text-4xl">👋</div>
        <h1 className="text-2xl font-bold text-gray-800">¡Bienvenido!</h1>
        <p className="text-gray-500">
          Tu cuenta está activa pero aún no está vinculada a un jugador del tour.
          Pide al organizador que te vincule a tu ficha.
        </p>
        <Link href="/" className="inline-block text-green-700 font-semibold">Ver el tour →</Link>
      </div>
    );
  }

  const data = await loadPlayerProfile(session.player.id);
  if (!data) redirect('/');
  return <PlayerProfileView data={data} editable />;
}
