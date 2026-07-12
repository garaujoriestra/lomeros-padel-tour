'use client';

import Link from 'next/link';
import { ArrowLeftRight, Check } from 'lucide-react';
import type { SwitcherGroup } from '@/lib/auth/group-switcher';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Conmutador de grupos del navbar: visible solo cuando el usuario alcanza 2+ grupos
// (multi-membership o súper-admin). Cada entrada navega a la home del grupo.
export function GroupSwitcher({ groups }: { groups: SwitcherGroup[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="icon-btn"
        title="Cambiar de grupo"
        aria-label="Cambiar de grupo"
        data-testid="group-switcher"
      >
        <ArrowLeftRight size={16} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {groups.map((g) => (
          <DropdownMenuItem key={g.slug} render={<Link href={g.href} />}>
            <span className="flex-1">{g.name}</span>
            {g.current && <Check size={14} aria-label="Grupo actual" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
