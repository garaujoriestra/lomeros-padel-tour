# La Timba — Sistema de apuestas con tokens virtuales

**Fecha:** 2026-06-12
**Estado:** Aprobado por Guillermo (diseño validado en sesión de brainstorming)

## Resumen

Los jugadores que no participan en un partido pueden apostar tokens virtuales (sin
dinero real) por el resultado. Los tokens solo se ganan acertando apuestas: no hay
paga periódica. Las cuotas dependen del Elo de las parejas: apostar por la pareja
inferior paga más. Quedarse sin tokens conlleva una penalización del mundo real
que, una vez cumplida, da derecho a una recarga. Los tokens acumulados se pueden
canjear por premios de un catálogo gestionado por el admin. Al liquidarse un
partido, cada apostante recibe una notificación push con su resultado.

## Reglas del juego

- Todo jugador empieza con **500 tokens**. Los jugadores creados después del
  lanzamiento también reciben 500 al crearse.
- Por cada partido `scheduled` hay **dos mercados independientes**:
  - **Ganador**: eliges equipo 1 o equipo 2. Si aciertas, cobras tu apuesta
    multiplicada por la **cuota** de ese equipo.
  - **Marcador exacto**: eliges equipo ganador + marcador en sets (2-0 ó 2-1).
    Si lo clavas, cobras la apuesta × **cuota del equipo × 2**.
- **Cuotas según Elo**: la probabilidad de cada pareja se calcula con la fórmula
  Elo existente (usando `pairElo` si la pareja figura en `pairStats`; si no, la
  media de los Elo individuales). Cuota = 1 / probabilidad, **acotada a
  [x1.2, x4.0]** y redondeada a 1 decimal. Un partido igualado da x2.0. El
  marcador exacto duplica la cuota del ganador (acotada por tanto a [x2.4, x8.0]).
- La **cuota se congela al apostar**: la que ves es la que cobras, guardada en la
  apuesta. Editar la apuesta recalcula la cuota con el Elo del momento.
- Límites por mercado: mínimo **10**, máximo **100** tokens. Máximo **una apuesta
  por mercado y persona** en cada partido (puede apostar en uno solo o en ambos).
- Las apuestas se pueden **modificar o cancelar hasta el cierre**.
- **Cierre**: la fecha+hora del partido (campo nuevo `matches.time`). Si un partido
  no tiene hora (p. ej. partidos antiguos), las apuestas cierran a las **00:00 del
  día del partido**.
- Los **4 jugadores del partido no pueden apostar** en él (validación en servidor).
- Al apostar, los tokens se **descuentan inmediatamente** (modelo de depósito):
  no se puede apostar saldo que no se tiene.
- Las apuestas son **públicas siempre**, también antes del cierre: todo el mundo ve
  quién ha apostado qué y a qué cuota.
- **Liquidación**: al registrar el admin el resultado, se liquidan las apuestas en
  el mismo flujo en que hoy se procesa el Elo. Pago = redondeo de
  apuesta × cuota congelada. Partido `injury_aborted` → devolución íntegra.
- **Notificación de liquidación**: cada apostante recibe un push con su resultado
  («🎉 Acertaste en Pepe/Juan vs Luis/Edu: +120 tokens» / «💸 Fallaste: −40
  tokens»), también en devoluciones (lesión o cambio de cartel).
- **Bancarrota**: si tras una liquidación (o canje) tu saldo queda por debajo de 10
  (la apuesta mínima) y no tienes apuestas abiertas pendientes de cobrar, entras en
  estado de bancarrota: no puedes apostar y se crea una penalización pendiente. El
  admin asigna el texto de la penalización (libre: «trae las bolas el viernes»,
  «pagas la pista»...) y, al marcarla cumplida, el jugador recibe una recarga de
  **250 tokens**.
- **Canjeo**: el admin mantiene un catálogo de premios con precio en tokens. Al
  canjear, los tokens se descuentan al momento y el canje queda `pending` hasta que
  el admin lo marca cumplido. Si el admin lo cancela, se devuelven los tokens.

Todas las constantes (500 inicial, 10/100 límites, clamp de cuotas [1.2, 4.0],
multiplicador ×2 del marcador exacto, 250 de recarga) viven en
`src/lib/betting/config.ts` para poder ajustarlas sin tocar lógica.

## Arquitectura elegida

**Libro contable + saldo cacheado** (descartadas: «solo saldo, sin historial» por
imposibilidad de auditar/revertir; «módulo completo de casino» por exceso de
alcance para una v1).

Cada movimiento de tokens queda registrado como transacción en un ledger —el
equivalente de `ratingHistory` para tokens— y el saldo vigente se cachea en
`players.tokenBalance`. Esto permite historial por jugador, resolución de disputas
y reversión de liquidaciones cuando el admin corrige un resultado.

## Modelo de datos (Drizzle, `src/lib/db/schema.ts`)

