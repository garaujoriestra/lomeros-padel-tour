import type { MetadataRoute } from 'next';
import { PLATFORM_NAME } from '@/lib/groups/constants';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PLATFORM_NAME,
    short_name: PLATFORM_NAME,
    description: 'Ranking Elo, partidos y apuestas de tu grupo de pádel · ' + PLATFORM_NAME,
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0c1715',
    theme_color: '#0c1715',
    icons: [
      {
        src: '/icon',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
      },
      {
        src: '/icon-512',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icon-maskable',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
