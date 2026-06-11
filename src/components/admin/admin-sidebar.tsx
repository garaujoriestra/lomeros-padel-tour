'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const adminLinks = [
  { href: '/admin', label: '📊 Dashboard' },
  { href: '/admin/players', label: '👤 Jugadores' },
  { href: '/admin/matches', label: '🎾 Partidos' },
  { href: '/admin/notifications', label: '🔔 Notificaciones' },
];

export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <aside className="md:w-52 md:shrink-0">
      <nav className="flex md:flex-col gap-2 md:gap-1 overflow-x-auto md:overflow-visible -mx-4 px-4 md:mx-0 md:px-0 pb-1 md:pb-0">
        {adminLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'inline-flex items-center min-h-[40px] px-4 md:px-3 md:py-2 rounded-full md:rounded-md text-sm font-medium transition-colors whitespace-nowrap shrink-0 md:shrink',
              pathname === link.href
                ? 'bg-orange-100 text-orange-800'
                : 'bg-white text-gray-700 hover:bg-gray-100 md:bg-transparent'
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
