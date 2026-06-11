# Auth con Google + Roles — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir login con Google y roles (admin/jugador) reutilizando los jugadores actuales, con lista blanca gestionada desde el formulario de admin y zona privada `/me` para cada jugador.

**Architecture:** OAuth 2.0/OIDC de Google "a mano". Sesión stateless en cookie httpOnly con un JWT firmado por `jose`. Una tabla `users` separada de `players` (email + rol + vínculo opcional a jugador) es la lista blanca. `proxy.ts` hace control de acceso optimista (solo lee el JWT, sin DB). Las páginas/route handlers usan `getSession()` (lee cookie + carga user/player de la DB) para autorización segura.

**Tech Stack:** Next.js 16.2.2 (App Router), React 19, Drizzle ORM + libSQL/Turso, `jose` (JWT), Vercel.

**Spec:** `docs/superpowers/specs/2026-06-11-auth-roles-design.md`

---

## Notas de entorno (leer antes de empezar)

- **La DB Turso solo es accesible desde Vercel** (las env vars `TURSO_*` están en Production). Por eso este repo NO usa `drizzle-kit migrate` local, sino **endpoints HTTP** que ejecutan SQL crudo (`/api/init-db`, `/api/migrate-db`). Este plan sigue ese patrón: la tabla `users` se crea con un endpoint `/api/migrate-auth` que se invoca **una vez tras desplegar**.
- Por la misma razón, los pasos "verificar" de tareas que tocan DB usan **`npm run build`** (typecheck) en local, y la verificación funcional real es **manual en el preview/prod de Vercel** tras desplegar. Esto se indica en cada tarea.
- Tests unitarios (`npm test`, vitest) solo cubren **lógica pura** (no DB, no red): el round-trip del JWT y la decisión de autorización. Es lo que hay hoy en el repo (los `*.test.ts` son funciones puras).
- `cookies()` de `next/headers` es **async** en Next 16: siempre `await cookies()`.
- `proxy.ts` usa **export nombrado** `proxy` + `export const config` (ya funciona así en el repo). No lo cambies a default export.

## Dependencias a instalar

```bash
npm install jose
```

(`jose` es compatible con el runtime de Next y es la librería recomendada por la guía oficial de auth de Next 16.)

## Variables de entorno necesarias

Añadir en `.env.local` (local) y en **Vercel → Project → Settings → Environment Variables (Production)**:

| Var | Ejemplo / cómo | Dónde se usa |
|-----|----------------|--------------|
| `GOOGLE_CLIENT_ID` | de Google Cloud Console | `google.ts` |
| `GOOGLE_CLIENT_SECRET` | de Google Cloud Console | `google.ts` (token exchange) |
| `AUTH_SECRET` | `openssl rand -base64 32` | `jwt.ts` (firma del JWT) |
| `APP_URL` | `https://<tu-dominio>` (sin slash final) | construir redirect URI |
| `ADMIN_EMAIL` | `garaujoriestra@gmail.com` | seed admin en `/api/migrate-auth` |

Las antiguas `ADMIN_PASSWORD` / `ADMIN_SECRET` quedan sin uso al final (se pueden borrar tras verificar).

## Estructura de archivos

**Crear:**
- `src/lib/auth/jwt.ts` — firma/verifica el JWT de sesión (jose puro, edge-safe, sin DB). Tipo `SessionPayload`.
- `src/lib/auth/authorize.ts` — `decideAccess(path, payload)` puro (usado por proxy). Testeable.
- `src/lib/auth/session.ts` — `createSession`, `deleteSession`, `getSession` (cookie + DB).
- `src/lib/auth/users.ts` — DAL de `users`: `getUserByEmail`, `getUserById`, `upsertPlayerUser`.
- `src/lib/auth/google.ts` — `buildGoogleAuthUrl`, `exchangeCodeForIdToken`, `verifyGoogleIdToken`.
- `src/app/api/auth/login/route.ts` — GET: redirige a Google.
- `src/app/api/auth/callback/route.ts` — GET: callback OAuth.
- `src/app/api/auth/logout/route.ts` — POST: borra sesión.
- `src/app/api/migrate-auth/route.ts` — POST: crea tabla `users` + seed admin.
- `src/app/api/me/route.ts` — PATCH: edita el perfil propio.
- `src/app/unauthorized/page.tsx` — pantalla "cuenta no autorizada".
- `src/components/players/player-profile-view.tsx` — vista de perfil reutilizable (extraída de la página actual).
- `src/lib/players/profile-data.ts` — `loadPlayerProfile(id)` (carga + cálculos, extraído de la página actual).
- `src/app/me/layout.tsx` — layout de la zona privada (navbar + bottom-nav con sesión).
- `src/app/me/page.tsx` — perfil propio.
- `src/app/me/edit/page.tsx` — editar perfil propio.
- `src/components/me/me-profile-form.tsx` — formulario cliente de edición propia.
- `src/lib/auth/jwt.test.ts`, `src/lib/auth/authorize.test.ts` — tests puros.

**Modificar:**
- `src/lib/db/schema.ts` — añadir tabla `users` + tipos.
- `src/app/api/init-db/route.ts` — incluir creación de `users` para instalaciones nuevas.
- `src/proxy.ts` — control de acceso por rol usando `decideAccess`.
- `src/app/login/page.tsx` — botón "Entrar con Google" (quitar contraseña).
- `src/components/admin/player-form.tsx` — campo "Email de Gmail".
- `src/app/api/players/route.ts` — POST acepta `email` y hace upsert en `users`.
- `src/app/api/players/[id]/route.ts` — PUT acepta `email` y hace upsert; GET no cambia.
- `src/app/admin/players/[id]/edit/page.tsx` — precargar el email vinculado.
- `src/app/(public)/players/[id]/page.tsx` — pasar a wrapper fino que usa `PlayerProfileView`.
- `src/components/shared/navbar.tsx` — navegación según sesión + logout nuevo.
- `src/components/shared/bottom-nav.tsx` — (opcional) enlace "Mi perfil".

**Borrar (al final, Tarea 14):**
- `src/app/api/login/route.ts`, `src/app/api/logout/route.ts` (reemplazados por `/api/auth/*`).

---

