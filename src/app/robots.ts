import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/marketing/site-url';

// Rastreo: lo público (landing, legales, tours) sí; API, admin y rutas de
// sesión no. Lo indexable de verdad lo enumera el sitemap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        disallow: [
          '/api/',
          '/admin',
          '/me',
          '/planificador',
          '/login',
          '/dev-login',
          '/g/*/admin',
          '/g/*/me',
          '/g/*/planificador',
        ],
      },
    ],
    sitemap: new URL('/sitemap.xml', siteUrl()).toString(),
  };
}
