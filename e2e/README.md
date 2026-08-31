# Tests e2e (Playwright)

Suite de navegador que cubre los flujos reales de LPT de punta a punta (~48 specs).
Usa una DB SQLite de fichero aislada (`e2e/test.db`, se borra en cada arranque) y
cookies de sesión forjadas — no toca producción ni necesita Google OAuth.

## Requisitos (una vez)

```bash
npm install            # instala @playwright/test
npx playwright install chromium
```

## Correr

```bash
npm run e2e            # toda la suite (headless)
npm run e2e:ui         # modo interactivo (Playwright UI)
npx playwright test e2e/edit-result.spec.ts    # un solo spec
```

Playwright arranca `next dev -p 3100` automáticamente con un `AUTH_SECRET`/`ADMIN_EMAIL`
de prueba y aplica migraciones + seed en `e2e/global-setup.ts`. No hace falta levantar
nada a mano. Asegúrate de no tener otro proceso ocupando el puerto 3100.

`global-setup` también alinea la tabla `players` con el schema drizzle (añade
`is_left_handed`, `token_balance`, `juega_padel`), ya que esas columnas las crean
migraciones que no expone `/api/init-db` y `getSession` carga la fila completa.

## Qué cubre

La suite crece con cada feature (regla de `AGENTS.md`: ninguna feature se da por
terminada sin su e2e). Agrupada por área:

- **Multi-tenant / aislamiento por grupo** (el bloque más grande): `1c-roles-memberships`,
  `1d-namespacing`, `slug-routing`, `players-scoping`, `player-routes-scoping`,
  `matches-scoping`, `rewards-scoping`, `group-home`, `group-me`, `group-admin`, y la
  familia **no-fuga** (`no-fuga-lecturas/-matches/-players/-premios/-timba/-tournaments`)
  que verifica que ningún grupo lee ni escribe datos de otro.
- **La Timba (apuestas)**: `timba-dos-mercados` (Ganador + Marcador por separado),
  `timba-celebration` (celebración del acierto).
- **Pozos**: `pozo-americano`, `pozo-fixed-pairs`, `pozo-public`.
- **Torneos**: `torneo-single-elim`, `torneo-groups-elim`, `torneo-public`.
- **Partidos / ranking**: `event-create`, `event-delete`, `eventos`, `edit-result`,
  `rankings-you`, `elo-proyeccion` (Elo proyectado en partidos programados),
  `empate` (1-1 a sets: se registra como empate, no mueve el Elo y devuelve las
  apuestas; incluye la regresión de que un 1-1 no se cuele como victoria).
- **Planificador**: `planner` — disponibilidad semanal pintable (tap = una celda,
  arrastre con umbral), mapa de calor y resumen «quién puede», validación de bloques
  (≥1,5h), authz de API entre grupos, paridad `/g/[slug]/planificador`.
- **Chrome / PWA / motion**: `pwa-manifest`, `view-transitions`, `animations`.
- **Dev tooling**: `dev-login`, `seed-staging` (guardados tras `VERCEL_ENV !== 'production'`).