## Task 1: Tabla `users` en el schema + endpoint de migración + seed admin

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `src/app/api/migrate-auth/route.ts`
- Modify: `src/app/api/init-db/route.ts`

- [ ] **Step 1: Añadir la tabla `users` al schema**

En `src/lib/db/schema.ts`, tras el bloque de `players` (después de la línea 16), añade:

```ts
// ─── USERS (cuentas de acceso) ───────────────────────────────────────────────
export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull().unique(),
  role: text('role').notNull().default('player'), // 'admin' | 'player'
  playerId: text('player_id').references(() => players.id, { onDelete: 'set null' }),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});
```

Y al final del archivo (zona de TYPES), añade:

```ts
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

- [ ] **Step 2: Endpoint de migración que crea la tabla y siembra el admin**

Crea `src/app/api/migrate-auth/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

// POST /api/migrate-auth
// Crea la tabla `users` (lista blanca) e inserta el usuario admin.
// Ejecutar UNA vez tras desplegar:  curl -X POST https://<dominio>/api/migrate-auth
export async function POST() {
  try {
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT 'player',
        player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    let adminSeeded = false;
    if (adminEmail) {
      await db.run(sql`
        INSERT INTO users (id, email, role)
        VALUES (${crypto.randomUUID()}, ${adminEmail}, 'admin')
        ON CONFLICT(email) DO UPDATE SET role = 'admin'
      `);
      adminSeeded = true;
    }

    return NextResponse.json({ success: true, adminSeeded });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al migrar auth' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Incluir `users` en init-db (instalaciones nuevas)**

En `src/app/api/init-db/route.ts`, antes del `return NextResponse.json(...)`, añade un bloque más:

```ts
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT 'player',
        player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
```

- [ ] **Step 4: Verificar que compila**

Run: `npm run build`
Expected: build OK, sin errores de tipos. (La migración real se ejecuta tras desplegar — ver Tarea 14.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts src/app/api/migrate-auth/route.ts src/app/api/init-db/route.ts
git commit -m "feat(auth): add users table, migrate-auth endpoint and admin seed"
```

---

## Task 2: Capa JWT de sesión (`jose`)

**Files:**
- Create: `src/lib/auth/jwt.ts`
- Test: `src/lib/auth/jwt.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crea `src/lib/auth/jwt.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { signSession, verifySession } from './jwt';

beforeAll(() => {
  process.env.AUTH_SECRET = 'test-secret-test-secret-test-secret-123';
});

describe('jwt session', () => {
  it('round-trips a payload', async () => {
    const token = await signSession({ userId: 'u1', role: 'admin' });
    const payload = await verifySession(token);
    expect(payload?.userId).toBe('u1');
    expect(payload?.role).toBe('admin');
  });

  it('returns null for a tampered token', async () => {
    const token = await signSession({ userId: 'u1', role: 'player' });
    const bad = token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa');
    expect(await verifySession(bad)).toBeNull();
  });

  it('returns null for undefined', async () => {
    expect(await verifySession(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `npx vitest run src/lib/auth/jwt.test.ts`
Expected: FAIL — "Cannot find module './jwt'".

- [ ] **Step 3: Implementar `jwt.ts`**

Crea `src/lib/auth/jwt.ts`:

```ts
import { SignJWT, jwtVerify } from 'jose';

export type Role = 'admin' | 'player';

export interface SessionPayload {
  userId: string;
  role: Role;
  [key: string]: unknown; // requerido por jose JWTPayload
}

const key = () => new TextEncoder().encode(process.env.AUTH_SECRET);

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(key());
}

export async function verifySession(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    if (typeof payload.userId !== 'string' || typeof payload.role !== 'string') {
      return null;
    }
    return { userId: payload.userId, role: payload.role as Role };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Ejecutar el test y verificar que pasa**

Run: `npx vitest run src/lib/auth/jwt.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/jwt.ts src/lib/auth/jwt.test.ts
git commit -m "feat(auth): JWT session sign/verify with jose"
```

---

## Task 3: Helpers de sesión (cookie + DB)

**Files:**
- Create: `src/lib/auth/session.ts`

- [ ] **Step 1: Implementar `session.ts`**

Crea `src/lib/auth/session.ts`:

```ts
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, players, type Player } from '@/lib/db/schema';
import { signSession, verifySession, type Role } from './jwt';

const COOKIE = 'session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 días

export interface Session {
  userId: string;
  role: Role;
  email: string;
  player: Player | null;
}

export async function createSession(userId: string, role: Role): Promise<void> {
  const token = await signSession({ userId, role });
  const cookieStore = await cookies();
  cookieStore.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE,
    path: '/',
  });
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE);
}

// Autorización SEGURA: lee la cookie y carga user/player frescos de la DB.
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const payload = await verifySession(cookieStore.get(COOKIE)?.value);
  if (!payload) return null;

  const [user] = await db.select().from(users).where(eq(users.id, payload.userId));
  if (!user) return null;

  let player: Player | null = null;
  if (user.playerId) {
    const [p] = await db.select().from(players).where(eq(players.id, user.playerId));
    player = p ?? null;
  }

  return { userId: user.id, role: user.role as Role, email: user.email, player };
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npm run build`
Expected: build OK (puede aún no usarse en ningún sitio; basta con que tipe-checkee).

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/session.ts
git commit -m "feat(auth): session cookie helpers (create/delete/getSession)"
```

---

## Task 4: DAL de usuarios (lista blanca + upsert)

**Files:**
- Create: `src/lib/auth/users.ts`

- [ ] **Step 1: Implementar `users.ts`**

Crea `src/lib/auth/users.ts`:

```ts
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, type User } from '@/lib/db/schema';

export async function getUserByEmail(email: string): Promise<User | null> {
  const normalized = email.trim().toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.email, normalized));
  return user ?? null;
}

export async function getUserById(id: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user ?? null;
}

/**
 * Sincroniza la autorización de un jugador desde el formulario de admin.
 * - email vacío  → desvincula/elimina la fila `users` de rol 'player' de ese jugador.
 * - email puesto → garantiza una fila `users` con ese email vinculada al jugador.
 *
 * Devuelve { error } si el email ya pertenece a OTRO jugador.
 */
