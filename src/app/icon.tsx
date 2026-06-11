import { ImageResponse } from 'next/og';

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
          fontSize: 68,
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
