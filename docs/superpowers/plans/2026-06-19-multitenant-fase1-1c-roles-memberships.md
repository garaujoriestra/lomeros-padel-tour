# Multi-tenant Fase 1 — Paso 1C (roles/enlace → memberships) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer de `memberships` la única fuente de verdad del rol y del enlace user↔ficha, sacar el `role` del JWT, y **borrar `role`/`playerId` del schema Drizzle de `users`** — sin cambio visible para Lomeros.

**Architecture:** Expand→contract, paso de "contracción". El blindaje por grupo de 1B ya vive; 1C solo mueve la fuente de verdad del rol/enlace de `users.role`/`users.playerId` a `memberships`, y reubica el gate de `/admin` (decidido con el usuario: **opción A**) del edge (que leía `role` del JWT) a un check server-side en `admin/layout.tsx`. El JWT pasa a llevar solo `userId` (compatible hacia atrás: las cookies viejas con `role` siguen verificando, se ignora el campo). Las columnas físicas `users.role`/`users.player_id` se quedan **inertes** (no se dropean en 1C): quitarlas del schema Drizzle basta para que el código deje de tocarlas, y deja intactos `migrate-multitenant`/`migrate-auth`/seed de e2e.

**Tech Stack:** Next.js (App Router, esta versión con breaking changes — ver `node_modules/next/dist/docs/`), Drizzle ORM + Turso/libSQL, jose (JWT), Vitest (unit, lógica pura), Playwright (e2e, todo lo que toca el `db` compartido).

---

## Contexto imprescindible (leer antes de tocar nada)

- **Procedimiento del proyecto (memoria `multitenant-fase1`):** cada sub-paso se implementa con TDD, se deja tsc/vitest/e2e verde y se pushea con `git push origin HEAD:main` (Vercel auto-despliega). 1C **no** lleva migración de datos nueva (las columnas ya existen y se quedan).
- **Patrón de tests del repo (confirmado):** la **lógica pura** se testea con Vitest (`src/**/*.test.ts`); **todo lo que toca el `db` compartido** (`getSession`, DAL, `upsertPlayerUser`, `send.ts`) se cubre por **e2e** (no hay arnés de DB en unit salvo migraciones, que inyectan un `client`). Por eso aquí: unit para `jwt`/`decideAccess`; e2e para lo demás.
- **`guard.ts` `requireAdmin` NO se toca:** lee `session.role`, que tras re-fuentear `getSession` (Task 2) ya viene de `memberships`. Así "rol desde memberships" se logra transitivamente en las 24 rutas admin sin tocarlas. El rename a `requireGroupAdmin` y el rechazo de escritura al `super_admin` son cosméticos/Fase-2 (en Fase 1 el dueño es admin real vía membership en el único grupo) → **fuera de 1C**.
- **No-fuga del guard de CI (1B-5):** `scripts/check-direct-db-access.mjs` solo vigila tablas **tenant raíz** (`players`/`matches`/`rewards`/`tournaments`) en `src/app`. `users`/`memberships` NO están vigiladas, así que leerlas en una página admin no dispara el guard. Aun así, la lectura directa de la edit page se mueve a un helper (Task 3).
- **Orden de commits:** cada tarea compila por sí sola. El schema se contrae **al final** (Task 5), cuando todos los consumidores de `users.role`/`users.playerId` ya leen de `memberships`.

### Mapa de ficheros

