# Diseño — Separar POZO y TORNEO (Fase 1)

> **Estado:** diseño aprobado en brainstorming (2026-06-15). Pendiente de revisión del usuario antes de escribir el plan de implementación.
>
> **Alcance:** Fase 1. La doble eliminación (cuadro de ganadores + perdedores) se diseña e implementa en un spec aparte (Fase 2).

## Motivación

El constructor de torneos actual modela un evento como un contenedor con una **secuencia de bloques**, y cada bloque puede ser `pozo` (rey de la pista individual) o `fixed_pairs` (grupos + cuadro). Como un mismo evento puede encadenar un pozo y un torneo, el concepto se siente mezclado y confuso: "hace las dos cosas a la vez".

Queremos **separarlo de raíz** en dos conceptos de primer nivel e independientes:

- **Pozo** — rey de la pista, con dos variantes (parejas fijas / americano).
- **Torneo** — parejas fijas, con dos estructuras en Fase 1 (eliminación directa / grupos → eliminación).

Se elimina el concepto de "bloques encadenados". Al crear, eliges el tipo desde el principio.

**Sin migración:** la feature de torneos se desplegó el 2026-06-15 y no hay datos reales que conservar, así que rehacemos el modelo limpio. El constructor basado en bloques (rutas `/admin/tournaments` y tablas con `block_id`) se **reemplaza** por este modelo; los módulos de motor puros (`scheduler`, `pozo`, `fixed-pairs`, `generate`, `display`, `time`) se **reutilizan** por dentro donde aplique.

## Alcance

**En Fase 1:**
- Dos entidades de primer nivel: Pozo y Torneo, cada una con su sección de admin, su flujo de creación y su vista pública.
- Pozo: variantes **parejas fijas** y **americano**, ambas "rey de la pista".
- Torneo: **eliminación directa** (A) y **grupos → eliminación simple** (B), parejas fijas.
- Siembra **aleatoria con ajuste manual** (grupos, posiciones de cuadro, posiciones iniciales de pista del pozo).
- Pistas reales del club (nombre + orden + horario); el orden de pistas define la "escalera" del pozo.

**Fuera de Fase 1 (Fase 2, spec aparte):**
- Doble eliminación (cuadro de ganadores + perdedores) y grupos → doble eliminación.
- Pozo sin movimiento de pista (americano plano), mexicano, individual puro: descartados por ahora.
- Reasignación manual de partidos a pista/hora tras generar ("tocar y elegir"): fuera de alcance.
- Siembra por Elo: descartada (se eligió aleatoria).

## El modelo

### Navegación y creación
- El admin tiene **dos secciones separadas**: "Pozos" y "Torneos", cada una con su listado y su botón de crear.
- Al crear se elige el tipo desde el inicio (Pozo o Torneo) y se rellena un formulario específico del tipo. **No hay bloques.**
- **Base común a ambos:** jugadores del roster + pistas reservadas (cada una con nombre real, orden y ventana horaria) + fecha.
- **Vista pública** de solo lectura por cada pozo/torneo: parrilla + clasificación en vivo (igual que hoy).

### Pistas reales y "escalera" del pozo
- Las pistas se nombran con el **nombre/número real del club** (p. ej. "Pista 5 — Central") y se **ordenan** (arrastrando).
- En un **pozo**, el orden de las pistas **es la escalera**: la primera del orden es la cima (👑, la del rey), la última es el fondo. El "sube/baja" recorre esa escalera de pistas reales.
- En un **torneo**, las pistas no tienen escalera: son solo dónde se reparten los partidos.
- En **toda la app** se muestra siempre el nombre real de la pista; nunca un "Pista 1" inventado.

## Pozo

Rey de la pista: pistas ordenadas, cada ronda 2v2 en cada pista, ganadores suben una pista y perdedores bajan. Ronda a ronda los mejores escalan hacia la cima.

### Variantes
- **Parejas fijas:** cada pista la juegan **2 parejas fijas** que se mueven como bloque; la pareja **nunca se rompe**. Clasificación **por parejas**.
- **Americano:** cada pista la juegan **4 jugadores** que **cambian de compañero cada ronda dentro de la pista**; se mueven los individuos. Clasificación **por jugador**. (Es el comportamiento del motor `pozo` actual.)

