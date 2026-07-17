import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PLATFORM_NAME } from '@/lib/groups/constants';

// Tarjeta social de la landing (WhatsApp/Telegram/FB son el canal de siembra:
// el enlace SIN tarjeta no existe). Estática: se genera en build, sin datos.
export const alt = `${PLATFORM_NAME} — la liga de tu peña de pádel`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Paleta de la landing («broadcast elevado», valores de globals.css — aquí van
// literales porque satori no ve el CSS de la app).
const BG = 'linear-gradient(160deg, #1d2f2c 0%, #0c1715 60%)';
const ACC = '#c8f03c';
const INK = '#f2f7f4';
const INK_MUTED = '#9db3ac';
const PANEL = '#122019';
// --loss-text (dark) = oklch(0.66 0.17 25) convertido a sRGB (satori no lee oklch).
const LOSS = '#e8605b';

const ROWS = [
  { pos: 1, ini: 'NR', name: 'Nacho R.', elo: '1584', delta: '+18', up: true, lead: true },
  { pos: 2, ini: 'BM', name: 'Bea M.', elo: '1551', delta: '+7', up: true, lead: false },
  { pos: 3, ini: 'QT', name: 'Quique T.', elo: '1533', delta: '-5', up: false, lead: false },
];

// Flecha ▲/▼ como SVG: la fuente embebida (Barlow Condensed) no trae esos glifos
// (como texto saldrían tofu □) y satori tampoco rasteriza bien el triángulo CSS
// de borders (lo pinta como rectángulo).
function Arrow({ up }: { up: boolean }) {
  return (
    <svg width="14" height="12" viewBox="0 0 14 12">
      <path
        d={up ? 'M7 0 L14 12 L0 12 Z' : 'M7 12 L14 0 L0 0 Z'}
        fill={up ? ACC : LOSS}
      />
    </svg>
  );
}

function Row({ r }: { r: (typeof ROWS)[number] }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        padding: '18px 26px',
        borderRadius: 14,
        background: r.lead ? 'rgba(200, 240, 60, 0.12)' : 'transparent',
        border: r.lead ? `1px solid rgba(200, 240, 60, 0.35)` : '1px solid transparent',
      }}
    >
      <div style={{ display: 'flex', width: 26, color: INK_MUTED, fontSize: 26 }}>{r.pos}</div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 52,
          height: 52,
          borderRadius: 26,
          background: r.lead ? ACC : '#2a413c',
          color: r.lead ? '#0c1715' : INK,
          fontSize: 22,
          fontWeight: 700,
        }}
      >
        {r.ini}
      </div>
      <div style={{ display: 'flex', flexGrow: 1, color: INK, fontSize: 28, whiteSpace: 'nowrap' }}>
        {r.name}
      </div>
      <div style={{ display: 'flex', color: INK, fontSize: 30, fontWeight: 700 }}>{r.elo}</div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: r.up ? ACC : LOSS,
          fontSize: 24,
          width: 74,
          justifyContent: 'flex-end',
        }}
      >
        <Arrow up={r.up} />
        {r.delta}
      </div>
    </div>
  );
}

export default async function Image() {
  // Display de la marca (Barlow Condensed, misma que .display en la app). Si la
  // lectura fallara, satori cae a su fuente por defecto: la tarjeta nunca rompe
  // el build.
  type OgFonts = NonNullable<ConstructorParameters<typeof ImageResponse>[1]>['fonts'];
  let fonts: OgFonts | undefined;
  try {
    const barlow = await readFile(
      join(process.cwd(), 'assets/fonts/BarlowCondensed-ExtraBoldItalic.ttf'),
    );
    fonts = [{ name: 'Barlow Condensed', data: barlow, style: 'italic', weight: 800 }];
  } catch {
    fonts = undefined;
  }

  const display = {
    fontFamily: '"Barlow Condensed"',
    fontStyle: 'italic' as const,
    fontWeight: 800,
    textTransform: 'uppercase' as const,
    lineHeight: 0.95,
  };

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: BG,
          padding: 64,
          alignItems: 'center',
          gap: 56,
        }}
      >
        {/* Relato: kicker + titular + marca */}
        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, height: '100%', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: ACC, fontSize: 26, letterSpacing: 4 }}>
              <div style={{ display: 'flex', width: 34, height: 4, background: ACC }} />
              EL RANKING OFICIAL DE TU GRUPO
            </div>
            <div style={{ ...display, display: 'flex', flexDirection: 'column', color: INK, fontSize: 116, marginTop: 28 }}>
              <div style={{ display: 'flex' }}>Tu peña</div>
              <div style={{ display: 'flex' }}>merece</div>
              <div style={{ display: 'flex', color: ACC }}>una liga</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', color: INK_MUTED, fontSize: 28 }}>
              Elo 2vs2 · La Timba · Torneos · Gratis
            </div>
            <div style={{ ...display, display: 'flex', color: ACC, fontSize: 40, letterSpacing: 2 }}>
              {PLATFORM_NAME}
            </div>
          </div>
        </div>

        {/* Marcador «Pista Central» como en el hero de la landing */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: 470,
            background: PANEL,
            borderRadius: 22,
            border: '1px solid rgba(200, 240, 60, 0.18)',
            padding: 26,
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: INK_MUTED, fontSize: 22, letterSpacing: 3 }}>
              <div style={{ display: 'flex', width: 10, height: 10, borderRadius: 5, background: ACC }} />
              PISTA CENTRAL
            </div>
            <div style={{ display: 'flex', color: INK_MUTED, fontSize: 20 }}>JORNADA 14</div>
          </div>
          {ROWS.map((r) => (
            <Row key={r.pos} r={r} />
          ))}
        </div>
      </div>
    ),
    { ...size, ...(fonts ? { fonts } : {}) },
  );
}
