'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { navLinks, isNavActive } from './nav-links';
import { LptAvatar, type LptPlayer } from '@/components/lpt/ui';

export function BottomNav({ player = null }: { player?: LptPlayer | null }) {
  const pathname = usePathname();
  // En móvil "Info" cede su sitio a "Yo" (perfil propio); Info queda en el menú superior.
  const items = navLinks.slice(0, 4);
  const meActive = pathname === '/me' || pathname.startsWith('/me/');

  return (
    <nav className="bottomnav" aria-label="Navegación inferior">
      {items.map((link) => {
        const Icon = link.icon;
        const active = isNavActive(link.href, pathname) && !meActive;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={`bn-item ${active ? 'active' : ''}`}
          >
            <Icon size={19} strokeWidth={active ? 2.5 : 2} />
            {link.label}
          </Link>
        );
      })}
      <Link
        href={player ? '/me' : '/login'}
        aria-current={meActive ? 'page' : undefined}
        className={`bn-item ${meActive ? 'active' : ''}`}
      >
        {player ? (
          <LptAvatar
            player={player}
            size={20}
            className={meActive ? '' : undefined}
          />
        ) : (
          <span className="lpt-avatar" style={{ width: 20, height: 20, fontSize: 10, background: 'var(--surface-2)', color: 'var(--ink-3)' }}>?</span>
        )}
        Yo
      </Link>
    </nav>
  );
}
