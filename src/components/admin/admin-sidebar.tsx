'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Swords, Bell, Gift, Ticket, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const adminLinks: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/players', label: 'Jugadores', icon: Users },
  { href: '/admin/matches', label: 'Partidos', icon: Swords },
  { href: '/admin/notifications', label: 'Avisos', icon: Bell },
  { href: '/admin/rewards', label: 'Premios', icon: Gift },
  { href: '/admin/redemptions', label: 'Canjes', icon: Ticket },
];

function isActive(href: string, pathname: string) {
  return href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
}

export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <aside className="md:w-48 md:shrink-0">
      <nav className="flex md:flex-col gap-1.5 overflow-x-auto md:overflow-visible -mx-4 px-4 md:mx-0 md:px-0 pb-1 md:pb-0">
        {adminLinks.map((link) => {
          const Icon = link.icon;
          const active = isActive(link.href, pathname);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'nav-tab whitespace-nowrap shrink-0 md:shrink min-h-[40px]',
                active ? 'active' : 'bg-surface md:bg-transparent border border-line md:border-transparent'
              )}
            >
              <Icon size={15} strokeWidth={2.2} /> {link.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