| Fichero | Tarea | Cambio |
|---|---|---|
| `src/lib/auth/jwt.ts` (+`jwt.test.ts`) | 1 | `SessionPayload` pierde `role`; `signSession({userId})`; `verifySession` devuelve `{userId}` e ignora `role` de cookies viejas. Mantiene `type Role`. |
| `src/lib/auth/authorize.ts` (+`authorize.test.ts`) | 1 | `decideAccess` deja de leer `role`: `/admin` → hay payload ? `allow` : `redirect-login`. |
| `src/app/api/auth/callback/route.ts` | 1 | `signSession({userId})`; quita `Role`/`user.role`. |
| `src/app/admin/layout.tsx` | 1 | Gate server-side: `getSession`; sin sesión→`/login`, rol≠admin→`/me`. |
| `src/lib/auth/session.ts` | 2 | `getSession` resuelve `role`+`playerId` desde la membership del grupo por defecto. |
| `src/lib/auth/users.ts` | 3 | `upsertPlayerUser(groupId, playerId, email)` escribe/borra **membership**; nuevo `getLinkedUserEmail(groupId, playerId)`. |
| `src/app/api/players/route.ts` | 3 | `upsertPlayerUser(groupId, player.id, email)`. |
| `src/app/api/players/[id]/route.ts` | 3 | `upsertPlayerUser(groupId, id, email)`. |
| `src/app/admin/players/[id]/edit/page.tsx` | 3 | Usa `getLinkedUserEmail` en vez de leer `users` directo. |
| `src/lib/push/send.ts` | 4 | `userIdsForPlayers` lee `memberships.playerId` (no `users.playerId`). |
| `src/lib/db/schema.ts` | 5 | Borra `role` y `playerId` de la tabla `users`. |
| `e2e/1c-roles-memberships.spec.ts` (nuevo) | 6 | Regresión: gate admin, link/unlink escribe membership, email duplicado→409. |

---

## Task 1: Sacar `role` del JWT y mover el gate de `/admin` al servidor

**Files:**
- Modify: `src/lib/auth/jwt.ts`
- Test: `src/lib/auth/jwt.test.ts`
- Modify: `src/lib/auth/authorize.ts`
- Test: `src/lib/auth/authorize.test.ts`
- Modify: `src/app/api/auth/callback/route.ts`
- Modify: `src/app/admin/layout.tsx`

- [ ] **Step 1: Actualizar `jwt.test.ts` (test que falla)**

Sustituir el contenido por:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { SignJWT } from 'jose';
import { signSession, verifySession } from './jwt';

beforeAll(() => {
  process.env.AUTH_SECRET = 'test-secret-para-jwt';
});

