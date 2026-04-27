import Link from 'next/link';

export default function InfoPage() {
  return (
    <div className="space-y-10">

      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-green-950 via-green-900 to-emerald-800 text-white shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_30%,rgba(74,222,128,0.07)_0%,transparent_60%)]" />
        <div className="relative px-5 sm:px-8 md:px-12 py-10 sm:py-14 md:py-16 max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1.5 text-sm font-semibold mb-6">
            <span>📖</span> Guía del torneo
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-black tracking-tight mb-4">
            ¿CÓMO FUNCIONA?
          </h1>
          <p className="text-green-200 text-base sm:text-lg md:text-xl font-medium max-w-2xl">
            Todo lo que necesitas saber sobre el <strong className="text-white">Lomeros Padel Tour</strong> —
            el ranking oficial de nuestro grupo de amigos.
          </p>
        </div>
      </div>

      {/* ¿Qué es LPT? */}
      <section className="bg-white rounded-2xl sm:rounded-3xl border border-gray-100 shadow-sm p-5 sm:p-8 md:p-10 space-y-4">
        <h2 className="text-2xl font-black text-gray-900">🎾 ¿Qué es el LPT?</h2>
        <p className="text-gray-600 leading-relaxed text-lg">
          El <strong>Lomeros Padel Tour (LPT)</strong> es el ranking privado de nuestro grupo de pádel.
          Cada partido que jugamos se registra aquí y se traduce en puntos de <strong>Elo</strong> —
          el mismo sistema que usa el ajedrez profesional y los videojuegos competitivos.
        </p>
        <p className="text-gray-600 leading-relaxed">
          Las parejas son siempre dinámicas: en cada partido se pueden formar cualquier combinación de 4 jugadores.
          No hay equipos fijos, lo que hace que el <strong>ranking individual</strong> refleje con precisión
          el nivel real de cada jugador independientemente de quién fue su compañero.
        </p>
      </section>

      {/* El Sistema Elo */}
      <section className="bg-white rounded-2xl sm:rounded-3xl border border-gray-100 shadow-sm p-5 sm:p-8 md:p-10 space-y-6">
        <h2 className="text-2xl font-black text-gray-900">📊 El sistema Elo</h2>
        <p className="text-gray-600 leading-relaxed">
          Todos los jugadores empiezan con <strong>1500 puntos de Elo</strong>.
          Lo que lo hace especial es que premia la <strong>calidad sobre la cantidad</strong>:
        </p>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="bg-green-50 border border-green-100 rounded-2xl p-5">
            <p className="font-black text-green-800 mb-2">✅ Ganar contra rivales fuertes</p>
            <p className="text-green-700 text-sm">Si tu equipo tiene Elo 1400 y gana a uno de 1600, el beneficio es grande. Fue una victoria inesperada.</p>
            <p className="mt-3 text-3xl font-black text-green-600">+25 pts</p>
          </div>
          <div className="bg-red-50 border border-red-100 rounded-2xl p-5">
            <p className="font-black text-red-800 mb-2">⚠️ Ganar contra rivales débiles</p>
            <p className="text-red-700 text-sm">Si tu equipo de 1600 gana a uno de 1400, los puntos son pocos. Era lo esperado.</p>
            <p className="mt-3 text-3xl font-black text-orange-500">+8 pts</p>
          </div>
        </div>

        <div className="bg-gray-50 rounded-2xl p-5 space-y-2">
          <p className="font-bold text-gray-700 text-sm">⚡ Factor-K (velocidad de cambio)</p>
          <div className="space-y-1.5 text-sm text-gray-600">
            <p>• <strong>&lt;10 partidos:</strong> K=40 — cambios rápidos para calibrar el nivel inicial</p>
            <p>• <strong>10–30 partidos:</strong> K=32 — cambios moderados</p>
            <p>• <strong>&gt;30 partidos:</strong> K=24 — el ranking se estabiliza y refleja el historial largo</p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="space-y-4">
        <h2 className="text-2xl font-black text-gray-900">🛠️ ¿Qué hay en la app?</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { icon: '🏆', title: 'Ranking individual', desc: 'Clasificación de todos los jugadores por Elo actual.' },
            { icon: '👥', title: 'Ranking de parejas', desc: 'Las mejores combinaciones históricas por win rate y partidos juntos.' },
            { icon: '📋', title: 'Historial de partidos', desc: 'Todos los resultados con marcadores set a set.' },
            { icon: '📈', title: 'Perfil del jugador', desc: 'Evolución de Elo, racha actual, estadísticas y partidos recientes.' },
            { icon: '📅', title: 'Partidos programados', desc: 'Mira qué partidos hay pendientes antes de que se jueguen.' },
            { icon: '🤝', title: 'Recomendador de parejas', desc: 'Sugiere la distribución más equilibrada para un partido programado.' },
          ].map((feat) => (
            <div key={feat.title} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-md transition-shadow">
              <div className="text-3xl mb-3">{feat.icon}</div>
              <p className="font-black text-gray-900 mb-1">{feat.title}</p>
              <p className="text-sm text-gray-500 leading-relaxed">{feat.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section className="relative overflow-hidden bg-gradient-to-br from-green-900 to-emerald-800 rounded-2xl sm:rounded-3xl p-5 sm:p-8 md:p-10 text-white shadow-xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_70%,rgba(74,222,128,0.1)_0%,transparent_60%)]" />
        <div className="relative">
          <p className="text-green-300 font-semibold text-sm uppercase tracking-widest mb-3">📬 Contacto</p>
          <h2 className="text-2xl md:text-3xl font-black mb-4">¿Quieres registrar un partido?</h2>
          <p className="text-green-100 text-lg leading-relaxed mb-2">
            Para registrar partidos, añadir resultados o dar de alta a nuevos jugadores, habla con:
          </p>
          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl px-6 py-4 inline-block mt-2">
            <p className="text-2xl font-black text-white">Guillermo Araujo Riestra</p>
            <p className="text-green-300 text-sm mt-1">Administrador del LPT · Lomeros Padel Tour</p>
          </div>
        </div>
      </section>

      {/* Glosario */}
      <section className="bg-white rounded-2xl sm:rounded-3xl border border-gray-100 shadow-sm p-5 sm:p-8 md:p-10 space-y-4">
        <h2 className="text-2xl font-black text-gray-900">📚 Glosario</h2>
        <div className="divide-y divide-gray-100">
          {[
            { term: 'Elo', def: 'Puntuación que mide el nivel relativo de un jugador. Sube al ganar y baja al perder, según la dificultad del rival.' },
            { term: 'Sinergia', def: 'Win rate que tiene una pareja específica cuando juegan juntos.' },
            { term: 'Win Rate', def: 'Porcentaje de partidos ganados sobre el total de partidos jugados.' },
            { term: 'Racha', def: 'Número de victorias o derrotas consecutivas desde el último partido.' },
            { term: 'Factor-K', def: 'Velocidad a la que cambia el Elo. Más alto = cambios más bruscos. Baja a medida que juegas más.' },
          ].map((item) => (
            <div key={item.term} className="py-4 flex flex-col sm:flex-row sm:gap-4">
              <p className="font-black text-green-700 sm:w-24 sm:shrink-0 mb-1 sm:mb-0">{item.term}</p>
              <p className="text-gray-600 text-sm leading-relaxed">{item.def}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="text-center pb-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold px-6 py-3 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all"
        >
          🏠 Volver al inicio
        </Link>
      </div>

    </div>
  );
}
