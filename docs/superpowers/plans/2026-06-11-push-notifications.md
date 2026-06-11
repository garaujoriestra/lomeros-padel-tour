# Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enviar notificaciones push (Web Push / PWA) a los usuarios para recordatorios de partido, resultados, logros y avisos del admin, con un panel admin que muestra quién las tiene activadas.

**Architecture:** Web Push estándar con VAPID (librería `web-push`), sin terceros. Las suscripciones se guardan en Turso (`push_subscriptions`). El envío sale de rutas API y de un Vercel Cron. La lógica pura (selección de recordatorios, fechas en Europe/Madrid, textos de notificación, helpers de cliente) se aísla en módulos testeables con vitest; el código que toca DB/red se verifica manualmente (igual que el resto del repo, que no tiene tests de integración con DB).

**Tech Stack:** Next.js 16.2 (App Router), React 19, Drizzle ORM + libSQL (Turso), `web-push`, Vercel Cron, vitest.

---

## Notas de contexto (leer antes de empezar)

- **Patrón de rutas API**: usan `requireAdmin()` / `requireSession()` de `src/lib/auth/guard.ts`, que devuelven `{ session }` o `{ response }`. Ver `src/app/api/matches/route.ts`.
- **Patrón de migración**: `src/app/api/migrate-auth/route.ts` usa `db.run(sql\`CREATE TABLE IF NOT EXISTS ...\`)`. Se ejecuta una vez tras el deploy con `curl -X POST`.
- **Tests**: el repo testea funciones puras con vitest (`npm test`). El dev local **no** tiene DB (faltan env vars de Turso), así que **no** se escriben tests que toquen la DB.
- **Sesión**: `getSession()` devuelve `{ userId, role, email, player }`. `player` puede ser `null`.
- **Iconos**: el manifest expone `/icon` (192x192) y `/apple-icon`. Usar `/icon` como icono de notificación (no existe `/icon.png`).
- **Logros**: `src/lib/achievements/catalog.ts` exporta `ACHIEVEMENT_BY_ID: Record<string, Achievement>` con `{ id, name, icon, description }`.
- **`processMatchRatings`** (`src/lib/rating/process-match.ts`) hoy devuelve `void`. Se llama desde `src/app/api/matches/route.ts` (POST con sets) y `src/app/api/matches/[id]/route.ts` (PUT). Hay que hacer que devuelva los cambios de ELO y los logros nuevos.

## File Structure

**Crear:**
- `src/lib/push/types.ts` — tipo `PushPayload`.
- `src/lib/push/notifications.ts` — builders puros de texto (`buildResultNotification`, `buildAchievementNotification`, `buildReminderNotification`).
- `src/lib/push/notifications.test.ts` — tests de los builders.
- `src/lib/push/reminders.ts` — lógica pura `madridDateParts`, `selectReminders`.
- `src/lib/push/reminders.test.ts` — tests.
- `src/lib/push/client.ts` — `urlBase64ToUint8Array` (pura, cliente).
- `src/lib/push/client.test.ts` — test.
- `src/lib/push/send.ts` — config web-push, `sendToUsers`, `sendToAll`, `userIdsForPlayers`, `shouldDeleteSubscription` (toca DB/red salvo el último).
- `src/lib/push/send.test.ts` — test de `shouldDeleteSubscription`.
- `src/lib/push/match-events.ts` — `notifyMatchResult` (orquesta resultado+logro).
- `src/app/api/migrate-push/route.ts` — crea tablas.
- `src/app/api/push/subscribe/route.ts` — guarda suscripción.
- `src/app/api/push/unsubscribe/route.ts` — borra suscripción.
- `src/app/api/push/broadcast/route.ts` — broadcast admin.
- `src/app/api/cron/match-reminders/route.ts` — cron recordatorios.
- `public/sw.js` — service worker.
- `src/components/me/push-notifications-toggle.tsx` — interruptor cliente.
- `src/app/admin/notifications/page.tsx` — listado + form admin.
- `src/components/admin/broadcast-form.tsx` — form cliente del broadcast.
- `vercel.json` — crons.

**Modificar:**
- `src/lib/db/schema.ts` — 2 tablas + tipos.
- `src/lib/rating/process-match.ts` — devolver `MatchRatingResult`.
- `src/app/api/matches/route.ts` — disparar push tras resultado.
- `src/app/api/matches/[id]/route.ts` — disparar push tras resultado.
- `src/app/me/page.tsx` — renderizar el toggle.
- `package.json` — dependencia `web-push`.

---

### Task 1: Instalar dependencias y generar claves VAPID

**Files:**
- Modify: `package.json` (vía npm)

- [ ] **Step 1: Instalar web-push y sus tipos**

Run:
```bash
npm install web-push && npm install -D @types/web-push
```
Expected: añade `web-push` a dependencies y `@types/web-push` a devDependencies.

