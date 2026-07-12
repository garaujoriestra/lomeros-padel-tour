import { permanentRedirect } from 'next/navigation';
import { Navbar } from '@/components/shared/navbar';
import { navSessionFromContext, resolvePageContext } from '@/lib/auth/page-context';
import { getSwitcherGroups } from '@/lib/auth/group-switcher';
import { hasSeasonPass, isPaidGroup } from '@/lib/billing/paid';

export const dynamic = 'force-dynamic';

export default async function GroupLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await resolvePageContext(slug); // notFound() si el slug no existe

  if (ctx.basePath === '') permanentRedirect('/'); // /g/lomeros → raíz canónica

  // Branding Fase 3: identidad de pago (logo/color/sin atribución) gateada por
  // isPaidGroup (flag-aware: en beta, todos); la ⭐ solo con pase REAL comprado.
  const paid = isPaidGroup(ctx.group);
  const accent = paid ? ctx.group.accentColor : null;
  const brand = {
    name: ctx.group.name,
    logoUrl: paid ? ctx.group.logoUrl : null,
    star: hasSeasonPass(ctx.group),
  };

  return (
    <div
      className="min-h-dvh flex flex-col"
      data-branding={accent ? 'custom' : 'default'}
      style={
        accent
          ? ({
              // --acc-text se computa en :root con el --acc de :root, así que al
              // sobreescribir --acc hay que redeclararla aquí (misma fórmula, theme-aware vía var(--ink)).
              '--acc': accent,
              '--acc-text': `color-mix(in oklab, ${accent} 55%, var(--ink))`,
            } as React.CSSProperties)
          : undefined
      }
    >
      <Navbar
        session={navSessionFromContext(ctx)}
        basePath={ctx.basePath}
        links={[]}
        brand={brand}
        switcher={await getSwitcherGroups(ctx.groupId)}
      />
      <main className="screen">
        <div className="lpt-container">{children}</div>
      </main>
      {!paid && (
        <footer className="muted" style={{ textAlign: 'center', fontSize: 12, padding: '12px 0 20px' }}>
          hecho con Lomeros Padel Tour
        </footer>
      )}
    </div>
  );
}
