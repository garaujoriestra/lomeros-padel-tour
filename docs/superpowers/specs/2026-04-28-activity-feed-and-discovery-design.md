# Activity Feed + ELO chart enhancements + Pareja inédita — Spec

## Contexto

Tras una conversación de brainstorming sobre qué mejoras añadir a la app, se acordó atacar primero el **Bloque 1**: tres features que comparten una misma característica — son capa de visibilidad sobre datos que ya existen en BD (`matches`, `match_sets`, `rating_history`, `pair_stats`, `players`). No hay cambios de schema.

Las tres features son cohesivas porque:
1. Todas viven en el dashboard o en el perfil del jugador (las dos pantallas más visitadas).
2. Todas explotan datos existentes y no añaden nuevas obligaciones de input al admin.
3. Funcionan bien juntas (el feed referencia los partidos, la gráfica los explica, los compañeros pendientes proyectan hacia adelante).

## Objetivos

- **Feed de actividad** en el dashboard que cuente la "vida" del grupo: partidos completados, programados, cambios de ranking notables, nuevos jugadores.
- **Mejoras a la gráfica de ELO** existente (`elo-chart.tsx`): eje X por fecha, marcadores de rank change, sparkline mini en el hero del perfil.
- **Pareja inédita**: tarjeta en el perfil con compañeros pendientes + badge "✨ INÉDITA" en el recomendador de parejas de partidos programados.

## Fuera de alcance

- Cambios de schema de BD (todas las features derivan de tablas existentes).
- Notificaciones push / WhatsApp / email cuando aparece actividad.
- Filtrado del feed por tipo o jugador.
- Comparación visual entre dos jugadores (segunda línea en la gráfica de ELO).
- Promedio del grupo en la gráfica de ELO.
- Badges/logros (es Bloque 3).
- Cambio en la lógica de scoring del recomendador de parejas (el badge "INÉDITA" es solo informativo).

---

## Diseño

### 📰 Feature 1 — Feed de actividad

#### Posición y reemplazo

- En `src/app/(public)/page.tsx`, **se mantiene intacta** la sección `📅 PRÓXIMOS PARTIDOS` (cards de partidos programados, con su layout actual `grid md:grid-cols-2 gap-4`).
- **Se reemplaza** la sección `⚡ ÚLTIMOS PARTIDOS` por un nuevo `<ActivityFeed>`. Los partidos completados pasan a ser entradas del feed (con icono ✅ y marcador inline).
- Usuarios siguen pudiendo ver el listado completo de partidos en `/matches`.

#### Contenido del feed

10 eventos más recientes en orden cronológico descendente. Sin paginación (link "Ver todos" lleva a `/matches`). 4 tipos de evento:

| Tipo | Icono | Origen de datos | Timestamp usado | Ejemplo de copy |
|------|-------|-----------------|-----------------|-----------------|
| Partido completado | ✅ | `matches.status='completed'` join `match_sets` | `recordedAt` máximo del `rating_history` ligado al `matchId` (= cuándo se cerró el resultado) | "Pedro & Juan ganan a Luis & Marcos · 6-3 / 7-5" |
| Partido programado | 📅 | `matches.status='scheduled'` | `createdAt` | "Programado: Carlos & David vs Marcos & Juan · 29 Abr" |
| Cambio de ranking | 📈 / 📉 | computado: comparar rank pre vs post entre top 3 / #1 al insertar `rating_history` | `recordedAt` del cambio que disparó | "Pedro entra al top 3" / "Pedro llega al #1" / "Luis sale del top 3" |
| Nuevo jugador | 👤 | `players` con `createdAt` reciente | `createdAt` | "Nueva jugadora: Ana" |

#### Detección de "rank change notable"

Helper puro `detectRankChanges(historyEntries, allPlayersSnapshot)`:
- Para cada entrada de `rating_history`, calcular el ranking del jugador **antes** y **después** del cambio.
- Eventos a emitir:
  - `rank_into_top1`: pasa a ser #1 (no era #1 antes).
  - `rank_loses_top1`: deja de ser #1 (era #1 antes).
  - `rank_into_top3`: pasa al top 3 (no estaba en top 3 antes).
  - `rank_loses_top3`: sale del top 3 (estaba en top 3 antes).
- Ignorar cualquier cambio que no cruce uno de esos umbrales.

