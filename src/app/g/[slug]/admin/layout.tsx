import { redirect } from 'next/navigation';
import { Eye } from 'lucide-react';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { resolvePageContext } from '@/lib/auth/page-context';

export const dynamic = 'force-dynamic';

// Chrome + gate del admin DE GRUPO: exige rol admin EN el grupo de la URL (ctx.role,
// no session.role). El edge ya exigió sesión (decideAccess); aquí un logueado que no
// es admin de ese grupo (jugador o no-miembro) va a su /me del grupo. El súper-admin
// entra en SOLO-LECTURA (Tarea 3): ve las vistas, pero cualquier escritura la rechaza
// requireGroupAdmin en la API con 403. Hereda navbar/container de g/[slug]/layout.tsx.
export default async function GroupAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await resolvePageContext(slug); // notFound() si el slug no existe
  if (ctx.role !== 'admin' && ctx.role !== 'super_admin') redirect(`${ctx.basePath}/me`);

  return (
    <div className="flex flex-col gap-4">
      {ctx.role === 'super_admin' && (
        <div className="lpt-card muted flex items-center gap-2 px-4 py-2 text-sm" role="status">
          <Eye size={15} aria-hidden />
          Solo lectura — estás viendo este grupo como súper-admin; los cambios están deshabilitados.
        </div>
      )}
      <div className="flex flex-col md:flex-row gap-4 md:gap-8">
        <AdminSidebar basePath={ctx.basePath} />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
