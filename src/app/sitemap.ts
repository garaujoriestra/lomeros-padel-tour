import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/marketing/site-url';

// Solo páginas de plataforma/marketing: la app vive tras login y cada tour es
// de su grupo. /bandejazo es la puerta de captación; la raíz es el tour insignia.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const page = (
    path: string,
    priority: number,
  ): MetadataRoute.Sitemap[number] => ({
    url: new URL(path, base).toString(),
    changeFrequency: 'monthly',
    priority,
  });
  return [
    page('/bandejazo', 1),
    page('/', 0.6),
    page('/legal/privacidad', 0.2),
    page('/legal/terminos', 0.2),
  ];
}
