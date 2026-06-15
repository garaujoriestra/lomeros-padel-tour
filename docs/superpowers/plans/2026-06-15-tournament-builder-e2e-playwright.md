# Plan E2E — Suite Playwright para el constructor de torneos

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (o subagent-driven-development) para ejecutar este plan tarea a tarea. Los pasos usan checkbox (`- [ ]`).
>
> **NOTA DE EJECUCIÓN (leer primero):** este plan se redactó en una sesión anterior y está pensado para ejecutarse en una **sesión nueva** dentro del worktree `worktree-tournament-builder` (`.claude/worktrees/tournament-builder`), donde ya está implementado el constructor de torneos (Planes 4-9). Antes de empezar: `cd` al worktree y `git status` para confirmar la rama. La Task 1 descarga el binario de Chromium (~150-300 MB).

**Goal:** Una suite e2e de navegador (Playwright) que verifica el constructor de torneos contra la app real — flujo admin (crear → editor de bloques → generar → registrar resultado → ver clasificación) y vista pública (parrilla de solo lectura + "tu próximo partido") — usando una base de datos de fichero aislada y una sesión admin/jugador forjada, sin tocar producción.

**Architecture:** Playwright levanta `next dev` en el puerto 3100 contra una DB SQLite de fichero (`e2e/test.db`, borrada en cada arranque). Un `globalSetup` aplica las migraciones (vía los endpoints `init-db`/`migrate-auth`/`migrate-tournaments`), siembra jugadores y un usuario jugador, y escribe `storageState` con cookies de sesión JWT forjadas (admin y jugador) — la misma técnica ya validada manualmente. Los specs configuran torneos vía la API (rápido y estable) y verifican la **interactividad real de la UI** en el navegador.

**Tech Stack:** `@playwright/test`, Next.js 16 dev server, `@libsql/client` (seed), `jose` (firmar cookie HS256). Ya están `@libsql/client` y `jose` como deps; solo falta `@playwright/test`.

**Por qué DB de fichero + cookie forjada:** los secretos de prod (Turso, AUTH_SECRET, Google OAuth) están solo en *Production* y el OAuth real no es automatizable. Una DB de fichero local + JWT firmado con un `AUTH_SECRET` de prueba propio reproduce el entorno sin depender de nada externo ni tocar datos reales.

---

## Contexto del repo (lo que ya existe)

- **App del torneo** (Planes 4-9): rutas API bajo `src/app/api/tournaments/**`, admin bajo `src/app/admin/tournaments/**`, pública `src/app/(public)/tournaments/[id]/page.tsx`.
- **Auth**: sesión = cookie `session` con JWT `jose` HS256 firmado por `process.env.AUTH_SECRET` (`src/lib/auth/jwt.ts`). `getSession` (`src/lib/auth/session.ts`) verifica la cookie, carga el `user` por id y su `player`. `requireAdmin` exige `role==='admin'`. `getSession` es tolerante a fallos de DB (devuelve null).
- **Bootstrap de esquema** (endpoints POST sin auth): `/api/init-db` (players, matches, match_sets), `/api/migrate-auth` (users; crea un admin desde `ADMIN_EMAIL`), `/api/migrate-tournaments` (tablas `tournament*`).
- **Selectores estables ya disponibles** (no hace falta tocar componentes):
  - Crear torneo (`tournament-form.tsx`): `<Label htmlFor="name">Nombre *</Label>` y `htmlFor="date">Fecha *`; participantes = checkboxes envueltos en `<label>` cuyo texto es el nombre del jugador → nombre accesible = nombre del jugador; botón "Crear torneo".
  - Editor de bloques (`blocks-editor.tsx`): botones "Bloque pozo", "Bloque parejas fijas", "Guardar bloques". Un bloque pozo recién añadido trae valores por defecto válidos (nombre "Pozo", 90 min, timed 15 punto de oro, ronda 15; `participantOrder` se autocompleta con todos los participantes).
  - Panel (`[id]/page.tsx`): "Editar bloques", botón "Generar parrilla" (si hay bloques), "Ver parrilla" (si status≠draft), texto "Sin bloques." cuando no hay.
  - Parrilla (`schedule-match.tsx`): botón "Resultado", inputs con `aria-label` "Marcador equipo A"/"Marcador equipo B", botón "Guardar"; partido completado muestra `Badge` con `{a}–{b}` (guion largo U+2013).
  - Pública: encabezado con el nombre del torneo; tarjeta "Tu próximo partido" si el visitante logueado es participante; filas de solo lectura (sin botón "Resultado").
