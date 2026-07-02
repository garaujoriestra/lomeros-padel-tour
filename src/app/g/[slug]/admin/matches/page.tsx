import { resolvePageContext } from '@/lib/auth/page-context';
import { AdminMatchesBody } from '@/components/pages/admin-matches-body';

export const dynamic = 'force-dynamic';

export default async function GroupAdminMatchesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await resolvePageContext(slug);
  return <AdminMatchesBody ctx={ctx} />;
}
