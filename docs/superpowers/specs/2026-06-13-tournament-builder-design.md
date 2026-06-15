# Diseño: Constructor de torneos puntuales

**Fecha:** 2026-06-13
**Estado:** Aprobado (brainstorming) — pendiente de plan de implementación

## Resumen

Pantalla para montar un torneo puntual (p. ej. el torneo de cumpleaños): se eligen
los jugadores, las pistas disponibles (cada una con su ventana horaria) y el sistema
genera la distribución de partidos y el cuadro, encajándolo todo en el tiempo y pistas
disponibles.

La idea central: **un torneo es una secuencia de bloques (fases) en el tiempo, y cada
bloque tiene su propio formato configurable.** Ejemplo real: primer bloque (1–1.5 h)
estilo *pozo* con parejas rotando, segundo bloque (1–1.5 h) torneo de *parejas fijas*.

Todo el sistema es **independiente**: no toca `matches`, Elo, ranking ni La Timba/apuestas.
Vive en sus propias tablas.

## Decisiones cerradas (brainstorming)

- **Formato:** un torneo se compone de **bloques en secuencia**; cada bloque elige su tipo.
- **Tipos de bloque en v1:** `pozo` (parejas rotativas, escalera) y `fixed_pairs` (parejas
  fijas → liguilla de grupos y/o eliminatoria). Americano/Mexicano quedan fuera de v1 pero
  el modelo los admite como tipos futuros.
- **Parejas (bloque de parejas fijas):** **siempre a mano**. La siembra del cuadro también la
  hace el admin a mano. No hay sugerencia automática.
- **Integración:** **independiente**. No afecta a Elo, ranking ni apuestas.
- **Pistas:** **una ventana única (inicio–fin) por pista**, que puede diferir entre pistas
  (cubre el caso "2 pistas 1h30 + 1 pista 3h").
- **Formato de partido:** **configurable por bloque** (tiempo fijo N min / hasta que alguien
  gane un set / a X juegos / al mejor de 3 sets), con buffer de descanso configurable.
- **Jugadores:** **sin invitados anónimos.** Cada jugador es un `player` real del roster
  (se crea uno si hace falta, aunque no compita en el ranking). Los participantes referencian
  `playerId`.
- **Motor de planificación:** generación automática (*greedy*) + **parrilla editable** con
  validación de conflictos en vivo y aviso de viabilidad.
- **Vista pública de solo lectura en v1** para que los jugadores vean parrilla, su próxima
  pista/hora, clasificación y cuadro desde el móvil.

## Arquitectura

### Contexto del proyecto (existente)

- Next.js 16.2.2 (App Router), React 19, Turso/libSQL + Drizzle ORM.
- Admin bajo `/admin`, protegido por `requireAdmin()` (`src/lib/auth/guard.ts`).
- DB client en `src/lib/db/index.ts`; esquema en `src/lib/db/schema.ts`.
- Migraciones: no hay carpeta de migraciones; se ejecutan vía endpoints `/api/init-db` y
  `/api/migrate-*`. Seguiremos ese patrón con un endpoint de migración propio.
- UI: Tailwind 4 + shadcn/ui + kit propio `lpt` (`src/components/lpt/ui.tsx`).

### Modelo de datos (tablas nuevas)

Todas con prefijo `tournament*`. Las clasificaciones (pozo y grupos) **se calculan** a partir
de los resultados de los partidos; no se duplican en tablas.

**`tournaments`**
- `id` (UUID, PK)
- `name`, `date` (ISO YYYY-MM-DD), `location` (nullable), `notes` (nullable)
- `status`: `'draft' | 'scheduled' | 'running' | 'completed'`
- `createdAt`, `createdBy` (userId)

**`tournamentCourts`**
- `id`, `tournamentId` (FK, cascade)
- `label` (ej. "Pista 1")
- `order` (entero; 1 = pista más alta, usado para la escalera del pozo)
- `availableFrom` (HH:MM), `availableTo` (HH:MM)

**`tournamentParticipants`**
- `id`, `tournamentId` (FK, cascade)
- `playerId` (FK → `players`)
- Único: `(tournamentId, playerId)`

**`tournamentBlocks`** (las fases)
- `id`, `tournamentId` (FK, cascade)
- `order` (entero; orden temporal del bloque)
- `type`: `'pozo' | 'fixed_pairs'`
- `name` (ej. "Pozo de calentamiento", "Torneo")
- `config` (JSON) — ver abajo
- `startsAt`/`endsAt` o `durationMinutes` (presupuesto temporal del bloque)

