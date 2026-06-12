import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { loadPlayerProfile } from '@/lib/players/profile-data';
import { PlayerProfileView } from '@/components/players/player-profile-view';
import { PushNotificationsToggle } from '@/components/me/push-notifications-toggle';

export const dynamic = 'force-dynamic';

export default async function MePage() {
  const session = await getSession();
  if (!session) redirect('/login?from=/me');

  if (!session.player) {
    return (
      <div className="max-w-md mx-auto mt-10 text-center space-y-4">
        <div className="text-4xl">👋</div>
        <h1 className="display" style={{ fontSize: 28 }}>¡Bienvenido!</h1>
        <p className="muted">
          Tu cuenta está activa pero aún no está vinculada a un jugador del tour.
          Pide al organizador que te vincule a tu ficha.
        </p>
        <Link href="/" className="sec-link" style={{ justifyContent: 'center' }}>Ver el tour →</Link>
        <div className="mt-6 text-left">
          <PushNotificationsToggle />
        </div>
      </div>
    );
  }

  const data = await loadPlayerProfile(session.player.id);
  if (!data) redirect('/');
  return (
    <div className="space-y-6">
      <PlayerProfileView data={data} editable />
      <Link href="/me/tokens" className="lpt-card flex items-center justify-between" style={{ padding: 14 }}>
        <span>🪙 Mi cartera de La Timba</span>
        <span className="font-semibold">{session.player.tokenBalance} tk →</span>
      </Link>
      <PushNotificationsToggle />
    </div>
  );
}