Columnas nuevas:

- `players.tokenBalance` — integer, default 500.
- `matches.time` — text `"HH:MM"`, nullable.

Tablas nuevas:

- **`bets`**: id, matchId (FK), playerId (FK, el apostante), market
  (`winner` | `exact_score`), predictedTeam (1 | 2), predictedScore
  (`2-0` | `2-1`, solo para exact_score), amount, odds (cuota congelada al
  apostar, real con 1 decimal, ya incluido el ×2 si es exact_score), status
  (`open` | `won` | `lost` | `refunded`), payout (entero, 0 hasta liquidar),
  createdAt, settledAt. **Índice único (matchId, playerId, market).**
- **`token_ledger`**: id, playerId (FK), amount (con signo), reason
  (`initial` | `bet_placed` | `bet_cancelled` | `bet_won` | `bet_refunded` |
  `recharge` | `redemption` | `redemption_refunded` | `settlement_reversal` |
  `adjustment`), refId (id de bet/redemption/penalty según reason),
  balanceAfter, createdAt.
- **`rewards`**: id, title, description, cost, active (boolean), createdAt.
- **`redemptions`**: id, playerId (FK), rewardId (FK), cost (precio congelado al
  canjear), status (`pending` | `fulfilled` | `cancelled`), requestedAt,
  resolvedAt.
- **`penalties`**: id, playerId (FK), description (texto libre del admin, null
  hasta que la asigne), status (`pending` | `fulfilled`), rechargeAmount,
  createdAt, fulfilledAt.

Migración: añadir columnas/tablas y dar el saldo inicial de 500 (con asiento
`initial` en el ledger) a todos los jugadores existentes, siguiendo el patrón de
los endpoints `/api/migrate-*` existentes.

## Flujos

### Cálculo de cuotas

Módulo puro `src/lib/betting/odds.ts`:

1. Rating de cada equipo: `pairElo` de `pairStats` si la pareja existe; si no,
   media de `eloRating` de los dos jugadores.
2. Probabilidad por la fórmula de expectativa Elo ya usada en
   `src/lib/rating/elo.ts`.
3. Cuota ganador = `clamp(1 / p, 1.2, 4.0)` redondeada a 1 decimal; cuota
   marcador exacto = cuota ganador × 2.

Se expone junto al partido en la API para pintarla en la UI, y se persiste en la
apuesta al confirmarla (el servidor recalcula, no se fía de la cuota del cliente).

### Apostar / editar / cancelar

`POST/PUT/DELETE /api/bets` (o server actions equivalentes). Validaciones en
servidor, dentro de una transacción:

1. Sesión válida con `playerId` vinculado.
2. El apostante no es ninguno de los 4 jugadores del partido.
3. Partido `scheduled` y ahora < fecha+hora de cierre.
4. El jugador no está en bancarrota (penalización pendiente).
5. Cantidad dentro de [10, 100] y ≤ saldo disponible.
6. Sin apuesta previa en ese mercado (alta) o existente y abierta (edición/cancelación).

Alta: recalcula y congela la cuota, descuenta saldo y asienta `bet_placed`.
Edición: se modela como cancelación (devolución + `bet_cancelled`) seguida de alta
nueva con cuota recalculada. Cancelación: devuelve el importe.

### Liquidación

Se engancha al flujo existente de registro de resultado
(`src/lib/rating/process-match.ts`), después del Elo. El orden no afecta a los
pagos: las cuotas ya están congeladas en cada apuesta.

- Mercado **winner**: `predictedTeam === winnerTeam` → `won`,
  payout = round(amount × odds), asiento `bet_won`. Si no → `lost` (los tokens ya
  se descontaron al apostar; no hay asiento nuevo).
- Mercado **exact_score**: acierta equipo **y** marcador en sets (calculado de
  `matchSets`: 2-0 ó 2-1) → `won`, payout = round(amount × odds). Si no → `lost`.
- Partido `injury_aborted`: todas las apuestas abiertas → `refunded`, devolución
  íntegra con asiento `bet_refunded`.
- Tras liquidar: **detección de bancarrota** para cada apostante afectado y
  **notificación push** a cada uno.

### Notificaciones de liquidación

Reutiliza la infraestructura existente (`web-push` + `pushSubscriptions`, patrón
de `/api/push/broadcast`): para cada apuesta liquidada se localiza el `user` del
`playerId` apostante y se le envía un push individual:

- Ganada: «🎉 Acertaste en {equipo1} vs {equipo2}: +{payout} tokens»
- Perdida: «💸 Fallaste en {equipo1} vs {equipo2}: −{amount} tokens»
- Devuelta: «↩️ Apuesta devuelta en {equipo1} vs {equipo2}: +{amount} tokens»

El envío es best-effort (como el broadcast actual): un fallo de push no aborta la
liquidación. Tap en la notificación → `/matches/[id]`.

