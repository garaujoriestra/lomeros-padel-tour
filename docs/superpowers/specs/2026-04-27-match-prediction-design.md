# Match Prediction (Feature F) — Lomeros Padel Tour

**Fecha:** 2026-04-27
**Estado:** Aprobado, pendiente de plan de implementación
**Alcance:** Mostrar la probabilidad de victoria de cada equipo en partidos programados, calculada con la función `expectedScore` que ya existe. Aparece en el hero del match detail y en cada card del recomendador de parejas.

---

## Contexto

`expectedScore(ratingA, ratingB)` ya existe en `src/lib/rating/elo.ts` (lo usa `calculateDoublesElo`). Devuelve la probabilidad de que el equipo A gane, en `[0, 1]`. El Elo de un equipo de dobles = media de los 2 jugadores (convención ya usada en el rating). Cero código nuevo en helpers — solo lo llamamos desde 2 sitios.

## Decisiones

**Mostrar predicción solo en partidos `scheduled`.** Los `completed` ya tienen resultado real; el % "predicho" sería ruido.

**Algoritmo de cálculo de probabilidad de equipo:**
```
team1Elo = (player1.elo + player2.elo) / 2
team2Elo = (player3.elo + player4.elo) / 2
team1Prob = expectedScore(team1Elo, team2Elo)
team2Prob = 1 - team1Prob
```

**Display 1: hero del match detail.** En la columna central del hero scheduled, añadir una línea de % bajo el badge "Pendiente":

```
       VS
   [Pendiente]
  🔵 62% – 38% 🔴
```

El "62%" en azul (`text-blue-300`), "38%" en rojo (`text-red-300`), separador en blanco translúcido. Sin label extra ("Predicción") — el contexto (VS + Pendiente) lo hace obvio.

**Display 2: cada card del recomendador.** Junto al label "⭐ Más equilibrado / ±18 ELO", añadir una segunda línea de probabilidad:

```
⭐ Más equilibrado          ±18 ELO
                            🔵 55% – 45% 🔴
```

**Sin cambios en match cards de la lista, ni en partidos completed, ni en el ranking.** Predicción es info extra — vive donde el usuario evalúa una opción de juego, no donde simplemente lista partidos.

## Cambios

### 1. `src/lib/rating/recommend-pairs.ts`

Añadir un nuevo campo a `PairingOption` y calcularlo dentro del mapping existente.

(a) Importar `expectedScore` (ya está exportado en `./elo`):
```ts
import { expectedScore } from './elo';
```

(b) Extender `PairingOption`:
```ts
export interface PairingOption {
  // ... fields actuales
  team1WinProb: number; // 0-1, desde la perspectiva del equipo 1
}
```

(c) Dentro del `combos.map((...) => { ... })` actual, calcular `team1WinProb`:
```ts
const team1WinProb = expectedScore(team1Elo, team2Elo);
```
Añadirlo al objeto retornado.

### 2. `src/lib/rating/recommend-pairs.test.ts`

Añadir 1 test nuevo (al final del describe block):

```ts
it('computes team1WinProb correctly', () => {
  // Equal teams (1500/1500 vs 1500/1500) → 0.5
  const equal = recommendPairings(four);
  for (const opt of equal) {
    expect(opt.team1WinProb).toBeCloseTo(0.5, 5);
  }

  // Stronger team1 → team1WinProb > 0.5
  const skewed: [PlayerSummary, PlayerSummary, PlayerSummary, PlayerSummary] = [
    player('a', 1700),
    player('b', 1700),
    player('c', 1300),
    player('d', 1300),
  ];
  // The pairing that makes a+b vs c+d has team1Elo=1700, team2Elo=1300
  // expectedScore(1700, 1300) = 1 / (1 + 10^((1300-1700)/400)) = 1 / (1 + 10^-1) = ~0.909
  const result = recommendPairings(skewed);
  const abVscd = result.find((o) =>
    o.team1.some((p) => p.id === 'a') && o.team1.some((p) => p.id === 'b'),
  );
  expect(abVscd).toBeDefined();
  expect(abVscd!.team1WinProb).toBeCloseTo(0.909, 2);
});
```

Total tests: 49 (48 + 1 nuevo).

### 3. `src/app/(public)/matches/[id]/page.tsx`

(a) Añadir import:
```ts
import { expectedScore } from '@/lib/rating/elo';
```

(b) Hero scheduled — calcular probabilidad cuando los 4 jugadores existen, y mostrarla bajo "Pendiente":

Encontrar el bloque "Scheduled layout" del hero (mobile y desktop). En ambos, dentro del bloque que contiene `<p className="...">VS</p>` y `<p className="...uppercase tracking-widest">Pendiente</p>`, añadir un nuevo elemento debajo:

```tsx
{t1p1 && t1p2 && t2p1 && t2p2 && (() => {
  const team1Elo = (t1p1.eloRating + t1p2.eloRating) / 2;
  const team2Elo = (t2p1.eloRating + t2p2.eloRating) / 2;
  const team1Pct = Math.round(expectedScore(team1Elo, team2Elo) * 100);
  return (
    <p className="text-xs sm:text-sm text-white/70 mt-1 font-bold tabular-nums">
      <span className="text-blue-300">🔵 {team1Pct}%</span>
      <span className="mx-1.5 text-white/40">–</span>
      <span className="text-red-300">{100 - team1Pct}% 🔴</span>
    </p>
  );
})()}
```

Aplicar tanto en el bloque `sm:hidden` (mobile) como en el `hidden sm:grid` (desktop) del scheduled hero.

(c) Recomendador — leer `team1WinProb` de cada option y renderizarlo:

Encontrar la línea actual donde se muestra `±{Math.round(opt.eloDiff)}` (la "Diferencia de Elo"). Justo después del bloque que la contiene, añadir:

```tsx
<p className="text-xs font-bold tabular-nums mt-1">
  <span className="text-blue-600">🔵 {Math.round(opt.team1WinProb * 100)}%</span>
  <span className="mx-1.5 text-gray-300">–</span>
  <span className="text-red-600">{100 - Math.round(opt.team1WinProb * 100)}% 🔴</span>
</p>
```

(El color en el recomendador es `text-blue-600`/`text-red-600` — más fuerte porque va sobre fondo blanco. En el hero usamos `text-blue-300`/`text-red-300` — más suaves, sobre fondo verde oscuro.)

## Verificación

- `npx tsc --noEmit && npm run lint && npm test` — todo verde, 49 tests.
- Manual post-deploy: crear un partido programado entre 4 jugadores, abrir el detail page → ver el bloque % en el hero. Si los 4 jugadores forman 3 pairings posibles, verificar que cada card del recomendador muestra su propia % y que la card más equilibrada está más cerca del 50%/50% que las otras.

## Sin cambios

Schema, API, migración, otras páginas (rankings, info, ranking parejas, profile, match list, admin), lógica de Elo, recommend-sides, side-stats, head-to-head.

## Archivos afectados

**Modificados (3):**
- `src/lib/rating/recommend-pairs.ts`
- `src/lib/rating/recommend-pairs.test.ts`
- `src/app/(public)/matches/[id]/page.tsx`

**Creados:** ninguno.

## Notas

- **Edge case:** si alguno de los 4 jugadores en un scheduled match es null (no debería pasar — el INSERT garantiza que existen), el bloque % no se renderiza. Sin error, simplemente no aparece.
- **Precisión:** redondeo a 0 decimales. Más decimales sugieren falsa precisión sobre un modelo Elo que es heurístico.
- **No se almacena** la probabilidad en DB — se recalcula on-the-fly. Trivial coste.
