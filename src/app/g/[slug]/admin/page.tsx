import { resolvePageContext } from '@/lib/auth/page-context';
import { AdminDashboardBody } from '@/components/pages/admin-dashboard-body';

export const dynamic = 'force-dynamic';

export default async function GroupAdminDashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await resolvePageContext(slug);
  return <AdminDashboardBody ctx={ctx} />;
}
