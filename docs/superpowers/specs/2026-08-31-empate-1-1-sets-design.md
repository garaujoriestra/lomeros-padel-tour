# Empate 1-1 a sets

**Fecha:** 2026-08-31
**Estado:** aprobado (decisiones de producto confirmadas por el usuario)

## Problema

Un partido programado se jugó y terminó **1-1 a sets**: no dio tiempo a empezar
el tercero. Hoy la app no contempla esa posibilidad.

Peor: no solo no la contempla, sino que la **corrompe en silencio**. En
`POST /api/matches` y en `PUT /api/matches/[id]` el ganador se calcula así:

```ts
winnerTeam = team1SetsWon > team2SetsWon ? 1 : 2;
```

Con 1-1 la comparación es falsa y el partido se registra como **victoria del
equipo 2**: Elo movido en la dirección equivocada para los cuatro jugadores y
apuestas de La Timba liquidadas a favor de quien no ganó. El formulario de
admin (`result-form.tsx`) sí bloquea el 1-1 en cliente, así que el agujero solo
se alcanza vía API — pero está abierto.

## Decisiones de producto

Confirmadas por el usuario antes de implementar:

1. **Elo:** el 1-1 se registra como resultado histórico y **cuenta como partido
   jugado**, pero **no mueve el Elo de nadie**. El ranking queda idéntico antes
   y después. Ni victoria ni derrota.
2. **La Timba:** **devolución íntegra** de los dos mercados. Nadie acertó
   «gana el equipo X» ni «2-0 / 2-1». Mismo trato que una lesión o un cambio de
   cartel: `refundOpenBets`.
3. **Alcance:** solo el 1-1 a sets, **autodetectado** al introducir 2 sets
   repartidos. No se añade un estado «suspendido» genérico.

## Modelo de datos — sin migración

`matches.status` gana un cuarto valor: `'draw'`. `winnerTeam` se queda en `null`,
que ya es su valor para programados y lesiones.

**No hay columnas nuevas.** El número de empates de un jugador es derivable:

```
empates = matchesPlayed − wins − losses
```

La resta es exacta porque el único otro estado que no suma victoria ni derrota
—`injury_aborted`— tampoco incrementa `matchesPlayed`. Evitar la migración
importa: en este proyecto migrar producción tiene un gotcha conocido (el build
prerenderiza lecturas, así que la columna tiene que existir *antes* del deploy).

## Componentes

### `src/lib/matches/outcome.ts` (nuevo) — la única fuente de verdad

Función pura, testeable sin DB, que decide qué significa un conjunto de sets:

```ts
type SetsOutcome =
  | { ok: true; status: 'completed'; winnerTeam: 1 | 2; sets: SetInput[] }
  | { ok: true; status: 'draw';      winnerTeam: null;  sets: SetInput[] }
  | { ok: false; error: string };

resolveSetsOutcome(sets: unknown): SetsOutcome
```

Reglas: 2 o 3 sets; ningún set empatado a juegos; juegos enteros ≥ 0. Si un
equipo gana 2 sets → `completed`. Si cada equipo gana 1 y hay **exactamente 2**
sets → `draw`. Cualquier otra cosa → error.

Los tres sitios que hoy repiten el conteo (`POST /api/matches`,
`PUT /api/matches/[id]`, `PATCH /api/matches/[id]/result`) pasan a llamarla. Eso
cierra el bug de arriba de paso: el 1-1 deja de poder colarse como victoria.

### `processDrawMatch(match)` en `src/lib/rating/process-match.ts` (nuevo)

Hermano de `processMatchRatings`, para partidos sin ganador:

- **Jugadores:** `matchesPlayed + 1` a los cuatro. `eloRating`, `wins` y
  `losses` intactos.
- **`rating_history`:** ninguna fila. No hay delta que guardar, y las rachas y
  los logros se calculan sobre esa tabla — así el empate ni corta ni alarga una
  racha, simplemente no existe para el detector.
- **`pair_stats`:** `matchesPlayed + 1` y `lastPlayed`. `pairElo`, `wins` y
  `losses` intactos; la sinergia se recalcula con el nuevo denominador, igual
  que se diluye el win-rate del jugador.
- **Logros:** no se detectan (dependen de `rating_history`).

`processMatchRatings` conserva su firma con `winnerTeam: 1 | 2`, así que el
camino normal no se toca.

### La Timba

En el `PUT` de resultado, si el desenlace es `draw` → `refundOpenBets(id)` en
lugar de `settleMatchBets(...)`. Cero código nuevo de economía: es la misma ruta
que ya usan lesión, cambio de cartel y borrado.

### Push y feed

- `notifyMatchDraw(match)`: aviso a los cuatro jugadores, sin delta de Elo ni
  posición de ranking (no hay ninguno que enseñar).
- Evento de feed `match_draw`, con sets y `timestamp = createdAt`, calcado del
  de lesión (que tampoco tiene `rating_history` de la que sacar el instante de
  cierre).

### UI

- `StatusPill`: `draw → «Empate»`, con su clase CSS.
- `ScoreGrid` con `winnerTeam = null` ya no resalta a nadie: sirve tal cual.
- `result-form.tsx` y `match-form.tsx`: la validación acepta el 1-1 y el resumen
  anuncia «Empate» en vez de un ganador.
- Detalle de partido: aviso «Empate a un set — no cuenta para el ranking».
- `metadata.ts` y `opengraph-image.tsx`: título y tarjeta de empate.
- Historial de jugador, admin de partidos y `pairings/preview`: donde hoy
  filtran `status === 'completed'` pasan a incluir también `'draw'`.
- Racha reciente del perfil (`W`/`L`): gana la letra `E`.
- Cold-open del home: un empate se lee «X empatan con Y».

## Fuera de alcance

Torneos y pozos (`tournament_matches`) son otra tabla y otro motor: un cuadro
necesita ganador para avanzar de ronda. No se tocan.

## Tests

- **Unitarios:** `resolveSetsOutcome` — 2-0, 2-1, 1-1, 3 sets, set empatado,
  número de sets inválido; y en particular que el 1-1 ya no devuelve ganador.
- **e2e (Playwright):** registrar un 1-1 sobre un partido programado con
  apuestas abiertas y verificar en el navegador que sale «Empate», que el Elo de
  los cuatro no se movió y que las apuestas quedaron devueltas.
