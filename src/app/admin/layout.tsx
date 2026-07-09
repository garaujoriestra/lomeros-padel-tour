import { redirect } from 'next/navigation';
import { Navbar } from '@/components/shared/navbar';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { getSession } from '@/lib/auth/session';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  // Gate de admin server-side (en 1C el rol ya no va en el JWT, así que el middleware
  // del edge solo comprueba que haya sesión). El middleware ya manda a /login si no hay
  // sesión; este check cubre a los logueados que no son admin del grupo.
  if (!session) redirect('/login');
  if (session.role !== 'admin') redirect('/me');

  const player = session.player
    ? {
        id: session.player.id,
        name: session.player.name,
        nickname: session.player.nickname,
        avatarUrl: session.player.avatarUrl,
      }
    : null;

  return (
    <div className="min-h-dvh">
      <Navbar session={{ role: session.role, player }} />
      <div className="lpt-container" style={{ paddingTop: 'calc(22px * var(--sp))', paddingBottom: 'calc(48px * var(--sp))' }}>
        <div className="flex flex-col md:flex-row gap-4 md:gap-8">
          <AdminSidebar />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
