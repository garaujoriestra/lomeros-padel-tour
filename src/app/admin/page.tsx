import { resolvePageContext } from '@/lib/auth/page-context';
import { AdminDashboardBody } from '@/components/pages/admin-dashboard-body';

export const dynamic = 'force-dynamic';

// /admin de raíz: contexto = grupo por defecto. Cuerpo compartido con /g/[slug]/admin.
export default async function AdminDashboard() {
  const ctx = await resolvePageContext();
  return <AdminDashboardBody ctx={ctx} />;
}
