# Diseño — TORNEO (Fase 1 completa: eliminación directa + grupos→eliminación)

> **Estado:** diseño aprobado en brainstorming (2026-06-16). Continúa `2026-06-15-pozo-torneo-split-design.md` y cierra la Fase 1 del rediseño (el Pozo ya está completo en la rama).
>
> **Rama:** `pozo-torneo-redesign` (sin mergear).
>
> **Alcance:** ambos formatos de torneo (`single_elim` A + `groups_elim` B), parejas fijas. Reutiliza el motor puro `fixed-pairs.ts` y el `scheduler.ts` ya existentes.

## Punto de partida (qué hay ya en la rama)

- **Pozo COMPLETO** (2b-2 + 2c): modelo, `pair-store`, `validatePairsInput`, run layer del pozo, fachada `pozo-engine`, UI admin + pública + e2e. `event-panel.tsx` ya muestra un **placeholder** para `kind=torneo`. Rutas `/admin/torneos`, `/admin/torneos/new`, `/admin/torneos/[id]` ya existen.
- **Motor puro del torneo — YA EXISTE** en `src/lib/tournament/fixed-pairs.ts`:
  - `seedOrder(size)`, `buildBracket(rankedLeaves: SlotRef[])`, `generateBracket(seededPairIds)`, `resolveBracket(bracket, results: Map<engineMatchId,'A'|'B'>)` (byes + slots `matchWinner`).
  - `roundRobinSchedule(pairIds)` (método del círculo), `groupStandings(pairIds, results)` (V=3/E=1/D=0; desempate pts → dif juegos → juegos a favor → pairId).
- **`scheduler.ts`**: `scheduleMatches(items, courts, slotMinutes)` (greedy a pistas/horas evitando solapes de jugador), `estimatedMatchMinutes(format)`.
- **`generate.ts` quedó HUÉRFANO** (layout del modelo de bloques viejo; solo lo usa su propio test). No se usa aquí; el run layer del torneo llama a `fixed-pairs.ts` + `scheduler.ts` directamente (igual que el pozo llama a `pozo.ts`). Se deja como está (no se borra en este spec).
- **Reutilizables ya construidos:** `pairs-editor.tsx`, `validatePairsInput`, `pair-store.ts`, `<ResultEntry>`, `display.ts` (`slotLabel`/`matchTeamLabels`/`isMatchPlayable`/`involvesPlayer`/`nextMatchForPlayer`), `buildDisplayContext` (en `pozo-view.ts`).

## Decisiones registradas (brainstorming 2026-06-16)

| Decisión | Elección |
|---|---|
| Alcance de la tanda | **A + B juntos** (single_elim + groups_elim) |
| Siembra / colocación | **Aleatoria por seed, sin ajuste manual** (ajuste manual = mejora posterior) |
| Entrada de resultado | **Dos números (juegos A / juegos B) → ganador**, como el pozo; alimenta `groupStandings` |
| Grupos→cuadro | **Automático** al cerrarse toda la liguilla (cruces estándar 1ºA-2ºB…) |
| 3er/4º puesto | **Fuera de v1** (requiere rastrear perdedores = `matchLoser`, reservado a Fase 2; se mantiene el flag en config) |
| Avance del cuadro | **Resolución en lectura** (`resolveBracket`); no se mutan filas aguas abajo |
| Esquema | **Sin cambios de DDL** (todo cabe en las tablas existentes) |

## Modelo de datos (sin cambios de esquema)

Tablas existentes: `tournament_groups` (id, tournamentId, name), `tournament_pairs` (id, tournamentId, player1Id, player2Id, seed, label, groupId), `tournament_matches` (id, tournamentId, courtId, round, phaseTag, scheduledStart/End, status, slotA1/A2/B1/B2, teamAScore, teamBScore, winner).

Convenciones de `phase_tag`:
- **Grupo:** `group:<nombre>` (p. ej. `group:A`). `round` = ronda del round-robin. Slots A1/B1 = `{type:'pair'}`.
- **Cuadro:** `ko:<idPosicional>` (p. ej. `ko:r0m0`, el `matchId` posicional del motor). `round` = ronda del cuadro. Slots A1/B1 = `pair` | `matchWinner` | `bye`.

Siempre **2 slots de pareja por partido** (A1 vs B1; A2/B2 null), como el pozo de parejas fijas.

## Run layer — `torneo-run.ts` (nuevo)

Análogo a `pozo-run.ts`/`pozo-pairs-run.ts`. Exporta:

