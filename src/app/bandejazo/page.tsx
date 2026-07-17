import type { Metadata } from 'next';
import Link from 'next/link';
import { PLATFORM_NAME } from '@/lib/groups/constants';
import { MarketingSection } from '@/components/marketing/marketing-section';
import { MarketingScrollFx } from '@/components/marketing/scroll-fx';
import { Ball3DLazy } from '@/components/marketing/ball3d-lazy';

const TITLE = `${PLATFORM_NAME} — la liga de tu peña de pádel`;
const DESCRIPTION =
  'Convierte los partidos sueltos de tu grupo en una temporada con narrativa: ranking Elo 2vs2, apuestas con fichas, torneos, logros y planificador. Gratis para siempre.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/bandejazo' },
  // La tarjeta social la aporta opengraph-image.tsx (convención de fichero);
  // aquí solo el resto de campos OG/Twitter para WhatsApp/Telegram/X.
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: '/bandejazo',
    siteName: PLATFORM_NAME,
    locale: 'es_ES',
    type: 'website',
  },
  twitter: { card: 'summary_large_image' },
};

/* ── Datos de EJEMPLO para las maquetas de marcador (no son datos reales) ── */
type Row = { pos: number; name: string; ini: string; elo: number; delta: number; ava: string; lead?: boolean };
const LEADERBOARD: Row[] = [
  { pos: 1, name: 'Nacho R.', ini: 'NR', elo: 1584, delta: 18, lead: true, ava: 'var(--acc)' },
  { pos: 2, name: 'Bea M.', ini: 'BM', elo: 1551, delta: 7, ava: 'var(--win)' },
  { pos: 3, name: 'Quique T.', ini: 'QT', elo: 1533, delta: -5, ava: 'var(--warn)' },
  { pos: 4, name: 'Silvia P.', ini: 'SP', elo: 1499, delta: -12, ava: 'var(--ink-3)' },
];

function Delta({ v }: { v: number }) {
  const up = v >= 0;
  return (
    <span className={`mkt-delta ${up ? 'up' : 'down'} num`}>
      {up ? '▲' : '▼'} {up ? '+' : ''}{v}
    </span>
  );
}

function Ava({ ini, bg }: { ini: string; bg: string }) {
  return <span className="mkt-ava" style={{ background: bg }}>{ini}</span>;
}

function Cta({ center = false }: { center?: boolean }) {
  return (
    <div className={`mkt-cta${center ? ' mkt-cta--center' : ''}`}>
      <Link className="lpt-btn primary" href="/crear-grupo">Crea tu grupo gratis</Link>
      <Link className="lpt-btn" href="/">Ver un tour en marcha</Link>
    </div>
  );
}

/** Maqueta del marcador "Pista Central": el ranking de la peña con dramatismo. */
function Scoreboard() {
  return (
    <div className="mkt-board">
      <div className="mkt-board__head">
        <span className="mkt-board__label">
          <span className="mkt-live" aria-hidden />
          <span className="kicker" style={{ color: 'var(--ink-2)' }}>Pista Central</span>
        </span>
        <span className="mkt-tag">Jornada 14</span>
      </div>
      {LEADERBOARD.map((r) => (
        <div key={r.pos} className={`mkt-row${r.lead ? ' mkt-row--lead' : ''}`}>
          <span className="mkt-pos">{r.pos}</span>
          <Ava ini={r.ini} bg={r.ava} />
          <span className="mkt-name">{r.name}</span>
          <span className="mkt-elo num">{r.elo}</span>
          <Delta v={r.delta} />
        </div>
      ))}
      <div className="mkt-board__foot">
        <span>+ 9 jugadores en la clasificación</span>
        <span>Ejemplo</span>
      </div>
    </div>
  );
}