describe('signSession / verifySession', () => {
  it('firma y verifica un payload con solo userId', async () => {
    const token = await signSession({ userId: 'u1' });
    const payload = await verifySession(token);
    expect(payload).toEqual({ userId: 'u1' });
  });

  it('devuelve null si no hay token', async () => {
    expect(await verifySession(undefined)).toBeNull();
  });

  it('devuelve null si la firma no es válida', async () => {
    expect(await verifySession('no-es-un-jwt')).toBeNull();
  });

  it('acepta cookies viejas que aún llevan role e ignora el campo', async () => {
    // Compat hacia atrás: en prod hay cookies firmadas antes de 1C con { userId, role }.
    const old = await new SignJWT({ userId: 'u2', role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    const payload = await verifySession(old);
    expect(payload).toEqual({ userId: 'u2' });
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/lib/auth/jwt.test.ts`
Expected: FAIL (hoy `signSession` exige `role`; `verifySession` devuelve `{userId, role}`).

- [ ] **Step 3: Reescribir `jwt.ts`**

```ts
import { SignJWT, jwtVerify } from 'jose';

export type Role = 'admin' | 'player';

export interface SessionPayload {
  userId: string;
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
    if (typeof payload.userId !== 'string') return null;
    // El rol ya no vive en el token (1C); si una cookie vieja lo trae, se ignora.
    return { userId: payload.userId };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `npx vitest run src/lib/auth/jwt.test.ts`
Expected: PASS.

- [ ] **Step 5: Actualizar `authorize.test.ts` (test que falla)**

Sustituir el contenido por:

```ts
import { describe, it, expect } from 'vitest';
import { decideAccess } from './authorize';

describe('decideAccess', () => {
  it('permite rutas públicas sin sesión', () => {
    expect(decideAccess('/', null)).toBe('allow');
    expect(decideAccess('/rankings', null)).toBe('allow');
  });

  it('manda a login si /admin sin sesión', () => {
    expect(decideAccess('/admin', null)).toBe('redirect-login');
    expect(decideAccess('/admin/players', null)).toBe('redirect-login');
  });

  it('deja pasar /admin a cualquier sesión (el rol lo exige el layout server-side)', () => {
    expect(decideAccess('/admin', { userId: 'u' })).toBe('allow');
    expect(decideAccess('/admin/matches', { userId: 'u' })).toBe('allow');
  });

  it('gatea /me solo por sesión', () => {
    expect(decideAccess('/me', null)).toBe('redirect-login');
    expect(decideAccess('/me/edit', { userId: 'u' })).toBe('allow');
  });
});
```

- [ ] **Step 6: Ejecutar y ver que falla**

Run: `npx vitest run src/lib/auth/authorize.test.ts`
Expected: FAIL (hoy `/admin` con player → `redirect-home`).

- [ ] **Step 7: Reescribir `authorize.ts`**

```ts
import type { SessionPayload } from './jwt';

export type AccessDecision = 'allow' | 'redirect-login' | 'redirect-home';

export function decideAccess(
  path: string,
  payload: SessionPayload | null,
): AccessDecision {
  if (path === '/admin' || path.startsWith('/admin/')) {
    // El edge solo comprueba que haya sesión; el rol admin lo exige
    // `admin/layout.tsx` server-side (el JWT ya no lleva role en 1C).
    return payload ? 'allow' : 'redirect-login';
  }
  if (path === '/me' || path.startsWith('/me/')) {
    return payload ? 'allow' : 'redirect-login';
  }
  return 'allow';
}
```

(`'redirect-home'` se mantiene en el union por compatibilidad; `src/proxy.ts` no cambia.)

- [ ] **Step 8: Ejecutar y ver que pasa**

Run: `npx vitest run src/lib/auth/authorize.test.ts`
Expected: PASS.

- [ ] **Step 9: Actualizar el callback de OAuth (`src/app/api/auth/callback/route.ts`)**

Cambiar el import de la línea 4-5 y la firma de la línea 34.

Quitar la línea 5 (`import type { Role } ...`) y dejar el import de la 4 así:
```ts
import { signSession } from '@/lib/auth/jwt';
```

Sustituir la línea 34:
```ts
    const token = await signSession({ userId: user.id });
```

- [ ] **Step 10: Añadir el gate server-side en `src/app/admin/layout.tsx`**

Añadir el import de `redirect` y el check tras `getSession()`. El fichero queda:

```tsx
import { redirect } from 'next/navigation';
import { Navbar } from '@/components/shared/navbar';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { getSession } from '@/lib/auth/session';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  // Gate de admin server-side (en 1C el rol ya no va en el JWT, así que el middleware
  // del edge solo comprueba que haya sesión). El middleware ya manda a /login si no hay
  // sesión; este check cubre a los logueados que no son admin del grupo.
  if (!session) redirect('/login');
  if (session.role !== 'admin') redirect('/me');

  const player = session.player
    ? {
        id: session.player.id,
        name: session.player.name,
        nickname: session.player.nickname,
        avatarUrl: session.player.avatarUrl,
      }
    : null;

  return (
    <div className="min-h-screen">
      <Navbar session={{ role: session.role, player }} />
      <div className="lpt-container" style={{ paddingTop: 'calc(22px * var(--sp))', paddingBottom: 'calc(48px * var(--sp))' }}>
        <div className="flex flex-col md:flex-row gap-4 md:gap-8">
          <AdminSidebar />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
```

(En este punto `session.role` aún sale de `users.role` — se re-fuentea en Task 2 sin cambiar este fichero.)

- [ ] **Step 11: tsc + unit de auth verde**

Run: `npx tsc --noEmit && npx vitest run src/lib/auth/`
Expected: PASS, sin errores de tipos.

- [ ] **Step 12: Commit**

```bash
git add src/lib/auth/jwt.ts src/lib/auth/jwt.test.ts src/lib/auth/authorize.ts src/lib/auth/authorize.test.ts src/app/api/auth/callback/route.ts src/app/admin/layout.tsx
git commit -m "feat(multitenant): saca role del JWT; gate de /admin server-side en el layout (1C)"
```

---

## Task 2: `getSession` lee rol y ficha desde la membership del grupo por defecto

**Files:**
- Modify: `src/lib/auth/session.ts`

(Sin unit test: toca el `db` compartido → lo cubre la e2e de Task 6 y la suite e2e existente del jugador/admin.)

- [ ] **Step 1: Reescribir `getSession` en `src/lib/auth/session.ts`**

El fichero queda:

```ts
import { cookies } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, memberships, players, type Player } from '@/lib/db/schema';
import { signSession, verifySession, type Role } from './jwt';
import { getDefaultGroupId } from './group-context';

const COOKIE = 'session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 días

export interface Session {
  userId: string;
  role: Role;
  email: string;
  player: Player | null;
}

export async function createSession(userId: string): Promise<void> {
  const token = await signSession({ userId });
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

// Autorización SEGURA: lee la cookie y carga user + (rol/ficha del grupo por defecto)
// frescos de la DB. En 1C el rol y el enlace user↔ficha viven en `memberships`, no en
// `users`. Tolerante a fallos: si la consulta falla devuelve null en vez de lanzar.
// NOTA: import circular benigno con group-context (getDefaultGroupId): ambos se usan
// dentro de funciones, no en carga de módulo → ESM lo resuelve sin problema.
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const payload = await verifySession(cookieStore.get(COOKIE)?.value);
  if (!payload) return null;

  try {
    const [user] = await db.select().from(users).where(eq(users.id, payload.userId));
    if (!user) return null;

    // Rol + ficha del grupo por defecto (Fase 1: grupo implícito = Lomeros).
    const groupId = await getDefaultGroupId();
    const [mb] = await db
      .select({ role: memberships.role, playerId: memberships.playerId })
      .from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.groupId, groupId)));

    const role = (mb?.role ?? 'player') as Role;

    let player: Player | null = null;
    if (mb?.playerId) {
      const [p] = await db.select().from(players).where(eq(players.id, mb.playerId));
      player = p ?? null;
    }

    return { userId: user.id, role, email: user.email, player };
  } catch (error) {
    console.error('getSession DB error', error);
    return null;
  }
}
```

Cambios respecto al original: `createSession` ya no recibe `role`; el rol/ficha salen de la membership del grupo por defecto en vez de `users.role`/`users.playerId`.

- [ ] **Step 2: tsc verde**

Run: `npx tsc --noEmit`
Expected: PASS. (`createSession` no tiene call-sites — el callback firma el token a mano — así que cambiar su firma no rompe nada; verificar con el siguiente grep.)

- [ ] **Step 3: Verificar que no hay call-sites rotos de `createSession`**

Run: `rg -n "createSession\(" src`
Expected: solo la definición. Si aparece algún call-site con `(userId, role)`, quitarle el `role`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth/session.ts
git commit -m "feat(multitenant): getSession resuelve rol y ficha desde memberships del grupo por defecto (1C)"
```

---

## Task 3: `upsertPlayerUser` y el enlace de la edit page operan sobre `memberships`

**Files:**
- Modify: `src/lib/auth/users.ts`
- Modify: `src/app/api/players/route.ts`
- Modify: `src/app/api/players/[id]/route.ts`
- Modify: `src/app/admin/players/[id]/edit/page.tsx`

(Sin unit test: toca el `db` compartido → cubierto por la e2e de Task 6.)

- [ ] **Step 1: Reescribir `src/lib/auth/users.ts`**

El fichero queda (mantiene `getUserByEmail`/`getUserById`; reescribe `upsertPlayerUser` con `groupId`; añade `getLinkedUserEmail`):

```ts
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, memberships, type User } from '@/lib/db/schema';

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
 * Email del usuario vinculado a un jugador EN ESTE GRUPO (vía su membership).
 * '' si la ficha no tiene cuenta vinculada en el grupo.
 */
export async function getLinkedUserEmail(groupId: string, playerId: string): Promise<string> {
  const [row] = await db
    .select({ email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.groupId, groupId), eq(memberships.playerId, playerId)));
  return row?.email ?? '';
}

/**
 * Sincroniza la autorización de un jugador EN UN GRUPO desde el formulario de admin.
 * El rol y el enlace user↔ficha viven en `memberships` (1C), no en `users`.
 * - email vacío  → desautoriza: borra la membership 'player' de ese jugador (o, si es
 *   admin u otro rol, solo desvincula la ficha).
 * - email puesto → garantiza una cuenta global `users` con ese email y una
 *   `membership(user, grupo, role, playerId)` apuntando a la ficha.
 *
 * Devuelve { ok:false, error } si el email ya está vinculado a OTRO jugador del grupo.
 */
export async function upsertPlayerUser(
  groupId: string,
  playerId: string,
  rawEmail: string | null | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = (rawEmail ?? '').trim().toLowerCase();

  // Membership de ESTE grupo que vincula a este jugador (si existe).
  const [mbByPlayer] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.groupId, groupId), eq(memberships.playerId, playerId)));

  // Sin email → desautorizar en este grupo.
  if (!email) {
    if (mbByPlayer?.role === 'player') {
      await db.delete(memberships).where(eq(memberships.id, mbByPlayer.id));
    } else if (mbByPlayer) {
      await db.update(memberships).set({ playerId: null }).where(eq(memberships.id, mbByPlayer.id));
    }
    return { ok: true };
  }

  // Con email → ¿ya existe una cuenta global con ese email?
  const [userByEmail] = await db.select().from(users).where(eq(users.email, email));

  if (userByEmail) {
    const [mbByUser] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.groupId, groupId), eq(memberships.userId, userByEmail.id)));

    if (mbByUser?.playerId && mbByUser.playerId !== playerId) {
      return { ok: false, error: 'Ese email ya está asignado a otro jugador' };
    }
    // El jugador estaba vinculado a OTRA membership (otra cuenta): soltarla.
    if (mbByPlayer && mbByPlayer.id !== mbByUser?.id) {
      if (mbByPlayer.role === 'player') {
        await db.delete(memberships).where(eq(memberships.id, mbByPlayer.id));
      } else {
        await db.update(memberships).set({ playerId: null }).where(eq(memberships.id, mbByPlayer.id));
      }
    }
    if (mbByUser) {
      // Conserva el rol existente (útil si es la cuenta del admin).
      await db.update(memberships).set({ playerId }).where(eq(memberships.id, mbByUser.id));
    } else {
      await db.insert(memberships).values({ userId: userByEmail.id, groupId, role: 'player', playerId });
    }
    return { ok: true };
  }

  // Email nuevo: si el jugador ya tenía cuenta vinculada, se renombra; si no, se crea.
  if (mbByPlayer) {
    await db.update(users).set({ email }).where(eq(users.id, mbByPlayer.userId));
  } else {
    const [created] = await db.insert(users).values({ email }).returning();
    await db.insert(memberships).values({ userId: created.id, groupId, role: 'player', playerId });
  }
  return { ok: true };
}
```

- [ ] **Step 2: Pasar `groupId` en el POST (`src/app/api/players/route.ts`)**

Sustituir la línea `const result = await upsertPlayerUser(player.id, email);` por:
```ts
    const result = await upsertPlayerUser(groupId, player.id, email);