Implementación nota: para reconstruir el ranking histórico de cualquier momento, el helper recibe la secuencia de cambios ordenada y mantiene un mapa `playerId → eloAfter` que va aplicando entrada por entrada. El rank en cada paso = ordenar por elo descendente.

#### Visualización (cards)

Cada entrada del feed = card blanca con borde gris claro:

```
┌────────────────────────────────────────────────────┐
│ [icono   ] Título del evento (1 línea, bold)       │
│ [pastel  ] Meta: marcador / fecha / contexto       │
│ [36×36px ]                          hace 2h        │
└────────────────────────────────────────────────────┘
```

- Icono circular de 36×36px con bg pastel según tipo (verde para completados, azul para rank, amarillo para programados, rosa para nuevos jugadores).
- Para partidos completados: marcador en chip mono `6-3 · 7-5`.
- Para programados: fecha del partido + ubicación si la hay.
- Timestamp relativo en español ("hace 2h", "ayer", "hace 3 días", "hace 2 sem", "hace 1 mes").
- Toda la card es un `<Link>`:
  - Partido (completado o programado) → `/matches/[id]`
  - Rank change → `/players/[playerId]` del jugador implicado
  - Nuevo jugador → `/players/[playerId]`

#### Empty state

Si el feed devuelve `[]` (grupo recién creado, sin matches/players):
> "Aún no hay actividad. ¡Que ruede el primer partido!" — centrado, gris, con icono 🎾.

#### Mobile

Las cards apilan vertical en mobile (sin grid). El padding y tamaño de icono ya está dimensionado para tap targets cómodos.

---

### 📈 Feature 2 — Mejoras a la gráfica de ELO

#### Cambios al componente existente `src/components/charts/elo-chart.tsx`

**1. Eje X por fecha.**
- Cambiar `dataKey="partido"` a `dataKey="date"` (timestamp ISO o ms).
- `tickFormatter`: formato corto ("15 Mar", "22 Mar"). Recharts auto-distribuye ticks; para ranges largos puede usar `interval="preserveStartEnd"` o un interval calculado.
- Tooltip ahora muestra fecha completa en el header en lugar de "Partido #N".

**2. Marcadores de rank change en la gráfica.**
- Recibir como prop adicional `rankEvents: { date, type, label }[]` calculados desde `detectRankChanges` (mismo helper que el feed).
- Renderizar cada evento como un `<ReferenceDot>` de Recharts en `(date, eloAfter)`, con label visible "↑ Top 3", "🥇 #1", etc.
- Estilo: dot 6px lime, label texto pequeño semibold encima.

**3. Sparkline mini en el hero del perfil — nuevo componente.**

Crear `src/components/charts/elo-sparkline.tsx`:
- Variante minimalista: `<LineChart>` o SVG manual — 80×28px, sin ejes, sin grid, sin tooltip.
- Línea verde (`#16a34a`) trazada con `strokeWidth={1.5}`.
- Recibe `data: { date, elo }[]` y devuelve `null` si data tiene <2 puntos.
- Renderizado en el hero del perfil del jugador, junto al número grande de ELO actual.

#### Ubicación del sparkline en el perfil

En el hero del perfil (parte de arriba), donde actualmente se muestra el ELO grande, añadir el sparkline a su derecha o debajo del número:

```
┌─────────────────────────────────────┐
│  Pedro Pérez  🤚 Zurdo              │
│                                     │
│  1547 ELO   📈 [sparkline 80×28]    │
│  ─────────                          │
│  +47 desde inicial                  │
└─────────────────────────────────────┘
```

(Maquetado preciso lo afinará el implementador respetando el hero existente.)

#### Eliminar la línea "↗ +47 desde inicial" del card grande?

No. Se queda como está. El sparkline complementa, no reemplaza.

---

### 🎲 Feature 3 — Pareja inédita

#### Helper puro `findUnplayedPartners`

Crear `src/lib/players/unplayed-partners.ts`:

```ts
export function findUnplayedPartners(
  playerId: string,
  allPlayers: Player[],
  pairStats: PairStat[],
): Player[]
```

- Devuelve los jugadores con los que `playerId` **no** ha sido pareja (ningún `pair_stats` entre los dos con `matchesPlayed > 0`).
- Excluye al propio `playerId`.
- Excluye jugadores con 0 partidos jugados en total (`player.matchesPlayed === 0`) — no contaminan la lista.
- Orden devuelto: alfabético por `name`.

#### Surface 1 — Card en el perfil del jugador

Añadir en `src/app/(public)/players/[id]/page.tsx` un nuevo componente:

