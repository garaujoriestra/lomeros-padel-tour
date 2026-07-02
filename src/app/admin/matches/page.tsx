import { resolvePageContext } from '@/lib/auth/page-context';
import { AdminMatchesBody } from '@/components/pages/admin-matches-body';

export const dynamic = 'force-dynamic';

// /admin/matches de raíz: contexto = grupo por defecto. Cuerpo compartido con /g/[slug]/admin/matches.
export default async function MatchesAdminPage() {
  const ctx = await resolvePageContext();
  return <AdminMatchesBody ctx={ctx} />;
}
