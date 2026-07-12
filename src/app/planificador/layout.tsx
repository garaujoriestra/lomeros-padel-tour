import { Navbar } from '@/components/shared/navbar';
import { BottomNav } from '@/components/shared/bottom-nav';
import { navSessionFromContext, resolvePageContext } from '@/lib/auth/page-context';
import { getSwitcherGroups } from '@/lib/auth/group-switcher';

export default async function PlanificadorLayout({ children }: { children: React.ReactNode }) {
  const ctx = await resolvePageContext();

  return (
    <div className="min-h-dvh flex flex-col">
      <Navbar session={navSessionFromContext(ctx)} switcher={await getSwitcherGroups(ctx.groupId)} />
      <main className="screen">
        <div className="lpt-container">{children}</div>
      </main>
      <BottomNav />
    </div>
  );
}
