import Link from 'next/link';
import { redirect } from 'next/navigation';
import { loadPlayerProfile } from '@/lib/players/profile-data';
import { PlayerProfileView } from '@/components/players/player-profile-view';
import { PushNotificationsToggle } from '@/components/me/push-notifications-toggle';
import type { PageContext } from '@/lib/auth/page-context';

// Cuerpo compartido de /me (raíz) y /g/[slug]/me. Recibe el contexto de página resuelto.
// - Sin ficha en el grupo → mensaje de bienvenida (no redirect-loop; el edge ya exigió sesión).
// - Con ficha → perfil del jugador EN ese grupo, con cartera de La Timba y edición de
//   perfil bajo el mismo basePath (paridad 2b, Task 6: /me/tokens y /me/edit existen
//   también bajo /g/[slug]).
export async function MeBody({ ctx }: { ctx: PageContext }) {
  const { player, groupId, basePath } = ctx;
  const isRoot = basePath === '';
  const home = basePath || '/';

  if (!player) {
    return (
      <div className="max-w-md mx-auto mt-10 text-center space-y-4">
        <div className="text-4xl">👋</div>
        <h1 className="display" style={{ fontSize: 28 }}>¡Bienvenido!</h1>
        <p className="muted">
          {isRoot
            ? 'Tu cuenta está activa pero aún no está vinculada a un jugador del tour. Pide al organizador que te vincule a tu ficha.'
            : 'Tu cuenta no está vinculada a un jugador de este grupo. Pide al organizador que te vincule a tu ficha.'}
        </p>
        <Link href={home} className="sec-link" style={{ justifyContent: 'center' }}>
          {isRoot ? 'Ver el tour →' : 'Ver el grupo →'}
        </Link>
        <div className="mt-6 text-left">
          <PushNotificationsToggle />
        </div>
      </div>
    );
  }

  const data = await loadPlayerProfile(groupId, player.id);
  if (!data) redirect(home);

  return (
    <div className="space-y-6">
      <PlayerProfileView data={data} editable basePath={basePath} />
      <Link href={`${basePath}/me/tokens`} className="lpt-card flex items-center justify-between" style={{ padding: 14 }}>
        <span>🪙 Mi cartera de La Timba</span>
        <span className="font-semibold">{player.tokenBalance} tk →</span>
      </Link>
      <PushNotificationsToggle />
    </div>
  );
}
