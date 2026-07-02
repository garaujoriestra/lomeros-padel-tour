import { redirect } from 'next/navigation';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { resolvePageContext } from '@/lib/auth/page-context';

export const dynamic = 'force-dynamic';

// Chrome + gate del admin DE GRUPO: exige rol admin EN el grupo de la URL (ctx.role,
// no session.role). El edge ya exigió sesión (decideAccess); aquí un logueado que no
// es admin de ese grupo (jugador, no-miembro, súper-admin hasta Tarea 3) va a su /me
// del grupo. Hereda navbar/container de g/[slug]/layout.tsx; añade el sidebar.
export default async function GroupAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await resolvePageContext(slug); // notFound() si el slug no existe
  if (ctx.role !== 'admin') redirect(`${ctx.basePath}/me`);

  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-8">
      <AdminSidebar basePath={ctx.basePath} />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
