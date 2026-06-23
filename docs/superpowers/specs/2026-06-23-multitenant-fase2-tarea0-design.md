# Fase 2 · Tarea 0 — Entornos de preview con BBDD aislada (diseño)

**Fecha:** 2026-06-23
**Estado:** brainstormeado y aprobado. Siguiente paso: `writing-plans`.
**Contexto previo:** `docs/superpowers/specs/2026-06-23-multitenant-fase2-arranque.md` (groundwork) fija la
Tarea 0 como el primer trabajo de Fase 2: montar previews que no toquen producción **antes** de
escribir onboarding. Este documento es el diseño cerrado de **la parte de código (Claude)** de esa
Tarea 0.

---

## 1. Objetivo y alcance

**Objetivo:** poder probar Fase 2 (crear grupos, onboarding, usuarios que reclaman ficha) en previews
y en dev local **sin ensuciar la base de Lomeros real** y **sin pasar por Google OAuth**.

Aislar PRO no requiere cambios de código: el cliente DB lee `TURSO_DATABASE_URL` /
`TURSO_AUTH_TOKEN` del entorno (`src/lib/db/index.ts:5-8`). El aislamiento es puramente cuestión de a
qué apunta cada scope de Vercel — eso lo hace el usuario (ver §5). Lo que construye Claude es la
**maquinaria para usar y sembrar** ese entorno aislado.

**Entregables de código (este spec):**
- A. Guard compartido `isDevToolingEnabled()`.
- B. Endpoint `POST /api/auth/dev-login` (forja sesión).
- C. Página `/dev-login` (UI con botones).
- D. Endpoint `POST /api/dev/seed-staging` (migraciones idempotentes + "Grupo Test" demo).
- E. Cobertura: unit del guard + e2e de dev-login y seed.
- F. Actualizar docs/memoria de dev local.

**Fuera de alcance (Fase 2 propia, con su propio brainstorming):** onboarding self-service, routing
por slug `/g/[slug]`, conmutador de grupo del súper-admin, y la deuda de `requireAdmin` (que hoy
resuelve el rol sobre el grupo por defecto).

---

## 2. Hallazgos del código actual (verificados)

- **El login real ya firma solo `{ userId }`**: `src/app/api/auth/callback/route.ts:33` llama
  `signSession({ userId })` (helper en `src/lib/auth/jwt.ts`, `HS256` + `AUTH_SECRET`, exp `30d`).
- **El rol sale de `memberships`**, no del JWT: `getSession()` en `src/lib/auth/session.ts:40-69` lee
  el JWT → `userId` → consulta `users`, grupo por defecto y `memberships` (rol + playerId).
- **`getGroupContext(targetGroupId?)`** ya acepta `targetGroupId` (`src/lib/auth/group-context.ts:79-102`).
- **`VERCEL_ENV` no se usa hoy** en `src/`; solo `NODE_ENV` para el flag `secure` de cookies. El guard
  por `VERCEL_ENV` es terreno nuevo.
- **No existe ningún dev-login HTTP**; solo el forjado de cookies de e2e en `e2e/global-setup.ts`. Las
  rutas `migrate-*` son `POST` sin guard (`src/app/api/migrate-*/route.ts`).
- **Cookie de sesión** (referencia del callback real): `name: 'session'`, `httpOnly: true`,
  `secure: process.env.NODE_ENV === 'production'`, `sameSite: 'lax'`, `maxAge: 60*60*24*30`, `path: '/'`.
- **Deuda menor a limpiar de paso:** `e2e/global-setup.ts:7` aún firma `{ userId, role }`; el `role` ya
  se ignora al verificar → simplificar a `{ userId }`.

---

## 3. Componentes

### A. Guard compartido — `src/lib/auth/dev-login.ts`
```ts
export function isDevToolingEnabled(): boolean {
  return process.env.VERCEL_ENV !== 'production';
}
```
- Local (`VERCEL_ENV` indefinido) → `true`. Preview (`'preview'`) → `true`. Producción
  (`'production'`) → `false`.
- **Única fuente de verdad**: la usan la página (C), el endpoint de login (B) y el de seed (D).
- Es un check de **entorno**, no un flag que se pueda activar por error en prod: en producción Vercel
  fija `VERCEL_ENV='production'` y el guard cierra.

### B. Endpoint `POST /api/auth/dev-login`
- Si `!isDevToolingEnabled()` → `403`.
- Body: `{ email: string, name?: string }`.
- Busca usuario por email en `users`. **Si no existe, lo crea** (fila `users` mínima, **sin
  membership**) → es el estado exacto de "usuario nuevo" para probar onboarding.
- Forja la sesión **reutilizando `signSession({ userId })`** y setea la cookie `session` con los
  mismos atributos que el callback real (§2). Respuesta JSON `{ ok: true, userId }`.
- No toca Google ni `state` CSRF: es forja directa, sólo viable porque el guard la limita a no-prod.

### C. Página — `src/app/dev-login/page.tsx`
- Server component. Si `!isDevToolingEnabled()` → `notFound()` (404, no existe en prod).
- Contenido:
  - Lista de usuarios existentes con su rol/grupo (de `users` + `memberships`), cada uno con un botón
    **"Entrar como…"**.
  - Campo de email libre + botón **"Entrar como nuevo"** (crea usuario fresco sin membership).
  - Cartel visible **"SOLO ENTORNOS DE PRUEBA"**.
- Cada acción hace `POST` al endpoint B y redirige a `/`.

