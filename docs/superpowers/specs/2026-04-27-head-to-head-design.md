# Head-to-Head Per Rival (Feature E) — Lomeros Padel Tour

**Fecha:** 2026-04-27
**Estado:** Aprobado, pendiente de plan de implementación
**Alcance:** Mostrar el récord de un jugador contra cada rival (W-L) en su perfil. Pura agregación sobre la tabla `matches` existente — sin cambios de schema, sin migración.

---

## Contexto

Las matches ya tienen toda la información necesaria (4 player slots + winnerTeam). Falta surfacearla. El usuario quiere ver de un vistazo cómo le va contra cada rival individual ("vs Juan: 5-3").

## Decisiones

**Display:** tabla compacta con una fila por rival, ordenada por partidos jugados (más jugados primero). Columnas: Rival, P (partidos), V (victorias), D (derrotas), Win%.

**Definición de rival:** otro jugador que ha estado en el equipo OPUESTO al del jugador del perfil en algún partido completado. Compañeros NO cuentan (eso ya está en la card "Mejor compañero").

**Filtro:** rivales con al menos 1 partido en equipos opuestos. Sin partido común → no aparece.

**Localización:** nueva card en el perfil del jugador, entre "Lado de pista" e "Historial de partidos".

**Sin cambios de schema** — todo se computa on-the-fly desde los datos ya existentes en `matches`.

## Cambios

### 1. Nuevo helper puro `src/lib/rating/head-to-head.ts`

```ts
export interface RivalryStats {
  opponentId: string;
  opponentName: string;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface MatchForRivalry {
  team1Player1Id: string;
  team1Player2Id: string;
  team2Player1Id: string;
  team2Player2Id: string;
  winnerTeam: number | null;
}

interface PlayerForRivalry {
  id: string;
  name: string;
}

/**
 * Compute head-to-head record vs every player who has been on the opposing team
 * in at least one completed match.
 *
 * Returns RivalryStats[] sorted by matches played (most → least), then by name (A→Z) for ties.
 * Players never opposed are NOT in the result.
 */
export function computeAllRivalries(
  playerId: string,
  matches: MatchForRivalry[],
  allPlayers: PlayerForRivalry[],
): RivalryStats[]
```

### 2. Algoritmo

Por cada partido `m` con `winnerTeam !== null`:
- Identificar el equipo del jugador (1, 2, o ninguno → skip).
- Los 2 jugadores del equipo opuesto son rivales en ese partido.
- Para cada rival: incrementar `matches`. Si `winnerTeam === playerTeam` → `wins++`, si no → `losses++`.

Al final, calcular `winRate = wins / matches` para cada rival, lookup `opponentName` desde `allPlayers`, ordenar por `matches DESC, name ASC`, devolver array.

### 3. Tests (Vitest, TDD)

`src/lib/rating/head-to-head.test.ts` con ~7 tests:
- Empty matches → empty array.
- Player not in any match → empty array.
- Player only as teammate (no opposing) → empty array.
- One match opposing one rival, win → 1 rivalry with `wins: 1, losses: 0`.
- Multiple matches vs same rival → aggregated.
- Multiple rivals → all listed, sorted by matches.
- `winnerTeam = null` (scheduled) → not counted.

Tests antes de la implementación. 47 tests totales (40 + 7).

### 4. Display en perfil del jugador

`src/app/(public)/players/[id]/page.tsx`:

(a) Add import:
```ts
import { computeAllRivalries, type MatchForRivalry } from '@/lib/rating/head-to-head';
```

(b) Compute rivalries (after `completedMatches` y `allPlayers` already exist):
```ts
const rivalries = computeAllRivalries(id, completedMatches, allPlayers);
```

(c) New card between "Lado de pista" and "Historial de partidos":

```tsx
{rivalries.length > 0 && (
  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
    <div className="px-5 py-4 border-b border-gray-50">
      <p className="text-xs font-black text-gray-500 uppercase tracking-widest">🤜 Head-to-head</p>
    </div>
    <div className="divide-y divide-gray-50">
      {rivalries.map((r) => (
        <RivalryRow key={r.opponentId} rivalry={r} />
      ))}
    </div>
  </div>
)}
```

(d) Helper `RivalryRow` colocated at the bottom of the page file:

```tsx
function RivalryRow({ rivalry }: { rivalry: RivalryStats }) {
  const winPct = Math.round(rivalry.winRate * 100);
  const colorClass = winPct >= 60 ? 'text-green-600' : winPct >= 40 ? 'text-yellow-600' : 'text-red-500';
  return (
    <Link href={`/players/${rivalry.opponentId}`} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 hover:bg-gray-50/50 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center text-white text-sm font-black shrink-0">
          {rivalry.opponentName.charAt(0)}
        </div>
        <span className="text-sm font-bold text-gray-800 truncate">{rivalry.opponentName}</span>
      </div>
      <div className="flex items-center gap-3 sm:gap-4 shrink-0">
        <span className="text-xs text-gray-400 tabular-nums">{rivalry.matches}P</span>
        <span className="text-xs font-bold text-green-600 tabular-nums">{rivalry.wins}V</span>
        <span className="text-xs font-bold text-red-400 tabular-nums">{rivalry.losses}D</span>
        <span className={`text-sm font-black tabular-nums w-12 text-right ${colorClass}`}>{winPct}%</span>
      </div>
    </Link>
  );
}
```

(e) Add `RivalryStats` to the imports at the top:
```ts
import { computeAllRivalries, type MatchForRivalry, type RivalryStats } from '@/lib/rating/head-to-head';
```

### 5. Sin cambios en API, schema, forms, otras páginas

Toda la lógica vive en el helper + el componente del perfil. No hay PUT/POST/migration.

## Verificación

- `npx tsc --noEmit && npm run lint && npm test` — todo verde, 47 tests (40 + 7 nuevos).
- Manual post-deploy: abrir un perfil con varios partidos jugados → verificar la card aparece, ordenada por partidos, con el rival con más partidos arriba. Si un rival tiene 100% winrate, ver verde; si 0%, rojo.

## Archivos afectados

**Creados (2):**
- `src/lib/rating/head-to-head.ts`
- `src/lib/rating/head-to-head.test.ts`

**Modificados (1):**
- `src/app/(public)/players/[id]/page.tsx`

**Sin tocar:** schema, API, todas las demás páginas, lógica de Elo, recommend-pairs, etc.

## Notas de scope

- **No** incluyo "diferencia media de Elo en el momento de los partidos" — más complejidad que valor para v1.
- **No** mostramos head-to-head en match cards o ranking — solo en el perfil del jugador. Podemos extender después si surge demanda.
- **No** hay paginación. Si un jugador tiene 30+ rivales, simplemente se hace scroll. En la práctica un grupo amateur tiene < 20 jugadores totales.