- **`generateTorneo(db, tournamentId, seed)`**
  - Carga evento + parejas (`loadPairs`). Valida ≥ 2 parejas (si no, throw `TOO_FEW_PAIRS`).
  - **single_elim:** `shuffleDeterministic(pairIds, seed)` → `generateBracket(seeded)` → BracketMatch[]. Escribe **todo el cuadro**: cada `BracketMatch` → fila con `phaseTag='ko:'+matchId`, `round`, slotA1/slotB1 = sus `SlotRef` (serializados). Tras escribir, ejecuta `resolveBracket(bracket, new Map())` y para cada match con `winnerPairId` por **bye**, marca ese partido `completed` con `winner` puesto (no requiere entrada).
  - **groups_elim:** reparte parejas en `numGroups` grupos por barajado determinista (reparto round-robin de la lista barajada: pareja i → grupo i%numGroups). Crea filas `tournament_groups` (A, B, …) y fija `pairs.groupId` (vía un `setPairGroup` en `pair-store` o update directo). Por grupo, `roundRobinSchedule(groupPairIds)` → partidos con `phaseTag='group:'+nombre`, `round`=ronda. **El cuadro NO se crea aún.**
  - **Scheduling:** arma `ScheduleItem[]` para todos los partidos a escribir (players = los 2 jugadores de cada pareja conocida; en cuadro, rondas > 0 con slots `matchWinner` → players `[]`), ordenados por (fase, round). `scheduleMatches(items, courtWindows, estimatedMatchMinutes(cfg.matchFormat))`. Asigna `courtId`+`scheduledStart/End` desde el resultado; los no programables quedan sin hueco (se muestran "por asignar").
  - status → `scheduled`.
- **`recordTorneoResult(db, matchId, gamesA, gamesB)`**
  - Escribe `teamAScore/teamBScore`, `winner` (= A si gamesA≥gamesB), `status='completed'`.
  - **Si es de grupo** (`phaseTag` empieza por `group:`): si **todos** los partidos `group:*` del torneo están `completed` y el cuadro aún no existe → por grupo `groupStandings` → toma top `advancePerGroup` (orden de rank) → ordena clasificados por **cruces estándar** (siembra que enfrenta 1º de un grupo con 2º de otro) → `buildBracket(rankedLeaves)` → escribe el cuadro (igual que single_elim, con byes auto-ganados) y lo programa con el scheduler.
  - **Si es de cuadro** (`phaseTag` empieza por `ko:`): solo fija el ganador. No se escriben filas aguas abajo; el avance se resuelve en lectura.
- **`loadTorneoMatches(db, tournamentId)`**: lee todos los partidos del torneo (group + ko) — reutiliza el patrón de `listPozoMatches` pero sin filtrar por `phaseTag='pozo'` (filtra por torneo). (Si conviene, generalizar `listPozoMatches` a un `listEventMatches`.)

### Cruces estándar grupos→cuadro

Con `g` grupos y `q` clasifican por grupo, hay `g·q` clasificados. Se ordenan en una lista sembrada de modo que (a) los primeros de grupo queden repartidos por el cuadro y (b) un 1º nunca se cruce con el 2º de su mismo grupo en 1ª ronda. Regla v1: lista = [1ºA, 1ºB, …, 1º del último; 2ºB, 2ºA, … (2ºs rotados +1 grupo)] y luego `buildBracket` con su `seedOrder`. Se documenta y se cubre con unit-tests el caso típico (2 grupos × 2 = cuadro de 4: 1ºA-2ºB y 1ºB-2ºA).

## Fachada unificada — `event-engine.ts` (nuevo)

Despacha por `kind`. Las rutas `generate`/`result` pasan a usarla (en vez de `pozo-engine` directamente):

- `generateEvent(db, id, seed)` → `kind==='pozo'` ? `pozoEngine.generatePozo` : `torneoRun.generateTorneo`.
- `recordResult(db, matchId, a, b)` → carga match→evento; pozo → `pozoEngine.recordPozoResult` ; torneo → `torneoRun.recordTorneoResult`.
- `listEventMatches(db, id)` → pozo: `listPozoMatches` ; torneo: `loadTorneoMatches`.

Se elimina el guard `kind!=='pozo'` de la ruta generate y el `NOT_POZO` de la ruta result deja de hacer falta (ambos kinds se manejan). Guards específicos se mantienen dentro de cada engine (pozo: NO_PAIRS/UNBALANCED_PAIRS/americano<4; torneo: TOO_FEW_PAIRS). Mapeo de errores nuevos a 400 en la ruta generate.

## View-model — `torneo-view.ts` (puro)