```
(`groupId` ya está en scope en ese handler.)

- [ ] **Step 3: Pasar `groupId` en el PUT (`src/app/api/players/[id]/route.ts`)**

Sustituir la línea `const result = await upsertPlayerUser(id, email);` por:
```ts
    const result = await upsertPlayerUser(groupId, id, email);
```
(`groupId` ya está en scope en ese handler.)

- [ ] **Step 4: Usar `getLinkedUserEmail` en la edit page (`src/app/admin/players/[id]/edit/page.tsx`)**

El fichero queda:

```tsx
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { getLinkedUserEmail } from '@/lib/auth/users';
import { getPlayerInGroup } from '@/lib/players/queries';
import { notFound } from 'next/navigation';
import { PlayerForm } from '@/components/admin/player-form';

export const dynamic = 'force-dynamic';

export default async function EditPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
  const player = await getPlayerInGroup(groupId, id);
  if (!player) notFound();

  const email = await getLinkedUserEmail(groupId, id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">Editar jugador</h1>
        <p className="muted text-sm mt-1.5">{player.name}</p>
      </div>
      <PlayerForm initialData={{ ...player, email }} />
    </div>
  );
}
```

(Se eliminan los imports directos de `db`/`users`/`eq`.)

- [ ] **Step 5: tsc verde**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/users.ts src/app/api/players/route.ts "src/app/api/players/[id]/route.ts" "src/app/admin/players/[id]/edit/page.tsx"
git commit -m "feat(multitenant): el enlace Gmail↔ficha se escribe/lee desde memberships (1C)"
```