`src/components/shared/unplayed-partners-card.tsx`:
- Header: "🎲 COMPAÑEROS PENDIENTES" (uppercase tracking, estilo consistente con otras tarjetas del perfil).
- Contador "X de Y" en la esquina superior derecha (X = pendientes, Y = total de candidatos = todos los jugadores activos menos uno).
- Cuerpo: chips horizontales de cada compañero pendiente, cada chip con avatar mini circular (foto del Blob si la hay, fallback inicial verde) + nombre. Todo el chip es link al perfil del jugador.
- Footer pequeño en cursiva gris: "Anímate a probar nuevas parejas — sumáis al historial del grupo." (opcional, si hay espacio).
- Solo se renderiza si `findUnplayedPartners(...).length > 0`. Para veteranos sin pendientes, la card no aparece.

Posición en el perfil: después de la sección de Best/Worst Partner, antes de Court Side stats. (Cohesión narrativa — best partner / worst partner / pendientes son el "tu mapa de relaciones de pareja".)

#### Surface 2 — Badge en el recomendador de parejas

En `src/app/(public)/matches/[id]/page.tsx`, dentro del bloque de `pairingOptions` que pinta las 3 opciones, añadir:

- Para cada equipo de cada opción, lookup en `pair_stats` (que ya se carga `relevantPairs`) si hay un row con esos dos `playerId` y `matchesPlayed > 0`.
- Si **no** lo hay, renderizar bajo el equipo un badge dorado:

```tsx
<span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200">
  ✨ INÉDITA
</span>
```

- La línea actual "5 partidos juntos" se reemplaza por el badge cuando `matchesPlayed === 0`. Si hay matchesPlayed > 0 sigue mostrándose la línea actual.
- El **scoring / ordering** de `recommendPairings` no se toca. Solo añadimos info visual.

---

## Archivos afectados

| Archivo | Cambio |
|---|---|
| `src/app/(public)/page.tsx` | Reemplazar sección "Últimos partidos" por `<ActivityFeed>`. "Próximos partidos" intacto. |
| `src/components/shared/activity-feed.tsx` | Nuevo. Renderiza la lista de eventos. |
| `src/components/shared/activity-feed-item.tsx` | Nuevo. Card individual del feed (uno por tipo de evento). |
| `src/lib/feed/build-feed.ts` | Nuevo. Función pura que combina partidos + rank changes + nuevos jugadores en una lista ordenada. |
| `src/lib/feed/build-feed.test.ts` | Nuevo. TDD. |
| `src/lib/feed/rank-changes.ts` | Nuevo. Detector de cruces top 3 / #1. |
| `src/lib/feed/rank-changes.test.ts` | Nuevo. TDD. |
| `src/lib/format/relative-time.ts` | Nuevo (si no existe). "hace 2h", "ayer", etc. |
| `src/lib/format/relative-time.test.ts` | Nuevo. TDD. |
| `src/components/charts/elo-chart.tsx` | Eje X por fecha + props `rankEvents` con `<ReferenceDot>`s. |
| `src/components/charts/elo-sparkline.tsx` | Nuevo. Mini chart 80×28px sin ejes. |
| `src/app/(public)/players/[id]/page.tsx` | Sparkline en el hero + card "Compañeros pendientes" + adaptación de los datos para `EloChart` (incluir fecha + rank events). |
| `src/lib/players/unplayed-partners.ts` | Nuevo. `findUnplayedPartners`. |
| `src/lib/players/unplayed-partners.test.ts` | Nuevo. TDD. |
| `src/components/shared/unplayed-partners-card.tsx` | Nuevo. Card del perfil. |
| `src/app/(public)/matches/[id]/page.tsx` | Badge "INÉDITA" en cada equipo de cada opción del recomendador cuando `matchesPlayed === 0`. |

Ningún cambio en `src/lib/db/schema.ts`. Ningún cambio en `src/app/api/*`.

---

## Data flow

### Feed

`page.tsx` (server component) hace 4 queries en paralelo:
1. `matches` últimos N (basta con N=20 para tener buffer) ordenados por algún timestamp.
2. `rating_history` últimos M (M=50 buffer) ordenados por `recordedAt` desc.
3. `players` últimos K creados (K=10).
4. `match_sets` para los matches del bullet 1.

