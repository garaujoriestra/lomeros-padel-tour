import { resolvePageContext } from '@/lib/auth/page-context';
import { MeBody } from '@/components/pages/me-body';

export const dynamic = 'force-dynamic';

// /g/[slug]/me: perfil del jugador EN el grupo del slug. Hereda el chrome group-aware
// de g/[slug]/layout.tsx (Paso 1). El edge exige sesión (decideAccess); el gating de
// ficha lo hace MeBody (sin ficha → bienvenida, sin redirect-loop).
export default async function GroupMePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await resolvePageContext(slug); // notFound() si el slug no existe
  return <MeBody ctx={ctx} />;
}