- [ ] **Step 2: Generar el par de claves VAPID**

Run:
```bash
npx web-push generate-vapid-keys --json
```
Expected: imprime un JSON `{ "publicKey": "...", "privateKey": "..." }`. **Copiar ambos valores** (se usan en el Step 3 y en env vars de Vercel).

- [ ] **Step 3: Crear `.env.local` con las claves (solo para no romper el build local)**

Crear/editar `.env.local` en la raíz (NO se commitea; ya está en `.gitignore`):
```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<publicKey del step 2>
VAPID_PUBLIC_KEY=<publicKey del step 2>
VAPID_PRIVATE_KEY=<privateKey del step 2>
VAPID_SUBJECT=mailto:garaujoriestra@gmail.com
CRON_SECRET=<inventar una cadena larga aleatoria>
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(push): add web-push dependency"
```

---

### Task 2: Schema de base de datos

**Files:**
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Añadir las tablas y tipos al final de `schema.ts`**

Añadir el import de `unique` en la primera línea (queda `import { sqliteTable, text, integer, real, unique } from 'drizzle-orm/sqlite-core';`) y al final del archivo, antes de la sección `TYPES`, añadir:

```ts
// ─── PUSH SUBSCRIPTIONS ──────────────────────────────────────────────────────
export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// ─── NOTIFICATION LOG (idempotencia de recordatorios) ────────────────────────
export const notificationLog = sqliteTable('notification_log', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  matchId: text('match_id').notNull(),
  kind: text('kind').notNull(), // 'reminder_day' | 'reminder_eve'
  sentAt: text('sent_at').notNull().default(sql`(datetime('now'))`),
}, (t) => ([
  unique().on(t.matchId, t.kind),
]));
```

Y en la sección `TYPES` al final, añadir:
```ts
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
export type NotificationLogRow = typeof notificationLog.$inferSelect;
```

- [ ] **Step 2: Verificar que TypeScript compila**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos relacionados con `schema.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(push): add push_subscriptions and notification_log tables"
```

---

### Task 3: Ruta de migración `/api/migrate-push`

**Files:**
- Create: `src/app/api/migrate-push/route.ts`

- [ ] **Step 1: Crear la ruta de migración**

```ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

// POST /api/migrate-push
// Crea las tablas de notificaciones push. Ejecutar UNA vez tras desplegar:
//   curl -X POST https://<dominio>/api/migrate-push
export async function POST() {
  try {
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await db.run(sql`
      CREATE TABLE IF NOT EXISTS notification_log (
        id TEXT PRIMARY KEY,
        match_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        sent_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(match_id, kind)
      )
    `);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al migrar push' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/migrate-push/route.ts
git commit -m "feat(push): add migrate-push route"
```

---

### Task 4: Tipo de payload

**Files:**
- Create: `src/lib/push/types.ts`

- [ ] **Step 1: Crear el tipo `PushPayload`**

```ts
export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  tag?: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/push/types.ts
git commit -m "feat(push): add PushPayload type"
```

---

### Task 5: Builders de texto de notificación (TDD)

**Files:**
- Create: `src/lib/push/notifications.ts`
- Test: `src/lib/push/notifications.test.ts`

- [ ] **Step 1: Escribir el test**

```ts
import { describe, it, expect } from 'vitest';
import {
  buildResultNotification,
  buildAchievementNotification,
  buildReminderNotification,
} from './notifications';

describe('buildResultNotification', () => {
  it('muestra victoria y ELO positivo', () => {
    const p = buildResultNotification(true, 12.4, 'm1');
    expect(p.title).toContain('Victoria');
    expect(p.body).toContain('Ganaste');
    expect(p.body).toContain('+12');
    expect(p.url).toBe('/matches/m1');
  });

  it('muestra derrota y ELO negativo', () => {
    const p = buildResultNotification(false, -8.7, 'm2');
    expect(p.body).toContain('Perdiste');
    expect(p.body).toContain('-9');
  });
});

describe('buildAchievementNotification', () => {
  it('construye el texto desde el catálogo', () => {
    const p = buildAchievementNotification('first_win');
    expect(p).not.toBeNull();
    expect(p!.body).toContain('Primera victoria');
    expect(p!.title).toContain('🥇');
  });

  it('devuelve null para un id desconocido', () => {
    expect(buildAchievementNotification('no_existe')).toBeNull();
  });
});

describe('buildReminderNotification', () => {
  it('dice "Hoy" para reminder_day', () => {
    const p = buildReminderNotification('reminder_day', 'Club Padel', 'm3');
    expect(p.body).toContain('Hoy');
    expect(p.body).toContain('Club Padel');
    expect(p.url).toBe('/matches/m3');
  });

  it('dice "Mañana" para reminder_eve sin detalle', () => {
    const p = buildReminderNotification('reminder_eve', '', 'm4');
    expect(p.body).toContain('Mañana');
  });
});
```