export async function upsertPlayerUser(
  playerId: string,
  rawEmail: string | null | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = (rawEmail ?? '').trim().toLowerCase();

  // Fila actual vinculada a este jugador (si existe)
  const [byPlayer] = await db.select().from(users).where(eq(users.playerId, playerId));

  // Sin email → desautorizar: solo borramos si es una cuenta de jugador.
  if (!email) {
    if (byPlayer && byPlayer.role === 'player') {
      await db.delete(users).where(eq(users.id, byPlayer.id));
    } else if (byPlayer) {
      // admin u otro rol: solo desvinculamos el playerId, no borramos la cuenta.
      await db.update(users).set({ playerId: null }).where(eq(users.id, byPlayer.id));
    }
    return { ok: true };
  }

  // Con email → ¿ese email ya existe en otra fila?
  const [byEmail] = await db.select().from(users).where(eq(users.email, email));

  if (byEmail) {
    if (byEmail.playerId && byEmail.playerId !== playerId) {
      return { ok: false, error: 'Ese email ya está asignado a otro jugador' };
    }
    // Vincular esa cuenta a este jugador (conserva su rol; útil si es la del admin).
    if (byPlayer && byPlayer.id !== byEmail.id) {
      // El jugador tenía otra cuenta 'player' con email distinto: la quitamos.
      await db.delete(users).where(eq(users.id, byPlayer.id));
    }
    await db.update(users).set({ playerId }).where(eq(users.id, byEmail.id));
    return { ok: true };
  }

  // El email es nuevo.
  if (byPlayer) {
    await db.update(users).set({ email }).where(eq(users.id, byPlayer.id));
  } else {
    await db.insert(users).values({ email, role: 'player', playerId });
  }
  return { ok: true };
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/users.ts
git commit -m "feat(auth): users DAL with allowlist upsert from player form"
```

---

## Task 5: Helpers de Google OAuth

**Files:**
- Create: `src/lib/auth/google.ts`

- [ ] **Step 1: Implementar `google.ts`**

Crea `src/lib/auth/google.ts`:

```ts
import { jwtVerify, createRemoteJWKSet } from 'jose';

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
);

export function redirectUri(): string {
  return `${process.env.APP_URL}/api/auth/callback`;
}

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return `${GOOGLE_AUTH}?${params.toString()}`;
}

export async function exchangeCodeForIdToken(code: string): Promise<string> {
  const res = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error('Google token exchange failed');
  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) throw new Error('No id_token in Google response');
  return data.id_token;
}

