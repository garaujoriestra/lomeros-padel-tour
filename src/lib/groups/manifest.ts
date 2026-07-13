import type { MetadataRoute } from 'next';
import { isValidAccentColor } from './branding';

const PLATFORM_BG = '#0c1715';

export type ManifestBrand = {
  name: string;
  slug: string;
  logoUrl: string | null;
  accentColor: string | null;
};

/** Construye el manifest PWA de un grupo. Puro (sin DB). `basePath` '' = grupo por
 *  defecto (raíz); `/g/<slug>` para el resto. Gating espejo de Fase 3 vía `paid`. */
export function buildGroupManifest({
  brand,
  basePath,
  paid,
}: {
  brand: ManifestBrand;
  basePath: '' | `/g/${string}`;
  paid: boolean;
}): MetadataRoute.Manifest {
  const start = basePath || '/';
  const accent = paid && isValidAccentColor(brand.accentColor) ? brand.accentColor : null;
  const hasCustomBranding = paid && (!!accent || !!brand.logoUrl);
  const iconBase = hasCustomBranding ? basePath : '';
  return {
    id: start,
    name: brand.name,
    short_name: brand.name,
    description: `Ranking Elo, partidos y apuestas de ${brand.name}`,
    start_url: start,
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: PLATFORM_BG,
    theme_color: accent ?? PLATFORM_BG,
    icons: [
      { src: `${iconBase}/icon`, sizes: '192x192', type: 'image/png' },
      { src: `${iconBase}/icon-512`, sizes: '512x512', type: 'image/png' },
      { src: `${iconBase}/icon-maskable`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
