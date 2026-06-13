import { VIEWBOX_W, VIEWBOX_H, crestInnerMarkup } from './crest-svg';

/**
 * Escudo de marca LPT como componente React (estático, sin animación).
 * Reutiliza el inner markup de crest-svg.ts para no duplicar la geometría.
 */
export default function Crest({
  size = 96,
  className,
  title = 'Lomeros Padel Tour',
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  const height = Math.round((size * VIEWBOX_H) / VIEWBOX_W);
  return (
    <svg
      width={size}
      height={height}
      viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
      className={className}
      role="img"
      aria-label={title}
      dangerouslySetInnerHTML={{ __html: crestInnerMarkup() }}
    />
  );
}
