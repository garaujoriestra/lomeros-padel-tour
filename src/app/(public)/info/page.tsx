import Link from 'next/link';
import { Info, BookOpen, Mail, House } from 'lucide-react';
import { SectionHead, HeroLines } from '@/components/lpt/ui';

const FEATURES = [
  { icon: '🏆', title: 'Ranking individual', desc: 'Clasificación de todos los jugadores por Elo actual.' },
  { icon: '👥', title: 'Ranking de parejas', desc: 'Las mejores combinaciones históricas por win rate y partidos juntos.' },
  { icon: '📋', title: 'Historial de partidos', desc: 'Todos los resultados con marcadores set a set.' },
  { icon: '📈', title: 'Perfil del jugador', desc: 'Evolución de Elo, racha actual, estadísticas y partidos recientes.' },
  { icon: '📅', title: 'Partidos programados', desc: 'Mira qué partidos hay pendientes antes de que se jueguen.' },
  { icon: '🤝', title: 'Recomendador de parejas', desc: 'Sugiere la distribución más equilibrada para un partido programado.' },
];

const GLOSSARY = [
  { term: 'Elo', def: 'Puntuación que mide el nivel relativo de un jugador. Sube al ganar y baja al perder, según la dificultad del rival.' },
  { term: 'Sinergia', def: 'Si una pareja rinde mejor (verde) o peor (rojo) juntos que por separado.' },
  { term: 'Win rate', def: 'Porcentaje de partidos ganados sobre el total de partidos jugados.' },
  { term: 'Racha', def: 'Número de victorias o derrotas consecutivas desde el último partido.' },
  { term: 'Factor-K', def: 'Velocidad a la que cambia el Elo. Más alto = cambios más bruscos. Baja a medida que juegas más.' },
  { term: 'Bagel 🍩', def: 'Ganar un set 6-0.' },
  { term: 'Pareja inédita ✦', def: 'Dos jugadores que nunca han jugado juntos.' },
  { term: 'Drive / Revés', def: 'Lado de pista de cada jugador.' },
];