- **DDL de tablas torneo**: `src/lib/tournament/schema-ddl.ts` (no se usa aquí; las migraciones por endpoint cubren todo).

---

## File Structure

- **Modify:** `package.json` — devDependency `@playwright/test` + scripts `e2e`, `e2e:ui`, `dev:e2e`.
- **Modify:** `.gitignore` — artefactos de Playwright + DB/cookies de test.
- **Create:** `playwright.config.ts` — config raíz (webServer + globalSetup + baseURL).
- **Create:** `e2e/global-setup.ts` — migra, siembra y escribe storageStates.
- **Create:** `e2e/helpers.ts` — contexto API admin + `setupGeneratedTournament`.
- **Create:** `e2e/admin-create.spec.ts` — crear torneo por la UI.
- **Create:** `e2e/admin-blocks.spec.ts` — añadir+guardar un bloque pozo por la UI.
- **Create:** `e2e/admin-result.spec.ts` — registrar resultado por la UI + marcador.
- **Create:** `e2e/public-view.spec.ts` — vista pública de solo lectura + "tu próximo partido".
- **Create:** `e2e/README.md` — cómo correr la suite.

---

## Task 1: Instalar Playwright + scripts + gitignore

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Instalar la dependencia y el navegador**

Run:
```bash
npm install -D @playwright/test
npx playwright install chromium
```
Expected: `@playwright/test` añadido a `devDependencies`; descarga de Chromium completada (puede tardar).

- [ ] **Step 2: Añadir scripts a `package.json`**

En el bloque `"scripts"`, añade estas tres entradas (junto a las existentes `test`, `lint`, etc.):

```json
    "dev:e2e": "next dev -p 3100",
    "e2e": "playwright test",
    "e2e:ui": "playwright test --ui"
```

- [ ] **Step 3: Ignorar artefactos en `.gitignore`**

Añade al final de `.gitignore`:

```
# Playwright / e2e
/test-results/
/playwright-report/
/blob-report/
/playwright/.cache/
/e2e/.auth/
/e2e/test.db
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "test(e2e): instala @playwright/test + scripts e ignores"
```

---

## Task 2: Configuración de Playwright

**Files:**
- Create: `playwright.config.ts`

- [ ] **Step 1: Crear `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';

// Puerto y secretos de prueba (NO los de producción). La DB es un fichero aislado.
const PORT = 3100;
export const BASE_URL = `http://localhost:${PORT}`;
const TEST_AUTH_SECRET = 'e2e-secret-no-prod';
const TEST_ADMIN_EMAIL = 'e2e-admin@test.com';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false, // comparten una DB de fichero; en serie evita carreras
  workers: 1,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  webServer: {
    // Borra la DB y arranca el dev server con env de prueba. La DB la crean las migraciones del globalSetup.
    command: `rm -f e2e/test.db && TURSO_DATABASE_URL=file:./e2e/test.db TURSO_AUTH_TOKEN= AUTH_SECRET=${TEST_AUTH_SECRET} ADMIN_EMAIL=${TEST_ADMIN_EMAIL} npm run dev:e2e`,
    // Readiness contra un endpoint sin DB (el manifest es estático): evita el huevo-y-gallina con las migraciones.
    url: `${BASE_URL}/manifest.webmanifest`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});