- [ ] **Step 2: Ejecutar el test (debe fallar)**

Run: `npm test -- src/lib/push/notifications.test.ts`
Expected: FAIL — `Cannot find module './notifications'`.

- [ ] **Step 3: Implementar los builders**

```ts
import { ACHIEVEMENT_BY_ID } from '@/lib/achievements/catalog';
import type { PushPayload } from './types';

export type ReminderKind = 'reminder_day' | 'reminder_eve';

export function buildResultNotification(
  didWin: boolean,
  eloChange: number,
  matchId: string,
): PushPayload {
  const rounded = Math.round(eloChange);
  const sign = rounded >= 0 ? '+' : '';
  return {
    title: didWin ? '🏆 ¡Victoria registrada!' : '📋 Resultado registrado',
    body: `${didWin ? 'Ganaste' : 'Perdiste'} · ELO ${sign}${rounded}`,
    url: `/matches/${matchId}`,
    tag: `result-${matchId}`,
  };
}

export function buildAchievementNotification(achievementId: string): PushPayload | null {
  const a = ACHIEVEMENT_BY_ID[achievementId];
  if (!a) return null;
  return {
    title: `${a.icon} ¡Logro desbloqueado!`,
    body: `${a.name} — ${a.description}`,
    url: '/me',
    tag: `achievement-${achievementId}`,
  };
}

export function buildReminderNotification(
  kind: ReminderKind,
  detail: string,
  matchId: string,
): PushPayload {
  const when = kind === 'reminder_day' ? 'Hoy juegas un partido' : 'Mañana tienes partido';
  return {
    title: '🎾 Recordatorio de partido',
    body: detail ? `${when} · ${detail}` : when,
    url: `/matches/${matchId}`,
    tag: `reminder-${matchId}-${kind}`,
  };
}
```

- [ ] **Step 4: Ejecutar el test (debe pasar)**

Run: `npm test -- src/lib/push/notifications.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/push/notifications.ts src/lib/push/notifications.test.ts
git commit -m "feat(push): notification text builders"
```

---

### Task 6: Lógica de recordatorios (TDD)

**Files:**
- Create: `src/lib/push/reminders.ts`
- Test: `src/lib/push/reminders.test.ts`

- [ ] **Step 1: Escribir el test**

```ts
import { describe, it, expect } from 'vitest';
import { madridDateParts, selectReminders } from './reminders';

describe('madridDateParts', () => {
  it('devuelve hoy y mañana en formato YYYY-MM-DD', () => {
    // 2026-06-11 10:00 UTC → en Madrid (verano, UTC+2) es 2026-06-11
    const { today, tomorrow } = madridDateParts(new Date('2026-06-11T10:00:00Z'));
    expect(today).toBe('2026-06-11');
    expect(tomorrow).toBe('2026-06-12');
  });

  it('usa la zona horaria de Madrid, no UTC', () => {
    // 2026-06-11 23:30 UTC → en Madrid (UTC+2) ya es 2026-06-12 01:30
    const { today } = madridDateParts(new Date('2026-06-11T23:30:00Z'));
    expect(today).toBe('2026-06-12');
  });
});

describe('selectReminders', () => {
  const matches = [
    { id: 'a', date: '2026-06-11' },
    { id: 'b', date: '2026-06-12' },
    { id: 'c', date: '2026-06-20' },
  ];

  it('marca los de hoy como reminder_day y los de mañana como reminder_eve', () => {
    const out = selectReminders(matches, '2026-06-11', '2026-06-12');
    expect(out).toEqual([
      { matchId: 'a', kind: 'reminder_day' },
      { matchId: 'b', kind: 'reminder_eve' },
    ]);
  });

  it('ignora partidos fuera de hoy/mañana', () => {
    const out = selectReminders(matches, '2026-06-11', '2026-06-12');
    expect(out.find((r) => r.matchId === 'c')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Ejecutar el test (debe fallar)**

Run: `npm test -- src/lib/push/reminders.test.ts`
Expected: FAIL — `Cannot find module './reminders'`.

- [ ] **Step 3: Implementar**

```ts
import type { ReminderKind } from './notifications';

