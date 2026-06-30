import { resolvePageContext } from '@/lib/auth/page-context';
import { MeBody } from '@/components/pages/me-body';

export const dynamic = 'force-dynamic';

// /me de raíz: contexto = grupo por defecto. El cuerpo es compartido con /g/[slug]/me.
export default async function MePage() {
  const ctx = await resolvePageContext();
  return <MeBody ctx={ctx} />;
}