export interface GoogleIdentity {
  email: string;
  emailVerified: boolean;
  name?: string;
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  return {
    email: String(payload.email ?? ''),
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === 'string' ? payload.name : undefined,
  };
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/google.ts
git commit -m "feat(auth): Google OAuth helpers (authorize URL, token exchange, id_token verify)"
```

---

## Task 6: Route handlers de auth (`/api/auth/login|callback|logout`)

**Files:**
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/callback/route.ts`
- Create: `src/app/api/auth/logout/route.ts`

- [ ] **Step 1: `login` — redirige a Google con `state`**

Crea `src/app/api/auth/login/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { buildGoogleAuthUrl } from '@/lib/auth/google';

export async function GET(request: NextRequest) {
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(buildGoogleAuthUrl(state));
  // Guardamos el state para validarlo en el callback (anti-CSRF).
  res.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 min
    path: '/',
  });
  // Guardamos el destino final (opcional).
  const from = request.nextUrl.searchParams.get('from');
  if (from) {
    res.cookies.set('oauth_from', from, { httpOnly: true, sameSite: 'lax', maxAge: 600, path: '/' });
  }
  return res;
}
```

- [ ] **Step 2: `callback` — valida state, intercambia code, crea sesión**

Crea `src/app/api/auth/callback/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForIdToken, verifyGoogleIdToken } from '@/lib/auth/google';
import { getUserByEmail } from '@/lib/auth/users';
import { signSession } from '@/lib/auth/jwt';
import type { Role } from '@/lib/auth/jwt';

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const savedState = request.cookies.get('oauth_state')?.value;
  const from = request.cookies.get('oauth_from')?.value;

  const base = process.env.APP_URL || url.origin;

  // Validar state (anti-CSRF) y presencia de code.
  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(new URL('/login?error=state', base));
  }

  try {
    const idToken = await exchangeCodeForIdToken(code);
    const identity = await verifyGoogleIdToken(idToken);

    if (!identity.email || !identity.emailVerified) {
      return NextResponse.redirect(new URL('/unauthorized', base));
    }

    const user = await getUserByEmail(identity.email);
    if (!user) {
      return NextResponse.redirect(new URL('/unauthorized', base));
    }

    const token = await signSession({ userId: user.id, role: user.role as Role });
    const dest = from && from.startsWith('/') ? from : '/me';
    const res = NextResponse.redirect(new URL(dest, base));
    res.cookies.set('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });
    // Limpiar cookies temporales.
    res.cookies.delete('oauth_state');
    res.cookies.delete('oauth_from');
    return res;
  } catch (error) {
    console.error('OAuth callback error', error);
    return NextResponse.redirect(new URL('/login?error=oauth', base));
  }
}
```

> Nota: aquí firmamos el JWT y ponemos la cookie con `res.cookies.set(...)` (no usamos `createSession()` de Task 3, que escribe vía `next/headers` y está pensada para Server Actions/páginas; en un route handler que devuelve un redirect es más directo escribir la cookie en la respuesta).

- [ ] **Step 3: `logout` — borra la sesión**

Crea `src/app/api/auth/logout/route.ts`:

```ts
import { NextResponse } from 'next/server';

export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set('session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  return res;
}
```

- [ ] **Step 4: Verificar que compila**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth
git commit -m "feat(auth): Google OAuth route handlers (login, callback, logout)"
```

---

## Task 7: Decisión de autorización (función pura, testeable)

**Files:**
- Create: `src/lib/auth/authorize.ts`
- Test: `src/lib/auth/authorize.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crea `src/lib/auth/authorize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { decideAccess } from './authorize';

describe('decideAccess', () => {
  it('permite rutas públicas sin sesión', () => {
    expect(decideAccess('/', null)).toBe('allow');
    expect(decideAccess('/rankings', null)).toBe('allow');
  });

  it('redirige a login si /admin sin sesión', () => {
    expect(decideAccess('/admin', null)).toBe('redirect-login');
    expect(decideAccess('/admin/players', null)).toBe('redirect-login');
  });

  it('redirige a home si /admin con sesión de jugador', () => {
    expect(decideAccess('/admin', { userId: 'u', role: 'player' })).toBe('redirect-home');
  });

  it('permite /admin a un admin', () => {
    expect(decideAccess('/admin/matches', { userId: 'u', role: 'admin' })).toBe('allow');
  });

  it('exige sesión para /me', () => {
    expect(decideAccess('/me', null)).toBe('redirect-login');
    expect(decideAccess('/me/edit', { userId: 'u', role: 'player' })).toBe('allow');
    expect(decideAccess('/me', { userId: 'u', role: 'admin' })).toBe('allow');
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run src/lib/auth/authorize.test.ts`
Expected: FAIL — "Cannot find module './authorize'".

- [ ] **Step 3: Implementar `authorize.ts`**

Crea `src/lib/auth/authorize.ts`:

```ts
import type { SessionPayload } from './jwt';

export type AccessDecision = 'allow' | 'redirect-login' | 'redirect-home';

export function decideAccess(
  path: string,
  payload: SessionPayload | null,
): AccessDecision {
  if (path === '/admin' || path.startsWith('/admin/')) {
    if (!payload) return 'redirect-login';
    return payload.role === 'admin' ? 'allow' : 'redirect-home';
  }
  if (path === '/me' || path.startsWith('/me/')) {
    return payload ? 'allow' : 'redirect-login';
  }
  return 'allow';
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run src/lib/auth/authorize.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/authorize.ts src/lib/auth/authorize.test.ts
git commit -m "feat(auth): pure route authorization decision + tests"
```

---

## Task 8: `proxy.ts` por roles

**Files:**
- Modify: `src/proxy.ts`

- [ ] **Step 1: Reescribir `proxy.ts`**

Reemplaza TODO el contenido de `src/proxy.ts` por:

```ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth/jwt';
import { decideAccess } from '@/lib/auth/authorize';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const payload = await verifySession(request.cookies.get('session')?.value);
  const decision = decideAccess(pathname, payload);

  if (decision === 'redirect-login') {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }
  if (decision === 'redirect-home') {
    return NextResponse.redirect(new URL('/me', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/me/:path*'],
};
```

- [ ] **Step 2: Verificar que compila**

Run: `npm run build`
Expected: build OK. (`verifySession` es jose puro, válido en el runtime del proxy; no toca DB.)

- [ ] **Step 3: Commit**

```bash
git add src/proxy.ts
git commit -m "feat(auth): role-based access control in proxy"
```

---

## Task 9: Página de login con Google + pantalla "no autorizado"

**Files:**
- Modify: `src/app/login/page.tsx`
- Create: `src/app/unauthorized/page.tsx`

- [ ] **Step 1: Reescribir la página de login**

Reemplaza TODO `src/app/login/page.tsx` por (Server Component, sin estado de contraseña):

```tsx
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; error?: string }>;
}) {
  const { from, error } = await searchParams;
  const loginHref = from ? `/api/auth/login?from=${encodeURIComponent(from)}` : '/api/auth/login';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-950 to-green-800 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="text-4xl mb-2">🎾</div>
          <CardTitle className="text-2xl">Lomeros Padel Tour</CardTitle>
          <CardDescription>Inicia sesión para ver tu perfil · LPT</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <p className="text-sm text-red-500 text-center">
              No se pudo iniciar sesión. Inténtalo de nuevo.
            </p>
          )}
          <Link
            href={loginHref}
            className="flex items-center justify-center gap-3 w-full min-h-[44px] rounded-md border border-gray-300 bg-white text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/>
              <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"/>
            </svg>
            Entrar con Google
          </Link>
          <p className="text-xs text-gray-400 text-center">
            Solo cuentas autorizadas por el organizador.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

> El `login/layout.tsx` ya envuelve en `<Suspense>`; al pasar a Server Component con `searchParams` async, sigue siendo válido.

- [ ] **Step 2: Crear la pantalla "no autorizado"**

Crea `src/app/unauthorized/page.tsx`:

```tsx
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-950 to-green-800 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="text-4xl mb-2">🚫</div>
          <CardTitle className="text-2xl">Cuenta no autorizada</CardTitle>
          <CardDescription>
            Tu cuenta de Google no está dada de alta. Pide al organizador que te añada.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <Button asChild variant="outline">
            <Link href="/">Volver al inicio</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

> Si `Button` no soporta `asChild`, sustituye por un `<Link>` estilado como en la página de login. Verifica `src/components/ui/button.tsx` antes (probablemente sí lo soporta, es shadcn).

- [ ] **Step 3: Verificar que compila**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add src/app/login/page.tsx src/app/unauthorized/page.tsx
git commit -m "feat(auth): Google sign-in page and unauthorized screen"
```

---

## Task 10: Campo "Email de Gmail" en el formulario de jugador + upsert en la API

**Files:**
- Modify: `src/components/admin/player-form.tsx`
- Modify: `src/app/api/players/route.ts`
- Modify: `src/app/api/players/[id]/route.ts`
- Modify: `src/app/admin/players/[id]/edit/page.tsx`

- [ ] **Step 1: Añadir `email` al formulario**

En `src/components/admin/player-form.tsx`:

1. Amplía `PlayerFormProps.initialData` con `email`:

```ts
interface PlayerFormProps {
  initialData?: {
    id: string;
    name: string;
    nickname: string | null;
    avatarUrl: string | null;
    isLeftHanded: boolean | null;
    email?: string | null;
  };
}
```

2. Añade `email` al estado inicial (junto a los otros campos del `useState(form)`):

```ts
  const [form, setForm] = useState({
    name: initialData?.name ?? '',
    nickname: initialData?.nickname ?? '',
    avatarUrl: initialData?.avatarUrl ?? '',
    isLeftHanded: initialData?.isLeftHanded ?? false,
    email: initialData?.email ?? '',
  });
```

3. Añade el input tras el bloque del apodo (después del `</div>` que cierra el campo "nickname", antes del checkbox de zurdo):

```tsx
          <div className="space-y-2">
            <Label htmlFor="email">Email de Gmail (para que pueda entrar)</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="jugador@gmail.com"
            />
            <p className="text-xs text-gray-400">
              Opcional. Si lo dejas vacío, el jugador no podrá iniciar sesión.
            </p>
          </div>
```

(El `form` completo ya se envía como JSON en `handleSubmit`, así que `email` viaja sin más cambios.)

- [ ] **Step 2: POST `/api/players` acepta email y hace upsert**

Reemplaza el cuerpo del `POST` en `src/app/api/players/route.ts` para extraer `email` y llamar al DAL tras crear el jugador:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { upsertPlayerUser } from '@/lib/auth/users';

// GET /api/players - listar todos los jugadores  (SIN CAMBIOS)
export async function GET() {
  try {
    const all = await db.select().from(players).orderBy(players.eloRating);
    return NextResponse.json(all.reverse());
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al obtener jugadores' }, { status: 500 });
  }
}

// POST /api/players - crear jugador
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, nickname, avatarUrl, isLeftHanded, email } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
    }

    const [player] = await db.insert(players).values({
      name: name.trim(),
      nickname: nickname?.trim() || null,
      avatarUrl: avatarUrl?.trim() || null,
      isLeftHanded: !!isLeftHanded,
    }).returning();

    const result = await upsertPlayerUser(player.id, email);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json(player, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al crear jugador' }, { status: 500 });
  }
}
```

- [ ] **Step 3: PUT `/api/players/[id]` acepta email y hace upsert**

En `src/app/api/players/[id]/route.ts`, añade el import y amplía el `PUT` (deja `GET` y `DELETE` como están):

```ts
import { upsertPlayerUser } from '@/lib/auth/users';
```

En el `PUT`, tras `const { name, nickname, avatarUrl, isLeftHanded } = body;` añade `email`:

```ts
    const { name, nickname, avatarUrl, isLeftHanded, email } = body;
```

Y tras el `.returning()` que actualiza el jugador, antes del `return NextResponse.json(updated)`:

```ts
    if (!updated) return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 });

    const result = await upsertPlayerUser(id, email);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json(updated);
```

- [ ] **Step 4: Precargar el email en la página de edición**

En `src/app/admin/players/[id]/edit/page.tsx`, carga la fila `users` vinculada y pásala como `initialData.email`:

```tsx
import { db } from '@/lib/db';
import { players, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { PlayerForm } from '@/components/admin/player-form';

export const dynamic = 'force-dynamic';

export default async function EditPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [player] = await db.select().from(players).where(eq(players.id, id));
  if (!player) notFound();

  const [linkedUser] = await db.select().from(users).where(eq(users.playerId, id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Editar jugador</h1>
        <p className="text-gray-500 text-sm">{player.name}</p>
      </div>
      <PlayerForm initialData={{ ...player, email: linkedUser?.email ?? '' }} />
    </div>
  );
}
```

- [ ] **Step 5: Verificar que compila**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/player-form.tsx src/app/api/players/route.ts src/app/api/players/[id]/route.ts src/app/admin/players/[id]/edit/page.tsx
git commit -m "feat(auth): email field on player form upserts users allowlist"
```

---

## Task 11: Extraer `PlayerProfileView` + `loadPlayerProfile` (refactor DRY para reutilizar en /me)

**Objetivo:** mover la carga de datos y el render del perfil a piezas reutilizables, dejando `/players/[id]` como wrapper fino. Es un **movimiento mecánico** del código existente (sin cambios de lógica), para que `/me` lo reutilice en la Tarea 12.

**Files:**
- Create: `src/lib/players/profile-data.ts`
- Create: `src/components/players/player-profile-view.tsx`
- Modify: `src/app/(public)/players/[id]/page.tsx`

- [ ] **Step 1: Crear el cargador de datos `loadPlayerProfile`**

Crea `src/lib/players/profile-data.ts`. Mueve aquí TODA la lógica de carga/cálculo que hoy está en el cuerpo de `PlayerProfilePage` (`src/app/(public)/players/[id]/page.tsx`, líneas 21–117: desde `const [player] = await db...` hasta el cálculo de `streak`). La función recibe `id` y devuelve un objeto con todo lo que el render necesita. Estructura:

```ts
import { db } from '@/lib/db';
import { players, matches, ratingHistory, pairStats, playerAchievements, type Player } from '@/lib/db/schema';
import { eq, or, desc } from 'drizzle-orm';
import { computeSideStats } from '@/lib/rating/side-stats';
import { computeAllRivalries } from '@/lib/rating/head-to-head';
import { detectRankChanges } from '@/lib/feed/rank-changes';
import { findUnplayedPartners } from '@/lib/players/unplayed-partners';

export async function loadPlayerProfile(id: string) {
  const [player] = await db.select().from(players).where(eq(players.id, id));
  if (!player) return null;

  // … (pega aquí, sin cambios, todo el bloque de queries y cálculos
  //    de page.tsx líneas 24–117: playerMatches, completedMatches, history,
  //    pairs, allPlayers, playerMap, globalHistory, allRankEvents,
  //    playerRankEvents, recentForm, winRate, bestPartner(+player),
  //    worstPartner(+player), showWorstCard, unplayed, totalCandidates,
  //    earnedGrants, sideStats, hasSideData, driveBetter, rivalries,
  //    chartData, eloChange, streak) …

  return {
    player,
    completedMatches,
    playerMap,
    playerRankEvents,
    recentForm,
    winRate,
    bestPartner, bestPartnerPlayer,
    worstPartner, worstPartnerPlayer, showWorstCard,
    unplayed, totalCandidates,
    earnedGrants,
    sideStats, hasSideData, driveBetter,
    rivalries,
    chartData, eloChange, streak,
  };
}

export type PlayerProfileData = NonNullable<Awaited<ReturnType<typeof loadPlayerProfile>>>;
export type { Player };
```

- [ ] **Step 2: Crear el componente de vista `PlayerProfileView`**

Crea `src/components/players/player-profile-view.tsx`. Mueve aquí el JSX que hoy devuelve `PlayerProfilePage` (líneas 119–319, el `return (...)`) **y** los dos sub-componentes auxiliares `SideStatBlock` y `RivalryRow` (líneas 322–369). El componente recibe los datos ya cargados + un flag `editable`:

```tsx
import Link from 'next/link';
import { EloChart } from '@/components/charts/elo-chart';
import { EloSparkline } from '@/components/charts/elo-sparkline';
import { PartnerCard } from '@/components/shared/partner-card';
import { UnplayedPartnersCard } from '@/components/shared/unplayed-partners-card';
import { AchievementsCard } from '@/components/shared/achievements-card';
import type { RivalryStats } from '@/lib/rating/head-to-head';
import type { PlayerProfileData } from '@/lib/players/profile-data';

export function PlayerProfileView({ data, editable = false }: { data: PlayerProfileData; editable?: boolean }) {
  const {
    player, completedMatches, playerMap, playerRankEvents, recentForm, winRate,
    bestPartner, bestPartnerPlayer, worstPartner, worstPartnerPlayer, showWorstCard,
    unplayed, totalCandidates, earnedGrants, sideStats, hasSideData, driveBetter,
    rivalries, chartData, eloChange, streak,
  } = data;
  const id = player.id;

  return (
    <div className="space-y-6">
      {/* Si editable, botón de editar arriba */}
      {editable && (
        <div className="flex justify-end">
          <Link
            href="/me/edit"
            className="inline-flex items-center min-h-[40px] px-4 rounded-full text-sm font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors"
          >
            ✏️ Editar perfil
          </Link>
        </div>
      )}

      {/* … pega aquí TODO el JSX del return original (líneas 122–318):
          PROFILE HEADER, Win% bar, Recent form, Elo chart, partners,
          UnplayedPartnersCard, AchievementsCard, side stats, head-to-head,
          match history … sin cambios … */}
    </div>
  );
}

// Pega aquí también, sin cambios, function SideStatBlock(...) y function RivalryRow(...)
```

> Importante: en el JSX movido se usan `id`, `player`, `playerMap`, etc. — todas vienen ahora del `data` desestructurado arriba, así que no hay que tocarlas.

- [ ] **Step 3: Convertir `/players/[id]/page.tsx` en wrapper fino**

Reemplaza TODO `src/app/(public)/players/[id]/page.tsx` por:

```tsx
import { notFound } from 'next/navigation';
import { loadPlayerProfile } from '@/lib/players/profile-data';
import { PlayerProfileView } from '@/components/players/player-profile-view';

export const dynamic = 'force-dynamic';

export default async function PlayerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadPlayerProfile(id);
  if (!data) notFound();
  return <PlayerProfileView data={data} editable={false} />;
}
```

- [ ] **Step 4: Verificar build + revisión visual**

Run: `npm run build`
Expected: build OK, sin imports sin usar ni tipos rotos.

Revisión visual (tras desplegar a preview): abre `/players/<un-id>` y confirma que **se ve idéntico** a antes del refactor (header, gráfica, parejas, historial). El refactor no debe cambiar nada visible.

- [ ] **Step 5: Commit**

```bash
git add src/lib/players/profile-data.ts src/components/players/player-profile-view.tsx "src/app/(public)/players/[id]/page.tsx"
git commit -m "refactor(players): extract reusable PlayerProfileView + loadPlayerProfile"
```

---

## Task 12: Zona privada `/me` (perfil + editar) y `PATCH /api/me`

**Files:**
- Create: `src/app/me/layout.tsx`
- Create: `src/app/me/page.tsx`
- Create: `src/app/me/edit/page.tsx`
- Create: `src/components/me/me-profile-form.tsx`
- Create: `src/app/api/me/route.ts`

- [ ] **Step 1: Layout de `/me` (reutiliza navbar + bottom-nav)**

Crea `src/app/me/layout.tsx`. Carga la sesión para pasar info a la navbar (ver Tarea 13 para las props de `Navbar`; de momento usa el mismo patrón que el layout público):

```tsx
import { Navbar } from '@/components/shared/navbar';
import { BottomNav } from '@/components/shared/bottom-nav';
import { getSession } from '@/lib/auth/session';

