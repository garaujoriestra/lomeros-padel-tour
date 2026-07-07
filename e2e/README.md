# Tests e2e (Playwright)

Suite de navegador del constructor de torneos. Usa una DB SQLite de fichero aislada
(`e2e/test.db`, se borra en cada arranque) y cookies de sesión forjadas — no toca
producción ni necesita Google OAuth.

## Requisitos (una vez)

```bash
npm install            # instala @playwright/test
npx playwright install chromium
```

## Correr

```bash
npm run e2e            # toda la suite (headless)
npm run e2e:ui         # modo interactivo (Playwright UI)
npx playwright test e2e/admin-result.spec.ts   # un solo spec
```

Playwright arranca `next dev -p 3100` automáticamente con un `AUTH_SECRET`/`ADMIN_EMAIL`
de prueba y aplica migraciones + seed en `e2e/global-setup.ts`. No hace falta levantar
nada a mano. Asegúrate de no tener otro proceso ocupando el puerto 3100.

`global-setup` también alinea la tabla `players` con el schema drizzle (añade
`is_left_handed`, `token_balance`, `juega_padel`), ya que esas columnas las crean
migraciones que no expone `/api/init-db` y `getSession` carga la fila completa.

## Qué cubre

- **admin-create**: crear torneo desde el formulario.
- **admin-blocks**: añadir y guardar un bloque en el editor.
- **admin-result**: registrar un resultado y ver el marcador + clasificación.
- **public-view**: parrilla pública de solo lectura y "tu próximo partido".
- **planner**: disponibilidad semanal pintable, validación de bloques (≥1,5h), alta de
  pista propia, coincidencias (4 jugadores + pista∩dueño), authz de API entre grupos,
  paridad `/g/[slug]/planificador`.