export function madridDateParts(now: Date): { today: string; tomorrow: string } {
  // en-CA produce el formato YYYY-MM-DD
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Madrid',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  const today = fmt(now);
  const tomorrow = fmt(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  return { today, tomorrow };
}

export function selectReminders(
  matches: { id: string; date: string }[],
  today: string,
  tomorrow: string,
): { matchId: string; kind: ReminderKind }[] {
  const out: { matchId: string; kind: ReminderKind }[] = [];
  for (const m of matches) {
    if (m.date === today) out.push({ matchId: m.id, kind: 'reminder_day' });
    else if (m.date === tomorrow) out.push({ matchId: m.id, kind: 'reminder_eve' });
  }
  return out;
}
```

- [ ] **Step 4: Ejecutar el test (debe pasar)**

Run: `npm test -- src/lib/push/reminders.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/push/reminders.ts src/lib/push/reminders.test.ts
git commit -m "feat(push): reminder selection logic"
```

---

### Task 7: Helper de cliente `urlBase64ToUint8Array` (TDD)

**Files:**
- Create: `src/lib/push/client.ts`
- Test: `src/lib/push/client.test.ts`

- [ ] **Step 1: Escribir el test**

```ts
import { describe, it, expect } from 'vitest';
import { urlBase64ToUint8Array } from './client';

describe('urlBase64ToUint8Array', () => {
  it('convierte base64url a Uint8Array de la longitud correcta', () => {
    // "AQID" en base64 = bytes [1,2,3]
    const out = urlBase64ToUint8Array('AQID');
    expect(out).toBeInstanceOf(Uint8Array);
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });

  it('maneja caracteres url-safe (- y _)', () => {
    // base64url "-_8" → base64 "+/8" → bytes [251, 255]
    const out = urlBase64ToUint8Array('-_8');
    expect(Array.from(out)).toEqual([251, 255]);
  });
});
```

- [ ] **Step 2: Ejecutar el test (debe fallar)**

Run: `npm test -- src/lib/push/client.test.ts`
Expected: FAIL — `Cannot find module './client'`.

- [ ] **Step 3: Implementar**

```ts
// Convierte la clave VAPID pública (base64url) al Uint8Array que exige
// pushManager.subscribe({ applicationServerKey }).
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
```

- [ ] **Step 4: Ejecutar el test (debe pasar)**

Run: `npm test -- src/lib/push/client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/push/client.ts src/lib/push/client.test.ts
git commit -m "feat(push): urlBase64ToUint8Array client helper"
```

---

### Task 8: Helper de envío `send.ts` (+ TDD de la parte pura)

**Files:**
- Create: `src/lib/push/send.ts`
- Test: `src/lib/push/send.test.ts`

- [ ] **Step 1: Escribir el test de la parte pura**

```ts
import { describe, it, expect } from 'vitest';
import { shouldDeleteSubscription } from './send';

describe('shouldDeleteSubscription', () => {
  it('borra en 404 y 410 (suscripción muerta)', () => {
    expect(shouldDeleteSubscription(404)).toBe(true);
    expect(shouldDeleteSubscription(410)).toBe(true);
  });

  it('no borra en otros códigos', () => {
    expect(shouldDeleteSubscription(500)).toBe(false);
    expect(shouldDeleteSubscription(201)).toBe(false);
    expect(shouldDeleteSubscription(0)).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar el test (debe fallar)**

Run: `npm test -- src/lib/push/send.test.ts`
Expected: FAIL — `Cannot find module './send'`.

- [ ] **Step 3: Implementar `send.ts`**

```ts
import webpush from 'web-push';
import { inArray, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { pushSubscriptions, users } from '@/lib/db/schema';
import type { PushPayload } from './types';

const DEFAULT_ICON = '/icon';

let configured = false;
function ensureVapid() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '',
    process.env.VAPID_PRIVATE_KEY || '',
  );
  configured = true;
}

export function shouldDeleteSubscription(statusCode: number): boolean {
  return statusCode === 404 || statusCode === 410;
}

type SubRow = typeof pushSubscriptions.$inferSelect;

async function sendToSubscriptions(subs: SubRow[], payload: PushPayload): Promise<void> {
  if (subs.length === 0) return;
  ensureVapid();
  const body = JSON.stringify({ icon: DEFAULT_ICON, ...payload });
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode ?? 0;
        if (shouldDeleteSubscription(statusCode)) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, s.endpoint));
        } else {
          console.error('push send error', statusCode, err);
        }
      }
    }),
  );
}

// Devuelve los userId enlazados a cualquiera de los playerId dados.
export async function userIdsForPlayers(playerIds: string[]): Promise<string[]> {
  if (playerIds.length === 0) return [];
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.playerId, playerIds));
  return rows.map((r) => r.id);
}

export async function sendToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (userIds.length === 0) return;
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, userIds));
  await sendToSubscriptions(subs, payload);
}

export async function sendToAll(payload: PushPayload): Promise<void> {
  const subs = await db.select().from(pushSubscriptions);
  await sendToSubscriptions(subs, payload);
}
```

- [ ] **Step 4: Ejecutar el test (debe pasar)**

Run: `npm test -- src/lib/push/send.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/push/send.ts src/lib/push/send.test.ts
git commit -m "feat(push): web-push send helpers"
```

---

### Task 9: Rutas API subscribe / unsubscribe

**Files:**
- Create: `src/app/api/push/subscribe/route.ts`
- Create: `src/app/api/push/unsubscribe/route.ts`

- [ ] **Step 1: Crear `subscribe/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { pushSubscriptions } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth/guard';

// POST /api/push/subscribe — guarda la suscripción del usuario actual.
// Body: { subscription: { endpoint, keys: { p256dh, auth } } }
export async function POST(request: NextRequest) {
  const auth = await requireSession();
  if ('response' in auth) return auth.response;
  try {
    const { subscription } = await request.json();
    const endpoint = subscription?.endpoint;
    const p256dh = subscription?.keys?.p256dh;
    const authKey = subscription?.keys?.auth;
    if (!endpoint || !p256dh || !authKey) {
      return NextResponse.json({ error: 'Suscripción inválida' }, { status: 400 });
    }

    const userAgent = request.headers.get('user-agent') ?? null;

    // Upsert por endpoint: si ya existe, lo reasigna a este usuario.
    await db
      .insert(pushSubscriptions)
      .values({ userId: auth.session.userId, endpoint, p256dh, auth: authKey, userAgent })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId: auth.session.userId, p256dh, auth: authKey, userAgent },
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al guardar suscripción' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Crear `unsubscribe/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { pushSubscriptions } from '@/lib/db/schema';
import { requireSession } from '@/lib/auth/guard';

// POST /api/push/unsubscribe — borra una suscripción del usuario actual.
// Body: { endpoint }
export async function POST(request: NextRequest) {
  const auth = await requireSession();
  if ('response' in auth) return auth.response;
  try {
    const { endpoint } = await request.json();
    if (!endpoint) {
      return NextResponse.json({ error: 'Falta endpoint' }, { status: 400 });
    }
    await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.endpoint, endpoint),
          eq(pushSubscriptions.userId, auth.session.userId),
        ),
      );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al borrar suscripción' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/push/subscribe/route.ts src/app/api/push/unsubscribe/route.ts
git commit -m "feat(push): subscribe/unsubscribe API routes"
```

---

### Task 10: Service worker

**Files:**
- Create: `public/sw.js`

- [ ] **Step 1: Crear `public/sw.js`**

```js
self.addEventListener('push', function (event) {
  if (!event.data) return;
  const data = event.data.json();
  const options = {
    body: data.body,
    icon: data.icon || '/icon',
    badge: '/icon',
    data: { url: data.url || '/' },
    tag: data.tag,
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
```

- [ ] **Step 2: Verificar que se sirve**

Run: `npm run dev` y en otra terminal `curl -I http://localhost:3000/sw.js`
Expected: `200 OK`, `Content-Type` de JavaScript. (Si el dev server no arranca por falta de env vars de Turso, basta con verificar que el archivo existe en `public/sw.js`.)

- [ ] **Step 3: Commit**

```bash
git add public/sw.js
git commit -m "feat(push): service worker for push + notificationclick"
```

---

### Task 11: Componente toggle en `/me`

**Files:**
- Create: `src/components/me/push-notifications-toggle.tsx`
- Modify: `src/app/me/page.tsx`

- [ ] **Step 1: Crear el componente cliente**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { urlBase64ToUint8Array } from '@/lib/push/client';

type State = 'loading' | 'unsupported' | 'needs-install' | 'off' | 'on';

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function PushNotificationsToggle() {
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!supported) {
      // En iOS, sin instalar como PWA, PushManager no está disponible.
      setState(isIos() && !isStandalone() ? 'needs-install' : 'unsupported');
      return;
    }
    if (isIos() && !isStandalone()) {
      setState('needs-install');
      return;
    }
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? 'on' : 'off'))
      .catch(() => setState('unsupported'));
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.error('Permiso de notificaciones denegado');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      });
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: JSON.parse(JSON.stringify(sub)) }),
      });
      if (!res.ok) throw new Error('subscribe failed');
      setState('on');
      toast.success('Notificaciones activadas');
    } catch {
      toast.error('No se pudieron activar las notificaciones');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState('off');
      toast.success('Notificaciones desactivadas');
    } catch {
      toast.error('No se pudieron desactivar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-gray-800">🔔 Notificaciones</h3>
          <p className="text-sm text-gray-500">
            Recordatorios de partido, resultados y logros.
          </p>
        </div>
        {state === 'loading' && <span className="text-sm text-gray-400">…</span>}
        {state === 'unsupported' && (
          <span className="text-sm text-gray-400">No soportado</span>
        )}
        {state === 'off' && (
          <button
            onClick={enable}
            disabled={busy}
            className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Activar
          </button>
        )}
        {state === 'on' && (
          <button
            onClick={disable}
            disabled={busy}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50"
          >
            Desactivar
          </button>
        )}
      </div>
      {state === 'needs-install' && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Para recibir notificaciones en iPhone, añade la app a tu pantalla de inicio:
          pulsa <strong>Compartir</strong> → <strong>Añadir a pantalla de inicio</strong>, y
          ábrela desde ahí.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Renderizar el toggle en `/me`**

En `src/app/me/page.tsx`, añadir el import al principio:
```tsx
import { PushNotificationsToggle } from '@/components/me/push-notifications-toggle';
```

Reemplazar el bloque del usuario sin jugador (`return ( <div ...> ... </div> )`) para incluir el toggle al final, justo antes de cerrar el `</div>` exterior, añadiendo:
```tsx
        <div className="mt-6 text-left">
          <PushNotificationsToggle />
        </div>
```

Y reemplazar la última línea `return <PlayerProfileView data={data} editable />;` por:
```tsx
  return (
    <div className="space-y-6">
      <PlayerProfileView data={data} editable />
      <PushNotificationsToggle />
    </div>
  );
```

- [ ] **Step 3: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/components/me/push-notifications-toggle.tsx src/app/me/page.tsx
git commit -m "feat(push): notifications toggle in /me"
```

---

### Task 12: `processMatchRatings` devuelve cambios de ELO y logros

**Files:**
- Modify: `src/lib/rating/process-match.ts`

- [ ] **Step 1: Definir el tipo de retorno y exportarlo**

Al principio de `src/lib/rating/process-match.ts` (después de los imports), añadir:
```ts
export interface MatchRatingResult {
  eloChanges: { playerId: string; eloAfter: number; eloChange: number }[];
  newAchievements: { playerId: string; achievementId: string }[];
}
```

- [ ] **Step 2: Hacer que `applyAchievementsForMatch` devuelva los logros nuevos**

En la función `applyAchievementsForMatch`, cambiar la firma a:
```ts
async function applyAchievementsForMatch(matchId: string): Promise<{ playerId: string; achievementId: string }[]> {
```
En el `return;` temprano (cuando `!thisMatch`), cambiarlo por:
```ts
  if (!thisMatch) return [];
```
Y al final de la función, después del bucle `for (const g of grantsToInsert) { ... }`, añadir:
```ts
  return grantsToInsert.map((g) => ({ playerId: g.playerId, achievementId: g.achievementId }));
```

- [ ] **Step 3: Hacer que `processMatchRatings` devuelva `MatchRatingResult`**

Cambiar la firma:
```ts
export async function processMatchRatings(match: MatchInput): Promise<MatchRatingResult> {
```
La variable `eloResults` (resultado de `calculateDoublesElo`) ya tiene `{ playerId, eloBefore, eloAfter, eloChange }` por jugador. Al final de la función, donde hoy termina tras `await applyAchievementsForMatch(match.id);`, cambiar esa línea por:
```ts
  const newAchievements = await applyAchievementsForMatch(match.id);

  return {
    eloChanges: eloResults.map((r) => ({
      playerId: r.playerId,
      eloAfter: r.eloAfter,
      eloChange: r.eloChange,
    })),
    newAchievements,
  };
```

- [ ] **Step 4: Verificar compilación y tests existentes**

Run: `npx tsc --noEmit && npm test`
Expected: compila; los tests existentes siguen pasando (este cambio solo añade un valor de retorno).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rating/process-match.ts
git commit -m "feat(push): processMatchRatings returns elo changes + new achievements"
```

---

### Task 13: Orquestador `notifyMatchResult` y enganche en rutas de partidos

**Files:**
- Create: `src/lib/push/match-events.ts`
- Modify: `src/app/api/matches/route.ts`
- Modify: `src/app/api/matches/[id]/route.ts`

- [ ] **Step 1: Crear `match-events.ts`**

```ts
import { sendToUsers, userIdsForPlayers } from './send';
import { buildResultNotification, buildAchievementNotification } from './notifications';
import type { MatchRatingResult } from '@/lib/rating/process-match';

interface MatchTeams {
  id: string;
  winnerTeam: number | null;
  team1Player1Id: string;
  team1Player2Id: string;
  team2Player1Id: string;
  team2Player2Id: string;
}

// Envía push de resultado a los 4 jugadores y de logro a quien corresponda.
// Best-effort: nunca lanza; los errores se loguean.
export async function notifyMatchResult(match: MatchTeams, result: MatchRatingResult): Promise<void> {
  try {
    const winners =
      match.winnerTeam === 1
        ? [match.team1Player1Id, match.team1Player2Id]
        : [match.team2Player1Id, match.team2Player2Id];

    for (const ec of result.eloChanges) {
      const userIds = await userIdsForPlayers([ec.playerId]);
      if (userIds.length === 0) continue;
      const didWin = winners.includes(ec.playerId);
      await sendToUsers(userIds, buildResultNotification(didWin, ec.eloChange, match.id));
    }

    for (const ach of result.newAchievements) {
      const payload = buildAchievementNotification(ach.achievementId);
      if (!payload) continue;
      const userIds = await userIdsForPlayers([ach.playerId]);
      if (userIds.length === 0) continue;
      await sendToUsers(userIds, payload);
    }
  } catch (error) {
    console.error('notifyMatchResult error', error);
  }
}
```

- [ ] **Step 2: Enganchar en `POST /api/matches`**

En `src/app/api/matches/route.ts`, añadir el import:
```ts
import { notifyMatchResult } from '@/lib/push/match-events';
```
Localizar el bloque dentro de `if (!isScheduled) { ... }` donde llama a `processMatchRatings`:
```ts
      // Update ratings
      await processMatchRatings({
        ...match,
        winnerTeam: winnerTeam as 1 | 2,
        sets,
      });
```
Reemplazarlo por:
```ts
      // Update ratings
      const ratingResult = await processMatchRatings({
        ...match,
        winnerTeam: winnerTeam as 1 | 2,
        sets,
      });

      // Push best-effort (no debe romper el guardado del partido)
      await notifyMatchResult({ ...match, winnerTeam }, ratingResult);
```

- [ ] **Step 3: Enganchar en `PUT /api/matches/[id]`**

En `src/app/api/matches/[id]/route.ts`, añadir el import:
```ts
import { notifyMatchResult } from '@/lib/push/match-events';
```
Localizar:
```ts
    // Trigger Elo calculation
    await processMatchRatings({ ...updated, winnerTeam, sets });
```
Reemplazarlo por:
```ts
    // Trigger Elo calculation
    const ratingResult = await processMatchRatings({ ...updated, winnerTeam, sets });

    // Push best-effort (no debe romper el guardado del resultado)
    await notifyMatchResult({ ...updated, winnerTeam }, ratingResult);
```

- [ ] **Step 4: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/push/match-events.ts src/app/api/matches/route.ts "src/app/api/matches/[id]/route.ts"
git commit -m "feat(push): notify players on match result + achievements"
```

---

### Task 14: Cron de recordatorios + `vercel.json`

**Files:**
- Create: `src/app/api/cron/match-reminders/route.ts`
- Create: `vercel.json`

- [ ] **Step 1: Crear la ruta del cron**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { matches, notificationLog } from '@/lib/db/schema';
import { madridDateParts, selectReminders } from '@/lib/push/reminders';
import { buildReminderNotification } from '@/lib/push/notifications';
import { sendToUsers, userIdsForPlayers } from '@/lib/push/send';

export const dynamic = 'force-dynamic';

// GET /api/cron/match-reminders?kind=day|eve
// Lo invoca Vercel Cron con el header Authorization: Bearer <CRON_SECRET>.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const kindParam = new URL(request.url).searchParams.get('kind');
  const wantKind = kindParam === 'eve' ? 'reminder_eve' : 'reminder_day';

  const { today, tomorrow } = madridDateParts(new Date());
  const scheduled = await db.select().from(matches).where(eq(matches.status, 'scheduled'));
  const due = selectReminders(scheduled, today, tomorrow).filter((r) => r.kind === wantKind);

  let sent = 0;
  for (const r of due) {
    // Idempotencia: insertar en notification_log; si choca con UNIQUE, ya se envió.
    try {
      await db.insert(notificationLog).values({ matchId: r.matchId, kind: r.kind });
    } catch {
      continue;
    }
    const m = scheduled.find((x) => x.id === r.matchId);
    if (!m) continue;
    const playerIds = [m.team1Player1Id, m.team1Player2Id, m.team2Player1Id, m.team2Player2Id];
    const userIds = await userIdsForPlayers(playerIds);
    const detail = m.location ?? '';
    await sendToUsers(userIds, buildReminderNotification(r.kind, detail, r.matchId));
    sent++;
  }

  return NextResponse.json({ ok: true, kind: wantKind, sent });
}
```

- [ ] **Step 2: Crear `vercel.json` con los dos crons**

```json
{
  "crons": [
    { "path": "/api/cron/match-reminders?kind=day", "schedule": "0 7 * * *" },
    { "path": "/api/cron/match-reminders?kind=eve", "schedule": "0 16 * * *" }
  ]
}
```

Nota: los horarios están en **UTC**. `0 7 * * *` ≈ 9:00 Madrid en verano (UTC+2) / 8:00 en invierno (UTC+1); `0 16 * * *` ≈ 18:00 / 17:00. Aproximación aceptable para recordatorios.

- [ ] **Step 3: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/match-reminders/route.ts vercel.json
git commit -m "feat(push): match reminder cron (eve + day)"
```

---

### Task 15: Broadcast del admin + visibilidad de estado

**Files:**
- Create: `src/app/api/push/broadcast/route.ts`
- Create: `src/components/admin/broadcast-form.tsx`
- Create: `src/app/admin/notifications/page.tsx`

- [ ] **Step 1: Crear la ruta de broadcast**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { sendToAll } from '@/lib/push/send';

// POST /api/push/broadcast — envía un aviso a todas las suscripciones (solo admin).
// Body: { title, body, url? }
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { title, body, url } = await request.json();
    if (!title || !body) {
      return NextResponse.json({ error: 'Título y cuerpo son obligatorios' }, { status: 400 });
    }
    await sendToAll({
      title: String(title),
      body: String(body),
      url: typeof url === 'string' && url.length > 0 ? url : '/',
      tag: 'broadcast',
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al enviar el aviso' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Crear el formulario cliente**

```tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';

export function BroadcastForm() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/push/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body }),
      });
      if (!res.ok) throw new Error('failed');
      toast.success('Aviso enviado');
      setTitle('');
      setBody('');
    } catch {
      toast.error('No se pudo enviar el aviso');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={send} className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="font-semibold text-gray-800">📢 Enviar aviso a todos</h2>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título (ej. ¡Hueco para jugar!)"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        required
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Mensaje"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        rows={3}
        required
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? 'Enviando…' : 'Enviar'}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Crear la página admin con el listado de estado**

