export interface NavLink {
  href: string;
  label: string;
  icon: string;
}

export const navLinks: NavLink[] = [
  { href: '/', label: 'Inicio', icon: '🏠' },
  { href: '/rankings', label: 'Ranking', icon: '🏆' },
  { href: '/rankings/pairs', label: 'Parejas', icon: '👥' },
  { href: '/matches', label: 'Partidos', icon: '📋' },
  { href: '/info', label: 'Info', icon: 'ℹ️' },
];