---

## Task 4: `send.ts` resuelve usuarios por `memberships.playerId`

**Files:**
- Modify: `src/lib/push/send.ts`

La columna `users.playerId` desaparece en Task 5, así que `userIdsForPlayers` (que hoy hace `inArray(users.playerId, ...)`) debe re-apuntar a `memberships`. (El scoping de push por grupo completo sigue siendo 1D; aquí solo se preserva el comportamiento actual.)

- [ ] **Step 1: Reescribir `userIdsForPlayers` en `src/lib/push/send.ts`**

Sustituir la función:
```ts
// Returns the userIds linked to any of the given playerIds.
export async function userIdsForPlayers(playerIds: string[]): Promise<string[]> {
  if (playerIds.length === 0) return [];
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.playerId, playerIds));
  return rows.map((r) => r.id);
}
```
por:
```ts
// Returns the userIds linked (vía membership) to any of the given playerIds.
export async function userIdsForPlayers(playerIds: string[]): Promise<string[]> {
  if (playerIds.length === 0) return [];
  const rows = await db
    .select({ id: memberships.userId })
    .from(memberships)
    .where(inArray(memberships.playerId, playerIds));
  return rows.map((r) => r.id);
}
```

- [ ] **Step 2: Ajustar imports en `src/lib/push/send.ts`**

