'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Swords, Bell, Gift, Ticket, Coins, Trophy, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const adminLinks: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/players', label: 'Jugadores', icon: Users },
  { href: '/admin/matches', label: 'Partidos', icon: Swords },
  { href: '/admin/pozos', label: 'Pozos', icon: Trophy },
  { href: '/admin/torneos', label: 'Torneos', icon: Trophy },
  { href: '/admin/notifications', label: 'Avisos', icon: Bell },
  { href: '/admin/rewards', label: 'Premios', icon: Gift },
  { href: '/admin/redemptions', label: 'Canjes', icon: Ticket },
  { href: '/admin/timba', label: 'La Timba', icon: Coins },
];

// Bajo /g/[slug] solo existen las páginas MVP de la paridad (dashboard/players/matches);
// el resto de secciones se omite para no enlazar 404s. En raíz se muestra todo.
const GROUP_MVP_LINKS = new Set(['/admin', '/admin/players', '/admin/matches']);

function isActive(href: string, pathname: string) {
  return href.endsWith('/admin') ? pathname === href : pathname.startsWith(href);
}

export function AdminSidebar({ basePath = '' }: { basePath?: string }) {
  const pathname = usePathname();
  const links = basePath ? adminLinks.filter((l) => GROUP_MVP_LINKS.has(l.href)) : adminLinks;
  return (
    <aside className="md:w-48 md:shrink-0">
      <nav className="flex md:flex-col gap-1.5 overflow-x-auto md:overflow-visible -mx-4 px-4 md:mx-0 md:px-0 pb-1 md:pb-0">
        {links.map((link) => {
          const Icon = link.icon;
          const href = `${basePath}${link.href}`;
          const active = isActive(href, pathname);
          return (
            <Link
              key={link.href}
              href={href}
              className={cn(
                'nav-tab whitespace-nowrap shrink-0 md:shrink min-h-11',
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
