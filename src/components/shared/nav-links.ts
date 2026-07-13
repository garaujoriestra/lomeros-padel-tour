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

/**
 * Tabs para un grupo dado, con los hrefs prefijados por su `basePath`
 * (`'' | '/g/<slug>'`). `/info` se excluye fuera de la raíz: es contenido con
 * storytelling propio de Lomeros (historia del grupo, etc.) — literales de
 * marca por grupo quedan para la Fase 4, así que de momento no tiene sentido
 * bajo `/g/[slug]`.
 */
export function navLinksFor(basePath: string): NavLink[] {
  return navLinks
    .filter((link) => basePath === '' || link.href !== '/info')
    .map((link) => ({
      ...link,
      href: link.href === '/' ? basePath || '/' : `${basePath}${link.href}`,
    }));
}

/**
 * Reduce un `href`/`pathname` con posible prefijo `/g/<slug>` a su forma
 * desnuda (sin el prefijo de grupo), para poder reutilizar la lógica de
 * activación de la raíz sin duplicarla. Si el `href` lleva prefijo de grupo
 * pero el `pathname` no comparte ese mismo prefijo, no puede estar activo.
 */
function stripGroupPrefix(href: string, pathname: string): { hrefBase: string; pathBase: string } | null {
  const match = href.match(/^(\/g\/[^/]+)(\/.*)?$/);
  if (!match) return { hrefBase: href, pathBase: pathname };

  const [, prefix, rest] = match;
  if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return null;

  return { hrefBase: rest || '/', pathBase: pathname.slice(prefix.length) || '/' };
}

/** Activo también en subrutas relacionadas (perfil → Ranking, detalle → Partidos). */
export function isNavActive(href: string, pathname: string): boolean {
  const stripped = stripGroupPrefix(href, pathname);
  if (!stripped) return false;
  const { hrefBase: base, pathBase: path } = stripped;

  if (base === '/') return path === '/';
  if (base === '/rankings') return path === '/rankings' || path.startsWith('/players');
  if (base === '/rankings/pairs') return path === '/rankings/pairs';
  if (base === '/rankings/tokens') return path === '/rankings/tokens';
  if (base === '/matches') return path.startsWith('/matches');
  if (base === '/eventos') {
    return path.startsWith('/eventos') || path.startsWith('/pozos') || path.startsWith('/torneos');
  }
  return path === base;
}
