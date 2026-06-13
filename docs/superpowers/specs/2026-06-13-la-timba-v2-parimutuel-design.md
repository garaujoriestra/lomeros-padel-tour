# La Timba v2 — Apuesta mutua (pari-mutuel) + economía con buy-in

**Fecha:** 2026-06-13
**Estado:** Borrador para revisión de Guillermo
**Sustituye a:** partes del motor de `2026-06-12-betting-tokens-design.md` (cuotas fijas según Elo y liquidación contra la banca). El resto (penalizaciones, premios, push, UI base) se adapta.

## Por qué v2

La v1 liquidaba **contra la banca**: acertar *creaba* fichas y fallar las *destruía*. Eso permite que, en una racha de aciertos correlacionados (todos apuestan al mismo equipo y gana), se mintee saldo que **nadie ha pagado** → el bote real se queda corto si esos jugadores van a canjear. Es decir, la v1 **no garantiza la solvencia del bote**.

v2 cambia el motor a **apuesta mutua (pari-mutuel)**: las fichas **nunca se crean ni se destruyen al apostar, solo cambian de manos** entre los jugadores. Combinado con un **buy-in real** (pagas 5 € para recibir tus primeras fichas), se cumple el invariante:

> **Bote (€) = (suma de todas las fichas en circulación) × 1 céntimo**, siempre.

El bote está respaldado al céntimo por construcción y **nunca puede quedarse corto**.

## Modelo económico

- **Tipo de cambio fijo (peg):** `1 ficha = 1 céntimo`. Todo se ancla aquí.
- **Buy-in:** todos empiezan a **0 fichas**. Para jugar pagan **5 € → reciben 500 fichas**. Lo registra el admin (hay dinero real de por medio).
- **Apuestas justas (suma cero):** ver «Motor pari-mutuel». No hay comisión/rake; el bote se llena con las entradas, no con las apuestas.
- **Quiebra / recompra:** llegar a 0 fichas (o por debajo de la apuesta mínima sin apuestas abiertas) → para seguir, **recompra 5 € → 500 fichas**. Quien no recompra, se queda fuera; sus 5 € siguen en el bote.
- **Premios (canje), por tramos:** catálogo gestionado por el admin. **Precio en € de cada premio = fichas que cuesta × 1 céntimo** (1.000 fichas = 10 €, 2.000 = 20 €…). Canjear **quema** esas fichas. El jugador ahorra y elige cuándo canjear; puede aguantar para un premio mayor.
- **Bote visible:** `bote € = Σ(saldos de todos los jugadores) × 0,01`. Se muestra en la app (público: «💰 Bote actual: X €»; detalle en admin).
- **Constantes** en `src/lib/betting/config.ts`: `buyIn = 500` fichas / `5 €`, `centsPerToken = 1`, `minBet = 10`, `maxBet = 100`. (Desaparecen `oddsMin/oddsMax/oddsSensitivity/exactScoreMultiplier`: ya no hay cuotas fijas.)

## Motor pari-mutuel

Dos **mercados independientes** por partido, cada uno con su propio bote (pool):

- **Ganador:** eliges equipo 1 o 2.
- **Marcador exacto:** eliges uno de 4 resultados: `T1 2-0`, `T1 2-1`, `T2 2-0`, `T2 2-1`.

### Apostar
- Al apostar, la **fichas salen del saldo** y entran en el pool del mercado (modelo depósito, como en v1).
- Límites por mercado: [10, 100]. Una apuesta por mercado y persona; editable/cancelable hasta el cierre (cancelar devuelve las fichas y las saca del pool).
- Los 4 jugadores del partido no pueden apostar en él. En bancarrota no se puede apostar.
- **No se congela ninguna cuota.** Lo único que se guarda es `(mercado, selección, cantidad)`.

