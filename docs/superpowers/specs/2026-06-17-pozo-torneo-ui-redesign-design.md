# Rediseño visual de Pozo y Torneo

**Fecha:** 2026-06-17
**Estado:** Diseño aprobado (brainstorming con companion visual). Pendiente de plan de implementación.
**Relacionado:** sustituye/mejora la capa de presentación de [2026-06-15-pozo-torneo-split-design.md](./2026-06-15-pozo-torneo-split-design.md) (Fase 1, ya en producción).

## 1. Contexto y objetivo

El Pozo y el Torneo ya funcionan en producción (modelo `kind`/`format`/`config`, motores y view-models estables). Pero su **interfaz son tablas HTML planas**: el pozo es una tabla pistas×rondas + una tabla de clasificación; el torneo son tablas de grupos + un cuadro hecho de `<div>` con borde en scroll horizontal. No hay jerarquía visual, ni identidad de marca, ni sensación de "movimiento" (quién sube/baja en el pozo, quién avanza en el torneo).

**Objetivo:** rediseñar por completo la **capa de presentación** de ambas piezas con la identidad LPT, de forma que se *vea* lo que pasa: las pistas, los jugadores y cómo progresan. Una sola vista responsive que luzca igual de bien en el móvil del jugador y en una pantalla grande.

## 2. Alcance

**Dentro:**
- Rediseño visual de **Pozo** (config admin, escalera en vivo, clasificación final, vista jugador/espectador).
- Rediseño visual de **Torneo** (config admin con sorteo, cuadro de eliminación, fase de grupos, vista jugador/espectador).
- Entrada de resultados del admin integrada en la nueva UI.

**Fuera (no tocar):**
- Motores y lógica (`pozo-engine`, `pozo-pairs-run`, `pozo-run`, `ladder`, `seeding`, `event-engine`, `torneo-run`, `scheduler`). Solo se consumen.
- Modelo de datos / esquema. Sin migraciones.
- Formatos de **Fase 2** (doble eliminación, grupos→doble, 3er/4º puesto).
- Features sociales (compartir, comentarios, reacciones in-app). El "comentar con amigos" se resuelve enseñando la pantalla; no hay UI social nueva.
- Los **view-models** (`pozo-view.ts`, `torneo-view.ts`) son estables; solo se permiten **extensiones aditivas mínimas** de presentación (ver §7), nunca rediseñarlos.

## 3. Principios de diseño (decisiones transversales)

1. **Una sola vista responsive** (no dos UIs). Mismos componentes que escalan: móvil = columna apilada; pantalla ancha = más aire / multicolumna.
2. **Identidad LPT** como en el resto de la app, tomando el **modo oscuro como referencia principal** (es el modo habitual del usuario), pero válido también en claro. Reutilizar tokens y componentes de `src/app/globals.css` (ver §4).
3. **Reutilización**: el constructor de parejas, la entrada de resultado y los helpers de display se comparten entre Pozo y Torneo.
4. **El admin trabaja en vivo; jugadores/espectadores miran a posteriori.** La vista del admin prioriza meter resultados rápido; la del jugador prioriza el repaso (retrospectiva), no la urgencia en tiempo real.

## 4. Identidad visual (tokens reales a usar)

De `src/app/globals.css` (no inventar valores nuevos):
- **Fuentes:** `--font-sans` = Archivo (cuerpo); `--font-display` = Barlow **itálica, peso 800, mayúsculas** (títulos, marcadores, dorsales/puestos, números grandes).
- **Acento:** `--acc` = `#c8f03c` (lima) con texto `--on-acc`; `--acc-text` (en dark = el propio lima).
- **Estados:** `--win` (verde, "sube"/gana/avanza), `--loss` (naranja, "baja"/pierde), `--warn`.
- **Superficies/tinta:** `--surface`, `--surface-2`, `--line`, `--line-strong`, `--ink`/`--ink-2`/`--ink-3`. Radios `--r-card` (14px), `--r-pill`.
- **Componentes existentes a reutilizar:** `.lpt-card` + `.card-pad`, `.kicker`, `.display`, `.status-pill` (scheduled/completed/…), `.set-cell` (marcadores), `.rank-row`/`.rank-pos`, `.seg` (segmented), `.lpt-btn.primary`, `.lpt-badge`, `.delta` (up/down), `.hero`/`--hero-bg`, `.podium-gold` y su glow en dark.

