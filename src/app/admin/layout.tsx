import { redirect } from 'next/navigation';
import { Navbar } from '@/components/shared/navbar';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { getSession } from '@/lib/auth/session';
import { navSessionFromContext, resolvePageContext } from '@/lib/auth/page-context';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Gate de admin server-side con el rol DEL GRUPO (raíz = grupo por defecto). El middleware
  // del edge solo comprueba que haya sesión; este check cubre a los logueados que no son
  // admin del grupo (super_admin incluido: solo-lectura, no entra al admin de la raíz).
  const session = await getSession();
  if (!session) redirect('/login');
  const ctx = await resolvePageContext();
  if (ctx.role !== 'admin') redirect('/me');

  return (
    <div className="min-h-dvh">
      <Navbar session={navSessionFromContext(ctx)} />
      <div className="lpt-container" style={{ paddingTop: 'calc(22px * var(--sp))', paddingBottom: 'calc(48px * var(--sp))' }}>
        <div className="flex flex-col md:flex-row gap-4 md:gap-8">
          <AdminSidebar />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
