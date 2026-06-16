# Diseño — Completar el POZO (run de parejas fijas + UI/API/pública)

> **Estado:** diseño aprobado en brainstorming (2026-06-16). Pendiente de revisión del usuario antes de escribir el plan de implementación.
>
> **Rama:** `pozo-torneo-redesign` (sin mergear). Continúa el spec `2026-06-15-pozo-torneo-split-design.md`.
>
> **Alcance:** cerrar el Pozo de extremo a extremo (ambas variantes). El Torneo entero queda fuera (siguiente tanda), pero `<PairsEditor>` y la validación de parejas se diseñan ya para reusarse en él.

## Punto de partida (qué hay hecho en la rama)

- **Plan 1 (Foundation)** ✅ — modelo nuevo (`kind`/`format`/`config`, sin bloques), `event-store`, validación, API crear/listar/editar evento, navegación + listados separados (`/admin/pozos`, `/admin/torneos`), formulario de creación, modelo de bloques retirado, e2e de borrador.
- **Plan 2 (motores)** ✅ — siembra aleatoria determinista (`seeding.ts`), `pozo-pairs.ts` (movimiento de rey de la pista con parejas fijas), `ladder.ts` (clasificación por escalera con desempate por acumulado).
- **Plan 2b (americano run)** ✅ — `pozo-run.ts`: `generatePozo`, `listPozoMatches`, `recordPozoResult`, `pozoStandingsLive`. Rejilla pista×ronda; avance por replay con `nextPozoRoundWithRest`. **Solo americano. Solo unit-tests; sin endpoints HTTP ni UI.**

## Qué falta (este spec)

1. **Run de parejas fijas (Plan 2b-2):** análogo a `pozo-run.ts` pero con `pozo-pairs.ts`. Requiere parejas definidas antes de generar.
2. **Persistencia + editor de parejas:** API y UI para que el admin defina las parejas (compartido con el Torneo).
3. **Cableado HTTP (Plan 2c — API):** endpoints de generar y registrar resultado.
4. **UI admin (Plan 2c):** página de detalle con editor de parejas, botón generar, parrilla pista×ronda con entrada de resultados y clasificación en vivo.
5. **Vista pública (Plan 2c):** `/pozos/[id]` de solo lectura + "tu próximo partido".
6. **Tests:** unit del run de parejas fijas + e2e Playwright de los flujos reales.

## Decisiones de diseño registradas (brainstorming 2026-06-16)

| Decisión | Elección |
|---|---|
| Dónde define el admin las parejas fijas | **Editor en la página de detalle** (componente reutilizable, compartido con el Torneo). "Generar" deshabilitado hasta que las parejas sean válidas. NO en el formulario de creación. |
| Ruta de detalle admin | **Por tipo:** `/admin/pozos/[id]` y `/admin/torneos/[id]`, renderizando un **componente de detalle compartido**. Se retira/migra `/admin/tournaments/[id]`. |
| Ruta pública del pozo | `/(public)/pozos/[id]` |

## 1. Capa de run de parejas fijas (Plan 2b-2)

Módulo nuevo `src/lib/tournament/pozo-pairs-run.ts`, hermano de `pozo-run.ts`, reutilizando el **mismo andamiaje de rejilla pista×ronda** (hueco determinista: pista de orden *k* aloja el partido *k*; hora = inicio_pista + ronda·slot):

- **Generar ronda 0:** lee las parejas persistidas (`tournament_pairs`), siembra posiciones de pista con `shuffleDeterministic` sobre los `pairId` (semilla), coloca 2 parejas por pista con `seedPozoPairsCourts`, escribe los partidos con **slots de tipo `pair`** (`{ type: 'pair', pairId }`).
- **Registrar resultado + avanzar (replay):** reconstruye la ronda 0 desde sus partidos y reaplica los resultados ronda a ronda con el movimiento de **parejas fijas** de `pozo-pairs.ts` (gana → sube una pista; pierde → baja; cima retiene ganador, fondo retiene perdedor; **la pareja nunca se rompe**). Mismo patrón de replay que `pozo-run.ts`, distinto motor de movimiento.
- **Clasificación en vivo:** `ladderStandings` (Plan 2) ya clasifica por **pista final** con desempate por juegos acumulados; la unidad pasa a ser la **pareja**, así que sirve tal cual.

### Fachada / dispatch por variante

La API y la UI no deben conocer la variante. Se introduce un **dispatcher** (en `pozo-run.ts` o una fachada `pozo-engine.ts`) que ramifica por `format` del evento:

- `generatePozo(db, id, seed)` → americano: `pozo-run`; parejas fijas: `pozo-pairs-run`.
- `recordPozoResult(db, matchId, gamesA, gamesB)` → carga el evento del match y ramifica.
- `listPozoMatches` / `pozoStandingsLive` → ramifican igual.

Decisión de implementación (a fijar en el plan): mantener las firmas actuales de `pozo-run.ts` como fachada pública y mover la implementación americano a interna, o crear `pozo-engine.ts` que importe ambas. Preferencia: **fachada única** para no romper a los consumidores.

## 2. Persistencia + editor de parejas (compartido con Torneo)

- **Tabla:** `tournament_pairs` (ya existe; cuelga de `tournament_id`).
- **API:** `PUT /api/tournaments/[id]/pairs` — **reemplaza** el set completo de parejas del evento. Body: `{ pairs: [[playerIdA, playerIdB], ...] }`.
  - **Validación (en la API; FK OFF en Turso):** nº par de jugadores; cada jugador en **exactamente una** pareja; ambos jugadores del **roster** del evento (`tournament_participants`); sin jugadores repetidos; el evento en estado **borrador** (no generado). Errores claros (400); 404 si no existe; 409 si ya está generado.
  - Solo **admin**.