En el import de `@/lib/db/schema`, añadir `memberships` y quitar `users` **solo si ya no se usa en el resto del fichero**. Verificar:

Run: `rg -n "\busers\b" src/lib/push/send.ts`
- Si no quedan otras referencias a `users`, quitarlo del import (dejar p.ej. `pushSubscriptions, memberships`).
- Si quedan, mantener ambos.

- [ ] **Step 3: tsc verde**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/push/send.ts
git commit -m "feat(multitenant): push resuelve usuarios por memberships.playerId (1C)"
```

---

## Task 5: Borrar `role` y `playerId` del schema Drizzle de `users` (el contract)

**Files:**
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Quitar las columnas de la tabla `users`**

En `src/lib/db/schema.ts`, la tabla `users` (líneas ~37-43) pasa de:
```ts
export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull().unique(),
  role: text('role').notNull().default('player'), // 'admin' | 'player'
  playerId: text('player_id').references(() => players.id, { onDelete: 'set null' }),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});
```
a:
```ts
// `users` = identidad global pura (email). El rol y el enlace user↔ficha viven en
// `memberships` (1C). Las columnas físicas `role`/`player_id` quedan inertes en la DB
// (no se dropean: quitarlas del schema basta para que el código deje de tocarlas, y
// deja intactos migrate-multitenant/migrate-auth/seed de e2e, que aún las leen).
export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull().unique(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});
```

- [ ] **Step 2: tsc verde (todos los consumidores ya migrados)**

Run: `npx tsc --noEmit`
Expected: PASS. Si tsc señala algún `.role`/`.playerId` sobre un `User` que no estaba en el mapa, migrarlo a `memberships` en este commit y anotarlo.

- [ ] **Step 3: Toda la suite unit verde**

Run: `npx vitest run`
Expected: PASS (incluye `multitenant.test.ts`, que crea su propia tabla `users` con `role`/`player_id` y NO depende del schema Drizzle → sigue verde).

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(multitenant): users pierde role/playerId del schema — memberships es la fuente de verdad (1C)"
```

