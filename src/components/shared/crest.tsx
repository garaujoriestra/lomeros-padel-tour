import { VIEWBOX_W, VIEWBOX_H, crestInnerMarkup, crestInnerMarkupNoWordmark } from './crest-svg';
import { PLATFORM_NAME } from '@/lib/groups/constants';

/**
 * Escudo de marca LPT como componente React (estático, sin animación).
 * Reutiliza el inner markup de crest-svg.ts para no duplicar la geometría.
 * Con `wordmark={false}` muestra solo el escudo + las palas (sin el texto
 * "LPT"), pensado para tamaños pequeños donde el texto no se aprecia.
 */
export default function Crest({
  size = 96,
  className,
  title = PLATFORM_NAME,
  wordmark = true,
}: {
  size?: number;
  className?: string;
  title?: string;
  wordmark?: boolean;
}) {
  const height = Math.round((size * VIEWBOX_H) / VIEWBOX_W);
  const inner = wordmark ? crestInnerMarkup() : crestInnerMarkupNoWordmark();
  return (
    <svg
      width={size}
      height={height}
      viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
      className={className}
      role="img"
      aria-label={title}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}
