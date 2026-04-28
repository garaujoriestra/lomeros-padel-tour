# Logros / Achievements — Spec

## Contexto

Bloque 3 del roadmap (después del feed/ELO/inédita y de la foto del partido). Se añade un sistema de "achievements" que se desbloquean automáticamente según los datos del partido. Sistema visible en el perfil del jugador y en el feed de actividad cuando alguien desbloquea uno nuevo.

El sistema es **stored** (tabla `player_achievements`), **retroactivo** (los partidos pasados se evalúan en la migración), y **anti-spam en el feed** (los logros del backfill no inundan el feed; solo los desbloqueados a partir del deploy).

## Objetivos

- Catálogo de 14 logros distribuidos en 4 categorías cubriendo hitos numéricos, victorias/rachas, ELO/ranking y momentos situacionales.
- Detección automática al cerrar un partido (en `processMatchRatings`).
- Backfill retroactivo en la migración de BD.
- Grid compacto en el perfil del jugador (todos los logros visibles, bloqueados en gris).
- Eventos del feed cuando se desbloquea un logro post-deploy.

## Fuera de alcance

- **Notificaciones push** (push/email) al desbloquear — pertenece al Bloque 4 (PWA).
- **Catálogo editable por admin** — los logros viven en código (`catalog.ts`), no en BD.
- **Logros privados o categorías ocultas** — todos visibles a todos los visitantes del perfil.
- **Animación de desbloqueo en tiempo real** (toast confetti).
- **Tier visual** (rare / mythic styling diferenciado) — el campo `tier` se guarda en el catálogo pero v1 los renderiza todos igual.
- **Más de 14 logros** — escala bien hasta 21+ con el grid de 7 columnas, pero v1 son 14 fijos.

---

## Diseño

### 1. Schema

Nueva tabla `playerAchievements` en `src/lib/db/schema.ts`:

```ts
export const playerAchievements = sqliteTable('player_achievements', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  playerId: text('player_id').notNull().references(() => players.id, { onDelete: 'cascade' }),
  achievementId: text('achievement_id').notNull(),  // catalog ID — see catalog.ts
  earnedAt: text('earned_at').notNull(),  // ISO timestamp
  triggerMatchId: text('trigger_match_id').references(() => matches.id, { onDelete: 'set null' }),
});

export type PlayerAchievement = typeof playerAchievements.$inferSelect;
```

**Idempotencia:** la combinación `(playerId, achievementId)` es lógicamente única; el detector verifica antes de insertar. No usamos `UNIQUE` constraint en SQLite (libsql) para mantener la migración simple.

### 2. Migración

Nueva Step 4d en `src/app/api/migrate-db/route.ts` (después del 4c que añade `photo_url`, antes del Step 5 backfill de sides):

```ts
// Step 4d: Create player_achievements table (Block 3)
try {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS player_achievements (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      achievement_id TEXT NOT NULL,
      earned_at TEXT NOT NULL,
      trigger_match_id TEXT REFERENCES matches(id) ON DELETE SET NULL
    )
  `);
} catch {
  // Table already exists — skip silently
}
```

Y nueva Step 6 (al final, después de Step 5):

```ts
// Step 6: Backfill achievements retroactively (Block 3)
// Walks rating_history + match_sets chronologically and emits achievements
// for every threshold crossed in history. Idempotent: skips grants that
// already exist for (player_id, achievement_id).
//
// Result: existing players appear with their full constellation of earned
// achievements from day 1 of deploy.
```

Implementación: usar el helper detector (ver §4) sobre todo el `rating_history` global. Insertar grants nuevos en bulk.

### 3. Catálogo (`src/lib/achievements/catalog.ts`)

```ts
export type AchievementCategory = 'milestones' | 'wins' | 'elo' | 'situational';
export type AchievementTier = 'common' | 'rare' | 'mythic';

export interface Achievement {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: AchievementCategory;
  tier: AchievementTier;
}