### Corrección de resultado

Si el admin edita el resultado de un partido ya liquidado: se revierte la
liquidación anterior con asientos compensatorios (`settlement_reversal`), las
apuestas vuelven a `open` (conservando su cuota congelada) y se reliquida con el
nuevo resultado. Las penalizaciones pendientes creadas por la liquidación
revertida se cancelan si el jugador deja de estar en bancarrota.

### Cambios en un partido con apuestas

- Si cambia cualquiera de los 4 jugadores de un partido `scheduled` con apuestas
  abiertas → devolución de todas (la cuota se calculó para un cartel que ya no
  existe), con push de devolución. Cambiar solo lados (drive/revés), fecha, hora o
  ubicación no afecta.
- Borrar un partido → devolución de todas sus apuestas abiertas.

### Bancarrota

Detección automática tras cada liquidación y cada canje: saldo < 10 **y** sin
apuestas `open`. Crea una `penalty` con status `pending` (sin descripción hasta que
el admin la asigne) y bloquea nuevas apuestas y canjes. Al marcarla `fulfilled`, el
admin dispara la recarga de 250 (asiento `recharge`) y se desbloquea al jugador.

### Canjeo

El jugador elige un premio activo del catálogo; se valida saldo ≥ coste y que no
esté en bancarrota; se descuenta el coste (asiento `redemption`) y se crea la
`redemption` en `pending`. El admin la marca `fulfilled` (sin movimiento de
tokens) o `cancelled` (devolución, asiento `redemption_refunded`).

## UI (estilo «Pista Central» existente)

Jugador:

- **`/matches/[id]`** — partidos futuros: card de apuestas con saldo propio, los
  dos mercados con sus cuotas junto a cada equipo (estilo casa de apuestas),
  cuenta atrás hasta el cierre y la lista pública de apuestas de los demás con sus
  cuotas. Partidos jugados: resumen de liquidación (quién acertó y cuánto cobró).
- **`/me`** — saldo, apuestas abiertas, historial de movimientos (ledger) y mis
  canjes con su estado. Si estás en bancarrota: aviso con la penalización asignada.
- **Rankings** — pestaña nueva «Tokens»: clasificación por saldo, con marca 💀
  para los jugadores en bancarrota.

Admin:

- Campo **hora** en los formularios de crear/editar partido.
- **`/admin/rewards`** — CRUD del catálogo de premios.
- **`/admin/redemptions`** — canjes pendientes: marcar cumplido o cancelar.
- **`/admin/penalties`** — bancarrotas: asignar descripción de la penalización y
  marcarla cumplida (dispara la recarga).

## Errores y casos límite

- Transacciones de DB en alta/edición de apuesta y en liquidación para evitar
  saldos negativos por peticiones concurrentes (Turso/libSQL, `db.batch` /
  transacción de Drizzle).
- El servidor recalcula la cuota al confirmar la apuesta; la cuota mostrada en el
  cliente es informativa. Si entre pintar y confirmar la cuota cambió, se guarda
  la del servidor (diferencias serán raras y pequeñas en la práctica).
- Usuarios sin `playerId` vinculado: no pueden apostar ni canjear (ven la UI en
  modo solo lectura).
- Partidos legacy sin hora: cierre a las 00:00 del día del partido.
- Saldo entre 1 y 9 tokens sin apuestas abiertas = bancarrota (no llega al mínimo);
  saldo bajo pero con apuestas abiertas = aún no (puede cobrar algo).
- Idempotencia de liquidación: solo se liquidan apuestas en `open`; reliquidar un
  partido ya liquidado no duplica pagos. Push de liquidación solo al transicionar
  de `open` a estado final.

## Testing (Vitest, patrón existente)

Unit tests para la lógica pura en `src/lib/betting/`:

- Cuotas: probabilidad → cuota, clamp [1.2, 4.0], redondeo, fallback a media de
  Elo individual cuando no hay `pairStats`, multiplicador del marcador exacto.
- Liquidación: ambos mercados, victorias/derrotas con cuota congelada,
  devolución por lesión, redondeo de pagos.
- Reversión por corrección de resultado (los asientos compensatorios cuadran).
- Detección de bancarrota (los cuatro cuadrantes saldo bajo/alto × con/sin
  apuestas abiertas).
- Validaciones de alta de apuesta (límites, cierre, jugador del partido, mercado
  duplicado, bancarrota).
- Cálculo de la hora de cierre con y sin `matches.time`.

## Fuera de alcance (v1) — ideas para después

- Estadísticas de apostador: % de acierto, racha, ROI.
- Notificaciones push de «apuestas abiertas» y «cierran en 2 h» (la de
  liquidación sí está en v1).
- Mercados adicionales (¿habrá bagel?, total de juegos…).
- Cuotas que se muevan con el volumen apostado (estilo parimutuel híbrido).
