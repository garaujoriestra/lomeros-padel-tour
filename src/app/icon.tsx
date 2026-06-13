import { ImageResponse } from 'next/og';
import { crestDataUri } from '@/components/shared/crest-svg';

export const size = { width: 192, height: 192 };
export const contentType = 'image/png';

export default function Icon() {
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
        <img src={crestDataUri(132)} width={132} height={142} alt="LPT" />
      </div>
    ),
    { ...size },
  );
}