`config` (JSON) común a todos los bloques:
- `matchFormat`: `{ kind: 'timed', minutes } | { kind: 'first_to_set' } | { kind: 'games', target } | { kind: 'best_of_3' }`
- `bufferMinutes` (descanso entre partidos en una pista)
- `tieRule` (solo `timed`): `'golden_point' | 'allow_draw'`

`config` específico de `pozo`:
- `roundMinutes` (duración de cada ronda; nº de rondas = presupuesto del bloque ÷ roundMinutes)
- `movement`: `'winners_up_losers_down'` (v1)
- `partnerRotation`: cómo se rotan las parejas dentro de la pista cada ronda (regla fija v1)

`config` específico de `fixed_pairs`:
- `phases`: `{ groups: boolean, knockout: boolean }` (solo liguilla, solo cuadro, o ambas)
- `numGroups`, `advancePerGroup` (si hay grupos)
- (las parejas y su reparto a grupos se montan a mano → ver `tournamentPairs`/`tournamentGroups`)

**`tournamentPairs`** (solo bloques `fixed_pairs`)
- `id`, `blockId` (FK, cascade)
- `player1Id`, `player2Id` (FK → `players`)
- `seed` (nullable; orden de siembra para el cuadro, fijado a mano)
- `label` (nullable)
- `groupId` (nullable; FK → tournamentGroups)

**`tournamentGroups`** (solo bloques `fixed_pairs` con grupos)
- `id`, `blockId` (FK, cascade)
- `name` (ej. "Grupo A")

**`tournamentMatches`**
- `id`, `tournamentId`, `blockId` (FK, cascade)
- `courtId` (FK → tournamentCourts, nullable hasta planificar)
- `round` (entero; ronda del pozo, jornada de liguilla, o nivel del cuadro)
- `phaseTag` (nullable; ej. `'group:A'`, `'ko:semi'`, `'pozo'`)
- `scheduledStart`, `scheduledEnd` (HH:MM, nullable hasta planificar)
- `status`: `'pending' | 'in_progress' | 'completed'`
- **4 huecos de participante**, cada uno un slot referencial:
  - `slotA1`, `slotA2` (equipo A), `slotB1`, `slotB2` (equipo B)
  - cada slot es JSON: `{ type: 'participant', participantId }` | `{ type: 'pair', pairId }`
    | `{ type: 'placeholder', desc: '1º Grupo A' }` | `{ type: 'matchWinner', matchId }`
    | `{ type: 'matchLoser', matchId }`
- Resultado: `teamAScore`, `teamBScore` (juegos o sets según formato), `setsJson` (nullable),
  `winner`: `'A' | 'B' | null`

> Los *placeholders* (`'1º Grupo A'`, `'Ganador partido X'`) permiten **dibujar toda la
> parrilla por adelantado**, incluido el cuadro, y rellenar los nombres reales conforme entran
> los resultados.

### Motor de planificación (scheduler)

Módulo puro en `src/lib/tournament/` (sin acceso a DB), testeable de forma aislada.

**Entrada:** bloques (en orden) + pistas (con ventanas) + partidos generados por bloque.
**Salida:** asignación `{ matchId → (courtId, scheduledStart, scheduledEnd) }` + reporte de
viabilidad (qué cabe y qué no).

Algoritmo (*greedy* por bloques, en orden temporal):
1. Para cada pista, se trocea su ventana en huecos de tamaño `duración estimada + buffer`.
   - Duración estimada: `timed` → exacta; `first_to_set`/`games`/`best_of_3` → estimación
     configurable por defecto (p. ej. set ≈ 20 min, bo3 ≈ 40 min).
2. Se colocan los partidos del bloque en huecos respetando:
   - La ventana de cada pista.
   - **Sin solape de jugador/pareja:** un participante no puede estar en dos pistas a la vez.
   - Reparto de descansos lo más equitativo posible.
3. Si no caben todos los partidos del bloque en el tiempo disponible, se devuelve aviso de
   viabilidad ("faltan N huecos") con sugerencias (acortar partido, reducir grupos, etc.).

**Pozo:** es **round-based** y todas las pistas juegan a la vez. El bloque se divide en rondas
por tiempo. La ronda R+1 depende de los resultados de la R (subidas/bajadas + rotación de
parejas), así que se pre-dibujan las rondas como franjas horarias y los participantes de cada
pista se recalculan en vivo al cerrar cada ronda.

