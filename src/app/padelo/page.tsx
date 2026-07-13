import type { Metadata } from 'next';
import Link from 'next/link';
import { PLATFORM_NAME } from '@/lib/groups/constants';
import { MarketingSection } from '@/components/marketing/marketing-section';

export const metadata: Metadata = {
  title: `${PLATFORM_NAME} — la liga de tu peña de pádel`,
  description:
    'Convierte los partidos sueltos de tu grupo en una temporada con narrativa: ranking Elo 2vs2, apuestas con fichas, torneos, logros y planificador. Gratis para siempre.',
};

function Cta() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 24 }}>
      <Link className="lpt-btn primary" href="/crear-grupo">Crea tu grupo gratis</Link>
      <Link className="lpt-btn" href="/">Ver un tour en marcha</Link>
    </div>
  );
}

export default function PadeloLanding() {
  return (
    <>
      {/* 1 · Hero broadcast */}
      <section style={{ background: 'var(--hero-bg)', color: 'oklch(0.97 0.008 120)' }}>
        <div className="lpt-container" style={{ padding: 'calc(88px * var(--sp)) 0 calc(72px * var(--sp))' }}>
          <p className="kicker" style={{ color: 'var(--acc)' }}>El ranking oficial de tu grupo</p>
          <h1 className="display" style={{ fontSize: 'clamp(40px, 9vw, 92px)', marginTop: 14, maxWidth: 900 }}>
            Tu peña merece una liga
          </h1>
          <p style={{ fontSize: 'clamp(16px, 2.4vw, 20px)', marginTop: 18, maxWidth: 620, color: 'oklch(0.9 0.01 150)' }}>
            Ranking Elo 2vs2, apuestas con fichas, torneos y logros. El pádel de tu grupo,
            tratado como una retransmisión.
          </p>
          <Cta />
          <p className="small" style={{ marginTop: 18, color: 'oklch(0.82 0.02 150)' }}>
            Gratis para siempre · se instala como app, sin nada que descargar.
          </p>
        </div>
      </section>

      {/* 2 · El giro */}
      <MarketingSection kicker="El problema" title="Tu ranking no debería vivir en un grupo de WhatsApp">
        <p style={{ maxWidth: 640, color: 'var(--ink-2)' }}>
          Hoy los resultados se pierden entre mensajes y una nota del móvil. {PLATFORM_NAME} los
          convierte en un marcador de verdad: quién sube, quién cae, qué racha hay.
        </p>
      </MarketingSection>

      {/* 3 · La capa social (el diferencial) */}
      <MarketingSection kicker="Lo que engancha" title="La Timba, logros y rankings de parejas" stage>
        <p style={{ maxWidth: 640, color: 'oklch(0.9 0.01 150)' }}>
          Apuestas internas con <strong>fichas de juego, nunca dinero real</strong>, logros que
          se desbloquean y rankings de parejas. La capa social que hace que una peña le enseñe
          la app a la siguiente.
        </p>
      </MarketingSection>

      {/* 4 · Motor competitivo */}
      <MarketingSection kicker="El motor" title="Elo 2vs2, historial, torneos y pozos">
        <p style={{ maxWidth: 640, color: 'var(--ink-2)' }}>
          Cada partido mueve el ranking Elo de la peña. Monta torneos y pozos, revisa el historial
          y sigue la temporada como una competición continua.
        </p>
      </MarketingSection>

      {/* 5 · Planificador */}
      <MarketingSection kicker="Organizaos" title="¿Cuándo puede jugar la peña?">
        <p style={{ maxWidth: 640, color: 'var(--ink-2)' }}>
          Cada jugador marca su disponibilidad semanal y el planificador enseña las coincidencias.
          Menos «¿quién puede el jueves?» y más pádel.
        </p>
      </MarketingSection>

      {/* 6 · Cómo funciona */}
      <MarketingSection kicker="En 3 pasos" title="Crea, invita, pícate">
        <ol style={{ display: 'grid', gap: 14, maxWidth: 640, paddingLeft: 20 }}>
          <li><strong>Crea tu grupo</strong> con tu cuenta de Google, en 30 segundos.</li>
          <li><strong>Invita a tu peña</strong> con un enlace; cada uno reclama su ficha.</li>
          <li><strong>Juega y pícate</strong>: registrad resultados y que empiece la temporada.</li>
        </ol>
      </MarketingSection>

      {/* 7 · Precio honesto */}
      <MarketingSection kicker="Precio" title="Todo gratis. Pagas solo por hacerlo tuyo" stage>
        <p style={{ maxWidth: 640, color: 'oklch(0.9 0.01 150)' }}>
          La función es gratis para siempre. Si quieres, el <strong>Pase de Temporada</strong>
          (~20 €/año) le pone a tu tour tu nombre, tu logo y tus colores, quita la atribución y
          luce el <strong>⭐ Tour Oficial</strong>. Sin suscripciones agresivas ni humo de casino.
        </p>
        <Cta />
      </MarketingSection>

      {/* 8 · Cierre */}
      <section>
        <div className="lpt-container" style={{ padding: 'calc(72px * var(--sp)) 0', textAlign: 'center' }}>
          <h2 className="display" style={{ fontSize: 'clamp(30px, 6vw, 56px)', maxWidth: 720, margin: '0 auto' }}>
            Empieza la temporada de tu peña
          </h2>
          <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 12, marginTop: 24, justifyContent: 'center' }}>
            <Link className="lpt-btn primary" href="/crear-grupo">Crea tu grupo gratis</Link>
            <Link className="lpt-btn" href="/">Ver un tour en marcha</Link>
          </div>
        </div>
      </section>
    </>
  );
}
