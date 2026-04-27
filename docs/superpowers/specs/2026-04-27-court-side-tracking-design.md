# Court Side Tracking (Feature C) — Lomeros Padel Tour

**Fecha:** 2026-04-27
**Estado:** Aprobado, pendiente de plan de implementación
**Alcance:** Registrar el lado (drive/revés) en que cada jugador juega cada partido. Surfacear los datos en match detail, perfil de jugador (nueva card analítica) y recomendador de parejas (sugerencia de lado por equipo). Backfill heurístico para partidos históricos + UI dedicada para corregirlos.

---

## Contexto y motivación

El usuario quiere indicar en qué lado de la pista (drive o revés) ha jugado cada jugador en cada partido, para poder analizar:
1. Win rate por lado de cada jugador.
2. Recomendación automática de qué lado debería jugar cada uno cuando se programa un partido.

La granularidad acordada es **por partido completo** (un único lado por jugador por partido — no por set).

## Decisiones de diseño

**Schema:** 4 columnas nuevas en `matches`, todas `TEXT` y nullable. Valores: `'drive' | 'reves' | null`. Texto en lugar de boolean por auto-documentación. Nullable porque (a) los partidos históricos no tienen el dato, (b) el admin puede no rellenarlo en el momento.

**Backfill heurístico (una sola vez, durante la migración):**
- Si un equipo tiene 1 zurdo + 1 diestro → el zurdo al revés, el diestro al drive (convención común en pádel).
- Si ambos misma mano → fallback posicional: `team1Player1Id` al drive, `team1Player2Id` al revés.
- Solo se backfilla si las 4 columnas del partido siguen `NULL` (no se sobrescribe edición manual previa).

**Edición posterior:** página dedicada `/admin/matches/[id]/sides` con un form pequeño focalizado **solo** en los 4 lados. No tocamos el match-form ni el result-form para "modo edit completo" — es scope mucho menor y resuelve el caso del usuario (corregir backfill).

**Algoritmo de recomendación de lado** ("suma de comodidades"):
```
comfort_A_drive = winrate(A, drive) + winrate(B, revés)
comfort_B_drive = winrate(B, drive) + winrate(A, revés)
```
Si `comfort_A_drive > comfort_B_drive` → A juega drive, B juega revés. Empate o ambos sin datos → sin recomendación.

Default de winrate cuando no hay datos del lado: `0.5` (neutral). Si AMBOS jugadores carecen de cualquier dato → no se muestra recomendación.

## Cambios

### 1. Schema (`src/lib/db/schema.ts`)

Añadir al `matches` table:

```ts
team1Player1Side: text('team1_player1_side'),  // 'drive' | 'reves' | null
team1Player2Side: text('team1_player2_side'),
team2Player1Side: text('team2_player1_side'),
team2Player2Side: text('team2_player2_side'),
```

### 2. Migración (`src/app/api/migrate-db/route.ts`)

Añadir 4 ALTER TABLE idempotentes + un paso de backfill:

```ts
// Step N: Add side columns to matches if not present (Feature C)
for (const col of ['team1_player1_side', 'team1_player2_side', 'team2_player1_side', 'team2_player2_side']) {
  try {
    await db.run(sql`ALTER TABLE matches ADD COLUMN ${sql.raw(col)} TEXT`);
  } catch { /* already exists — skip */ }
}

// Step N+1: Heuristic backfill for matches with no side data set
const allMatches = await db.select().from(matches);
const allPlayers = await db.select().from(players);
const playerMap = Object.fromEntries(allPlayers.map((p) => [p.id, p]));

for (const m of allMatches) {
  const hasAnySide =
    m.team1Player1Side || m.team1Player2Side || m.team2Player1Side || m.team2Player2Side;
  if (hasAnySide) continue; // skip matches that already have side info

  const t1 = backfillTeamSides(playerMap[m.team1Player1Id], playerMap[m.team1Player2Id]);
  const t2 = backfillTeamSides(playerMap[m.team2Player1Id], playerMap[m.team2Player2Id]);

  await db.update(matches).set({
    team1Player1Side: t1.player1,
    team1Player2Side: t1.player2,
    team2Player1Side: t2.player1,
    team2Player2Side: t2.player2,
  }).where(eq(matches.id, m.id));
}
```

Helper `backfillTeamSides` definido inline:
```ts
function backfillTeamSides(p1, p2) {
  if (!p1 || !p2) return { player1: null, player2: null };
  if (p1.isLeftHanded && !p2.isLeftHanded) return { player1: 'reves', player2: 'drive' };
  if (!p1.isLeftHanded && p2.isLeftHanded) return { player1: 'drive', player2: 'reves' };
  return { player1: 'drive', player2: 'reves' }; // positional fallback
}
```

### 3. API

**POST `/api/matches/route.ts`:** aceptar las 4 nuevas columnas opcionales del body, persistir con coerción defensiva (`'drive'`/`'reves'`/null, otros valores → null).

