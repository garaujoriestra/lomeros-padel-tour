import { resolvePageContext } from '@/lib/auth/page-context';
import { PlannerBody } from '@/components/pages/planner-body';

export const dynamic = 'force-dynamic';

// /planificador de raíz: contexto = grupo por defecto. Cuerpo compartido con /g/[slug].
export default async function PlanificadorPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const ctx = await resolvePageContext();
  return <PlannerBody ctx={ctx} weekParam={week} />;
}