export const ACHIEVEMENTS: Achievement[] = [
  // Milestones
  { id: 'first_match',  name: 'Primer partido',   icon: '🎾', description: '1 partido jugado',     category: 'milestones', tier: 'common' },
  { id: 'matches_10',   name: 'Decena',           icon: '🔟', description: '10 partidos jugados',  category: 'milestones', tier: 'common' },
  { id: 'matches_50',   name: 'Cincuentón',       icon: '🎯', description: '50 partidos jugados',  category: 'milestones', tier: 'rare' },
  { id: 'matches_100',  name: 'El siglo',         icon: '💯', description: '100 partidos jugados', category: 'milestones', tier: 'mythic' },
  // Wins & streaks
  { id: 'first_win',    name: 'Primera victoria', icon: '🥇', description: 'Primera victoria',         category: 'wins', tier: 'common' },
  { id: 'wins_25',      name: 'Veterano',         icon: '🏆', description: '25 victorias',             category: 'wins', tier: 'rare' },
  { id: 'streak_3',     name: 'Racha de 3',       icon: '🔥', description: '3 victorias seguidas',     category: 'wins', tier: 'common' },
  { id: 'streak_5',     name: 'Racha de 5',       icon: '🚀', description: '5 victorias seguidas',     category: 'wins', tier: 'rare' },
  { id: 'streak_10',    name: 'Racha de 10',      icon: '⚡', description: '10 victorias seguidas',    category: 'wins', tier: 'mythic' },
  // ELO & ranking
  { id: 'elo_1600',     name: '1600+',            icon: '📈', description: 'Cruzar 1600 ELO',          category: 'elo', tier: 'common' },
  { id: 'elo_1800',     name: '1800+',            icon: '💎', description: 'Cruzar 1800 ELO',          category: 'elo', tier: 'rare' },
  { id: 'rank_1',       name: '#1 del LPT',       icon: '👑', description: 'Llegar al #1 del ranking', category: 'elo', tier: 'rare' },
  // Situational
  { id: 'bagel',        name: 'Bagel',            icon: '🍩', description: 'Ganar un set 6-0',         category: 'situational', tier: 'common' },
  { id: 'double_bagel', name: 'Doble bagel',      icon: '🥶', description: 'Ganar 6-0 / 6-0',          category: 'situational', tier: 'mythic' },
];
```

### 4. Detector — `src/lib/achievements/detect.ts`

Función pura. TDD-first. Toma el historial completo y devuelve grants candidatos.

```ts
import type { RankChangeEvent } from '@/lib/feed/rank-changes';

export interface PlayerAchievementGrant {
  playerId: string;
  achievementId: string;
  earnedAt: string;
  triggerMatchId: string | null;
}

interface MatchHistoryEntry {
  /** rating_history row */
  playerId: string;
  matchId: string;
  recordedAt: string;
  eloBefore: number;
  eloAfter: number;
  /** From join: was this player on the winning team? */
  isWin: boolean;
  /** From join: did this player's team win any 6-0 set in this match? */
  hasBagelSet: boolean;
  /** From join: did this player's team win 2 sets that were both 6-0? */
  isDoubleBagel: boolean;
}

interface DetectInput {
  history: MatchHistoryEntry[];        // ordered by recordedAt asc, ALL players mixed
  rankEvents: RankChangeEvent[];       // from detectRankChanges
}