```tsx
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { users, players, pushSubscriptions } from '@/lib/db/schema';
import { BroadcastForm } from '@/components/admin/broadcast-form';

export const dynamic = 'force-dynamic';

export default async function AdminNotificationsPage() {
  const session = await getSession();
  if (!session) redirect('/login?from=/admin/notifications');
  if (session.role !== 'admin') redirect('/');

  const allUsers = await db.select().from(users);
  const allPlayers = await db.select().from(players);
  const subs = await db.select().from(pushSubscriptions);

  const playerName = new Map(allPlayers.map((p) => [p.id, p.name]));
  const subCount = new Map<string, number>();
  for (const s of subs) {
    subCount.set(s.userId, (subCount.get(s.userId) ?? 0) + 1);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      <h1 className="text-2xl font-bold text-gray-800">Notificaciones</h1>

      <BroadcastForm />

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 font-semibold text-gray-800">Estado por usuario</h2>
        <ul className="divide-y divide-gray-100">
          {allUsers.map((u) => {
            const count = subCount.get(u.id) ?? 0;
            const name = u.playerId ? playerName.get(u.playerId) : null;
            return (
              <li key={u.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-gray-700">
                  {name ?? u.email}
                  {name && <span className="ml-2 text-gray-400">{u.email}</span>}
                </span>
                {count > 0 ? (
                  <span className="font-medium text-green-700">
                    🔔 Activadas{count > 1 ? ` · ${count} disp.` : ''}
                  </span>
                ) : (
                  <span className="text-gray-400">🔕 Desactivadas</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verificar compilación**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/push/broadcast/route.ts src/components/admin/broadcast-form.tsx src/app/admin/notifications/page.tsx
git commit -m "feat(push): admin broadcast + subscription status panel"
```