### Liquidación (al registrar el resultado)
Para cada mercado:
- `pool` = suma de todas las apuestas del mercado.
- `ganadoras` = apuestas cuya selección coincide con el resultado real; `poolGanador` = suma de sus cantidades.
- Si `poolGanador > 0`: cada acertante cobra `round(cantidad_i × pool / poolGanador)`. Los que fallan no cobran (su apuesta ya salió del saldo).
- Si `poolGanador == 0` (nadie acertó): **devolución íntegra** a todos los del mercado (recuperan su cantidad). Nadie pierde.
- **Conservación exacta:** el reparto usa el **método del resto mayor** (floor de cada pago + repartir las fichas sobrantes del redondeo a los mayores restos fraccionarios) para que `Σ pagos == pool` al céntimo. Sin esto, el redondeo rompería la solvencia.
- **Lesión / partido anulado / cartel cambiado / borrado:** devolución íntegra de todos los pools.

### Cuotas provisionales (solo display)
- Para cada selección se muestra una **cuota orientativa** = `poolActual / poolDeEsaSelección` (lo que multiplicarías si ganara y el pool no cambiara). Se actualiza según va apostando la gente y **es provisional hasta el cierre**.
- El **Elo se mantiene como guía informativa**: se marca qué pareja es la favorita/underdog según Elo individual, para orientar, pero **no determina el pago**. (El efecto «underdog paga más» emerge solo: si poca gente respalda a la pareja peor, los pocos que acierten se reparten más.)

## Cambios respecto a v1 (mapa de impacto)

| Módulo | Cambio |
|---|---|
| `src/lib/betting/config.ts` | Reescribir constantes (buy-in, peg; fuera lo de cuotas Elo). |
| `src/lib/betting/odds.ts` | Reemplazar cuotas-Elo por **cuotas provisionales de pool** + helper de «favorito según Elo» (guía). |
| `src/lib/betting/match-odds.ts` | Calcular cuotas provisionales desde los pools actuales (no desde Elo). El Elo solo para la etiqueta de guía. |
| `src/lib/betting/settle-logic.ts` | Reescribir: reparto pari-mutuel por pool con método del resto mayor; sin pagos por cuota fija. |
| `src/lib/betting/settle.ts` | Adaptar a liquidación por pools; devoluciones; sin `reverseSettlement` por cuota (la reversión sigue para borrado de partido). |
| `src/lib/betting/bank.ts` | Igual (movimientos atómicos + ledger). Reusar. |
| `src/app/api/bets/route.ts` | Quitar congelado de cuota; registrar `(mercado, selección, cantidad)`; validar pool. |
| `src/lib/db/schema.ts` | `bets`: `odds` deja de usarse (se puede dejar nullable u omitir); selección de marcador exacto ya cubierta por `predictedTeam`+`predictedScore`. Nuevos `reason` de ledger: `buyin`, `rebuy` (sustituye semántica de `initial`/`recharge`). |
| **Buy-in / pot (nuevo)** | Acción admin «registrar entrada/recompra (5 € → 500 fichas)»; bote derivado de `Σ saldos × 0,01`. |
| **Premios** | Mantener catálogo; añadir en admin la **guía de precio a 1 céntimo/ficha**. |
| UI `betting-card` | Mostrar cuotas provisionales de pool, guía Elo, «tu posible reparto», estado del pool. |
| UI `/me/tokens`, `/rankings/tokens`, home | Mostrar el **bote actual**; distinguir «no ha entrado» (nunca compró) de saldo 0 por quiebra. |
| Admin | Vista de bote (entradas, recompras, premios pagados, bote actual). |

## Modelo de datos

- `players.tokenBalance`: ahora arranca en **0** (no 500). El buy-in lo sube a 500.
- `bets`: `market`, `predictedTeam`, `predictedScore` (para exacto), `amount`, `status` (`open|won|lost|refunded`), `payout` (calculado en liquidación). `odds` queda obsoleta (mantener nullable para no romper, dejar de escribir).
- `token_ledger`: añadir reasons `buyin` (+500, 5 € a bote) y `rebuy` (+500, 5 € a bote). `bet_placed` (−stake), `bet_won` (+reparto), `bet_refunded` (+stake), `redemption` (−coste), `redemption_refunded`, `settlement_reversal`, `adjustment`. El `UNIQUE(reason, ref_id)` se mantiene como guarda de idempotencia.
- Bote: **derivado**, no se almacena. `bote € = Σ(players.tokenBalance) × 0,01`.

