import { resolvePageContext } from '@/lib/auth/page-context';
import { AdminNotificationsBody } from '@/components/pages/admin-notifications-body';

export const dynamic = 'force-dynamic';

// Réplica de /admin/notifications (Task 8, paridad 2b): cuerpo compartido
// (AdminNotificationsBody) por lógica de datos no trivial (join memberships↔usuarios),
// no por líneas — ver la nota de la excepción en admin-notifications-body.tsx.
// Hereda el gate admin-del-grupo del layout de /g/[slug]/admin (sin gate propio,
// a diferencia de la raíz, que conserva el suyo histórico).
export default async function GroupAdminNotificationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await resolvePageContext(slug);
  return <AdminNotificationsBody ctx={ctx} />;
}