export default async function MeLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg,#f0fdf4 0%,#dcfce7 45%,#f0fdf4 80%,#ecfdf5 100%)' }}>
      <Navbar session={session ? { role: session.role, hasPlayer: !!session.player } : null} />
      <main className="max-w-6xl mx-auto px-4 pt-6 sm:pt-8 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-8">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
```

> Si haces la Tarea 13 después, la prop `session` de `Navbar` ya existirá. Si ejecutas esta tarea antes, añade temporalmente la prop opcional a `Navbar` o usa `<Navbar />` sin props y completa en la Tarea 13.

- [ ] **Step 2: Página `/me` (perfil propio)**

Crea `src/app/me/page.tsx`:

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { loadPlayerProfile } from '@/lib/players/profile-data';
import { PlayerProfileView } from '@/components/players/player-profile-view';

export const dynamic = 'force-dynamic';

export default async function MePage() {
  const session = await getSession();
  if (!session) redirect('/login?from=/me');

  // Autorizado pero aún sin jugador vinculado.
  if (!session.player) {
    return (
      <div className="max-w-md mx-auto mt-10 text-center space-y-4">
        <div className="text-4xl">👋</div>
        <h1 className="text-2xl font-bold text-gray-800">¡Bienvenido!</h1>
        <p className="text-gray-500">
          Tu cuenta está activa pero aún no está vinculada a un jugador del tour.
          Pide al organizador que te vincule a tu ficha.
        </p>
        <Link href="/" className="inline-block text-green-700 font-semibold">Ver el tour →</Link>
      </div>
    );
  }

  const data = await loadPlayerProfile(session.player.id);
  if (!data) redirect('/');
  return <PlayerProfileView data={data} editable />;
}
```

