import { ImageResponse } from 'next/og';
import { crestDataUri } from '@/components/shared/crest-svg';

// Icono maskable: Android recorta el lienzo con su máscara adaptativa
// (círculo/squircle), así que el escudo va dentro de la zona segura central
// (~80% del canvas) para que nunca quede cortado.
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
        <img src={crestDataUri(264)} width={264} height={285} alt="LPT" />
      </div>
    ),
    { width: 512, height: 512 },
  );
}