### Configuración
- Variante (parejas fijas / americano).
- Participantes (jugadores del roster). En parejas fijas, además, **las parejas las define el admin**.
- Pistas reservadas + su orden (= escalera).
- **Nº de rondas** que dura el pozo.
- **Formato de cada ronda:** por defecto **por tiempo con punto de oro** (configurable; reutiliza `MatchFormat`).
- Siembra **aleatoria** de las posiciones iniciales de pista, **ajustable** antes de generar.

### Reglas
- **Huecos / descansos:** si los participantes no cuadran (p. ej. no múltiplo de 4 en americano, o nº de parejas que no llena las pistas), cada ronda **rota quién descansa** (ya soportado: `nextPozoRoundWithRest`).
- **Clasificación final = por la pista en la que acabas** (cima = campeón), etiquetada con el nombre real de la pista. **Desempate dentro de una misma pista: por juegos ganados acumulados.**
  - *Nota de implementación:* el motor actual (`pozoStandings`) clasifica por puntos acumulados; en Fase 1 la clasificación primaria pasa a ser **posición final en la escalera**, con el acumulado solo como desempate intra-pista. Es lógica nueva de standings.
  - El motor de movimiento de **parejas fijas** (2 parejas por pista que se mueven como bloque) es **nuevo** (el `pozo` actual rota compañeros dentro de la pista; aquí no).

## Torneo

Siempre **parejas fijas**: el admin define las parejas (quién juega con quién); te inscribes como pareja y avanzas como pareja.

### Común a A y B
- **Parejas pre-formadas por el admin.** El **sorteo solo decide la colocación** (en grupos / posiciones del cuadro), **ajustable** antes de generar.
- Los partidos se reparten en las **pistas reales reservadas** (con su horario) vía el `scheduler`; se muestra siempre pista real + hora.
- **Formato de partido configurable por fase** (por defecto **al mejor de 3 sets** en el cuadro).
- **Partido por el 3er/4º puesto:** **desactivado por defecto**, configurable por torneo.

### A) Eliminación directa
- Cuadro de eliminación simple. Sorteo de posiciones (ajustable).
- Si el nº de parejas no es potencia de 2, se reparten **byes** automáticamente en la 1ª ronda (ya soportado: `buildBracket`/`generateBracket`).

### B) Grupos → eliminación
- **Liguilla de grupos** (todos contra todos dentro del grupo). Configurable: **nº de grupos** y **cuántas parejas pasan por grupo** (por defecto 2).
- **Clasificación de grupo:** victorias → enfrentamiento directo → diferencia de juegos.
- Los clasificados pasan a un **cuadro de eliminación simple** con **cruces estándar** (1ºA-2ºB, 1ºB-2ºA…).

## Modelo de datos

Reescritura limpia del DDL en `src/lib/tournament/schema-ddl.ts` (fuente única; la usan la migración por endpoint y el harness de test). Cambios respecto al actual:

- **`tournaments`** (evento): añadir
  - `kind TEXT NOT NULL` — `'pozo' | 'torneo'`.
  - `format TEXT NOT NULL` — pozo: `'fixed_pairs' | 'americano'`; torneo: `'single_elim' | 'groups_elim'`.
  - `config TEXT NOT NULL DEFAULT '{}'` — JSON con la config del formato (nº rondas, `MatchFormat` por fase, nº grupos, pasan-por-grupo, 3er/4º puesto, etc.).
- **Eliminar `tournament_blocks`.** Lo que colgaba de `block_id` pasa a colgar de `tournament_id`:
  - `tournament_groups.block_id` → `tournament_id`.
  - `tournament_pairs.block_id` → `tournament_id`.
  - `tournament_matches.block_id` → se elimina; se conserva `phase_tag` para discriminar fase (`'pozo:r0'`, `'group:A'`, `'ko:r1'`…).
