import { Navbar } from '@/components/shared/navbar';
import { BottomNav } from '@/components/shared/bottom-nav';
import { getSession } from '@/lib/auth/session';

export default async function MeLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg,#f0fdf4 0%,#dcfce7 45%,#f0fdf4 80%,#ecfdf5 100%)' }}>
      <Navbar session={session ? { role: session.role, hasPlayer: !!session.player } : null} />
      <main className="max-w-6xl mx-auto px-4 pt-6 sm:pt-8 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-8">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