- **UI:** componente reutilizable `<PairsEditor>` (`src/components/admin/pairs-editor.tsx`):
  - Lista los participantes del evento; el admin forma parejas (seleccionar dos / añadir-quitar pareja); muestra jugadores sin emparejar.
  - Guarda vía `PUT .../pairs`; refleja errores de validación.
  - Se monta en el detalle cuando `kind=pozo & format=fixed_pairs` y (en el futuro) en el Torneo. **"Generar" deshabilitado** hasta que el set sea válido y completo.

## 3. Cableado HTTP (Plan 2c — API)

- `POST /api/tournaments/[id]/generate` — body `{ seed? }` → fachada `generatePozo`. Solo admin. 409 si ya generado; 400 si config/parejas incompletas. Devuelve avisos de viabilidad de horario como hoy.
- `POST /api/tournaments/[id]/matches/[matchId]/result` — body `{ gamesA, gamesB }` → `recordPozoResult`. Solo admin. Rechaza si los slots no están resueltos; 404/409/500 según corresponda.
- **Parrilla y clasificación** se renderizan en **server components** que cargan directo del store; no requieren GET dedicados. Los dos endpoints anteriores cubren el "montar estado por API" de los e2e (patrón del repo: API para montar, UI para aserciones).

## 4. UI admin (Plan 2c)

**Componente de detalle compartido** (`src/components/admin/event-panel.tsx` o similar) renderizado por `/admin/pozos/[id]` y `/admin/torneos/[id]`. Para el Pozo:

- **Cabecera:** nombre, tipo, formato, fecha; **pistas en orden = escalera** (nombre real; la primera es la cima 👑).
- **Borrador (no generado):**
  - `<PairsEditor>` si `format=fixed_pairs`.
  - Botón **Generar** (deshabilitado hasta parejas válidas en parejas fijas; en americano siempre disponible con roster válido).
- **Generado:**
  - **Parrilla pista×ronda:** filas = pistas (en orden de escalera, cima arriba), columnas = rondas; cada celda = partido con sus slots resueltos (nombre real de pareja/jugadores) + hora; entrada de resultado (`gamesA`/`gamesB`) por partido vía el endpoint de result.
  - **Clasificación en vivo por escalera:** posición final por pista (cima = líder), etiquetada con el nombre real de la pista; desempate por juegos acumulados.

Se retira/migra la ruta stub `/admin/tournaments/[id]`.

## 5. Vista pública (Plan 2c)

`/(public)/pozos/[id]` de **solo lectura**:
- Parrilla pista×ronda + clasificación en vivo (mismos datos que admin, sin controles de edición).
- **"Tu próximo partido":** para el jugador logueado, localiza el partido de la **ronda actual/siguiente** en el que participa (directo o como miembro de una pareja) y lo destaca con pista real + hora. Reutiliza el patrón ya existente en main para "tu próximo partido".
- Nombre real de pista en todas partes; nunca "Pista N" inventada.

## 6. Testing

Por `AGENTS.md` (Testing), toda funcionalidad nueva lleva **e2e de Playwright** además de unitarios.

- **Unit (vitest)** — `pozo-pairs-run.test.ts`, espejo de `pozo-run.test.ts`:
  - Generar ronda 0 (rejilla pista×ronda, slots `pair`, descansos por pareja cuando no cuadran).
  - Registrar resultado + avance por replay (parejas suben/bajan como bloque, no se rompen).
  - Clasificación en vivo por escalera.
  - Dispatch por `format` (americano vs parejas fijas) desde la fachada.
  - Validación de `PUT .../pairs` (nº par, jugador único, roster, borrador).
- **E2E (Playwright)** — reutilizan la infra de `e2e/` (DB de fichero aislada, cookies forjadas; `npm run e2e`):
  - **Pozo parejas fijas:** crear (UI) → definir parejas (UI `<PairsEditor>`) → generar → registrar resultados de una ronda → ver movimiento de parejas + clasificación por pista.
  - **Pozo americano:** crear → generar → registrar resultado → clasificación.
  - **Vista pública** read-only de un pozo + "tu próximo partido" del jugador logueado.

## Arquitectura y unidades

- **Motores puros** (sin DB) ya aislados: `seeding`, `pozo`, `pozo-pairs`, `ladder`. No se tocan salvo bugs.
- **Run/persistencia:** `pozo-run.ts` (americano) + `pozo-pairs-run.ts` (parejas fijas) + fachada de dispatch. Cada uno testeable contra la DB de test.
- **API:** rutas finas que validan, llaman a la fachada y mapean errores.
- **UI:** `<PairsEditor>` y el panel de detalle compartido; server components cargan del store; la parrilla y la clasificación son componentes de presentación reutilizables entre admin y pública (admin añade controles).

## Fuera de alcance

- El **Torneo** (eliminación directa y grupos→eliminación): siguiente tanda, spec/plan aparte. `<PairsEditor>` y la validación de parejas se diseñan para reusarse allí.
- Doble eliminación (Fase 2).
- Reasignación manual de partidos a pista/hora tras generar.

## Secuencia de implementación propuesta

1. **Plan 2b-2** — `pozo-pairs-run.ts` + fachada de dispatch + persistencia/validación de parejas (`PUT .../pairs`) + unit-tests.
2. **Plan 2c** — endpoints `generate`/`result` + `<PairsEditor>` + panel de detalle compartido (rutas por tipo) + parrilla/resultados/clasificación + vista pública `/pozos/[id]` + "tu próximo partido" + e2e.
