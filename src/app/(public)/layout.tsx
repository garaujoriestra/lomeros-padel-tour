import { Navbar } from '@/components/shared/navbar';
import { BottomNav } from '@/components/shared/bottom-nav';
import { navSessionFromContext, resolvePageContext } from '@/lib/auth/page-context';

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const ctx = await resolvePageContext();

  return (
    <div className="min-h-dvh flex flex-col">
      <Navbar session={navSessionFromContext(ctx)} />
      <main className="screen">
        <div className="lpt-container">{children}</div>
      </main>
      <BottomNav />
    </div>
  );
}
