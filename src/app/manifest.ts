import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Lomeros Padel Tour',
    short_name: 'LPT',
    description: 'El ranking oficial del grupo Lomeros · LPT',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f0fdf4',
    theme_color: '#052e16',
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
    ],
  };
}