## Migración a v2

La Timba se lanzó hoy pero **aún no se ha jugado con dinero real**, así que se hace un **reinicio limpio**:
- Poner `tokenBalance = 0` a todos.
- Borrar todas las `bets` y los asientos de `token_ledger` (arranque desde cero).
- Cancelar penalizaciones pendientes.
- Mantener el catálogo de `rewards` (repreciar a 1 céntimo/ficha).
- Endpoint `POST /api/migrate-timba-v2` idempotente, patrón de los `migrate-*` existentes.
Tras la migración, los jugadores entran pagando su buy-in real.

## Flujos

1. **Entrada (buy-in):** admin registra que X pagó 5 € → `applyTokenMovement(+500, 'buyin')`. Saldo 0→500.
2. **Apostar:** valida (sesión+player, no juega el partido, no en bancarrota, mercado abierto, [10,100], saldo) → `applyTokenMovement(−amount, 'bet_placed')` + alta de bet. Sustitución como en v1 (cancelar previa + alta).
3. **Liquidar:** al registrar resultado → por cada mercado, reparto pari-mutuel (resto mayor) → `bet_won`/devoluciones → push a cada apostante con su resultado → detección de bancarrota.
4. **Quiebra:** saldo < mínimo y sin apuestas abiertas → estado bancarrota (bloquea apostar/canjear). Admin registra recompra (5 €) → `applyTokenMovement(+500, 'rebuy')` → desbloquea.
5. **Canje:** valida saldo ≥ coste y no bancarrota → `applyTokenMovement(−coste, 'redemption')` → canje `pending` → admin marca cumplido (entrega el premio comprado con el bote) o cancela (devuelve fichas).
6. **Bote:** en cada vista que lo muestre, calcular `Σ saldos × 0,01`.

## Casos límite

- **Todos al mismo equipo y aciertan:** `poolGanador == pool` → multiplicador 1 → cada uno recupera su apuesta. Nadie gana ni pierde, bote intacto. (El escenario que motivó v2.)
- **Nadie acierta un mercado:** devolución íntegra de ese mercado.
- **Un solo apostante en un mercado:** si acierta, recupera su apuesta (×1); si falla, su apuesta se reparte… pero si es el único, no hay acertantes → devolución. En la práctica un apostante solo siempre recupera su dinero.
- **Redondeo:** método del resto mayor garantiza `Σ pagos == pool`.
- **Sin `player` vinculado:** no puede entrar ni apostar (solo lectura).
- **Idempotencia de liquidación:** solo se liquidan apuestas `open`; guarda `hasLedgerEntry(reason, refId)` evita pagos dobles si se reintenta.

## Fuera de alcance (v2)

- Cuotas dinámicas tipo casa de apuestas (descartado: es justo lo que evitamos).
- Auto-cobro del buy-in (lo registra el admin; el dinero es real y físico).
- Mercados adicionales más allá de ganador + marcador exacto.

## Testing (Vitest, lógica pura)

- Reparto pari-mutuel: pool con varios acertantes (proporcional), un acertante (se lleva todo), cero acertantes (devolución), todos al ganador (×1), método del resto mayor (Σ pagos == pool, sin perder ni crear fichas).
- Cuota provisional de pool (poolActual/poolSelección; pool vacío → sin cuota).
- Bancarrota y validaciones de apuesta (igual que v1, adaptadas).
- Invariante del bote: `Σ saldos × 0,01` tras secuencias de buy-in/apuesta/liquidación/canje permanece coherente (conservación).
