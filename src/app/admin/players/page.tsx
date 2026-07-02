import { resolvePageContext } from '@/lib/auth/page-context';
import { AdminPlayersBody } from '@/components/pages/admin-players-body';

export const dynamic = 'force-dynamic';

// /admin/players de raíz: contexto = grupo por defecto. Cuerpo compartido con /g/[slug]/admin/players.
export default async function PlayersAdminPage() {
  const ctx = await resolvePageContext();
  return <AdminPlayersBody ctx={ctx} />;
}
