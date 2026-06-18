# ELO en juego — partidos programados

**Fecha:** 2026-06-18
**Estado:** Aprobado, en implementación

## Problema

En el detalle de un partido **programado** (`/matches/[id]`) solo se muestra la barra
de "Predicción Elo" (probabilidad de victoria %). No se ve cuánto ELO está en juego:
cuánto ganaría cada jugador si su equipo gana, ni cuánto perdería si pierde.

Los partidos **completados** ya muestran el delta real por jugador (badges
`Nombre +12 / −8` leídos de `rating_history`) y quedan **fuera de alcance**.

## Solución

En la vista de partido programado, bajo la línea de Elo de cada jugador, mostrar dos
números:

- `▲ +X` (verde, `var(--win)`) → lo que ganaría **si su equipo gana**.
- `▼ −Y` (rojo, `var(--loss)`) → lo que perdería **si su equipo pierde**.

Más una leyenda breve una sola vez: *"▲ si gana · ▼ si pierde"*. La barra de
"Predicción Elo" se mantiene igual.

### Por qué por jugador (no por equipo)

El K-factor depende de `matchesPlayed` de cada jugador (40 / 32 / 24), así que dentro
del mismo equipo los números pueden diferir. Mostrarlo por jugador refleja eso y es
consistente con cómo se ven los partidos completados.

## Cálculo (sin tocar la BD)

Nuevo helper puro en `src/lib/rating/elo.ts`:

```ts
export interface EloProjection { ifWin: number; ifLose: number; }

export function projectDoublesElo(
  team1: [PlayerForElo, PlayerForElo],
  team2: [PlayerForElo, PlayerForElo],
): Record<string, EloProjection>
```

Internamente llama a `calculateDoublesElo` dos veces (gana equipo 1 / gana equipo 2) y,
para cada jugador, toma el delta de "su equipo gana" como `ifWin` y el de "su equipo
pierde" como `ifLose`. No persiste nada.

En `matches/[id]/page.tsx` se calcula solo cuando `isUp && fourPlayers.length === 4`
(misma guarda que la predicción) y se pasa un `projection` a `TeamBlock`, que solo
renderiza los números (la lógica vive en el helper testeable).

## Tests

- **Unit** (`elo.test.ts`): `projectDoublesElo` — signos correctos (gana ≥ 0, pierde ≤ 0),
  coincidencia con `calculateDoublesElo` por jugador, y que el favorito gana menos al
  ganar y pierde más al perder que el underdog.
- **e2e** (`e2e/elo-proyeccion.spec.ts`): crear un partido **programado** vía API
  (pl1/pl2 vs pl3/pl4, todos 1500 → `+20 / −20`), abrir `/matches/[id]` y aseverar que
  aparecen los ▲/▼ por jugador y la leyenda; y que en un partido **completado** NO
  aparece la proyección.

## Fuera de alcance

- Partidos completados (se quedan igual).
- Proyección por equipo (promedio).
- Cualquier cambio de esquema o de la BD.
</content>
</invoke>