export default function BandejazoLanding() {
  return (
    <>
      <MarketingScrollFx />
      <Ball3DLazy />
      {/* 1 · Hero broadcast — split asimétrico: relato | marcador */}
      <section className="mkt-hero">
        <div className="lpt-container mkt-hero__grid">
          <div>
            <p className="kicker mkt-kicker mkt-anim">
              <span className="mkt-tick" aria-hidden /> El ranking oficial de tu grupo
            </p>
            <h1 className="display mkt-hero__title mkt-anim" style={{ animationDelay: '0.06s' }}>
              Tu peña merece una liga
            </h1>
            <p className="mkt-hero__sub mkt-anim" style={{ animationDelay: '0.12s' }}>
              Ranking Elo 2vs2, apuestas con fichas, torneos y logros. El pádel de tu grupo,
              tratado como una retransmisión.
            </p>
            <div className="mkt-anim" style={{ animationDelay: '0.18s' }}>
              <Cta />
              <p className="mkt-hero__trust">
                Gratis para siempre. Se instala como app, sin nada que descargar.
              </p>
            </div>
          </div>
          <div className="mkt-anim" style={{ animationDelay: '0.24s' }}>
            {/* Drift y tilt van en un wrapper propio: mkt-anim ya anima transform en la carga. */}
            <div data-parallax="drift" data-parallax-speed="-44" data-tilt data-fx="board-live">
              <Scoreboard />
            </div>
          </div>
        </div>
      </section>

      {/* 2 · LA PISTA — scrollytelling de funcionalidades golpe a golpe: la
          sección se pinea, la pista de cristal 3D aparece (padel-ball-3d) y
          cada tramo de scroll es un vuelo de la pelota sobre la red hasta el
          cristal; cada impacto revela un golpe (.mkt-beat). Sin JS o con
          reduced-motion no hay pin: los golpes son secciones apiladas. */}
      <section className="mkt-pista" data-pista>
        <div className="mkt-beat" data-beat="0">
          <div className="lpt-container">
            <div className="mkt-head">
              <h2 className="display mkt-h2">Tu ranking no debería vivir en un grupo de WhatsApp</h2>
              <p className="mkt-lead">
                Hoy los resultados se pierden entre mensajes y una nota del móvil. {PLATFORM_NAME} los
                convierte en un marcador de verdad: quién sube, quién cae, qué racha hay.
              </p>
            </div>
            <div className="mkt-swap">
              <div className="mkt-panel mkt-before">
                <p className="mkt-cap">Antes</p>
                <div className="mkt-chat">
                  <span className="mkt-bubble">creo q ganamos 6-4 6-3?? 😅</span>
                  <span className="mkt-bubble mkt-bubble--me">¿y quién va primero al final?</span>
                  <span className="mkt-bubble">ni idea, estaba en una nota del movil</span>
                </div>
              </div>
              <div className="mkt-swap__arrow display" aria-hidden>▶</div>
              <div className="mkt-panel mkt-panel--after">
                <p className="mkt-cap" style={{ color: 'var(--acc)' }}>Después</p>
                <div className="mkt-board" style={{ boxShadow: 'none', borderRadius: 12 }}>
                  <div className="mkt-row mkt-row--lead">
                    <span className="mkt-pos">1</span>
                    <Ava ini="NR" bg="var(--acc)" />
                    <span className="mkt-name">Nacho R.</span>
                    <span className="mkt-elo num">1584</span>
                    <Delta v={18} />
                  </div>
                  <div className="mkt-row">
                    <span className="mkt-pos">2</span>
                    <Ava ini="BM" bg="var(--win)" />
                    <span className="mkt-name">Bea M.</span>
                    <span className="mkt-elo num">1551</span>
                    <Delta v={7} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mkt-beat" data-beat="1">
          <div className="lpt-container mkt-split mkt-split--rev">
            <div className="mkt-split__content">
              <p className="kicker mkt-kicker">
                <span className="mkt-tick" aria-hidden /> Lo que engancha
              </p>
              <h2 className="display mkt-h2">La Timba, logros y rankings de parejas</h2>
              <p className="mkt-lead">
                Apuestas internas con <span className="mkt-strong">fichas de juego, nunca dinero real</span>,
                logros que se desbloquean y rankings de parejas. La capa social que hace que una peña le
                enseñe la app a la siguiente.
              </p>
            </div>
            <div className="mkt-split__visual mkt-tiles" data-tilt data-fx="social">
            <div className="mkt-tile">
              <span className="mkt-ficha" aria-hidden>T</span>
              <div className="mkt-tile__body">
                <p className="mkt-tile__t">La Timba</p>
                <p className="mkt-tile__d">Porra entre amigos con fichas de juego, sin dinero real.</p>
              </div>
              <span className="mkt-tile__n" style={{ color: 'var(--acc)' }} data-fx="countup">1.240</span>
            </div>
            <div className="mkt-tile">
              <span className="mkt-medal" aria-hidden>🏅</span>
              <div className="mkt-tile__body">
                <p className="mkt-tile__t">Racha de 5 victorias</p>
                <p className="mkt-tile__d">Logro desbloqueado por Bea M. esta jornada.</p>
              </div>
              <span className="lpt-badge win">Nuevo</span>
            </div>
            <div className="mkt-tile">
              <span className="mkt-duo" aria-hidden>
                <Ava ini="NR" bg="var(--acc)" />
                <Ava ini="BM" bg="var(--win)" />
              </span>
              <div className="mkt-tile__body">
                <p className="mkt-tile__t">Nacho &amp; Bea</p>
                <p className="mkt-tile__d">Mejor pareja de la temporada.</p>
              </div>
              <span className="mkt-tile__n" data-fx="countup">1.602</span>
            </div>
            </div>
          </div>
        </div>

        <div className="mkt-beat" data-beat="2">
          <div className="lpt-container mkt-split">
            <div className="mkt-split__content">
              <h2 className="display mkt-h2">Cada partido mueve el ranking</h2>
              <p className="mkt-lead">
                Elo 2vs2 en cada resultado, historial completo, torneos y pozos. La temporada
                avanza como una competición de verdad, no como una lista de partidos.
              </p>
            </div>
            <div className="mkt-split__visual mkt-match" data-tilt data-fx="sets-flip">
            <div className="mkt-match__head">
              <span>Final · Torneo de primavera</span>
              <span className="num">6-4 · 4-6 · 7-5</span>
            </div>
            <div className="mkt-team mkt-team--win">
              <div>
                <p className="mkt-team__names">Nacho &amp; Bea</p>
                <p className="mkt-team__meta">
                  Ganan la final <Delta v={18} />
                </p>
              </div>
              <div className="mkt-sets">
                <span className="mkt-set mkt-set--w num">6</span>
                <span className="mkt-set num">4</span>
                <span className="mkt-set mkt-set--w num">7</span>
              </div>
            </div>
            <div className="mkt-team">
              <div>
                <p className="mkt-team__names">Quique &amp; Silvia</p>
                <p className="mkt-team__meta">
                  Subcampeones <Delta v={-9} />
                </p>
              </div>
              <div className="mkt-sets">
                <span className="mkt-set num">4</span>
                <span className="mkt-set mkt-set--w num">6</span>
                <span className="mkt-set num">5</span>
              </div>
            </div>
            <p className="mkt-match__foot">Historial, torneos y pozos: toda la temporada en un sitio.</p>
            </div>
          </div>
        </div>

        <div className="mkt-beat" data-beat="3">
          <div className="lpt-container mkt-split">
            <div className="mkt-split__visual">
              <div
                className="mkt-week"
                data-fx="wave"
                role="img"
              aria-label="Rejilla de disponibilidad semanal: el jueves coincide la mayoría de la peña."
            >
              {[
                { d: 'L', on: [1, 0, 0, 1, 0, 0] },
                { d: 'M', on: [0, 1, 0, 0, 1, 0] },
                { d: 'X', on: [1, 0, 1, 0, 0, 1] },
                { d: 'J', on: [1, 1, 1, 1, 1, 1], hot: true },
                { d: 'V', on: [0, 1, 0, 1, 0, 0] },
                { d: 'S', on: [1, 1, 0, 0, 1, 1] },
                { d: 'D', on: [0, 0, 1, 0, 0, 1] },
              ].map((col) => (
                <div key={col.d} className={`mkt-daycol${col.hot ? ' mkt-daycol--hot' : ''}`}>
                  <span className="mkt-daylabel">{col.d}</span>
                  {col.on.map((v, i) => (
                    <span key={i} className={`mkt-cell${v ? ' mkt-cell--on' : ''}`} />
                  ))}
                </div>
              ))}
            </div>
            <p className="mkt-weekcap">
              El <span className="mkt-strong" style={{ color: 'var(--acc)' }}>jueves</span> coincidís 6. Menos «¿quién puede?» y más pádel.
            </p>
          </div>
            <div className="mkt-split__content">
              <h2 className="display mkt-h2">¿Cuándo puede jugar la peña?</h2>
              <p className="mkt-lead">
                Cada jugador marca su disponibilidad semanal y el planificador enseña las coincidencias
                de un vistazo. La pista se llena sola.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6 · Cómo funciona — rail numerado */}
      <MarketingSection title="Crea, invita, pícate">
        <div className="mkt-steps" data-fx="steps">
          <div className="mkt-step">
            <span className="mkt-step__bar" aria-hidden />
            <p className="mkt-step__n num">01</p>
            <p className="mkt-step__t">Crea tu grupo</p>
            <p className="mkt-step__d">Con tu cuenta de Google, en 30 segundos. Sin tarjeta.</p>
          </div>
          <div className="mkt-step">
            <span className="mkt-step__bar" aria-hidden />
            <p className="mkt-step__n num">02</p>
            <p className="mkt-step__t">Invita a tu peña</p>
            <p className="mkt-step__d">Un enlace y cada uno reclama su ficha de jugador.</p>
          </div>
          <div className="mkt-step">
            <span className="mkt-step__bar" aria-hidden />
            <p className="mkt-step__n num">03</p>
            <p className="mkt-step__t">Juega y pícate</p>
            <p className="mkt-step__d">Registrad resultados y que empiece la temporada.</p>
          </div>
        </div>
      </MarketingSection>

      {/* 7 · Precio honesto — dos planes, el gratis manda */}
      <section className="mkt-section mkt-section--panel">
        <div className="lpt-container">
          <div className="mkt-head">
            <h2 className="display mkt-h2">Todo gratis. Pagas solo por hacerlo tuyo</h2>
            <p className="mkt-lead">
              La función es gratis para siempre. Sin suscripciones agresivas ni humo de casino.
            </p>
          </div>
          <div className="mkt-price">
            <div className="mkt-plan" data-parallax="expand">
              <p className="mkt-plan__price" data-fx="stamp">Gratis</p>
              <p className="mkt-plan__unit">para siempre</p>
              <ul className="mkt-list">
                <li><span className="mkt-check mkt-check--free">✓</span> Ranking Elo 2vs2 e historial</li>
                <li><span className="mkt-check mkt-check--free">✓</span> La Timba, logros y rankings de parejas</li>
                <li><span className="mkt-check mkt-check--free">✓</span> Torneos, pozos y planificador</li>
                <li><span className="mkt-check mkt-check--free">✓</span> Se instala como app en el móvil</li>
              </ul>
            </div>
            <div className="mkt-plan mkt-plan--pass" data-parallax="expand">
              <span className="mkt-shine" aria-hidden />
              <span className="mkt-official">⭐ Tour Oficial</span>
              <p className="mkt-plan__price" style={{ marginTop: 16 }}>~20&nbsp;€</p>
              <p className="mkt-plan__unit">al año · Pase de Temporada</p>
              <ul className="mkt-list">
                <li><span className="mkt-check mkt-check--pass">✓</span> Tu nombre, tu logo y tus colores</li>
                <li><span className="mkt-check mkt-check--pass">✓</span> Quita la atribución de {PLATFORM_NAME}</li>
                <li><span className="mkt-check mkt-check--pass">✓</span> Distintivo de Tour Oficial</li>
              </ul>
            </div>
          </div>
          <Cta />
        </div>
      </section>

      {/* 8 · Cierre — manifiesto centrado con podio de fondo */}
      <section className="mkt-section mkt-close">
        <div className="lpt-container" style={{ position: 'relative', zIndex: 1 }}>
          <div className="mkt-head--center">
            <h2 className="display mkt-close__title">Empieza la temporada de tu peña</h2>
            <Cta center />
          </div>
          <div className="mkt-podium" data-parallax="expand" aria-hidden>
            <span /><span /><span />
          </div>
        </div>
      </section>
    </>
  );
}