### D. Endpoint `POST /api/dev/seed-staging`
- Guardado por `isDevToolingEnabled()` (→ `403` en prod).
- **Idempotente** y **server-side** (corre en el deploy, con la conexión de staging del entorno → el
  token de Turso nunca sale de Vercel). Dos fases:
  1. **Esquema:** corre las funciones de migración **en orden, llamándolas directamente** (no
     self-fetch HTTP). Orden de referencia (superset del que usa `e2e/global-setup.ts`):
     `init-db → migrate-auth → migrate-db → migrate-avatars → migrate-push →
     migrate-bets-odds-nullable → migrate-timba-v2 → migrate-tournaments → migrate-tournaments-v2 →
     migrate-multitenant`. (Durante el plan se verifica que cada `route.ts` exponga una función
     importable; si alguna sólo tiene lógica inline en el handler, se extrae a función reutilizable.)
  2. **Seed demo:** siembra un **"Grupo Test" demo** — grupo + un admin con `membership(admin)` + unos
     jugadores — con id/slug claramente demo (p. ej. `grupo-demo`) para **no colisionar** con el
     `grupo-test` que usa e2e. Todo `INSERT OR IGNORE`.
- Devuelve reporte JSON (qué migraciones corrieron, qué se sembró).
- **Reset** = recrear la DB Turso de staging + 1 curl a este endpoint. Barato.

### E. Cobertura
- **Unit:** `isDevToolingEnabled()` con `VERCEL_ENV` = undefined / `'preview'` / `'production'`.
- **e2e `e2e/dev-login.spec.ts`:**
  1. `/dev-login` → "Entrar como" un usuario sembrado → queda autenticado (p. ej. `/me` o la home
     reflejan la sesión).
  2. Email nuevo → "Entrar como nuevo" → sesión seteada y el usuario **sin membership**.
  3. La cookie `session` queda presente tras el login.
- **e2e seed:** `POST /api/dev/seed-staging` crea el grupo demo; un 2º `POST` no rompe (idempotencia).
- **Limpieza:** `e2e/global-setup.ts:7` → firmar `{ userId }` en vez de `{ userId, role }`.

> Nota sobre el guard en prod: e2e corre con `VERCEL_ENV` indefinido (no se puede simular
> `'production'` cómodamente en la suite), así que el caso "bloqueado en prod" se cubre con el **unit
> test** de `isDevToolingEnabled()`, no con e2e.

### F. Docs/memoria
Actualizar al cierre:
- `local-dev-db-env`: el scope **Development** de Vercel ya apunta a staging → `vercel env pull` baja
  URL/token de staging (no-sensitive) y `npm run dev` funciona contra staging sin tocar PRO.
- `local-dev-auth-secret`: sigue valiendo que `AUTH_SECRET` es *sensitive* (a mano tras el pull), pero
  para probar páginas autenticadas ya **no** hace falta forjar la cookie a mano: usar `/dev-login`.

---

## 4. Flujo de datos (dev-login)

```
[Página /dev-login]  --POST {email}-->  [/api/auth/dev-login]
   (guard: notFound si prod)               (guard: 403 si prod)
                                           busca/crea user en `users`
                                           signSession({ userId })  ← mismo helper que el login real
                                           Set-Cookie: session=<jwt>
   <--------------------- 200 + Set-Cookie ----------------------
[redirect a /]  →  getSession() lee userId → memberships → rol (o ninguno → onboarding en Fase 2)
```

El usuario "nuevo" (sin membership) hoy aterriza donde aterriza un usuario sin grupo; en Fase 2 ese
es justo el punto de entrada del onboarding.

---

## 5. Reparto y secuencia

- **Ahora (Claude — todo testeable contra la SQLite local de e2e, NO depende de que exista staging):**
  componentes A–F.
- **Usuario (interactivo, en sus cuentas):**
  - `turso db create lomeros-staging` (+ url/token).
  - `vercel env add TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` en **preview** y **development** → staging
    (NO tocar Production).
  - Set propio de secretos en **Preview**: `AUTH_SECRET`, `CRON_SECRET`, claves VAPID, token de Blob
    (idealmente un **store de Blob separado** para no mezclar avatares de staging con los de PRO).
  - Deploy de preview.
- **Verificación conjunta:** el preview pega a staging (no a PRO) → curl `POST /api/dev/seed-staging`
  en la URL de preview → abrir `/dev-login` y clicar.

### Checklist de la Tarea 0 (global, del doc de arranque)
- [ ] `turso db create lomeros-staging` + URL/token. *(usuario)*
- [ ] `vercel env add TURSO_*` en preview + development → staging. *(usuario)*
- [ ] Verificar que un preview deploy levanta contra staging (no PRO). *(conjunto)*
- [ ] Secretos propios en Preview (`AUTH_SECRET`, `CRON_SECRET`, VAPID, Blob). *(usuario)*
- [ ] Guard `isDevToolingEnabled()` + unit. *(Claude)*
- [ ] Dev-login: endpoint + página + e2e. *(Claude)*
- [ ] Endpoint de seed de staging (migrate-* + "Grupo Test" demo) + e2e. *(Claude)*
- [ ] `vercel env pull` local apunta a staging → `npm run dev` sin tocar PRO. *(usuario)*
- [ ] Docs/memoria de dev local actualizada. *(Claude)*

---

## 6. Riesgos y decisiones

- **Defensa en profundidad del guard:** la spec pide sólo `VERCEL_ENV !== 'production'`. Se mantiene
  así (las URLs de preview no exponen datos reales porque pegan a staging). Si en el futuro se quiere
  endurecer, se puede añadir un secreto compartido al endpoint sin cambiar el contrato de la página.
- **Colisión de seeds:** el "Grupo Test" demo usa un id/slug distinto al `grupo-test` de e2e para no
  pisar las aserciones de no-fuga.
- **Migraciones como funciones:** si alguna `migrate-*/route.ts` tiene la lógica inline en el handler,
  se extrae a una función importable para que el endpoint de seed la reutilice sin self-fetch.
