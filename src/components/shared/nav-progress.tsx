'use client';

import { useLinkStatus } from 'next/link';

/**
 * Barra de progreso superior para la navegación entre pantallas.
 *
 * Se renderiza DENTRO de un <Link> (requisito de `useLinkStatus`) pero pinta una
 * barra `position: fixed` a lo ancho de la parte superior. Solo se revela si la
 * navegación tarda más de ~120 ms (animation-delay), así que en cambios rápidos
 * no parpadea. Da feedback inmediato de «he tocado, está cargando» manteniendo
 * la pantalla actual visible.
 */
export function NavProgress() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className={`route-progress ${pending ? 'route-progress--active' : ''}`}
    />
  );
}
