# Planificador semanal de partidos — Diseño (v1)

**Fecha:** 2026-07-06
**Estado:** Aprobado por el usuario (pendiente de plan de implementación)

## Objetivo

Facilitar cuadrar partidos: cada semana, los jugadores marcan en qué tramos podrían
jugar y los que tienen pista propia (urbanización o similar) marcan cuándo la tienen
disponible. La app muestra las **coincidencias**: tramos donde hay partido posible.

**Alcance v1 — solo visibilidad.** La app enseña las coincidencias; el cuadre final
(hora exacta, quién juega) se sigue haciendo por WhatsApp. Quedan explícitamente
fuera de v1: notificaciones push al activarse un tramo, proponer/confirmar partido,
plantillas recurrentes o copiar semana anterior.

## Reglas de dominio

- Los partidos duran siempre **1,5 h**.
- La disponibilidad se marca en **slots de 30 min**; cada bloque pintado debe tener
  **≥3 slots consecutivos** (quien puede de 20:00 a 22:00 pinta 4 slots, y ya se
  verá si se juega 20:00–21:30 o 20:30–22:00).
- La semana va de **lunes a domingo** y se identifica por la fecha de su lunes
  (`YYYY-MM-DD`). Horas en **hora local del grupo** (Europe/Madrid); no se hace
  aritmética de zonas horarias: se guardan día + minuto de inicio del slot.
- Rango horario de la cuadrícula: **08:00–23:30** (constante de configuración).
- Cada semana se rellena **de cero** (sin plantillas ni copia de la anterior).
- **Pista ligada al jugador**: un jugador puede declarar una (1) pista con nombre
  (p. ej. «Urb. Los Olivos»). Solo su dueño edita su disponibilidad.
- **Coincidencia** (partido posible): ventana de 3 slots consecutivos con
  **≥4 jugadores disponibles** durante toda la ventana **y ≥1 pista efectiva**.
  - *Pista efectiva* = disponibilidad de la pista ∩ disponibilidad de su dueño
    (el dueño tiene que poder jugar para que su pista cuente; él es uno de los 4).
  - Las ventanas solapadas se **fusionan en tramos maximales**:
    «Jueves 20:00–22:00 · Pista de Juan · 5 disponibles: Juan, Luis, …».

## UI

Nueva página **Planificador** en la navbar, visible solo para sesión con ficha de
jugador. Selector de semana: **actual y siguiente** (ambas editables). Tres bloques:

1. **Mi disponibilidad** — cuadrícula pintable (filas = slots de 30 min
   08:00–23:30 con scroll, columnas = L–D). Se pinta con tap/drag; el cliente
   impide guardar bloques de <3 slots consecutivos.
2. **Mi pista** — si el jugador no tiene pista declarada, acción «Tengo pista»
   (nombre); si la tiene, misma cuadrícula pintable para la pista + editar nombre.
3. **Coincidencias de la semana** — por día, lista de tramos maximales con pista(s)
   efectiva(s) y nombres de los disponibles. Vista de solo lectura, igual para todos.

## Modelo de datos

Todo scopeado por `group_id` (patrón multi-tenant Fase 1/2). Tablas nuevas:

- `courts`: `id`, `group_id`, `owner_player_id` (único — una pista por jugador),
  `name`, `created_at`.
- `planner_slots`: una fila por (`group_id`, `week_start`, `day` 0–6,
  sujeto) donde el sujeto es un jugador (`player_id`) **o** una pista (`court_id`);
  los slots pintados se guardan como lista JSON de minutos de inicio
  (p. ej. `[1200, 1230, 1260, 1290]` = 20:00–22:00). Upsert por fila.

El **servidor revalida** la regla de ≥3 slots consecutivos por bloque y el rango
horario permitido; la cuadrícula lo garantiza visualmente pero la API no se fía.

## API y permisos

Rutas nuevas bajo el guard de grupo existente (`requireGroupSession`):

- `GET` semana completa: disponibilidades de todos, pistas y **coincidencias
  calculadas en servidor** (una sola respuesta para pintar la página).
- `PUT` mi disponibilidad de un día/semana; `PUT` disponibilidad de mi pista;
  `POST/PATCH` mi pista (crear con nombre / renombrar).
- Escritura **solo de lo propio** vía `ctx.playerId` — nadie edita la
  disponibilidad de otros; el admin tampoco (v1). Sin cambios en rutas existentes.

Solo semanas actual o siguiente son escribibles (las pasadas, de solo lectura).

## Multi-tenant

Componente compartido `PlannerBody` + página raíz `/planificador` (Lomeros) +
`/g/[slug]/planificador`, siguiendo el patrón de paridad de Fase 2 (Pasos 2/3):
`resolvePageContext`, navbar con `basePath`, gating por sesión + ficha de jugador
en el grupo.

## Algoritmo de coincidencias (servidor)

1. Para cada pista: intersecar sus slots con los de su dueño → slots efectivos.
2. Para cada ventana de 3 slots consecutivos del día: contar jugadores disponibles
   en los 3 slots; la ventana «activa» si cuenta ≥4 y alguna pista efectiva cubre
   los 3 slots.
3. Fusionar ventanas activas solapadas/adyacentes en tramos maximales; para cada
   tramo, reportar rango horario, pistas efectivas y jugadores disponibles (la
   lista de jugadores puede variar dentro del tramo; se muestra la unión, con el
   detalle por ventana disponible en el dato si la UI lo necesita).

Función pura en `src/lib/planner/` con tests unitarios.

## Tests

- **Unitarios**: algoritmo de ventanas y fusión, pista∩dueño, validación de
  bloques ≥3 slots, límites de rango horario, casos borde (exactamente 4
  jugadores, pista sin dueño disponible, bloques que se tocan a medianoche del
  rango).
- **E2E Playwright** (patrón del repo, `e2e/` + `npm run e2e`): montar estado por
  API (4-5 jugadores con disponibilidad, una pista con dueño disponible) y
  verificar en navegador: pintar y guardar la cuadrícula propia, declarar pista,
  y que las coincidencias muestran el tramo, la pista y los nombres esperados;
  caso negativo (solo 3 disponibles → sin coincidencia).

## Futuro (fuera de v1, apuntado)

- Push cuando un tramo pasa a «activo» (infra `push_subscriptions` ya existe).
- Proponer partido desde una coincidencia y confirmar plazas → partido programado.
- Plantilla semanal recurrente o «copiar semana anterior» si rellenar de cero
  resulta pesado en la práctica.
