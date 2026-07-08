'use client';

import { ViewTransition } from 'react';
import type { ReactNode } from 'react';

// Slide direccional keado por tipo de transición. `default: 'none'` mantiene la
// transición muda en navegación lateral (tab-a-tab), revelados de Suspense y
// revalidaciones — solo las navegaciones adelante/atrás se apuntan vía su tipo.
const NAV_MAP = {
  'nav-forward': 'nav-forward',
  'nav-back': 'nav-back',
  default: 'none',
} as const;

/**
 * Transición direccional a nivel de página (lista → detalle). Envuelve la raíz
 * de una PAGE, nunca un layout (los layouts persisten entre navegaciones y no
 * disparan enter/exit). La dirección la marca el tipo de transición del disparo:
 * `<Link transitionTypes={['nav-forward']}>` para adelante, o
 * `<Link transitionTypes={['nav-back']}>` para atrás.
 */
export function DirectionalTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={NAV_MAP} exit={NAV_MAP} default="none">
      {children}
    </ViewTransition>
  );
}