export const TEST_ENV = { AUTH_SECRET: TEST_AUTH_SECRET, ADMIN_EMAIL: TEST_ADMIN_EMAIL, DB_URL: 'file:./e2e/test.db' };
```

- [ ] **Step 2: Verificar que Playwright lee la config**

Run: `npx playwright test --list 2>&1 | head -5`
Expected: lista vacía o "No tests found" (aún no hay specs) sin errores de configuración. (Si descarga/arranca el webServer, basta con que no falle el parseo de la config; corta con Ctrl-C si se queda esperando.)

- [ ] **Step 3: Commit**

```bash
git add playwright.config.ts
git commit -m "test(e2e): configuración de Playwright (webServer + DB aislada)"
```

---

## Task 3: Global setup — migraciones, seed y cookies forjadas

**Files:**
- Create: `e2e/global-setup.ts`

- [ ] **Step 1: Crear `e2e/global-setup.ts`**

```ts
import { createClient } from '@libsql/client';
import { SignJWT } from 'jose';
import { mkdir, writeFile } from 'node:fs/promises';
import { BASE_URL, TEST_ENV } from '../playwright.config';

async function sessionStorageState(userId: string, role: 'admin' | 'player', secret: string) {
  const token = await new SignJWT({ userId, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(new TextEncoder().encode(secret));
  return {
    cookies: [{
      name: 'session', value: token, domain: 'localhost', path: '/',
      expires: -1, httpOnly: true, secure: false, sameSite: 'Lax' as const,
    }],
    origins: [],
  };
}

export default async function globalSetup() {
  // 1) Migraciones de esquema (el dev server ya está arriba; estos endpoints no requieren auth).
  for (const ep of ['init-db', 'migrate-auth', 'migrate-tournaments']) {
    const res = await fetch(`${BASE_URL}/api/${ep}`, { method: 'POST' });
    if (!res.ok) throw new Error(`Migración /api/${ep} falló: ${res.status}`);
  }

  // 2) Seed directo en la DB de fichero.
  const db = createClient({ url: TEST_ENV.DB_URL });
  for (let i = 1; i <= 8; i++) {
    await db.execute({ sql: 'INSERT OR IGNORE INTO players (id, name) VALUES (?, ?)', args: [`pl${i}`, `Jugador ${i}`] });
  }
  // Usuario "jugador" ligado a pl1 (para probar "tu próximo partido").
  const playerUserId = 'e2e-player-user';
  await db.execute({
    sql: 'INSERT OR IGNORE INTO users (id, email, role, player_id) VALUES (?, ?, ?, ?)',
    args: [playerUserId, 'pl1@test.com', 'player', 'pl1'],
  });
  // El usuario admin lo creó migrate-auth desde ADMIN_EMAIL.
  const adminRow = await db.execute("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  const adminId = adminRow.rows[0]?.id as string | undefined;
  if (!adminId) throw new Error('No hay usuario admin (¿ADMIN_EMAIL no se aplicó en migrate-auth?)');

  // 3) storageStates con cookies de sesión forjadas.
  await mkdir('e2e/.auth', { recursive: true });
  await writeFile('e2e/.auth/admin.json', JSON.stringify(await sessionStorageState(adminId, 'admin', TEST_ENV.AUTH_SECRET)));
  await writeFile('e2e/.auth/player.json', JSON.stringify(await sessionStorageState(playerUserId, 'player', TEST_ENV.AUTH_SECRET)));
}
```

- [ ] **Step 2: Verificar (se ejecuta junto con el primer spec en la Task 5; aquí solo comprobamos que compila)**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "global-setup" || echo "sin errores de tipos en global-setup"`
Expected: "sin errores de tipos en global-setup". (Si `tsconfig` no incluye `e2e/`, este check no reporta nada; es aceptable — Playwright transpila sus propios ficheros.)

- [ ] **Step 3: Commit**

```bash
git add e2e/global-setup.ts
git commit -m "test(e2e): global setup (migraciones + seed + cookies forjadas)"
```

---

## Task 4: Helpers de test (contexto admin + alta de torneo por API)

**Files:**
- Create: `e2e/helpers.ts`

- [ ] **Step 1: Crear `e2e/helpers.ts`**

```ts
import { expect, type APIRequestContext, type Playwright } from '@playwright/test';
import { BASE_URL } from '../playwright.config';

export const PLAYERS = ['pl1', 'pl2', 'pl3', 'pl4', 'pl5', 'pl6', 'pl7', 'pl8'];

// Contexto de API autenticado como admin (independiente del storageState del test).
export async function newAdminRequest(playwright: Playwright): Promise<APIRequestContext> {
  return playwright.request.newContext({ baseURL: BASE_URL, storageState: 'e2e/.auth/admin.json' });
}

// Crea un torneo completo (cascarón + bloques pozo y fixed_pairs + parrilla generada) vía API.
// Devuelve el id. Requiere un contexto admin.
export async function setupGeneratedTournament(request: APIRequestContext, name = 'E2E Torneo'): Promise<string> {
  const create = await request.post('/api/tournaments', {
    data: {
      name, date: '2026-06-20', location: 'Club E2E',
      courts: [
        { label: 'Pista 1', order: 1, availableFrom: '17:00', availableTo: '20:00' },
        { label: 'Pista 2', order: 2, availableFrom: '17:00', availableTo: '20:00' },
      ],
      participantPlayerIds: PLAYERS,
    },
  });
  expect(create.status(), 'crear torneo').toBe(201);
  const { id } = await create.json();

  const blocks = await request.put(`/api/tournaments/${id}/blocks`, {
    data: {
      blocks: [
        {
          type: 'pozo', name: 'Pozo de calentamiento', durationMinutes: 60,
          matchFormat: { kind: 'timed', minutes: 15, tieRule: 'golden_point' },
          bufferMinutes: 0, roundMinutes: 15, participantOrder: PLAYERS,
        },
        {
          type: 'fixed_pairs', name: 'Torneo', durationMinutes: 120,
          matchFormat: { kind: 'best_of_3' }, bufferMinutes: 5,
          knockout: true, advancePerGroup: 1, groupNames: ['A', 'B'],
          pairs: [
            { player1Id: 'pl1', player2Id: 'pl2', seed: 1, groupName: 'A' },
            { player1Id: 'pl3', player2Id: 'pl4', seed: 2, groupName: 'A' },
            { player1Id: 'pl5', player2Id: 'pl6', seed: 3, groupName: 'B' },
            { player1Id: 'pl7', player2Id: 'pl8', seed: 4, groupName: 'B' },
          ],
        },
      ],
    },
  });
  expect(blocks.status(), 'guardar bloques').toBe(200);

  const gen = await request.post(`/api/tournaments/${id}/generate`);
  expect(gen.status(), 'generar parrilla').toBe(200);

  return id;
}
```

- [ ] **Step 2: Commit**

```bash
git add e2e/helpers.ts
git commit -m "test(e2e): helpers (contexto admin + alta de torneo por API)"
```

---

## Task 5: Spec — crear torneo por la UI (admin)

**Files:**
- Create: `e2e/admin-create.spec.ts`

- [ ] **Step 1: Crear `e2e/admin-create.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test.use({ storageState: 'e2e/.auth/admin.json' });

test('admin crea un torneo desde el formulario', async ({ page }) => {
  await page.goto('/admin/tournaments/new');

  await page.getByLabel('Nombre').fill('E2E Crear UI');
  await page.getByLabel('Fecha').fill('2026-07-01');

  // Selecciona 4 participantes (sembrados en global-setup: "Jugador 1".."Jugador 8").
  for (const n of ['Jugador 1', 'Jugador 2', 'Jugador 3', 'Jugador 4']) {
    await page.getByRole('checkbox', { name: n }).check();
  }

  await page.getByRole('button', { name: 'Crear torneo' }).click();

  // Vuelve al listado y el torneo aparece.
  await expect(page).toHaveURL(/\/admin\/tournaments$/);
  await expect(page.getByRole('link', { name: 'E2E Crear UI' })).toBeVisible();

  // El panel muestra que aún no hay bloques.
  await page.getByRole('link', { name: 'E2E Crear UI' }).click();
  await expect(page).toHaveURL(/\/admin\/tournaments\/[0-9a-f-]+$/);
  await expect(page.getByText('Sin bloques.')).toBeVisible();
});
```

- [ ] **Step 2: Ejecutar el spec**

Run: `npx playwright test e2e/admin-create.spec.ts`
Expected: 1 passed. (En la primera ejecución Playwright arranca el webServer y corre el globalSetup.)

- [ ] **Step 3: Commit**

```bash
git add e2e/admin-create.spec.ts
git commit -m "test(e2e): crear torneo por la UI"
```

---

## Task 6: Spec — editor de bloques por la UI (admin)

**Files:**
- Create: `e2e/admin-blocks.spec.ts`

- [ ] **Step 1: Crear `e2e/admin-blocks.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { newAdminRequest, PLAYERS } from './helpers';

test.use({ storageState: 'e2e/.auth/admin.json' });

test('admin añade y guarda un bloque pozo desde el editor', async ({ page, playwright }) => {
  // Cascarón vía API (sin bloques) para centrar el test en el editor.
  const admin = await newAdminRequest(playwright);
  const create = await admin.post('/api/tournaments', {
    data: {
      name: 'E2E Bloques', date: '2026-07-02',
      courts: [{ label: 'Pista 1', order: 1, availableFrom: '17:00', availableTo: '20:00' }],
      participantPlayerIds: PLAYERS,
    },
  });
  expect(create.status()).toBe(201);
  const { id } = await create.json();
  await admin.dispose();

  await page.goto(`/admin/tournaments/${id}/blocks`);

  // Añade un bloque pozo (trae valores por defecto válidos) y guarda.
  await page.getByRole('button', { name: 'Bloque pozo' }).click();
  await expect(page.getByText('1. Pozo')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar bloques' }).click();

  // Vuelve al panel: el bloque aparece y ya se puede generar.
  await expect(page).toHaveURL(new RegExp(`/admin/tournaments/${id}$`));
  await expect(page.getByText('1. Pozo')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generar parrilla' })).toBeVisible();
});
```

- [ ] **Step 2: Ejecutar el spec**

Run: `npx playwright test e2e/admin-blocks.spec.ts`
Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add e2e/admin-blocks.spec.ts
git commit -m "test(e2e): editor de bloques por la UI"
```

---

## Task 7: Spec — registrar resultado por la UI (admin)

**Files:**
- Create: `e2e/admin-result.spec.ts`

- [ ] **Step 1: Crear `e2e/admin-result.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { newAdminRequest, setupGeneratedTournament } from './helpers';

test.use({ storageState: 'e2e/.auth/admin.json' });

test('admin registra un resultado en la parrilla y se ve el marcador', async ({ page, playwright }) => {
  const admin = await newAdminRequest(playwright);
  const id = await setupGeneratedTournament(admin, 'E2E Resultado');
  await admin.dispose();

  await page.goto(`/admin/tournaments/${id}/schedule`);

  // Abre el primer partido jugable y mete 6–2.
  await page.getByRole('button', { name: 'Resultado' }).first().click();
  await page.getByLabel('Marcador equipo A').fill('6');
  await page.getByLabel('Marcador equipo B').fill('2');
  await page.getByRole('button', { name: 'Guardar' }).click();

  // Tras refrescar, el marcador aparece como badge (guion largo U+2013).
  await expect(page.getByText('6–2')).toBeVisible();
  // Y la clasificación del pozo ya está presente.
  await expect(page.getByText('Clasificación')).toBeVisible();
});
```

- [ ] **Step 2: Ejecutar el spec**

Run: `npx playwright test e2e/admin-result.spec.ts`
Expected: 1 passed.

- [ ] **Step 3: Commit**

```bash
git add e2e/admin-result.spec.ts
git commit -m "test(e2e): registrar resultado por la UI"
```

---

## Task 8: Spec — vista pública + "tu próximo partido"

**Files:**
- Create: `e2e/public-view.spec.ts`

- [ ] **Step 1: Crear `e2e/public-view.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { newAdminRequest, setupGeneratedTournament } from './helpers';

test.describe('vista pública (anónima)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('muestra parrilla en solo lectura, sin botones de resultado', async ({ page, playwright }) => {
    const admin = await newAdminRequest(playwright);
    const id = await setupGeneratedTournament(admin, 'E2E Pública');
    await admin.dispose();

    await page.goto(`/tournaments/${id}`);
    await expect(page.getByRole('heading', { name: 'E2E Pública' })).toBeVisible();
    await expect(page.getByText('Jugador 1').first()).toBeVisible();
    // Solo lectura: no hay botones de "Resultado".
    await expect(page.getByRole('button', { name: 'Resultado' })).toHaveCount(0);
  });
});

