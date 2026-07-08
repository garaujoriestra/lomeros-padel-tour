# La Timba: apostar a los dos mercados por separado (Ganador + Marcador)

Fecha: 2026-07-08

## Problema

Un usuario (Jaime blanco) reportó dos comportamientos "raros" en las apuestas:

1. Partido del 7-jul: apostó al marcador exacto correcto (eq.2, 2-0) y ganó, pero
   acabó con las mismas 500 fichas con las que empezó; esperaba repartirse el dinero
   de los que apostaron en contra.
2. Partido programado: ve "150 a un equipo y 100 a otro" pero la cuota le sale **x2
   para ambos**.

### Diagnóstico (verificado contra datos de producción, solo lectura)

**No hay error de cálculo.** El reparto parimutuel cuadra al céntimo. Ambos síntomas
son consecuencia de un único hecho de diseño: existen **dos mercados con botes
independientes** que nunca se mezclan:

- **Ganador** (`winner`): a qué pareja gana.
- **Marcador exacto** (`exact_score`): 2-0 / 2-1 de un equipo.

Caso 1: Jaime hizo **una sola apuesta**, en `exact_score`, donde era el **único**
apostante → acertar solo devuelve su propia apuesta (×1). El dinero de los perdedores
estaba en el bote `winner`, en el que Jaime **no participó**. Su saldo:
`500 − 100 + 100 = 500`. Correcto según el diseño actual.

Caso 2: el bote `winner` real tiene 100 vs 100 (empatados) → cuota `200/100 = x2` en
ambos lados, **correcta**. El "150 vs 100" percibido incluye una apuesta de 50 al
`exact_score`, que vive en otro bote y no afecta la cuota del ganador.

### Causa raíz del malestar (no del cálculo)

La UI presenta un **conmutador "Ganador *o* Marcador"** con un solo importe y un solo
botón. Eso induce a colocar **una** apuesta, cuando en realidad se puede (y se quiere)
apostar a **ambos** mercados con fichas separadas. Jaime colocó solo la de marcador.

> Nota: el **backend ya soporta** una apuesta por mercado a la vez (restricción única
> `(matchId, playerId, market)`), así que apostar a los dos mercados ya es posible
> técnicamente. El problema es de presentación.

## Decisión

Rediseñar la tarjeta de apuestas para que **ambos mercados sean apostables a la vez,
de forma evidente**, cada uno con sus propias fichas y su propio botón. **Enfoque A**.

Decisión de producto confirmada con el usuario: **si un jugador juega el partido, sigue
pudiendo apostar solo al mercado Ganador de su propia pareja** (regla actual intacta).
El bloque de Marcador se oculta para jugadores del partido.

## Diseño (Enfoque A) — solo frontend

Dentro de la card `🎰 La Timba`, dos bloques independientes:

```
🎰 La Timba                                  Cierra 8 jul, 20:30

── GANADOR ─────────────────────────────────
 [ T1  Bote 100 · x2 ⭐]  [ T2  Bote 100 · x2 ]   ← selector de equipo (winner)
 Fichas: [ 10 ]  (10–100)
 [  Apostar al ganador · T1  ]
 Si aciertas, cobras ≈ 16 (x1.6)
 (tu apuesta de ganador + cancelar, si la hay)

── MARCADOR EXACTO ─────────────────────────  (oculto si juegas el partido)
 [ T1 ] [ T2 ]        ← selector de equipo
 [ 2-0 ] [ 2-1 ]      ← selector de marcador
 Fichas: [ 10 ]  (10–100)
 [  Apostar al marcador · T1 2-0  ]
 Si aciertas, cobras ≈ … (x…)
 (tu apuesta de marcador + cancelar, si la hay)

 Saldo: 500 fichas
 Apuestas de la peña …
```

### Componentes / responsabilidades

- `BettingCard` (`src/components/betting/betting-card.tsx`): mismo contrato de props.
  Internamente pasa de **un** formulario con `market` conmutado a **dos** slips con
  estado propio:
  - Ganador: `winnerTeam`, `winnerAmount`.
  - Marcador: `marcadorTeam`, `marcadorScore`, `marcadorAmount`.
  - `pending` compartido para deshabilitar durante cualquier envío.
- Helper interno de **pago estimado por mercado** (extrae la fórmula parimutuel actual
  `(amount*(baseTotal+amount))/(baseSel+amount)`, excluyendo la apuesta previa propia
  en ese mercado). Se reutiliza en ambos slips.
- `placeBet(market, params)` parametrizado (un único `fetch` a `/api/bets`).
- Cancelación por mercado ya existe (`cancelBet('winner'|'exact_score')`), se conserva.
- Jugadores del partido (`ownTeam !== 0`): solo el slip Ganador, bloqueado a su pareja.

### Sin cambios

- **Backend** (`/api/bets`, `settle.ts`, `parimutuel.ts`, `match-odds.ts`,
  `provisional-odds.ts`): intacto. La economía y el reparto no se tocan.
- **Props** de `BettingCard` desde `matches/[id]/page.tsx`: sin cambios.
- Restricción de jugadores del partido a solo-Ganador: se mantiene en el POST.

### Característica conocida que NO cambia

Si eres el único apostante de un bote (típico en `exact_score` de una peña pequeña),
acertar sigue devolviendo solo tus fichas (×1). Es propio del parimutuel. Lo que cambia
es que ahora es evidente que además puedes colocar la de Ganador y ahí sí competir por
el dinero de los perdedores.

## Tests

Según `AGENTS.md`, toda funcionalidad nueva lleva **e2e Playwright**.

- **Nuevo** `e2e/timba-dos-mercados.spec.ts`:
  - Monta por DB/API un partido programado de Lomeros en el que `pl1` **no** juega y
    da saldo (buy-in) a `pl1`.
  - Como `pl1` (espectador), en la UI: coloca una apuesta de **Ganador** y otra de
    **Marcador** en el **mismo** partido.
  - Asserts: **ambas** aparecen en "Tus apuestas"; el saldo baja por las dos; cada una
    se puede cancelar por separado; el POST de una no borra la otra.
  - Caso jugador: como `pl1` **jugando** el partido, el bloque Marcador no se muestra.
- Suite existente (`no-fuga-timba`, `parimutuel.test.ts`, etc.) debe seguir verde.

## Riesgo

Bajo: cambio confinado a un componente de presentación; motor de reparto sin tocar.
