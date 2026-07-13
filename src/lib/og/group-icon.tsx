import { ImageResponse } from 'next/og';
import { crestDataUri } from '@/components/shared/crest-svg';
import { getGroupBySlug } from '@/lib/groups/resolve-slug';
import { isPaidGroup } from '@/lib/billing/paid';
import { isValidAccentColor, isDarkColor } from '@/lib/groups/branding';

const PLATFORM_BG = 'linear-gradient(160deg, #1d2f2c 0%, #0c1715 60%)';

// Icono PWA de un grupo. Con marca de pago (acento o logo) → monograma (inicial del
// nombre) sobre el color de acento; si no → escudo de plataforma (idéntico a /icon).
// `safe` < 1 reduce el contenido para dejar zona segura en la variante maskable.
export async function renderGroupIcon(slug: string, canvas: number, safe = 1): Promise<ImageResponse> {
  const group = await getGroupBySlug(slug);
  const paid = group ? isPaidGroup(group) : false;
  const accent = group && paid && isValidAccentColor(group.accentColor) ? group.accentColor : null;
  const hasBrand = !!group && paid && (!!accent || !!group.logoUrl);

  if (!hasBrand) {
    const inner = Math.round(canvas * 0.72 * safe);
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: PLATFORM_BG }}>
          <img src={crestDataUri(inner)} width={inner} height={Math.round(inner * 1.08)} alt="" />
        </div>
      ),
      { width: canvas, height: canvas },
    );
  }

  const bg = accent ?? '#0c1715';
  const fg = accent && !isDarkColor(accent) ? '#0c1715' : '#ffffff';
  const letter = (group!.name.trim()[0] ?? '?').toUpperCase();
  const fontSize = Math.round(canvas * 0.5 * safe);
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: bg }}>
        <div style={{ fontSize, fontWeight: 800, fontStyle: 'italic', color: fg, lineHeight: 1 }}>{letter}</div>
      </div>
    ),
    { width: canvas, height: canvas },
  );
}
