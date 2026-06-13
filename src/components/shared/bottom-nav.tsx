'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, Trophy, Swords, Users, Coins } from 'lucide-react';
import { isNavActive } from './nav-links';
import { NavProgress } from './nav-progress';

// Barra inferior curada para móvil (≠ menú de escritorio). La Timba ocupa el
// centro como acción destacada tipo «ficha de casino». El perfil NO está aquí:
// vive arriba a la derecha (avatar / «Entrar»), lo que libera el hueco para que
// quepan todas las secciones principales.
const LEFT = [
  { href: '/', label: 'Inicio', icon: House },
  { href: '/rankings', label: 'Ranking', icon: Trophy },
];
const RIGHT = [
  { href: '/matches', label: 'Partidos', icon: Swords },
  { href: '/rankings/pairs', label: 'Parejas', icon: Users },
];

export function BottomNav() {
  const pathname = usePathname();
  const timbaActive = pathname === '/rankings/tokens';

  const item = (href: string, label: string, Icon: typeof House) => {
    const active = isNavActive(href, pathname);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`bn-item ${active ? 'active' : ''}`}
      >
        <NavProgress />
        <Icon size={19} strokeWidth={active ? 2.5 : 2} />
        {label}
      </Link>
    );
  };

  return (
    <nav className="bottomnav" aria-label="Navegación inferior">
      {LEFT.map((l) => item(l.href, l.label, l.icon))}

      {/* La Timba — acción destacada (ficha que sobresale de la barra) */}
      <Link
        href="/rankings/tokens"
        aria-current={timbaActive ? 'page' : undefined}
        className={`bn-item bn-timba ${timbaActive ? 'active' : ''}`}
      >
        <NavProgress />
        <span className="bn-chip">
          <Coins size={22} strokeWidth={2.4} />
        </span>
        <span className="bn-spacer" aria-hidden="true" />
        La Timba
      </Link>

      {RIGHT.map((l) => item(l.href, l.label, l.icon))}
    </nav>
  );
}