---

## Task 6: e2e de regresión 1C + suite completa verde

**Files:**
- Create: `e2e/1c-roles-memberships.spec.ts`

Verifica, en navegador/API reales contra la DB de fichero aislada: (a) el gate de admin server-side, (b) que enlazar/desenlazar un Gmail escribe/borra una **membership**, (c) el error de email duplicado. Usa jugadores Lomeros libres (`pl6`, `pl7`) y limpia al final.

- [ ] **Step 1: Crear `e2e/1c-roles-memberships.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { createClient } from '@libsql/client';
import { TEST_ENV } from '../playwright.config';

const db = createClient({ url: TEST_ENV.DB_URL });

async function membershipFor(playerId: string) {
  const r = await db.execute({
    sql: "SELECT user_id, role, player_id FROM memberships WHERE group_id = 'lomeros' AND player_id = ?",
    args: [playerId],
  });
  return r.rows[0] ?? null;
}

test.describe('1C — roles y enlace desde memberships', () => {
  test.describe.configure({ mode: 'serial' });

  test('el admin entra en /admin/players', async ({ page }) => {
    await page.goto('/admin/players');
    await expect(page).toHaveURL(/\/admin\/players/);
    await expect(page.getByRole('heading', { name: /jugadores/i }).first()).toBeVisible();
  });

  test('un jugador es redirigido fuera de /admin (gate server-side)', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/player.json' });
    const page = await ctx.newPage();
    await page.goto('/admin/players');
    await expect(page).toHaveURL(/\/me/);
    await ctx.close();
  });

  test('enlazar un Gmail crea una membership y desenlazar la borra', async ({ page }) => {
    // Enlazar pl6 → email nuevo (PUT admin).
    const put = await page.request.put('/api/players/pl6', {
      data: { name: 'Jugador 6', email: 'link6@test.com' },
    });
    expect(put.ok()).toBeTruthy();

    const mb = await membershipFor('pl6');
    expect(mb).not.toBeNull();
    expect(mb!.role).toBe('player');

    // La edit page muestra el email enlazado (lo lee de memberships).
    await page.goto('/admin/players/pl6/edit');
    await expect(page.getByDisplayValue('link6@test.com')).toBeVisible();

    // Desenlazar (email vacío) borra la membership 'player'.
    const clear = await page.request.put('/api/players/pl6', {
      data: { name: 'Jugador 6', email: '' },
    });
    expect(clear.ok()).toBeTruthy();
    expect(await membershipFor('pl6')).toBeNull();
  });

  test('un email ya asignado a otro jugador devuelve 409', async ({ page }) => {
    const a = await page.request.put('/api/players/pl6', {
      data: { name: 'Jugador 6', email: 'dup@test.com' },
    });
    expect(a.ok()).toBeTruthy();

    const b = await page.request.put('/api/players/pl7', {
      data: { name: 'Jugador 7', email: 'dup@test.com' },
    });
    expect(b.status()).toBe(409);

    // Limpieza: desenlazar pl6.
    await page.request.put('/api/players/pl6', { data: { name: 'Jugador 6', email: '' } });
  });
});
```