**Referencias visuales aprobadas (alta fidelidad):** `./assets/2026-06-17-pozo-hifi.html` (claro) y `./assets/2026-06-17-pozo-hifi-dark.html` (oscuro, referencia principal).

## 5. Pozo

### 5.1 Estados / flujo
`Configuración (borrador)` → `Generar` → `Escalera en vivo` → `Final (= clasificación)`.

### 5.2 Configuración (lado admin) — **una sola página con secciones**
Decisión: página única con scroll (no asistente por pasos), porque el admin repite cada semana.
Secciones:
1. **Datos:** nombre, fecha, hora de inicio.
2. **Formato:** segmented `Parejas fijas` / `Americano (rotan)`, con una línea explicativa de cada uno.
3. **Pistas — ordenables (drag):** el **orden de las pistas = la escalera** (arriba la mejor, 👑). Se pueden apagar pistas que no se usen. Nombres reales del club (nunca "Pista 1" genérico).
4. **Rondas:** nº de rondas + minutos/ronda → fin estimado calculado.
5. **Jugadores / Parejas:**
   - *Parejas fijas:* **constructor de parejas** (cada pareja = 2 jugadores) con contador "N/N emparejados" y los sueltos como chips para emparejar. Mismo componente que el Torneo.
   - *Americano:* lista simple de jugadores (rotan, no se emparejan).
6. **Generar:** botón primario que crea la ronda 1 y bloquea la config. Muestra inline los errores del motor: `NO_PAIRS` ("faltan parejas"), `UNBALANCED_PAIRS` ("descansarían más de 2 por ronda"), `< 4 jugadores` (americano).

### 5.3 Escalera en vivo — **vista única (sin pestañas)**
La pieza estrella. Un solo componente cubre directo, "cómo va", clasificación y "cómo fue":
- **Scrubber de rondas** arriba (segmented con los números de ronda): jugadas marcadas, actual resaltada (lima). Navega ◀▶ para revivir cualquier ronda.
- **Pistas como carriles (lanes)**, de arriba (mejor, 👑 con borde lima + glow en dark) a abajo (peor). Cada lane = una `.lpt-card`:
  - Cabecera: nombre real de la pista + `.status-pill` (Final / Jugándose / Pendiente / Descanso).
  - Por equipo de la pista: **dorsal/puesto** (display font), nombres, **juegos acumulados** y **marcador** (`.set-cell`, ganador en lima). Ganador con énfasis; perdedor atenuado.
- **Flechas de movimiento ▲▼** entre lanes: quién sube (`--win`) y quién baja (`--loss`) de una ronda a la siguiente. En la ronda activa: "se decide al guardar".
- **Pista de descanso:** lane atenuado indicando quién descansa.
- **Tu pista resaltada** (borde verde) para el jugador identificado.