export function detectAllAchievements(input: DetectInput): PlayerAchievementGrant[]
```

**Reglas de detección:**

- Para cada entrada de `history`, mantener un mapa `playerId → { matchesPlayed, wins, currentStreak, maxElo }`.
- En cada entrada del jugador X, incrementar contadores y comprobar:
  - `first_match`: primera entrada del jugador X.
  - `matches_10`, `matches_50`, `matches_100`: cuando el contador cruza el umbral.
  - `first_win`: primera entrada con `isWin === true`.
  - `wins_25`: contador de wins cruza 25.
  - `streak_3`, `streak_5`, `streak_10`: `currentStreak` (resetea a 0 en derrota) cruza el umbral.
  - `elo_1600`, `elo_1800`: cuando `eloAfter` cruza el umbral hacia arriba y no estaba antes.
  - `bagel`: cuando `hasBagelSet === true`.
  - `double_bagel`: cuando `isDoubleBagel === true`.
- Para cada `RankChangeEvent` de tipo `rank_into_top1`, emitir `rank_1` (la PRIMERA vez por jugador; subsiguientes ignoradas).

`earnedAt` = `recordedAt` de la entrada que dispara el desbloqueo. `triggerMatchId` = `matchId` de esa misma entrada (excepto para `rank_1`, donde puede ser el `matchId` del rank event).

**Idempotencia:** el detector emite TODOS los grants candidatos. El consumidor (backfill o hook al cerrar partido) hace la deduplicación contra grants ya guardados.

### 5. Hook al cerrar partido

En `src/lib/rating/process-match.ts`, tras actualizar ELOs y `pair_stats`, llamar:

```ts
async function applyAchievements(matchId: string) {
  // Load full history + sets + rank events for the affected players.
  // Run detectAllAchievements.
  // Filter out grants that already exist (lookup against player_achievements).
  // Insert new grants in bulk.
}
```

Coste: una vez por partido cerrado. Aceptable.

### 6. UI — `<AchievementsCard>` en el perfil

Componente nuevo `src/components/shared/achievements-card.tsx`:

```tsx
interface AchievementsCardProps {
  earned: { achievementId: string; earnedAt: string }[];
}

// Renders all 14 ACHIEVEMENTS in a grid. Earned: gradient yellow + full color.
// Locked: bg-gray-100 + opacity-40 grayscale. title attribute shows name +
// description + (if earned) earnedAt formatted.
```

Estructura visual:
- Header: `🏆 LOGROS` + contador `X / 14`.
- Grid `grid grid-cols-7 gap-2` (7 columnas, 2 filas para 14 logros).
- Cada celda: aspect-ratio 1, rounded-xl, icono centrado a 24px font-size.
- Earned: `bg-gradient-to-br from-yellow-100 to-yellow-300`.
- Locked: `bg-gray-100 opacity-40 grayscale`.
- `title="${name} — ${description}${earned ? ' · ' + earnedAt : ''}"`.

Posición en `src/app/(public)/players/[id]/page.tsx`: después de `<UnplayedPartnersCard>`, antes del bloque "Court side stats".

Datos: el perfil ejecuta `db.select().from(playerAchievements).where(eq(playerAchievements.playerId, id))` y pasa el resultado como `earned` prop.

### 7. UI — Feed integration

#### Nuevo tipo de evento en `FeedEvent`

En `src/lib/feed/build-feed.ts`:

```ts
| {
    type: 'achievement_unlocked';
    timestamp: string;
    playerId: string;
    achievement: Achievement;
  }
```

#### Anti-spam: cutoff de fecha

En `buildFeed`:

```ts
const FEED_ACHIEVEMENT_CUTOFF = '2026-04-29T00:00:00Z';