- [ ] **Step 3: Formulario cliente de edición propia**

Crea `src/components/me/me-profile-form.tsx` (versión reducida del player-form: apodo, avatar, zurdo; PATCH a `/api/me`):

```tsx
'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Image from 'next/image';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface MeProfileFormProps {
  initial: { name: string; nickname: string | null; avatarUrl: string | null; isLeftHanded: boolean | null };
}

export function MeProfileForm({ initial }: MeProfileFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    nickname: initial.nickname ?? '',
    avatarUrl: initial.avatarUrl ?? '',
    isLeftHanded: initial.isLeftHanded ?? false,
  });
  const [preview, setPreview] = useState<string>(initial.avatarUrl ?? '');

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (res.ok) {
      setForm((f) => ({ ...f, avatarUrl: data.url }));
      toast.success('Imagen subida');
    } else {
      toast.error(data.error || 'Error al subir la imagen');
      setPreview(form.avatarUrl);
    }
    setUploading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch('/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      toast.success('Perfil actualizado');
      router.push('/me');
      router.refresh();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Error al guardar');
      setLoading(false);
    }
  }

  const initials = initial.name
    ? initial.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <Card className="max-w-md">
      <CardHeader><CardTitle>Editar mi perfil</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label>Foto (opcional)</Label>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="relative w-20 h-20 rounded-full overflow-hidden shrink-0 border-2 border-dashed border-gray-300 hover:border-green-500 transition-colors group"
              >
                {preview ? (
                  <Image src={preview} alt="Avatar" fill className="object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white text-2xl font-black">
                    {initials}
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold">
                  {uploading ? '⏳' : '📷'}
                </div>
              </button>
              {preview && (
                <button
                  type="button"
                  className="text-xs text-red-400 hover:text-red-600"
                  onClick={() => { setPreview(''); setForm((f) => ({ ...f, avatarUrl: '' })); }}
                >
                  ✕ Quitar foto
                </button>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nickname">Apodo</Label>
            <Input
              id="nickname"
              value={form.nickname}
              onChange={(e) => setForm({ ...form, nickname: e.target.value })}
              placeholder="Ej: El Cañón"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="isLeftHanded"
              type="checkbox"
              checked={form.isLeftHanded}
              onChange={(e) => setForm({ ...form, isLeftHanded: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="isLeftHanded" className="cursor-pointer">🤚 Zurdo</Label>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={loading || uploading} className="min-h-[40px] px-4 text-sm">
              {loading ? 'Guardando...' : 'Guardar cambios'}
            </Button>
            <Button type="button" variant="outline" className="min-h-[40px] px-4 text-sm" onClick={() => router.push('/me')}>
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Página `/me/edit`**

Crea `src/app/me/edit/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { MeProfileForm } from '@/components/me/me-profile-form';

