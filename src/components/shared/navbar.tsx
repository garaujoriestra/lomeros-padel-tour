'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Sun, Moon, Settings, LogOut, LogIn } from 'lucide-react';
import { navLinks, isNavActive } from './nav-links';
import { LptAvatar, type LptPlayer } from '@/components/lpt/ui';
import Crest from './crest';

export interface NavSession {
  role: 'admin' | 'player';
  player: LptPlayer | null;
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

export function Navbar({ session = null }: { session?: NavSession | null }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  return (
    <header className={`topbar ${session ? 'with-session' : ''}`} aria-label="Barra superior">
      <div className="topbar-inner">
        <Link href="/" className="brand" aria-label="Inicio">
          <Crest size={34} className="brand-crest" title="Lomeros Padel Tour" wordmark={false} />
          <span className="brand-name">Lomeros Padel Tour</span>
        </Link>

        <nav className="nav-tabs" aria-label="Navegación principal">
          {navLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`nav-tab ${isNavActive(link.href, pathname) ? 'active' : ''}`}
              >
                <Icon size={15} strokeWidth={2.2} /> {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="topbar-actions">
          <ThemeToggle />
          {session ? (
            <>
              {session.role === 'admin' && (
                <Link href="/admin" className="icon-btn" title="Admin" aria-label="Admin">
                  <Settings size={16} />
                </Link>
              )}
              <button className="icon-btn" title="Salir" aria-label="Salir" onClick={handleLogout}>
                <LogOut size={16} />
              </button>
              {session.player && (
                <Link href="/me" title="Mi perfil" aria-label="Mi perfil" style={{ borderRadius: 99, display: 'inline-flex' }}>
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