**Parejas fijas:** liguilla (round-robin por grupo) + cuadro se generan y pre-dibujan completos
desde el principio con *placeholders*.

**Edición manual:** la parrilla generada es editable (mover un partido de pista/hora). Toda
edición revalida conflictos en vivo.

### Lógica por tipo de bloque

Módulos puros en `src/lib/tournament/`:
- `pozo.ts`: generar rondas, calcular movimiento (ganadores suben / perdedores bajan), rotar
  parejas, repartir "descansa" cuando los jugadores no son múltiplo de 4, clasificación final
  (por pista final y juegos acumulados).
- `fixed-pairs.ts`: generar calendario round-robin por grupo, calcular clasificación de grupo
  (puntos, diferencia de juegos), generar cuadro con *byes* cuando el nº de parejas no es
  potencia de 2 (byes a los mejores sembrados), propagar ganadores por el cuadro.
- `scheduler.ts`: el repartidor descrito arriba.
- `standings.ts`: cálculo de clasificaciones a partir de los partidos completados.

### Pantallas y rutas

**Admin (protegido por `requireAdmin()`):**
- `/admin/tournaments` — listado de torneos + botón crear.
- `/admin/tournaments/new` — crear: nombre, fecha, jugadores (selección del roster), pistas
  con ventanas.
- `/admin/tournaments/[id]` — panel: estado, bloques, accesos a configuración/parrilla.
- `/admin/tournaments/[id]/blocks` — añadir/ordenar/configurar bloques; montar parejas y grupos
  a mano en los bloques `fixed_pairs`.
- `/admin/tournaments/[id]/schedule` — **parrilla generada y editable** (pistas × tiempo);
  tocar un partido abre la entrada de resultado; muestra cuadro y clasificaciones en vivo.

**Público (solo lectura):**
- `/tournaments/[id]` — parrilla, "tu próxima pista/hora", clasificación de pozo/grupos y cuadro.
  Sin necesidad de ser admin.

### Capa de datos / API

Siguiendo el patrón del proyecto (API routes con `requireAdmin()` para mutaciones; server
components para lectura):
- `POST /api/tournaments` — crear torneo (+ pistas + participantes).
- `PUT/PATCH /api/tournaments/[id]` — editar config/bloques/parejas/grupos.
- `POST /api/tournaments/[id]/generate` — generar parrilla (llama al scheduler) + persistir.
- `POST /api/tournaments/[id]/matches/[matchId]/result` — registrar resultado; recalcula
  movimiento del pozo / clasificación de grupos / propagación de cuadro.
- Lectura: server components consultan la DB directamente (panel admin y vista pública).
- Migración del esquema: endpoint `/api/migrate-tournaments` siguiendo el patrón existente.

## Manejo de errores y casos límite

- **Pozo con jugadores no múltiplos de 4:** rotación de "descansa" repartida equitativamente
  ronda a ronda.
- **Cuadro con nº de parejas no potencia de 2:** *byes* para los mejores sembrados.
- **Partido a tiempo empatado:** regla configurable por bloque (`golden_point` o `allow_draw`).
- **No cabe en el tiempo:** el scheduler devuelve aviso de viabilidad con sugerencias; no se
  bloquea la creación (se puede ajustar y regenerar).
- **Edición manual que crea conflicto:** validación en vivo; se marca el conflicto y no se
  permite guardar un estado inválido.
- **Resultado en partido con placeholders sin resolver:** no se permite cerrar un partido cuyo
  participante aún es un placeholder no resuelto.

## Estrategia de pruebas

- **Módulos puros (`src/lib/tournament/`)** con tests unitarios: generación de calendario de
  pozo y rotaciones, movimiento subir/bajar, generación de round-robin, clasificación de grupos,
  generación de cuadro con byes, propagación de ganadores, y el scheduler (incluyendo ventanas
  de pista heterogéneas, no solape de jugador, y reporte de viabilidad).
- Casos de tabla: 8/12/16/24 jugadores, pistas con ventanas distintas, jugadores no múltiplo de 4,
  parejas no potencia de 2.
- Pruebas de integración ligeras de los endpoints de resultado (recalculo de standings/cuadro).

## Fuera de alcance (v1)

- Tipos de bloque Americano y Mexicano (el modelo los admite; no se construyen ahora).
- Sugerencia/siembra automática de parejas (se hace todo a mano).
- Integración con Elo/ranking/La Timba.
- Varias franjas horarias por pista (solo una ventana continua por pista).
- Invitados anónimos (todo participante es un `player` del roster).
