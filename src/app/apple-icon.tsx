import { ImageResponse } from 'next/og';
import { crestDataUri } from '@/components/shared/crest-svg';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
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
        <img src={crestDataUri(124)} width={124} height={134} alt="LPT" />
      </div>
    ),
    { ...size },
  );
}
