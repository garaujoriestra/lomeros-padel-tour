import { permanentRedirect } from 'next/navigation';
import { Navbar } from '@/components/shared/navbar';
import { BottomNav } from '@/components/shared/bottom-nav';
import { navSessionFromContext, resolvePageContext } from '@/lib/auth/page-context';
import { getSwitcherGroups } from '@/lib/auth/group-switcher';

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

  return (
    <div className="min-h-dvh flex flex-col">
      {/* Sin prop `links`: Navbar la calcula de `basePath` en cliente (ver
          comentario en navbar.tsx) — pasarla ya resuelta desde aquí (Server
          Component) rompería la serialización RSC de los iconos. */}
      <Navbar
        session={navSessionFromContext(ctx)}
        basePath={ctx.basePath}
        switcher={await getSwitcherGroups(ctx.groupId)}
      />
      <main className="screen">
        <div className="lpt-container">{children}</div>
      </main>
      <BottomNav basePath={ctx.basePath} />
    </div>
  );
}
