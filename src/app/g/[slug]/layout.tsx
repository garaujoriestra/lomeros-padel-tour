import { permanentRedirect } from 'next/navigation';
import { Navbar } from '@/components/shared/navbar';
import { BottomNav } from '@/components/shared/bottom-nav';
import { navSessionFromContext, resolvePageContext } from '@/lib/auth/page-context';
import { getSwitcherGroups } from '@/lib/auth/group-switcher';
import { hasSeasonPass, isPaidGroup } from '@/lib/billing/paid';
import { isDarkColor, isValidAccentColor } from '@/lib/groups/branding';
import { PLATFORM_NAME } from '@/lib/groups/constants';

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
  // Defensa en profundidad: aunque el API ya valida al guardar, el color acaba en
  // un style inline — solo se aplica si sigue siendo un #rrggbb estricto.
  const accent = paid && isValidAccentColor(ctx.group.accentColor) ? ctx.group.accentColor : null;
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
              // --acc-text y --primary se computan en :root con el --acc de :root, así
              // que al sobreescribir --acc hay que redeclararlas aquí (fórmula del tema
              // claro, legible también en oscuro vía var(--ink)).
              '--acc': accent,
              '--acc-text': `color-mix(in oklab, ${accent} 55%, var(--ink))`,
              '--primary': accent,
              // --on-acc (y --primary-foreground, que en :root se computa de él) es casi
              // negro por defecto; sobre un acento oscuro sería dark-on-dark → blanco.
              ...(isDarkColor(accent) ? { '--on-acc': '#ffffff', '--primary-foreground': '#ffffff' } : {}),
            } as React.CSSProperties)
          : undefined
      }
    >
      {/* Sin prop `links`: Navbar los calcula de `basePath` en cliente (ver comentario
          en navbar.tsx) — pasarlos ya resueltos desde aquí (Server Component) rompería
          la serialización RSC de los iconos. Paridad 2b: el grupo tiene nav completa. */}
      <Navbar
        session={navSessionFromContext(ctx)}
        basePath={ctx.basePath}
        brand={brand}
        switcher={await getSwitcherGroups(ctx.groupId)}
      />
      <main className="screen">
        <div className="lpt-container">{children}</div>
      </main>
      <BottomNav basePath={ctx.basePath} />
      {!paid && (
        <footer className="muted" style={{ textAlign: 'center', fontSize: 12, padding: '12px 0 20px' }}>
          hecho con {PLATFORM_NAME}
        </footer>
      )}
    </div>
  );
}
