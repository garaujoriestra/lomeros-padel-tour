import { House, Trophy, Users, Swords, Info, Coins, CalendarDays, CalendarCheck, type LucideIcon } from 'lucide-react';

export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const navLinks: NavLink[] = [
  { href: '/', label: 'Inicio', icon: House },
  { href: '/rankings', label: 'Ranking', icon: Trophy },
  { href: '/rankings/pairs', label: 'Parejas', icon: Users },
  { href: '/matches', label: 'Partidos', icon: Swords },
  { href: '/eventos', label: 'Eventos', icon: CalendarDays },
  { href: '/planificador', label: 'Planificador', icon: CalendarCheck },
  { href: '/rankings/tokens', label: 'La Timba', icon: Coins },
  { href: '/info', label: 'Info', icon: Info },
];

/** Activo también en subrutas relacionadas (perfil → Ranking, detalle → Partidos). */
export function isNavActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  if (href === '/rankings') return pathname === '/rankings' || pathname.startsWith('/players');
  if (href === '/rankings/pairs') return pathname === '/rankings/pairs';
  if (href === '/rankings/tokens') return pathname === '/rankings/tokens';
  if (href === '/matches') return pathname.startsWith('/matches');
  if (href === '/eventos') {
    return pathname.startsWith('/eventos') || pathname.startsWith('/pozos') || pathname.startsWith('/torneos');
  }
  return pathname === href;
}