test.describe('vista pública (jugador logueado)', () => {
  test.use({ storageState: 'e2e/.auth/player.json' });

  test('resalta "Tu próximo partido" al participante', async ({ page, playwright }) => {
    const admin = await newAdminRequest(playwright);
    const id = await setupGeneratedTournament(admin, 'E2E Próximo');
    await admin.dispose();

    await page.goto(`/tournaments/${id}`);
    await expect(page.getByText('Tu próximo partido')).toBeVisible();
  });
});
```

- [ ] **Step 2: Ejecutar el spec**

Run: `npx playwright test e2e/public-view.spec.ts`
Expected: 2 passed.

- [ ] **Step 3: Commit**

```bash
git add e2e/public-view.spec.ts
git commit -m "test(e2e): vista pública + tu próximo partido"
```

---

## Task 9: Verificación final + documentación

**Files:**
- Create: `e2e/README.md`

- [ ] **Step 1: Ejecutar TODA la suite**

Run: `npm run e2e`
Expected: 5 tests passed (admin-create 1, admin-blocks 1, admin-result 1, public-view 2). Si algún spec falla por timing del primer arranque, reejecuta `npm run e2e` (el webServer ya estará caliente).

- [ ] **Step 2: Comprobar que los unit tests y tipos siguen verdes**

Run: `npx vitest run src/lib/tournament && npx tsc --noEmit | grep -c "error TS"`
Expected: vitest 110+ passed; `0` errores de tipos nuevos.

- [ ] **Step 3: Crear `e2e/README.md`**

```markdown
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

