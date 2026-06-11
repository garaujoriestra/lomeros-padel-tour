import { Navbar } from '@/components/shared/navbar';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { getSession } from '@/lib/auth/session';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar session={session ? { role: session.role, hasPlayer: !!session.player } : null} />
      <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8 flex flex-col md:flex-row gap-4 md:gap-8">
        <AdminSidebar />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
