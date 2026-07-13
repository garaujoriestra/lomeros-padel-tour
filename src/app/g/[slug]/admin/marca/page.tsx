import { resolvePageContext } from '@/lib/auth/page-context';
import { hasSeasonPass } from '@/lib/billing/paid';
import { BrandingForm } from '@/components/admin/branding-form';

export const dynamic = 'force-dynamic';

// Marca del grupo (Fase 3): logo + color de acento + estado del Pase de Temporada.
// Solo existe bajo /g/[slug] (la raíz es el grupo por defecto: su marca es la del producto).
export default async function GroupBrandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await resolvePageContext(slug); // el layout admin ya gateó el rol

  return (
    <BrandingForm
      slug={slug}
      initial={{ logoUrl: ctx.group.logoUrl, accentColor: ctx.group.accentColor }}
      pass={{
        billingEnabled: process.env.BILLING_ENABLED === 'true',
        active: hasSeasonPass(ctx.group),
        paidUntil: ctx.group.paidUntil,
      }}
    />
  );
}