**PUT `/api/matches/[id]/route.ts`** (current "add result"): aceptar los 4 nuevos campos opcionales, actualizar las side columns junto con sets/winnerTeam.

**Nuevo endpoint:** `PATCH /api/matches/[id]/sides/route.ts`
- Body: `{ team1Player1Side, team1Player2Side, team2Player1Side, team2Player2Side }`
- Coerción de cada campo a `'drive' | 'reves' | null`
- Update SOLO esos 4 campos, sin tocar nada más
- Returns the updated match

### 4. Forms

**`src/components/admin/match-form.tsx`** — dropdown junto a cada select de jugador:

```tsx
<div className="grid grid-cols-[1fr_auto] gap-2 items-end">
  <select> {/* current player select */} </select>
  <select className="border rounded-md px-2 py-2 text-sm bg-white">
    <option value="">—</option>
    <option value="drive">Drive</option>
    <option value="reves">Revés</option>
  </select>
</div>
```

Estado del form se extiende: `team1Sides: ['drive' | 'reves' | '', 'drive' | 'reves' | '']` (paralelo a `team1`). Igual para team2. Al submit, se mapean strings vacíos a `null`.

Validación suave (no bloqueante): si en un equipo se elige el mismo lado para los dos jugadores, mostrar warning toast pero permitir guardar (admin sabe lo que hace).

**`src/components/admin/result-form.tsx`** — mismo patrón al final del form, antes del botón "Guardar". Pre-rellena con los valores existentes si los hay (recibidos vía props del server component padre).

**Nuevo `src/components/admin/match-sides-form.tsx`:**
- Recibe `matchId`, los 4 player names, y los 4 valores actuales de side
- 4 dropdowns simples (uno por jugador con su nombre como label)
- Submit via PATCH `/api/matches/[id]/sides`
- Toast + redirect a `/admin/matches`

**Nueva página `src/app/admin/matches/[id]/sides/page.tsx`:**
- Server component: fetcha el match + los 4 jugadores
- Renderiza `<MatchSidesForm>` con los datos cargados

**Botón "Lados"** en cada card de la lista admin (`src/app/admin/matches/page.tsx`):
- Junto al botón "+ Resultado" para partidos `scheduled` y junto al botón Delete para partidos `completed`.
- `<Link href={`/admin/matches/${match.id}/sides`}>` con `<Button variant="outline" size="sm" className="min-h-[40px] px-3 text-xs">🎾 Lados</Button>`.

### 5. Lógica de stats por lado

**Nuevo `src/lib/rating/side-stats.ts`:**

```ts
export interface SideStats {
  drive: { matches: number; wins: number; losses: number; winRate: number };
  reves: { matches: number; wins: number; losses: number; winRate: number };
}

export interface MatchWithSide {
  team1Player1Id: string;
  team1Player2Id: string;
  team2Player1Id: string;
  team2Player2Id: string;
  team1Player1Side: string | null;
  team1Player2Side: string | null;
  team2Player1Side: string | null;
  team2Player2Side: string | null;
  winnerTeam: number | null;
}

/**
 * Para un jugador y un set de partidos donde participó, calcula sus
 * estadísticas agregadas por lado (drive y revés).
 * Solo cuenta partidos donde el lado del jugador esté registrado.
 */
export function computeSideStats(playerId: string, matches: MatchWithSide[]): SideStats { ... }
```

**Nuevo `src/lib/rating/recommend-sides.ts`:**

```ts
export interface SideRecommendation {
  driveSidePlayerId: string;
  revesSidePlayerId: string;
}

/**
 * Decide cuál de los dos jugadores debería ir al drive y cuál al revés
 * usando "suma de comodidades". Retorna null si no hay datos suficientes
 * para una recomendación clara.
 */
export function recommendSides(
  playerA: { id: string; sideStats: SideStats },
  playerB: { id: string; sideStats: SideStats },
): SideRecommendation | null { ... }
```

### 6. Modificación al recomendador (`src/lib/rating/recommend-pairs.ts`)

Extender la firma para aceptar side stats opcional y enriquecer el resultado:

```ts
export interface PairingOption {
  // ... campos actuales
  team1SideRec: SideRecommendation | null;
  team2SideRec: SideRecommendation | null;
}

export function recommendPairings(
  players: PlayerSummary[],
  sideStatsByPlayer?: Record<string, SideStats>,
): PairingOption[]
```

Si `sideStatsByPlayer` no se pasa → `team1SideRec`/`team2SideRec` = `null`.

### 7. Display

**Match detail (`src/app/(public)/matches/[id]/page.tsx`):**