export const dynamic = 'force-dynamic';

export default async function MeEditPage() {
  const session = await getSession();
  if (!session) redirect('/login?from=/me/edit');
  if (!session.player) redirect('/me');

  const { name, nickname, avatarUrl, isLeftHanded } = session.player;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Mi perfil</h1>
      <MeProfileForm initial={{ name, nickname, avatarUrl, isLeftHanded }} />
    </div>
  );
}
```

- [ ] **Step 5: `PATCH /api/me`**

Crea `src/app/api/me/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/session';

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!session.player) return NextResponse.json({ error: 'Sin jugador vinculado' }, { status: 403 });

  const body = await request.json();
  const { nickname, avatarUrl, isLeftHanded } = body;

  const [updated] = await db
    .update(players)
    .set({
      nickname: nickname?.trim() || null,
      avatarUrl: avatarUrl?.trim() || null,
      isLeftHanded: !!isLeftHanded,
    })
    .where(eq(players.id, session.player.id))
    .returning();

  return NextResponse.json(updated);
}
```

> Seguridad: el `id` a actualizar sale de `session.player.id` (servidor), nunca del cliente. `name`, `eloRating`, `wins`, etc. no se tocan.

- [ ] **Step 6: Verificar que compila**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 7: Commit**

```bash
git add src/app/me src/components/me/me-profile-form.tsx src/app/api/me/route.ts
git commit -m "feat(me): private profile zone with self-edit (PATCH /api/me)"
```

---

## Task 13: Navegación según sesión + logout nuevo

**Files:**
- Modify: `src/components/shared/navbar.tsx`
- Modify: `src/app/(public)/layout.tsx`
- Modify: `src/app/admin/layout.tsx`

- [ ] **Step 1: `Navbar` con prop `session`**

Reemplaza `src/components/shared/navbar.tsx` por (acepta `session` y deriva el lado derecho; logout apunta a `/api/auth/logout`):

```tsx
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { navLinks } from './nav-links';

interface NavSession { role: 'admin' | 'player'; hasPlayer: boolean }