// Only emit achievement_unlocked events for grants earned >= cutoff.
// Backfilled grants (earned during migration on past matches) have
// earnedAt = the historical recordedAt, which is before the cutoff,
// so they're excluded from the feed automatically.
```

El cutoff se setea al timestamp del primer deploy del Bloque 3 (cuando se añadió la feature). Lo más simple: hard-coded en el código.

#### Nueva fuente de datos en `BuildFeedInput`

```ts
interface BuildFeedInput {
  // ... existing fields
  achievements: { playerId: string; achievementId: string; earnedAt: string }[];
}
```

El dashboard carga `player_achievements` recientes (últimos N) y los pasa a `buildFeed`.

#### `<ActivityFeedItem>` — branch nuevo

Nuevo render para `achievement_unlocked`: card amarilla, icono del logro a la izquierda, texto "**[Player]** desbloquea **[Icon] [Name]**". Click → link al perfil del jugador.

### 8. Tests (TDD)

Tests unitarios para `detectAllAchievements`:

- Empty input → empty grants.
- Player con 1 partido → emite `first_match`.
- Player con 1 victoria en su primer partido → emite `first_match` + `first_win`.
- Player con 10 partidos → emite `matches_10`.
- Player que cruza 1600 ELO → emite `elo_1600` (una vez, aunque oscile arriba y abajo).
- Racha de 3 victorias → emite `streak_3`. Si pierde y vuelve a ganar 3 → NO emite de nuevo (ya tiene el logro).
- `rank_into_top1` event → emite `rank_1` la primera vez, no subsiguientes.
- Match con un set 6-0 → emite `bagel` para los ganadores del set.
- Match con dos sets 6-0 ganados por el mismo equipo → emite `double_bagel` (y `bagel` también).

Ningún test del lado de la UI (es server-rendered + estilo).

### 9. Archivos afectados

| Archivo | Cambio |
|---|---|
| `src/lib/db/schema.ts` | Tabla `playerAchievements` + tipo |
| `src/app/api/migrate-db/route.ts` | Step 4d (CREATE TABLE) + Step 6 (backfill) |
| `src/lib/achievements/catalog.ts` | Nuevo. 14 achievements + tipos |
| `src/lib/achievements/detect.ts` | Nuevo. Detector puro |
| `src/lib/achievements/detect.test.ts` | Nuevo. TDD ~10 casos |
| `src/lib/rating/process-match.ts` | Hook tras cerrar partido |
| `src/components/shared/achievements-card.tsx` | Nuevo. Grid compacto |
| `src/app/(public)/players/[id]/page.tsx` | Cargar achievements + render `<AchievementsCard>` |
| `src/lib/feed/build-feed.ts` | Nuevo tipo de evento `achievement_unlocked` + cutoff |
| `src/lib/feed/build-feed.test.ts` | Tests para el nuevo tipo |
| `src/components/shared/activity-feed-item.tsx` | Branch para `achievement_unlocked` |
| `src/app/(public)/page.tsx` | Cargar grants recientes para `buildFeed` |

---

## Riesgos / consideraciones

- **Backfill cost**: walking `rating_history` for ~500 entries is O(N). Trivial. Coste despreciable.
- **Idempotencia del backfill**: si la migración corre dos veces, los grants no se duplican porque comprobamos `(playerId, achievementId)` antes de insertar. Verificar con un test manual.
- **`process-match.ts` performance**: el hook al cerrar partido lee history y sets de los 4 jugadores y corre el detector. Para grupos pequeños es instantáneo. Si crece a miles de partidos podría empezar a notarse, pero v1 está cubierto.
- **Cutoff del feed**: hard-coded `2026-04-29T00:00:00Z`. Cuando se haga el deploy del Bloque 3, ajustar el valor al día del deploy si difiere mucho.
- **Logros que requieren info no en `rating_history`**: `bagel` y `double_bagel` necesitan `match_sets` que NO está en `rating_history`. El detector recibe pre-joined data (`hasBagelSet`, `isDoubleBagel`) calculada por el caller a partir de los sets.
- **Ordering ambigüedad**: si dos logros se cumplen en el mismo partido (ej. `first_match` + `first_win` + `bagel`), todos se emiten con el mismo `earnedAt` y `triggerMatchId`. En el feed pueden aparecer apilados — aceptable.

---

## Open questions

Ninguna. Decisiones cerradas:
- Stored architecture, tabla `player_achievements`.
- 14 logros (catálogo aprobado).
- Backfill retroactivo en migración.
- Grid compacto en perfil, bloqueados en gris.
- Feed con anti-spam (cutoff de fecha hard-coded).