- **`tournament_courts`**, **`tournament_participants`**, **`tournament_matches`** (slots `SlotRef` en JSON) se mantienen casi igual.
- La forma de los `SlotRef` (`participant` / `pair` / `placeholder` / `matchWinner` / `bye`) no cambia en Fase 1 (`matchLoser` queda reservado para Fase 2).

## Arquitectura y reutilización

- **Se reutiliza:** `time.ts`, `scheduler.ts` (reparto greedy a pistas/horas), `fixed-pairs.ts` (round-robin de grupos, standings de grupo, `buildBracket`/`resolveBracket` con byes), `generate.ts` (composición), `display.ts` (etiquetas de slots), `pozo.ts` (americano: movimiento + rotación de compañero + descansos).
- **Nuevo:**
  - Motor de **pozo de parejas fijas**: 2 parejas por pista que se mueven como bloque (sin rotación de compañero). Probablemente una variante de `pozo.ts` o un módulo hermano `pozo-pairs.ts`.
  - **Clasificación del pozo por posición final en la escalera** (con desempate por acumulado), para ambas variantes.
  - **Siembra aleatoria** (de grupos, posiciones de cuadro y posiciones iniciales de pista) con barajado determinista por semilla para que sea reproducible/testeable.
- **Capa de persistencia/UI:** `store.ts`, rutas API y páginas admin/pública se **reescriben** alrededor del nuevo modelo (un formato por evento en lugar de lista de bloques). Se eliminan el editor de bloques (`blocks-editor.tsx`) y la ruta `/blocks`.
- **División en unidades:** mantener motores puros (sin DB) separados de la persistencia (`store.ts`) y de la UI; cada variante de pozo y cada estructura de torneo, con su función pura testeable de forma aislada.

## Validación y errores

- Validación en la API (las FK están OFF en Turso): parejas con jugadores distintos y dentro del roster, sin repetir; nº de grupos / pasan-por-grupo coherentes; nº de rondas > 0; formato válido; pistas con horario válido.
- Generar requiere config completa y válida; devolver errores claros (400) y avisos (warnings) de viabilidad de horario como hoy.
- Registrar resultado: rechazar si los slots no están resueltos; mapear errores a 404/409/500.

## Testing

Por la regla del repo (`AGENTS.md` → Testing), toda funcionalidad nueva lleva **tests e2e de Playwright** además de unitarios:

- **Unitarios** (vitest) de los motores puros nuevos: movimiento de pozo de parejas fijas, clasificación por escalera + desempate, siembra aleatoria determinista, cruces de grupos→cuadro.
- **E2E (Playwright)** del flujo real en navegador, reutilizando la infra existente (`e2e/`, DB de fichero aislada, cookies forjadas):
  - Crear un **pozo** (cada variante) → generar parrilla → registrar resultados de una ronda → ver movimiento y clasificación por pista.
  - Crear un **torneo A** (eliminación directa) → generar → registrar resultado → avanzar ronda.
  - Crear un **torneo B** (grupos → eliminación) → generar → cerrar liguilla → ver clasificados en el cuadro.
  - Vista pública de solo lectura de un pozo y de un torneo.

## Decisiones registradas

| Decisión | Elección |
|---|---|
| Nivel de reorganización | Separar de raíz (rebuild limpio, sin migración) |
| Variantes de pozo | Parejas fijas + Americano |
| Clasificación del pozo | Por pista final (escalera); desempate por acumulado |
| Estructuras de torneo (Fase 1) | Eliminación directa (A) + Grupos→eliminación (B) |
| Doble eliminación | Fase 2 (spec aparte) |
| Siembra | Aleatoria, ajustable a mano |
| Pistas | Nombres reales del club; el orden = escalera del pozo |
| Parejas de torneo | Las define el admin; el sorteo solo coloca |
| 3er/4º puesto | Desactivado por defecto (configurable) |

## Secuencia de sub-proyectos

1. **Fase 1 (este spec):** reestructura + Pozo (2 variantes) + Torneo (A, B).
2. **Fase 2 (futuro spec):** doble eliminación (cuadro de perdedores) + grupos → doble.
