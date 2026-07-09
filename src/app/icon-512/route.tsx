import { ImageResponse } from 'next/og';
import { crestDataUri } from '@/components/shared/crest-svg';

// Icono PWA grande: Android lo usa para el splash de instalación (sin él,
// escala el de 192px y se ve borroso).
export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(160deg, #1d2f2c 0%, #0c1715 60%)',
        }}
      >
        <img src={crestDataUri(352)} width={352} height={379} alt="LPT" />
      </div>
    ),
    { width: 512, height: 512 },
  );
}