**El puesto (#) + juegos van siempre visibles**, de modo que la escalera **en la última ronda se lee como la clasificación final** (1º 👑 arriba → último abajo). Por eso **no hace falta pestaña de "Clasificación" ni de "Recorrido"**: el scrubber cubre el "cómo fue".

### 5.4 Clasificación final
Es el mismo componente en la última ronda. Manda la **pista final**; dentro de cada pista desempatan los **juegos acumulados** (regla del motor `ladder`). El campeón ocupa el primer puesto de la pista superior.

### 5.5 Vista jugador / espectador (solo lectura, retrospectiva)
Misma escalera, sin entrada de resultado (eso solo el admin).
- Optimizada para **revisar a posteriori** (durante el pozo, que es dinámico y sin descansos, casi nadie mira el móvil). Aterriza en el resultado final cuando ha terminado; scrubber para revivir rondas.
- "Tu próximo partido" queda como **detalle secundario** durante el directo (no un hero con cuenta atrás). Al terminar: "🏁 Pozo terminado — quedaste Nº".
- El espectador sin login ve lo mismo sin la parte personal.

### 5.6 Americano vs parejas fijas
La pista se ve igual (2 vs 2). Diferencias: en americano las parejas rotan cada ronda y la **clasificación es individual** (las flechas mueven jugadores, no parejas); en parejas fijas, todo va por pareja. El componente despacha según `format` igual que `pozo-engine`.

## 6. Torneo

### 6.1 Estados / flujo
`Configuración (borrador)` → `Generar` → `Grupos (si aplica) + Cuadro` → `Final (campeón)`.

### 6.2 Configuración (lado admin) — **una sola página** (consistente con el Pozo)
1. **Datos:** nombre, fecha, inicio.
2. **Formato (propio del torneo):** segmented `Eliminación directa` / `Grupos + eliminación`. Si grupos: sub-campos `nº de grupos`, `clasifican por grupo`, `tamaño de grupo` (auto). En directa, esa fila desaparece.
3. **Parejas:** **mismo constructor que el Pozo** (el torneo siempre es parejas fijas definidas por el admin).
4. **Sorteo / siembra (propio del torneo):** botón `🎲 Sortear de nuevo` que coloca las parejas al azar; **arrastrar ⠿ una pareja para ajustar** (separar cabezas de serie). En *grupos*, distribuye en grupos; en *directa*, coloca/permuta siembras en el cuadro.
5. **Pistas y opciones:** pistas disponibles (para programar por olas) + toggle `3er y 4º puesto` (off por defecto; Fase 2).
6. **Generar:** crea grupos + cuadro y bloquea. Avisa si faltan parejas o el nº no cuadra con los grupos.

### 6.3 Cuadro (bracket) — **árbol clásico**
- **Pantalla ancha:** árbol horizontal, rondas en columnas izquierda→derecha con líneas conectoras, final a la derecha y caja de **campeón**.
  - El **ganador se resalta** (verde) y "fluye" por la línea: la celda de la ronda siguiente ya muestra su nombre (vía `resolveBracket`).
  - **Partido en vivo:** lleva la entrada de marcador del admin (mismo componente que el pozo) y `.status-pill`.
  - **Byes** (cuadro impar): tarjeta en discontinuo, "pasa directo".
- **Móvil:** el **mismo árbol** con **scroll en dos ejes** (↔ entre rondas, ↕ para ver más partidos de la ronda actual) y **auto-centrado en la ronda en juego** al abrir. Indicador de posición de ronda (puntos) + aviso "↓ N partidos más". (Un render único; el híbrido árbol↔stepper queda como posible mejora futura si en móvil se siente justo con cuadros de 16+.)

### 6.4 Fase de grupos (formato `groups_elim`)
- **Conmutador `Grupos / Cuadro`** arriba (segmented) que separa las dos fases sin saturar. Mientras los grupos no terminan, el "Cuadro" muestra el bracket con los cruces aún por resolver.
- **Pantalla ancha:** tablas por grupo (A, B, …) lado a lado: `#`, pareja, PJ, G-P, Dif (juegos), Pts. Los **clasificados (top-N) en verde** + **línea de corte** discontinua. Debajo de cada grupo, sus partidos con entrada de resultado.
- **Móvil:** grupos **apilados** (scroll ↕). La tabla de 6 columnas se reorganiza en **filas**: dorsal + nombre arriba, stats finos debajo (`PJ 3 · 2-1 · +4`) y **puntos en grande** a la derecha. Verde + dorsal relleno = clasifica. **Partidos plegables** ("Ver los N partidos ▾").
- **Banda "Del grupo al cuadro" 🔀:** muestra los cruces (1º de un grupo vs 2º del otro) que evita que rivales del mismo grupo se crucen en 1ª ronda (`crossSeedLeaves`).

### 6.5 Vista jugador / espectador
A diferencia del pozo, el torneo de eliminación tiene **esperas entre olas**, así que aquí "ver si he pasado / cuándo juego" tiene valor en vivo además del repaso. Solo lectura (sin entrada de resultado). La pareja del jugador se resalta en el cuadro/grupos.

## 7. Datos / view-models (consumo y extensiones aditivas)

Los view-models ya exponen casi todo. La rejilla del pozo (`buildPozoGrid`) da pistas×rondas; la del torneo da grupos (`buildGroupsView`), cuadro (`buildBracketView`) y "tu próximo partido". **Posibles añadidos de presentación** (aditivos, sin tocar motores):
- **Pozo:** derivar, por ronda, el **puesto + juegos acumulados** por carril y los **deltas de movimiento ▲▼** comparando la pista de cada participante entre ronda N y N+1 (todo derivable de la rejilla existente; encapsular en un helper de `pozo-view.ts` para no meter lógica en el componente).
- **Torneo:** etiqueta de **siembra/cruce** (1ºA vs 2ºB) para la banda grupo→cuadro, si no está ya disponible.

Si algún dato no se puede derivar limpiamente en presentación, se añade un helper **puro** en el view-model correspondiente; nunca en el motor.

## 8. Inventario de componentes (objetivo de la implementación)

Se **reconstruyen** (presentación):
- **Pozo:** `pozo-grid.tsx` → escalera en vivo (lanes + scrubber + movimiento); `pozo-standings.tsx` → **se absorbe en la escalera** (la clasificación es la última ronda con puesto+juegos; el componente de tabla aparte se retira); `next-match-card.tsx` (pasa a detalle secundario); `result-entry.tsx` (estilo nuevo, reutilizable).
- **Torneo:** `bracket-view.tsx` → árbol clásico responsive (scroll 2 ejes + auto-centra); `groups-table.tsx` → tablas (ancho) / filas (móvil) + conmutador + banda de cruces.
- **Compartidos / admin:** `event-panel.tsx`, `pairs-editor.tsx`, `generate-button.tsx` → secciones de configuración con la identidad nueva; nuevo bloque de **sorteo ajustable** (drag) para el torneo.
- **Rutas:** `/admin/pozos/[id]`, `/admin/torneos/[id]`, `/(public)/pozos/[id]`, `/(public)/torneos/[id]` (mismos componentes, modo lectura en las públicas).

Mantener archivos **enfocados y pequeños** (un propósito por componente); extraer los sub-bloques (lane, scrubber, match-card del cuadro, fila de grupo) como piezas reutilizables.

**Orden de implementación (dos pasos):** primero el **Pozo** completo (config + escalera + jugador), luego el **Torneo** (config + sorteo + cuadro + grupos). Cada paso entra con sus tests e2e en verde antes de pasar al siguiente. El plan de implementación se decompone siguiendo este orden.

## 9. Estrategia responsive

- **Móvil-first**, ampliando en breakpoints (la app usa `760px` como corte principal en `globals.css`).
- Pozo y grupos: apilado en móvil, multicolumna/aire en ancho.
- Cuadro: único render con scroll 2 ejes + auto-centra en móvil; árbol completo en ancho.

## 10. Testing

Según `AGENTS.md`, **toda funcionalidad lleva tests e2e de Playwright** (flujo real en navegador) además de los unitarios que correspondan. La suite vive en `e2e/` y corre con `npm run e2e` (montar estado por API, aserciones por UI).
- **Reutilizar/actualizar** los specs e2e existentes (`pozo-fixed-pairs`, `pozo-americano`, `pozo-public`, y los de torneo) para que apunten a la nueva UI (escalera, scrubber, cuadro, conmutador grupos/cuadro, sorteo).
- Unit: cubrir los **helpers nuevos de view-model** (deltas de movimiento, puesto+juegos por ronda, etiquetas de cruce) si se añaden.
- Verificación final: `npm run e2e` verde + build limpio + tsc, igual que en la Fase 1.

## 11. Resumen de decisiones cerradas

| Tema | Decisión |
|---|---|
| Superficie | Una vista responsive única (móvil + pantalla grande) |
| Identidad | Tokens/fuentes/componentes LPT existentes; **dark como referencia principal** |
| Pozo · estructura | Vista única (escalera + scrubber), sin pestañas; clasificación = última ronda; sin "Recorrido" |
| Pozo · config | Página única con secciones; pistas ordenables = escalera |
| Pozo · jugador | Solo lectura, retrospectiva; "próximo partido" secundario; sin features sociales |
| Torneo · cuadro | Árbol clásico; móvil = scroll 2 ejes + auto-centra (render único) |
| Torneo · grupos | Conmutador Grupos/Cuadro; tablas (ancho) / filas (móvil); banda de cruces |
| Torneo · config | Página única; formato + sorteo ajustable (drag); 3er/4º off |
| Fuera de alcance | Fase 2, multi-tenant, social, cambios de motor/datos |