- **Grupos:** para cada `tournament_groups`, arma `{ name, standings: GroupStanding[], matches: GridCell-like[] }`. `standings` = `groupStandings(groupPairIds, resultsDeLosPartidosDelGrupo)` (mapea cada partido de grupo a `PairMatchResult`). Los partidos se etiquetan con `matchTeamLabels` + jugabilidad con `isMatchPlayable`.
- **Cuadro:** reconstruye el `BracketMatch[]` desde las filas `ko:*` (parsea `phaseTag` → matchId posicional; ordena por round), construye `results: Map<engineMatchId,'A'|'B'>` desde los `winner` de DB, llama `resolveBracket` → para cada match: slots resueltos (pareja concreta / matchWinner pendiente / bye), etiqueta de equipos, ganador, jugabilidad, y a qué ronda/columna pertenece. Devuelve `{ rounds: number[]; matchesByRound }` para pintar columnas.
- Reutiliza `buildDisplayContext` (de `pozo-view`) y `display.ts`.

## UI admin (rellena el placeholder de torneo en `event-panel.tsx`)

- **Borrador:** `<PairsEditor>` (reutilizado) + `<GenerateButton>` (gate `pairsComplete`).
- **Generado:**
  - `groups_elim`: una `<GroupsTable>` por grupo + (cuando exista) `<BracketView>`.
  - `single_elim`: `<BracketView>`.
- **Componentes nuevos (server):**
  - `<GroupsTable>`: tabla de clasificación (PJ, V, E, D, dif, Pts) + partidos del grupo con `<ResultEntry>` en los jugables (si `editable`).
  - `<BracketView>`: columnas por ronda; cada partido = dos parejas (o "Ganador pdte."/"BYE"), pista+hora, y `<ResultEntry>` cuando ambas parejas son concretas y está pendiente (si `editable`).

## Vista pública — `/(public)/torneos/[id]`

Solo lectura: `<GroupsTable editable={false}>` + `<BracketView editable={false}>` + **"tu próximo partido"** (`nextMatchForPlayer` con las parejas del jugador logueado). Nombre real de pista + hora. Análoga a `/(public)/pozos/[id]`.

## Validación y errores

- Generar requiere parejas válidas (mismas reglas de `validatePairsInput`, ya aplicadas vía `PUT .../pairs`) y ≥ 2 parejas; `groups_elim` requiere `numGroups`≥1 y `advancePerGroup`≥1 (ya validado en `validateEventInput`) y que cada grupo reciba ≥ 2 parejas (si no, throw `GROUP_TOO_SMALL` → 400).
- Registrar resultado: marcador enteros ≥ 0 (ya validado en la ruta); rechaza si el partido no existe (404).
- Solo admin en generate/result/pairs.

## Testing

- **Unit (vitest):**
  - `torneo-run`: generar single_elim (cuadro completo, byes auto-ganados, nº de partidos correcto), generar groups_elim (grupos + liguilla; reparto de parejas), `recordTorneoResult` (avance del cuadro por resolución en lectura; transición grupos→cuadro automática con cruces estándar; no pasa del campeón), scheduling (pista+hora asignadas; sin solapes donde se conocen jugadores), guards (TOO_FEW_PAIRS, GROUP_TOO_SMALL).
  - `torneo-view`: vista de grupos (standings) y de cuadro (resuelve `matchWinner`, jugabilidad, columnas por ronda).
  - `event-engine`: dispatch pozo vs torneo.
- **E2E (Playwright):** reutiliza `e2e/` (DB de fichero, cookies forjadas, `pl1..pl8`):
  - **single_elim:** crear (UI) → parejas (UI) → generar → cuadro visible → resultados ronda 0 → ronda siguiente se resuelve → campeón.
  - **groups_elim:** crear → parejas → generar → tablas de grupo → registrar toda la liguilla → cuadro aparece con clasificados → registrar cuadro → campeón.
  - **pública** `/torneos/[id]`: solo lectura (sin botones Guardar) + "tu próximo partido".

## Fuera de alcance (v1)

- **3er/4º puesto** (necesita `matchLoser`; Fase 2). Se conserva el flag `thirdPlace` en config.
- **Siembra con ajuste manual** (colocación drag/select); v1 es aleatoria por seed.
- **Doble eliminación** y **grupos→doble** (Fase 2, spec aparte).
- Reasignación manual de partidos a pista/hora tras generar.

## Secuencia de implementación propuesta

1. **Plan T1 (motor de run):** `torneo-run.ts` (generate single_elim + groups_elim, record + transición + resolución de cuadro, scheduling, guards) + `event-engine.ts` (dispatch) + cableado de las rutas `generate`/`result` a la fachada + unit-tests.
2. **Plan T2 (UI + pública + e2e):** `torneo-view.ts`, `<GroupsTable>`, `<BracketView>`, relleno del `EventPanel` para torneo, vista pública `/torneos/[id]`, e2e (single_elim + groups_elim + pública).
