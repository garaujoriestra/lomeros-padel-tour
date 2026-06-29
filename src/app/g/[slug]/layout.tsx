import { permanentRedirect } from 'next/navigation';
import { Navbar } from '@/components/shared/navbar';
import { resolvePageContext } from '@/lib/auth/page-context';

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

  const navSession =
    ctx.role && ctx.role !== 'super_admin'
      ? {
          role: ctx.role,
          player: ctx.player
            ? {
                id: ctx.player.id,
                name: ctx.player.name,
                nickname: ctx.player.nickname,
                avatarUrl: ctx.player.avatarUrl,
              }
            : null,
        }
      : null;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar session={navSession} basePath={ctx.basePath} links={[]} />
      <main className="screen">
        <div className="lpt-container">{children}</div>
      </main>
    </div>
  );
}