## Qué cubre

- **admin-create**: crear torneo desde el formulario.
- **admin-blocks**: añadir y guardar un bloque en el editor.
- **admin-result**: registrar un resultado y ver el marcador + clasificación.
- **public-view**: parrilla pública de solo lectura y "tu próximo partido".
```

- [ ] **Step 4: Lint y commit final**

Run: `npx eslint e2e playwright.config.ts || echo "revisar lint de e2e (puede requerir ignore si molesta)"`

```bash
git add e2e/README.md
git commit -m "test(e2e): README de la suite Playwright"
git push origin worktree-tournament-builder
```

---

## Self-review (cobertura vs. objetivo)

- **Flujo admin completo en navegador**: crear (Task 5) → editor de bloques (Task 6) → generar+resultado+clasificación (Task 7). ✓
- **Vista pública de solo lectura** (sin botones de resultado): Task 8. ✓
- **"Tu próximo partido"** con sesión de jugador participante: Task 8. ✓
- **Aislamiento de prod** (DB de fichero + cookie forjada, sin OAuth ni Turso): Tasks 2-3. ✓
- **Reutiliza la API para el setup** y la UI para las aserciones (specs estables): Task 4. ✓

**Notas / posibles ajustes durante la ejecución:**
- Si `getByLabel('Nombre')` capturara más de un elemento en la página de crear, usar `{ exact: true }` con el texto real del label (`'Nombre *'`).
- Si ESLint se queja de los ficheros `e2e/**` (globals de Playwright, imports de devDependency), añadir `e2e/**` a los `ignores` del flat config o un override que permita devDependencies en tests.
- Si el primer `npm run e2e` agota el timeout del webServer por la compilación inicial de Next, subir `webServer.timeout` o reejecutar.
- `globalSetup` importa `BASE_URL`/`TEST_ENV` desde `playwright.config.ts`; si Playwright se queja del import, mover esas constantes a `e2e/constants.ts` e importarlas en ambos.
- Para correr en CI: `CI=1`, cachear `~/.cache/ms-playwright`, y `npx playwright install --with-deps chromium`.
```