Notas de implementación:
- Los tests con `page` usan el storageState por defecto del proyecto (admin). Verificar en `playwright.config.ts` cuál es el proyecto/`storageState` admin por defecto; si el default no es admin, envolver los tests admin con `test.use({ storageState: 'e2e/.auth/admin.json' })`.
- El selector del heading (`/jugadores/i`) y el `getByDisplayValue` del email deben casar con el DOM real de `/admin/players` y del `PlayerForm`. Ajustar al render real (abrir la página en el navegador de Playwright si hace falta) — **no** dar el test por bueno sin verlo verde.

- [ ] **Step 2: Ejecutar la nueva e2e**

Run: `npm run e2e -- 1c-roles-memberships`
Expected: PASS (4 tests).

- [ ] **Step 3: Ejecutar TODA la suite e2e (regresión: Lomeros intacto)**

Run: `npm run e2e`
Expected: PASS (toda la suite existente + la nueva). En particular, las sesiones forjadas viejas (`{userId, role}`) siguen funcionando, el jugador ve su perfil y el admin entra a todo.

- [ ] **Step 4: Commit**

```bash
git add e2e/1c-roles-memberships.spec.ts
git commit -m "test(e2e): roles/enlace desde memberships y gate de admin server-side (1C)"
```

---

## Verificación final (antes de push)

- [ ] `npx tsc --noEmit` → limpio.
- [ ] `npx vitest run` → toda la suite unit verde.
- [ ] `npm run e2e` → toda la suite e2e verde.
- [ ] `rg -n "users\.role|users\.playerId|user\.role|user\.playerId|payload\.role|session\.role"` sobre `src` → no quedan lecturas de `users.role`/`users.playerId` ni de `role` en el JWT/payload (las apariciones legítimas restantes son `memberships.role`, `session.role` en consumidores que lo reciben re-fuenteado, y el seed/migración que tocan la columna física por SQL crudo).
- [ ] Push: `git push origin HEAD:main` (Vercel auto-despliega). **Sin curl de migración** (1C no migra datos; las columnas físicas se quedan).
- [ ] Sanity prod tras el deploy: login sigue funcionando, `/admin` accesible para el dueño, un no-admin no entra, `/me` carga la ficha. (El dueño ya tiene `membership(lomeros, admin, ficha)` por el backfill de 1A.)

---

## Riesgos y notas

- **Auth en prod (lo delicado):** las cookies de sesión vivas en prod llevan `{userId, role}`; `verifySession` las sigue aceptando (ignora `role`). Nadie es deslogueado por el deploy. El rol pasa a resolverse fresco desde `memberships` en cada request (igual de fresco que hoy, que ya releía de DB).
- **Gate de /admin (opción A, elegida con el usuario):** el edge deja de redirigir por rol; lo hace `admin/layout.tsx` (un salto server-side después). Resultado idéntico para el usuario. Sin consultas a DB en el middleware.
- **Import circular session↔group-context:** ambos usos son dentro de funciones (lazy), no en carga de módulo → ESM/Next lo resuelve. La e2e del jugador (carga `getSession` real) es la prueba de que no hay ciclo roto en runtime.
- **Columnas físicas inertes:** `users.role`/`users.player_id` se quedan en la DB. `migrate-multitenant` (backfill) y el seed de e2e las siguen leyendo por SQL crudo sin problema. Dropearlas físicamente sería una limpieza futura sin valor funcional y con riesgo de acoplar la migración de backfill.
- **`super_admin` / `requireGroupAdmin`:** fuera de 1C. En Fase 1 el dueño es admin real vía membership en el único grupo; el rechazo de escritura cross-grupo al súper-admin y el rename del guard son Fase 2 (cuando exista 2º grupo y conmutador).
</content>
