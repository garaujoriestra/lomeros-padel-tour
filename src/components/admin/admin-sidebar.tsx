'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const adminLinks = [
  { href: '/admin', label: '📊 Dashboard' },
  { href: '/admin/players', label: '👤 Jugadores' },
  { href: '/admin/matches', label: '🎾 Partidos' },
];

export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-52 shrink-0">
      <nav className="space-y-1">
        {adminLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'block px-3 py-2 rounded-md text-sm font-medium transition-colors',
              pathname === link.href
                ? 'bg-orange-100 text-orange-800'
                : 'text-gray-700 hover:bg-gray-100'
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
