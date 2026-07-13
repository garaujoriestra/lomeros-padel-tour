import { ImageResponse } from 'next/og';
import { crestDataUri } from '@/components/shared/crest-svg';
import { getGroupBySlug } from '@/lib/groups/resolve-slug';
import { isPaidGroup } from '@/lib/billing/paid';
import { hasCustomBranding, isValidAccentColor, isDarkColor } from '@/lib/groups/branding';

const PLATFORM_BG = 'linear-gradient(160deg, #1d2f2c 0%, #0c1715 60%)';

// Icono PWA de un grupo. Con marca de pago (acento o logo) → logo del grupo (best-effort,
// re-fetch + data-uri) o, si no hay logo o falla, monograma (inicial del nombre) sobre el
// color de acento; sin marca de pago → escudo de plataforma (idéntico a /icon).
// `safe` < 1 reduce el contenido para dejar zona segura en la variante maskable.
export async function renderGroupIcon(slug: string, canvas: number, safe = 1): Promise<Response> {
  const group = await getGroupBySlug(slug);
  if (!group) return new Response('Not found', { status: 404 });

  const paid = isPaidGroup(group);
  const accent = paid && isValidAccentColor(group.accentColor) ? group.accentColor : null;
  const branded = hasCustomBranding(group, paid);

  if (!branded) {
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

  if (group.logoUrl) {
    try {
      const res = await fetch(group.logoUrl);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const ct = res.headers.get('content-type') ?? 'image/png';
        const dataUri = `data:${ct};base64,${buf.toString('base64')}`;
        const inner = Math.round(canvas * 0.66 * safe);
        return new ImageResponse(
          (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: accent ?? '#0c1715' }}>
              <img src={dataUri} width={inner} height={inner} style={{ objectFit: 'contain' }} alt="" />
            </div>
          ),
          { width: canvas, height: canvas },
        );
      }
    } catch {
      // best-effort: si el fetch del logo falla, cae al monograma de abajo.
    }
  }

  const bg = accent ?? '#0c1715';
  const fg = accent && !isDarkColor(accent) ? '#0c1715' : '#ffffff';
  const letter = ([...group.name.trim()][0] ?? '?').toUpperCase();
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
