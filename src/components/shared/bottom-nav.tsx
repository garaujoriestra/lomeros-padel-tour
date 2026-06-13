'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, Trophy, Swords, Coins } from 'lucide-react';
import { isNavActive } from './nav-links';
import { LptAvatar, type LptPlayer } from '@/components/lpt/ui';

// Barra inferior curada para móvil (≠ menú de escritorio). La Timba ocupa el
// centro como acción destacada tipo «ficha de casino»; Parejas pasa a la página
// de Rankings, donde encaja como sub-clasificación.
const LEFT = [
  { href: '/', label: 'Inicio', icon: House },
  { href: '/rankings', label: 'Ranking', icon: Trophy },
];
const RIGHT = [{ href: '/matches', label: 'Partidos', icon: Swords }];

export function BottomNav({ player = null }: { player?: LptPlayer | null }) {
  const pathname = usePathname();
  const meActive = pathname === '/me' || pathname.startsWith('/me/');
  const timbaActive = pathname === '/rankings/tokens' && !meActive;

  const item = (href: string, label: string, Icon: typeof House) => {
    const active = isNavActive(href, pathname) && !meActive;
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`bn-item ${active ? 'active' : ''}`}
      >
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
        <span className="bn-chip">
          <Coins size={22} strokeWidth={2.4} />
        </span>
        <span className="bn-spacer" aria-hidden="true" />
        La Timba
      </Link>

      {RIGHT.map((l) => item(l.href, l.label, l.icon))}

      {/* Yo (perfil propio) */}
      <Link
        href={player ? '/me' : '/login'}
        aria-current={meActive ? 'page' : undefined}
        className={`bn-item ${meActive ? 'active' : ''}`}
      >
        {player ? (
          <LptAvatar player={player} size={20} />
        ) : (
          <span
            className="lpt-avatar"
            style={{ width: 20, height: 20, fontSize: 10, background: 'var(--surface-2)', color: 'var(--ink-3)' }}
          >
            ?
          </span>
        )}
        Yo
      </Link>
    </nav>
  );
}