Pasa todo a `buildFeed(matches, history, allPlayersSnapshot, players, matchSets)` que:
- Genera entradas `match_completed` desde matches con `status='completed'`.
- Genera entradas `match_scheduled` desde matches con `status='scheduled'`.
- Genera entradas `rank_change` aplicando `detectRankChanges(history, allPlayersSnapshot)`.
- Genera entradas `new_player` desde players ordenados por `createdAt`.
- Las une, las ordena por timestamp desc, devuelve top 10.

`<ActivityFeed events={feedEvents} playerMap={playerMap} />` renderiza.

### ELO chart con marcadores

`page.tsx` del perfil:
1. Carga `rating_history` del jugador (ya existe).
2. Carga `rating_history` global de todos los jugadores (necesario para reconstruir rank histórico).
3. `detectRankChanges(globalHistory, ...)` filtrado a entradas del jugador actual.
4. Pasa `chartData` (con dates) y `rankEvents` a `<EloChart>`.

Coste: una query extra (todo el `rating_history`). En un grupo con ~20 jugadores y ~100 partidos = ~400 rows. Insignificante.

### Pareja inédita

`page.tsx` del perfil ya carga `pair_stats` y `players`. `findUnplayedPartners(id, allPlayers, pairStats)` corre en memoria — pure function, instantáneo. Resultado pasa a `<UnplayedPartnersCard>`.

`page.tsx` del partido programado ya carga `relevantPairs`. La comprobación `matchesPlayed === 0` es lookup en memoria.

---

## Testing

### Unit tests (vitest)

- `buildFeed`: combina las 4 fuentes, ordena por timestamp, devuelve top 10. Casos: feed vacío, sólo un tipo de evento, mezcla de tipos, exceso de eventos (truncate a 10).
- `detectRankChanges`: secuencia de `rating_history` con cruces de top 3 / #1 en distintos órdenes; identifica los 4 tipos de evento; ignora cambios que no cruzan umbrales.
- `findUnplayedPartners`: jugador sin partidos previos (devuelve todos los activos); jugador veterano (devuelve subset); excluye nuevos jugadores; alfabético.
- `relativeTime`: "hace 2h", "ayer", "hace N días", "hace N sem", "hace N mes". Edge cases (justo ahora, hace 23h59min).

### Verificación manual

- Feed con grupo activo: 4+ tipos de evento mezclados, orden correcto, click navega bien.
- Feed con grupo recién creado: empty state.
- ELO chart con jugador veterano: ticks de fecha legibles, rank events visibles.
- ELO chart con jugador con 1 partido: no rompe (chartData.length < 2 → no se renderiza, ya gestionado).
- Sparkline en el hero: se ve, no rompe layout, oculto si <2 puntos.
- Card "Compañeros pendientes" en perfil: se renderiza con chips clicables; oculta si no hay pendientes.
- Badge "INÉDITA" en recomendador: aparece sólo en parejas con `matchesPlayed === 0`; no afecta el orden de las opciones.

---

## Riesgos y consideraciones

- **Coste de la query global de `rating_history`** para el perfil. En un grupo de tamaño LPT (decenas de partidos) es ridículo. Si el grupo crece (cientos), considerar cachear el snapshot del ranking en una tabla auxiliar — fuera de alcance de este spec.
- **Idempotencia del feed:** `buildFeed` debe ser determinista para el mismo input. Si dos eventos comparten exactamente el mismo timestamp, romper empate por tipo (matches > rank > players) y luego por id.
- **Recharts y dates:** Recharts usa números o strings para `dataKey`. Pasar timestamps en ms (`Date.parse`) y formatear con `tickFormatter`. No usar Date objects directamente.
- **Sparkline cuando hay <2 puntos:** devolver `null`. Mismo comportamiento que el chart grande.
- **Empty rank changes:** un grupo nuevo o un jugador que nunca cruzó top 3 no genera rank events. La gráfica simplemente no muestra dots — perfectamente válido.
- **Click en chip de compañero pendiente:** asegurarse de que el componente del chip hace `<Link>` y no swallow el click si está anidado en otro link.
- **Mantener performance del dashboard:** las 4 queries del feed deberían ir en `Promise.all` paralelo. La página ya hace varias queries hoy, esto añade marginal.

---

## Open questions

Ninguna — todas las decisiones están cerradas:
- Feed: 4 tipos de evento, top 10, sin paginación, posición debajo de "Próximos partidos".
- ELO chart: fecha en X, marcadores de rank, sparkline en hero.
- Pareja inédita: card en perfil + badge en recomendador, scoring no cambia.
