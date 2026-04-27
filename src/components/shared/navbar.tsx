'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { navLinks } from './nav-links';

export function Navbar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  return (
    <nav aria-label="Barra superior" className="bg-gradient-to-r from-green-950 via-green-900 to-green-950 text-white shadow-2xl sticky top-0 z-50 border-b border-green-800/50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 font-black text-xl tracking-tight hover:opacity-80 transition-opacity shrink-0">
          <span className="text-2xl">🎾</span>
          <span>LPT<span className="text-green-400 ml-1">·</span></span>
          <span className="hidden lg:block text-xs text-green-300 font-semibold uppercase tracking-widest">Lomeros Padel Tour</span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200',
                pathname === link.href
                  ? 'bg-green-400/20 text-white border border-green-400/30 shadow-inner'
                  : 'text-green-200 hover:text-white hover:bg-white/10'
              )}
            >
              {link.icon} {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isAdmin ? (
            <>
              <Link
                href="/admin"
                className="inline-flex items-center min-h-[40px] px-3 rounded-full text-sm font-semibold bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 border border-orange-500/30 transition-all"
              >
                ⚙️ Admin
              </Link>
              <button
                onClick={handleLogout}
                className="inline-flex items-center min-h-[40px] px-3 rounded-full text-sm font-medium text-green-300 hover:text-white hover:bg-white/10 transition-all"
              >
                Salir
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center min-h-[40px] px-4 rounded-full text-sm font-semibold border border-green-600 text-green-300 hover:bg-green-800 hover:text-white transition-all"
            >
              Admin
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
