import { Navbar } from '@/components/shared/navbar';
import { BottomNav } from '@/components/shared/bottom-nav';
import { getSession } from '@/lib/auth/session';

export default async function MeLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const player = session?.player
    ? {
        id: session.player.id,
        name: session.player.name,
        nickname: session.player.nickname,
        avatarUrl: session.player.avatarUrl,
      }
    : null;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar session={session ? { role: session.role, player } : null} />
      <main className="screen">
        <div className="lpt-container">{children}</div>
      </main>
      <BottomNav />
    </div>
  );
}
