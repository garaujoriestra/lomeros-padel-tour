import { permanentRedirect } from 'next/navigation';
import { Navbar } from '@/components/shared/navbar';
import { navSessionFromContext, resolvePageContext } from '@/lib/auth/page-context';

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
      <Navbar session={navSessionFromContext(ctx)} basePath={ctx.basePath} links={[]} />
      <main className="screen">
        <div className="lpt-container">{children}</div>
      </main>
    </div>
  );
}
