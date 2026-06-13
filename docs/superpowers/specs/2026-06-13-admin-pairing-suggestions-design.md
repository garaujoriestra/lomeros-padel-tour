# Sugerencias de parejas al programar partido (admin)

**Fecha:** 2026-06-13
**Estado:** Aprobado

## Problema

Al programar un partido desde `/admin/matches/new`, el admin elige manualmente 4 jugadores
repartidos en Equipo 1 / Equipo 2 sin ninguna ayuda sobre cuál es la mejor combinación de
parejas. La lógica que calcula las 3 combinaciones posibles (`recommendPairings()`) ya existe,
pero solo se muestra en la página pública del partido **después** de programarlo. Queremos verla
**mientras** se programa para decidir las parejas cuanto antes.

## Alcance

- Exactamente **4 jugadores** por partido (no hay sistema de pool/jornada).
- Solo en el modo **"📅 Programar partido"** del formulario (no en "Registrar con resultado").
- Interacción: el admin selecciona 4 jugadores en cualquier hueco → aparece el panel con las 3
  combinaciones → pulsa "Aplicar esta combinación" → se rellenan Equipo 1 / Equipo 2 y los lados
  drive/revés automáticamente.
- **Sin** cambios de esquema de BD ni de la lógica de rating. Cero migraciones.

## Arquitectura

### 1. Endpoint — `src/app/api/pairings/preview/route.ts`
`GET ?ids=p1,p2,p3,p4`. Protegido para admin (mismo patrón que el resto de `/api` del panel).
- Valida: 4 ids, distintos, existentes.
- Reutiliza la misma lógica que la página pública del partido:
  - Carga los partidos completados que involucran a esos jugadores → `computeSideStats` por jugador.
  - Consulta `pairStats` para las parejas relevantes (historial).
  - Llama a `recommendPairings([p1,p2,p3,p4], sideStatsByPlayer)`.
- Devuelve JSON serializable:
  ```ts
  {
    options: PairingOption[],
    pairHistory: { player1Id, player2Id, matchesPlayed, wins, losses, synergyScore }[]
  }
  ```

### 2. Componente — `src/components/admin/pairing-suggestions.tsx` (cliente)
Props: `selectedIds: string[]`, `players: Player[]`, `onApply(team1Ids, team2Ids, team1Sides, team2Sides)`.
- Cuando hay 4 ids distintos, hace fetch al endpoint (estado "calculando…", manejo de error).
- Refetch cuando cambia el conjunto de 4.
- Pinta las 3 combinaciones como tarjetas, estilo visual consistente con la página pública:
  la mejor resaltada (✦), Δ Elo, probabilidad de victoria, badges de lado (Drive/Revés),
  y "X juntos" / "pareja inédita".
- Cada tarjeta: botón **"Aplicar esta combinación"** → llama `onApply` con los ids ordenados y
  los lados según `team1SideRec` / `team2SideRec` (vacío si la pareja no tiene historial de lados).

### 3. Integración — `src/components/admin/match-form.tsx`
- En modo `scheduled`, cuando hay 4 jugadores distintos seleccionados (en cualquiera de los 4
  huecos), renderiza `<PairingSuggestions>` debajo de la sección de equipos.
- `onApply` actualiza el estado `team1`, `team2`, `team1Sides`, `team2Sides`.

## Flujo de datos

```
selección de 4 jugadores (cliente)
  → GET /api/pairings/preview?ids=...
    → [servidor] completed matches + pairStats → computeSideStats → recommendPairings
  → { options, pairHistory }
  → render 3 tarjetas
  → "Aplicar" → onApply → setTeam1/setTeam2/setSides
  → submit normal (POST /api/matches)
```

## Manejo de errores

- Endpoint: 400 si ids inválidos/duplicados/inexistentes; 401/403 si no es admin.
- Componente: si el fetch falla, muestra aviso discreto y no bloquea el guardado manual.
- Pareja sin historial de lados → badges de lado vacíos (no se fuerza ningún lado).

## Pruebas

- Unit: el endpoint devuelve 3 opciones ordenadas por equilibrio para 4 ids válidos; 400 para
  entradas inválidas; rechaza no-admin.
- Lógica `recommendPairings` ya está cubierta; no se reimplementa.
- Verificación manual en el formulario: seleccionar 4 → ver panel → aplicar → equipos y lados
  rellenados → programar.

## Fuera de alcance

- Sistema de pool/jornada con >4 jugadores.
- Mostrar el panel en modo "Registrar con resultado".
- Cambios en el algoritmo de recomendación.