A) Junto a cada nombre de jugador (en mobile y desktop layouts), badge minúsculo:
```tsx
{playerSide && (
  <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded font-bold ${
    playerSide === 'drive' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
  }`}>
    {playerSide === 'drive' ? 'D' : 'R'}
  </span>
)}
```
Solo se muestra si la columna no es null.

B) En el recomendador de parejas, calcular `sideStatsByPlayer` para los 4 jugadores del partido y pasarlo a `recommendPairings`. En cada card del recomendador, junto a cada nombre del jugador, mostrar badge "Drive sugerido" / "Revés sugerido" si la recomendación existe.

**Player profile (`src/app/(public)/players/[id]/page.tsx`):**

Nueva card entre "Mejor compañero" y "Historial de partidos":

```tsx
{(stats.drive.matches > 0 || stats.reves.matches > 0) && (
  <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
    <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4">🎾 Lado de pista</p>
    <div className="grid grid-cols-2 gap-4">
      <SideStatBlock label="Drive" stats={stats.drive} highlight={driveBetter} />
      <SideStatBlock label="Revés" stats={stats.reves} highlight={!driveBetter} />
    </div>
  </div>
)}
```

`SideStatBlock` muestra: matches played, V/D, win%. El bloque highlighted (mejor lado) tiene un sutil borde verde. Si solo hay datos de uno de los lados, el otro muestra "Sin datos".

Datos: server component query — todos los partidos completados del jugador con sus columnas de side, pasados a `computeSideStats(playerId, matches)`.

### 8. Tests

Nuevos en `src/lib/rating/side-stats.test.ts`:
- `computeSideStats` con array vacío → ambos lados a 0.
- Solo partidos al drive → `reves.matches === 0`.
- Solo partidos al revés → `drive.matches === 0`.
- Ambos lados con winrates conocidos → resultados correctos.
- Partidos donde el jugador NO aparece → ignorados.
- Partidos donde el lado del jugador es null → no cuentan.

Nuevos en `src/lib/rating/recommend-sides.test.ts`:
- Sin datos en ninguno → null.
- Datos solo de uno → suma de comodidades con default 0.5 para el otro.
- Caso claro (A 80/50, B 60/70) → A drive, B revés.
- Empate exacto → null.

Nuevos en `src/lib/rating/recommend-pairs.test.ts` (archivo nuevo, no existe hoy):
- recommendPairings sin `sideStatsByPlayer` → `team1SideRec`/`team2SideRec` son null.
- recommendPairings con sideStatsByPlayer → cada PairingOption incluye recomendación correcta o null según haya datos.
- Edge case: 4 jugadores sin datos de side → todas las recomendaciones null.

Tests totales: 23 actuales + ~10 nuevos ≈ 33.

## Orden de despliegue

1. Merge + push → Vercel deploya en ~40s.
2. **Aplicar migración:**
   ```bash
   curl -X POST https://lomeros-padel-tour.vercel.app/api/migrate-db
   ```
   Esto añade las 4 columnas Y aplica el backfill heurístico a tus partidos existentes.
3. Probar:
   - Editar un partido viejo con `/admin/matches/<id>/sides` para verificar que se puede corregir.
   - Crear un partido nuevo desde admin con sides → verificar que se persisten.
   - Abrir un perfil con datos de side → ver la card "Lado de pista".
   - Crear un partido programado → en su detail page, ver el recomendador con badges de lado.

## Verificación

- `npx tsc --noEmit && npm run lint && npm test` — todo verde, ~33 tests pasan.
- Manual post-deploy según el orden arriba.

## Archivos afectados

**Modificados (8):**
- `src/lib/db/schema.ts`
- `src/app/api/migrate-db/route.ts`
- `src/app/api/matches/route.ts`
- `src/app/api/matches/[id]/route.ts`
- `src/components/admin/match-form.tsx`
- `src/components/admin/result-form.tsx`
- `src/app/admin/matches/page.tsx` (botón "Lados" en cards)
- `src/app/(public)/matches/[id]/page.tsx` (badges + recomendador con sides)
- `src/app/(public)/players/[id]/page.tsx` (nueva card)
- `src/lib/rating/recommend-pairs.ts`

**Creados (5):**
- `src/app/api/matches/[id]/sides/route.ts`
- `src/app/admin/matches/[id]/sides/page.tsx`
- `src/components/admin/match-sides-form.tsx`
- `src/lib/rating/side-stats.ts`
- `src/lib/rating/recommend-sides.ts`
- `src/lib/rating/side-stats.test.ts`
- `src/lib/rating/recommend-sides.test.ts`

**Sin tocar:** Lógica de Elo (`elo.ts`, `process-match.ts`), Podium, MatchCard, ranking pages, info, login.

## Riesgos / decisiones explícitas

- **Backfill heurístico:** algunos partidos quedarán "mal" backfilleados (especialmente si nadie está marcado como zurdo aún → todos van a fallback posicional). El usuario tendrá que corregirlos manualmente vía la nueva sides-edit page. Documentado y aceptado.
- **No edit completo de partidos** (jugadores, fecha, etc.): fuera de scope. La sides-edit page solo toca lados. Si en el futuro se quiere editar todo, es feature aparte.
- **Algoritmo "suma de comodidades":** elegido por el usuario tras comparar con "máximo individual" (la suma respeta mejor las preferencias secundarias).
