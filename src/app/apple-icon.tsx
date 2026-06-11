import { ImageResponse } from 'next/og';

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
          fontSize: 62,
          color: '#c8f03c',
          fontWeight: 800,
          fontStyle: 'italic',
        }}
      >
        LPT
      </div>
    ),
    { ...size },
  );
}
