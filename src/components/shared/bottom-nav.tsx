'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { navLinks } from './nav-links';

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-green-950/95 backdrop-blur border-t border-green-900/50 pb-[env(safe-area-inset-bottom)]"
      aria-label="Navegación principal"
    >
      <ul className="grid grid-cols-5">
        {navLinks.map((link) => {
          const active = pathname === link.href;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 min-h-14 py-1.5 transition-colors',
                  active
                    ? 'bg-green-400/15 text-white'
                    : 'text-green-300 hover:text-white'
                )}
              >
                <span className="text-xl leading-none" aria-hidden="true">
                  {link.icon}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wide leading-none">
                  {link.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