export function Navbar({ session = null }: { session?: NavSession | null }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  return (
    <nav aria-label="Barra superior" className="bg-gradient-to-r from-green-950 via-green-900 to-green-950 text-white shadow-2xl sticky top-0 z-50 border-b border-green-800/50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 font-black text-xl tracking-tight hover:opacity-80 transition-opacity shrink-0">
          <span className="text-2xl">🎾</span>
          <span>LPT<span className="text-green-400 ml-1">·</span></span>
          <span className="hidden lg:block text-xs text-green-300 font-semibold uppercase tracking-widest">Lomeros Padel Tour</span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200',
                pathname === link.href
                  ? 'bg-green-400/20 text-white border border-green-400/30 shadow-inner'
                  : 'text-green-200 hover:text-white hover:bg-white/10'
              )}
            >
              {link.icon} {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {session ? (
            <>
              {session.role === 'admin' && (
                <Link
                  href="/admin"
                  className="inline-flex items-center min-h-[40px] px-3 rounded-full text-sm font-semibold bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 border border-orange-500/30 transition-all"
                >
                  ⚙️ Admin
                </Link>
              )}
              <Link
                href="/me"
                className="inline-flex items-center min-h-[40px] px-3 rounded-full text-sm font-semibold bg-green-400/15 text-green-200 hover:bg-green-400/25 border border-green-400/30 transition-all"
              >
                👤 Mi perfil
              </Link>
              <button
                onClick={handleLogout}
                className="inline-flex items-center min-h-[40px] px-3 rounded-full text-sm font-medium text-green-300 hover:text-white hover:bg-white/10 transition-all"
              >
                Salir
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center min-h-[40px] px-4 rounded-full text-sm font-semibold border border-green-600 text-green-300 hover:bg-green-800 hover:text-white transition-all"
            >
              Entrar
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
```

> Se elimina la prop `isAdmin`. El admin layout pasará `session` con `role:'admin'`.

- [ ] **Step 2: Pasar `session` desde el layout público**

En `src/app/(public)/layout.tsx`, conviértelo en async y carga la sesión:

```tsx
import { Navbar } from '@/components/shared/navbar';
import { BottomNav } from '@/components/shared/bottom-nav';
import { getSession } from '@/lib/auth/session';

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg,#f0fdf4 0%,#dcfce7 45%,#f0fdf4 80%,#ecfdf5 100%)' }}>
      <Navbar session={session ? { role: session.role, hasPlayer: !!session.player } : null} />
      <main className="max-w-6xl mx-auto px-4 pt-6 sm:pt-8 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-8">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
```

> Nota: cargar la sesión en el layout hace estas rutas dinámicas. Las páginas del grupo `(public)` ya usan `dynamic = 'force-dynamic'` en su mayoría, así que es coherente. Si alguna página estática se queja en build, añade `export const dynamic = 'force-dynamic'` en ella.

- [ ] **Step 3: Actualizar el admin layout**

En `src/app/admin/layout.tsx`, sustituye `<Navbar isAdmin />` por la sesión real:

```tsx
import { Navbar } from '@/components/shared/navbar';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { getSession } from '@/lib/auth/session';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar session={session ? { role: session.role, hasPlayer: !!session.player } : null} />
      <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8 flex flex-col md:flex-row gap-4 md:gap-8">
        <AdminSidebar />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verificar que compila**

Run: `npm run build`
Expected: build OK. Si el compilador avisa de algún uso restante de `isAdmin`, corrígelo (ya no existe la prop).

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/navbar.tsx "src/app/(public)/layout.tsx" src/app/admin/layout.tsx
git commit -m "feat(auth): session-aware navbar (login / mi perfil / admin / logout)"
```

---

## Task 14: Limpieza, setup de Google Cloud, env vars y verificación end-to-end

**Files:**
- Delete: `src/app/api/login/route.ts`
- Delete: `src/app/api/logout/route.ts`

- [ ] **Step 1: Borrar el login por contraseña antiguo**

```bash
git rm src/app/api/login/route.ts src/app/api/logout/route.ts
```

Comprueba que nada los referencia:

Run: `grep -rn "api/login\|api/logout\|ADMIN_PASSWORD\|ADMIN_SECRET\|admin-token" src/`
Expected: sin resultados (o solo en comentarios/borrables). Si aparece alguno, elimínalo.

- [ ] **Step 2: Verificar build + tests + lint**

Run: `npm run build && npm test && npm run lint`
Expected: build OK, tests PASS (incluidos `jwt.test.ts` y `authorize.test.ts`), lint limpio.

- [ ] **Step 3: Commit del código**

```bash
git add -A
git commit -m "chore(auth): remove legacy password login"
```

- [ ] **Step 4: Configurar Google Cloud (manual, lo hace el usuario)**

1. [console.cloud.google.com](https://console.cloud.google.com) → crear/elegir proyecto.
2. **APIs & Services → OAuth consent screen** → External → rellenar lo mínimo (nombre app, email de soporte) → guardar. Añadir tu Gmail como **Test user** (si la app está en modo testing).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** → tipo **Web application**.
4. **Authorized redirect URIs**:
   - `https://<tu-dominio-vercel>/api/auth/callback`
   - `http://localhost:3000/api/auth/callback`
5. Copiar **Client ID** y **Client Secret**.

- [ ] **Step 5: Configurar env vars en Vercel**

En Vercel → Project → Settings → Environment Variables (Production), añadir:
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET` (`openssl rand -base64 32`), `APP_URL` (`https://<tu-dominio>`), `ADMIN_EMAIL` (`garaujoriestra@gmail.com`).

(Opcional, para probar local con `npm run dev`: replica estas + las `TURSO_*` en `.env.local`.)

- [ ] **Step 6: Desplegar y migrar la DB**

```bash
git push   # Vercel auto-despliega
```

Tras el deploy, ejecutar la migración UNA vez:

```bash
curl -X POST https://<tu-dominio>/api/migrate-auth
```

Expected: `{"success":true,"adminSeeded":true}`.

- [ ] **Step 7: Verificación funcional end-to-end (manual, en prod)**

Checklist:
1. Visitar la home pública sin sesión → se ve todo, navbar muestra **"Entrar"**.
2. Ir a `/admin` sin sesión → redirige a `/login`.
3. Pulsar **"Entrar con Google"** con tu Gmail (admin) → vuelve logueado; navbar muestra **⚙️ Admin** + **👤 Mi perfil** + **Salir**.
4. `/admin` accesible. Editar un jugador, ponerle un **Email de Gmail** y guardar.
5. (Con otra cuenta de Google, la del jugador) → "Entrar con Google" → ve su `/me` con su perfil y partidos.
6. En `/me` pulsar **Editar perfil**, cambiar apodo/foto, guardar → se refleja en `/me` y en `/players/<id>` público.
7. Con la cuenta de jugador, ir a `/admin` → redirige a `/me` (sin permiso).
8. Con un Gmail **no** dado de alta → "Entrar con Google" → pantalla **"Cuenta no autorizada"**.
9. **Salir** → navbar vuelve a "Entrar"; `/me` redirige a `/login`.
10. Vincular tu propia ficha de jugador (admin): editar tu jugador, poner tu Gmail admin → en `/me` ya ves tu perfil deportivo (tu cuenta admin conserva el rol admin).

- [ ] **Step 8: (Opcional) Borrar env vars antiguas**

Una vez verificado, eliminar de Vercel `ADMIN_PASSWORD` y `ADMIN_SECRET` (ya no se usan).

---

## Resumen de verificación por capas

- **Lógica pura (automatizable):** `npm test` cubre el round-trip del JWT (`jwt.test.ts`) y la decisión de autorización (`authorize.test.ts`).
- **Tipos/compilación:** `npm run build` tras cada tarea.
- **Funcional con DB/OAuth:** manual en preview/prod (Tarea 14, Step 7), porque la DB Turso y Google solo responden desplegado.
