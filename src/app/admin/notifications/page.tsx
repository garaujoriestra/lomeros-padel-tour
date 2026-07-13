import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { resolvePageContext } from '@/lib/auth/page-context';
import { AdminNotificationsBody } from '@/components/pages/admin-notifications-body';

export const dynamic = 'force-dynamic';

// Gate propio histórico (redundante con /admin/layout.tsx, no se toca) + contexto =
// grupo por defecto. Cuerpo compartido con /g/[slug]/admin/notifications (Task 8,
// paridad 2b) — ver admin-notifications-body.tsx.
export default async function AdminNotificationsPage() {
  const session = await getSession();
  if (!session) redirect('/login?from=/admin/notifications');
  const ctx = await resolvePageContext();
  if (ctx.role !== 'admin') redirect('/me');

  return <AdminNotificationsBody ctx={ctx} />;
}
