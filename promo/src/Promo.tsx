import { AbsoluteFill, Series, useCurrentFrame } from 'remotion';
import { C, F } from './theme';
import { Chaos } from './scenes/Chaos';
import { Title } from './scenes/Title';
import { Scoreboard } from './scenes/Scoreboard';
import { Social } from './scenes/Social';
import { Cta } from './scenes/Cta';

export const FPS = 30;

// Duración de cada escena en frames (a 30 fps).
export const SCENES = {
  chaos: 135, // 0:00–0:04.5 · el caos del grupo de WhatsApp
  title: 105, // 0:04.5–0:08 · "Tu peña merece una liga"
  scoreboard: 180, // 0:08–0:14 · marcador Pista Central
  social: 180, // 0:14–0:20 · La Timba, logros, parejas
  cta: 210, // 0:20–0:27 · marca + CTA
};

export const DURATION = Object.values(SCENES).reduce((a, b) => a + b, 0);

export type PromoProps = {
  brand: string;
  tagline: string;
  url: string;
};

// La marca es un prop: el rename Padelo→Bandejazo aún no está desplegado,
// así que el vídeo no fija el nombre en código. Otra marca/URL:
//   npx remotion render Promo --props='{"brand":"...","url":"..."}'
export const promoDefaultProps: PromoProps = {
  brand: 'Bandejazo',
  tagline: 'La liga de tu peña de pádel',
  url: 'bandejazo.app',
};

/** Fondo continuo entre escenas: gradiente hero + resplandor lima que deriva lento. */
const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 120) * 40;
  return (
    <AbsoluteFill style={{ background: C.heroBg }}>
      <div
        style={{
          position: 'absolute',
          width: 1500,
          height: 1500,
          borderRadius: '50%',
          left: -560 + drift,
          top: -520,
          background:
            'radial-gradient(circle, rgba(200, 240, 60, 0.09) 0%, rgba(200, 240, 60, 0) 62%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 1300,
          height: 1300,
          borderRadius: '50%',
          right: -620,
          bottom: -560 - drift,
          background:
            'radial-gradient(circle, rgba(200, 240, 60, 0.05) 0%, rgba(200, 240, 60, 0) 60%)',
        }}
      />
    </AbsoluteFill>
  );
};

export const Promo: React.FC<PromoProps> = ({ brand, tagline, url }) => {
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: F.sans, color: C.ink }}>
      <Backdrop />
      <Series>
        <Series.Sequence durationInFrames={SCENES.chaos}>
          <Chaos duration={SCENES.chaos} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.title}>
          <Title duration={SCENES.title} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.scoreboard}>
          <Scoreboard duration={SCENES.scoreboard} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.social}>
          <Social duration={SCENES.social} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={SCENES.cta}>
          <Cta brand={brand} tagline={tagline} url={url} />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