---

### Task 16: Enlace en el panel admin y verificación final

**Files:**
- Modify: `src/app/admin/page.tsx` (añadir enlace a `/admin/notifications`)

- [ ] **Step 1: Añadir enlace a la nueva página**

En `src/app/admin/page.tsx`, dentro del `<CardContent className="space-y-2 text-sm text-gray-600">` de la tarjeta "Acciones rápidas", añadir una línea más después del párrafo del Dashboard público:

```tsx
          <p>👉 Ve a <Link href="/admin/notifications" className="text-green-700 font-medium hover:underline">Notificaciones</Link> para enviar avisos y ver quién las tiene activadas.</p>
```

- [ ] **Step 2: Verificar build completo y tests**

Run: `npx tsc --noEmit && npm test && npm run lint`
Expected: compila, todos los tests pasan, lint limpio.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat(push): link to notifications page from admin"
```

---

## Despliegue (manual, tras mergear)

1. **Env vars en Vercel** (Production): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `CRON_SECRET`. (Las mismas que en `.env.local`.)
2. **Deploy** (push a `main` → Vercel auto-despliega).
3. **Migrar la DB**: `curl -X POST https://<dominio>/api/migrate-push`.
4. **Probar en iPhone**: abrir la PWA instalada → `/me` → Activar → enviar un broadcast desde `/admin/notifications` y comprobar que llega.
5. **Verificar el cron**: en el dashboard de Vercel, sección Cron Jobs, confirmar que aparecen las 2 entradas.

## Verificación de cobertura del spec

- Recordatorio víspera + día → Task 6, 14 ✅
- Resultado registrado → Task 12, 13 ✅
- Logro desbloqueado → Task 12, 13 ✅
- Aviso manual admin → Task 15 ✅
- On/off global por usuario → Task 9, 11 ✅
- Panel admin con estado por usuario → Task 15 ✅
- Limpieza de suscripciones muertas → Task 8 ✅
- Idempotencia de recordatorios → Task 2, 14 ✅
- Restricción iOS (PWA instalada) → Task 11 ✅
- Orden de despliegue / migración → Task 3 + sección Despliegue ✅