export default function InfoPage() {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      {/* Hero */}
      <div className="hero section" style={{ padding: 'calc(30px * var(--sp)) calc(26px * var(--sp))' }}>
        <HeroLines />
        <div style={{ position: 'relative' }}>
          <div className="kicker" style={{ color: 'currentcolor', opacity: 0.65 }}>
            <BookOpen size={13} /> Guía del tour
          </div>
          <h1 className="display" style={{ fontSize: 'clamp(30px, 6vw, 48px)', margin: '10px 0 8px' }}>
            ¿Cómo funciona <span style={{ color: 'var(--acc)' }}>el LPT</span>?
          </h1>
          <p style={{ opacity: 0.7, margin: 0, fontSize: 14.5, maxWidth: '52ch' }}>
            El <b>Lomeros Padel Tour</b> es el ranking privado de nuestro grupo de pádel. Cada partido se registra
            y se traduce en puntos de Elo — el mismo sistema que usa el ajedrez profesional.
          </p>
        </div>
      </div>

      <div className="stagger" style={{ display: 'grid', gap: 14 }}>
        <div className="lpt-card card-pad">
          <h2 className="kicker" style={{ marginBottom: 8 }}>El ranking Elo</h2>
          <p className="small" style={{ margin: 0, lineHeight: 1.6 }}>
            Todos empiezan con <b>1500 puntos</b>. Cada partido transfiere puntos del equipo perdedor al ganador:
            ganar a rivales mejores da más puntos; perder contra rivales peores quita más. Las parejas son dinámicas
            — cualquier combinación de 4 — así que el ranking individual refleja tu nivel real, juegues con quien juegues.
          </p>
          <div className="grid-2" style={{ marginTop: 14 }}>
            <div style={{ borderRadius: 10, padding: '12px 14px', background: 'color-mix(in oklab, var(--win) 10%, transparent)', border: '1px solid color-mix(in oklab, var(--win) 25%, transparent)' }}>
              <div className="small" style={{ fontWeight: 800, color: 'var(--win)' }}>Ganar a rivales fuertes</div>
              <p className="small muted" style={{ margin: '4px 0 6px' }}>Tu equipo de 1400 gana a uno de 1600: victoria inesperada.</p>
              <span className="elo-num" style={{ color: 'var(--win)' }}>+25</span>
            </div>
            <div style={{ borderRadius: 10, padding: '12px 14px', background: 'color-mix(in oklab, var(--warn) 10%, transparent)', border: '1px solid color-mix(in oklab, var(--warn) 25%, transparent)' }}>
              <div className="small" style={{ fontWeight: 800, color: 'var(--warn)' }}>Ganar a rivales débiles</div>
              <p className="small muted" style={{ margin: '4px 0 6px' }}>Tu equipo de 1600 gana a uno de 1400: era lo esperado.</p>
              <span className="elo-num" style={{ color: 'var(--warn)' }}>+8</span>
            </div>
          </div>
        </div>

        <div className="lpt-card card-pad">
          <h2 className="kicker" style={{ marginBottom: 8 }}>Factor-K (velocidad de cambio)</h2>
          <div className="small" style={{ display: 'grid', gap: 7, lineHeight: 1.55 }}>
            <span><b className="num">&lt;10 partidos:</b> K=40 — cambios rápidos para calibrar el nivel inicial.</span>
            <span><b className="num">10–30 partidos:</b> K=32 — cambios moderados.</span>
            <span><b className="num">&gt;30 partidos:</b> K=24 — el ranking se estabiliza y refleja el historial largo.</span>
          </div>
        </div>

        <div className="lpt-card card-pad">
          <h2 className="kicker" style={{ marginBottom: 8 }}>Elo de pareja y sinergia</h2>
          <p className="small" style={{ margin: 0, lineHeight: 1.6 }}>
            Cada pareja tiene su propio Elo. La <b>sinergia</b> compara ese rendimiento con el esperado por los
            niveles individuales: positiva (verde) si juntos sois mejores, negativa (roja) si os hacéis peores.
          </p>
        </div>
      </div>

      <section className="section" style={{ marginTop: 'calc(34px * var(--sp))' }}>
        <SectionHead icon={Info} title="Qué hay en la app" />
        <div className="grid-2 stagger">
          {FEATURES.map((feat) => (
            <div key={feat.title} className="lpt-card card-pad">
              <div style={{ fontSize: 24, marginBottom: 6 }}>{feat.icon}</div>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{feat.title}</div>
              <p className="small muted" style={{ margin: '4px 0 0', lineHeight: 1.5 }}>{feat.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <SectionHead icon={BookOpen} title="Glosario" />
        <div className="lpt-card card-pad">
          <div className="small" style={{ display: 'grid', gap: 9, lineHeight: 1.55 }}>
            {GLOSSARY.map((item) => (
              <span key={item.term}>
                <b style={{ color: 'var(--acc-text)' }}>{item.term}</b> — {item.def}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="hero" style={{ padding: 'calc(24px * var(--sp))' }}>
          <div className="kicker" style={{ color: 'currentcolor', opacity: 0.65 }}>
            <Mail size={13} /> Contacto
          </div>
          <h2 className="display" style={{ fontSize: 26, margin: '10px 0 8px' }}>¿Quieres registrar un partido?</h2>
          <p style={{ opacity: 0.7, margin: '0 0 14px', fontSize: 14 }}>
            Para registrar partidos, añadir resultados o dar de alta a nuevos jugadores, habla con:
          </p>
          <div style={{ display: 'inline-block', borderRadius: 12, padding: '12px 18px', background: 'color-mix(in oklab, currentcolor 10%, transparent)', border: '1px solid color-mix(in oklab, currentcolor 18%, transparent)' }}>
            <div className="display" style={{ fontSize: 20 }}>Guillermo Araujo Riestra</div>
            <div className="small" style={{ opacity: 0.65, marginTop: 2 }}>Administrador del LPT · Lomeros Padel Tour</div>
          </div>
        </div>
      </section>

      <div style={{ textAlign: 'center', paddingBottom: 16 }}>
        <Link href="/" className="lpt-btn primary">
          <House size={14} /> Volver al inicio
        </Link>
      </div>
    </div>
  );
}
