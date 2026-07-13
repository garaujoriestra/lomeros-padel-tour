'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Swords, Bell, Gift, Ticket, Coins, Trophy, Palette, type LucideIcon } from 'lucide-react';
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
  { href: '/admin/marca', label: 'Marca', icon: Palette },
];

// La paridad 2b completó todas las secciones bajo /g/[slug]/admin, así que el filtro
// MVP que las omitía (evitar enlazar 404s) ya no hace falta. Solo queda la distinción
// de secciones SOLO-grupo: sin página en la raíz (la marca de la raíz es la del producto).
const GROUP_ONLY_LINKS = new Set(['/admin/marca']);

function isActive(href: string, pathname: string) {
  return href.endsWith('/admin') ? pathname === href : pathname.startsWith(href);
}

export function AdminSidebar({ basePath = '' }: { basePath?: string }) {
  const pathname = usePathname();
  // Grupo: todas las secciones (paridad 2b), incluida Marca (solo-grupo).
  // Raíz: todo menos las solo-grupo (la marca de la raíz es la del producto).
  const links = basePath ? adminLinks : adminLinks.filter((l) => !GROUP_ONLY_LINKS.has(l.href));
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
