'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Sun, Moon, Settings, LogOut, LogIn } from 'lucide-react';
import { navLinks, isNavActive, type NavLink } from './nav-links';
import { LptAvatar, type LptPlayer } from '@/components/lpt/ui';
import type { SwitcherGroup } from '@/lib/auth/group-switcher';
import { GroupSwitcher } from './group-switcher';
import Crest from './crest';

export interface NavSession {
  role: 'admin' | 'player' | 'super_admin';
  player: LptPlayer | null;
}

export interface NavBrand {
  name: string;
  logoUrl: string | null; // ya viene gateado por isPaidGroup desde el layout
  star: boolean; // ⭐ Tour Oficial (hasSeasonPass)
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // El icono se decide por CSS según la clase `.dark` del <html> (la pone el script
  // bloqueante de next-themes antes del primer pintado), así no hay desajuste de
  // hidratación y no hace falta un flag `mounted` con setState dentro de un efecto.
  return (
    <button
      className="icon-btn"
      title="Cambiar tema"
      aria-label="Cambiar tema"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      <Moon size={16} className="block dark:hidden" />
      <Sun size={16} className="hidden dark:block" />
    </button>
  );
}

export function Navbar({
  session = null,
  basePath = '',
  links = navLinks,
  brand = null,
  switcher = null,
}: {
  session?: NavSession | null;
  basePath?: string;
  links?: NavLink[];
  brand?: NavBrand | null;
  switcher?: SwitcherGroup[] | null;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push(basePath || '/');
    router.refresh();
  }

  return (
    <header
      className={`topbar ${session ? 'with-session' : ''}`}
      aria-label="Barra superior"
      style={{ viewTransitionName: 'lpt-topbar' }}
    >
      <div className="topbar-inner">
        <Link href={basePath || '/'} className="brand" aria-label="Inicio">
          {brand?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob externo, tamaño fijo
            <img
              src={brand.logoUrl}
              alt=""
              width={34}
              height={34}
              style={{ borderRadius: 8, objectFit: 'cover' }}
            />
          ) : (
            <Crest size={34} className="brand-crest" title={brand?.name ?? 'Lomeros Padel Tour'} wordmark={false} />
          )}
          <span className="brand-name">{brand?.name ?? 'Lomeros Padel Tour'}</span>
          {brand?.star && (
            <span title="Tour Oficial" aria-label="Tour Oficial" style={{ fontSize: 14 }}>
              ⭐
            </span>
          )}
        </Link>

        <nav className="nav-tabs" aria-label="Navegación principal">
          {links.map((link) => {
            const Icon = link.icon;
            const href = `${basePath}${link.href === '/' ? '' : link.href}` || '/';
            return (
              <Link
                key={link.href}
                href={href}
                className={`nav-tab ${isNavActive(href, pathname) ? 'active' : ''}`}
              >
                <Icon size={15} strokeWidth={2.2} /> {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="topbar-actions">
          {switcher && <GroupSwitcher groups={switcher} />}
          <ThemeToggle />
          {session ? (
            <>
              {/* Engranaje: admin del grupo, o súper-admin bajo /g/ (solo-lectura; en la
                  raíz el layout admin le redirige fuera, así que no se le ofrece). */}
              {(session.role === 'admin' || (session.role === 'super_admin' && basePath !== '')) && (
                <Link href={`${basePath}/admin`} className="icon-btn" title="Admin" aria-label="Admin">
                  <Settings size={16} />
                </Link>
              )}
              <button className="icon-btn" title="Salir" aria-label="Salir" onClick={handleLogout}>
                <LogOut size={16} />
              </button>
              {session.player && (
                <Link href={`${basePath}/me`} title="Mi perfil" aria-label="Mi perfil" style={{ borderRadius: 99, display: 'inline-flex' }}>
                  <LptAvatar player={session.player} size={34} />
                </Link>
              )}
            </>
          ) : (
            <Link href="/login" className="lpt-btn" style={{ minHeight: 36, padding: '6px 14px' }}>
              <LogIn size={14} /> Entrar
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
