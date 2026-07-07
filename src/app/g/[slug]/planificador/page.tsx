import { resolvePageContext } from '@/lib/auth/page-context';
import { PlannerBody } from '@/components/pages/planner-body';

export const dynamic = 'force-dynamic';

// /g/[slug]/planificador: planificador EN el grupo del slug. Hereda el chrome
// group-aware de g/[slug]/layout.tsx. El edge exige sesión; el gating de ficha
// lo hace PlannerBody (sin ficha → bienvenida).
export default async function GroupPlanificadorPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { slug } = await params;
  const { week } = await searchParams;
  const ctx = await resolvePageContext(slug); // notFound() si el slug no existe
  return <PlannerBody ctx={ctx} weekParam={week} />;
}
