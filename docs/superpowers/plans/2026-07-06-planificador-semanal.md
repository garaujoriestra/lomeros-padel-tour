# Planificador Semanal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página «Planificador» donde cada jugador pinta su disponibilidad semanal en slots de 30 min (bloques ≥1,5h), los dueños de pista pintan la de su pista, y la app muestra las coincidencias (≥4 jugadores + pista efectiva = pista ∩ dueño).

**Architecture:** Lógica pura en `src/lib/planner/` (semanas, validación de slots, matcher de coincidencias) con tests unitarios; acceso a DB solo vía `src/lib/planner/queries.ts`; API bajo `requireGroupSession` con escritura solo de lo propio (`ctx.playerId`); UI con el patrón de paridad Fase 2 (Body compartido + página raíz + `/g/[slug]`). Spec aprobada: `docs/superpowers/specs/2026-07-06-planificador-semanal-design.md`.

**Tech Stack:** Next.js 16 App Router (¡leer `node_modules/next/dist/docs/` ante cualquier duda — `params`/`searchParams` son Promise!), Drizzle + libsql/Turso (SQLite), vitest, Playwright, sonner (toasts), lucide-react.

---

## Convenciones del repo que DEBES seguir

- **Nunca** accedas a tablas con Drizzle desde `src/app/**`: toda query vive en `src/lib/<dominio>/queries.ts` (guard `npm run check:db-access` + test `no-direct-db-access.test.ts`).
- Rutas API: `requireGroupSession(await groupIdFromValue(body.g))` para mutaciones, `requireGroupSession(await groupIdFromQuery(request))` para GET/DELETE. Patrón de referencia: `src/app/api/bets/route.ts`.
- Páginas: `export const dynamic = 'force-dynamic'`; en `/g/[slug]` los `params` llegan como `Promise<{ slug: string }>` y se resuelven con `resolvePageContext(slug)`. Patrón: `src/app/me/page.tsx` + `src/app/g/[slug]/me/page.tsx` + `src/components/pages/me-body.tsx`.
- Comentarios y textos de UI en español, estilo de los ficheros vecinos.
- Horas SIEMPRE en hora local del grupo (Europe/Madrid) como «minutos desde medianoche»; solo `madridTodayIso()` consulta la zona horaria.
- Commits frecuentes, mensajes en español estilo `feat(planner): …`, terminados en `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Mapa de ficheros

**Crear:**
- `src/lib/planner/config.ts` — constantes (slots, rango horario, mínimos)
- `src/lib/planner/weeks.ts` + `weeks.test.ts` — semanas L→D, hoy en Madrid, semanas editables
- `src/lib/planner/slots.ts` + `slots.test.ts` — validación de listas de slots, formato HH:MM, rangos
- `src/lib/planner/validate.ts` + `validate.test.ts` — validación del payload de escritura
- `src/lib/planner/matcher.ts` + `matcher.test.ts` — coincidencias de un día (puro)
- `src/lib/planner/queries.ts` — DB: courts + planner_slots
- `src/lib/planner/week-data.ts` — `loadWeekView()`: vista completa de la semana
- `src/app/api/migrate-planner/route.ts` — migración prod (CREATE TABLE IF NOT EXISTS)
- `src/app/api/planner/route.ts` — GET vista de semana
- `src/app/api/planner/availability/route.ts` — PUT mi disponibilidad (un día)
- `src/app/api/planner/court/route.ts` — POST crear mi pista / PATCH renombrar
- `src/app/api/planner/court/availability/route.ts` — PUT disponibilidad de mi pista
- `src/components/planner/availability-grid.tsx` — cuadrícula pintable (client)
- `src/components/planner/court-section.tsx` — sección «Mi pista» (client)
- `src/components/planner/coincidences.tsx` — lista de coincidencias (server)
- `src/components/pages/planner-body.tsx` — Body compartido raíz + grupo
- `src/app/planificador/layout.tsx` + `page.tsx` — página raíz
- `src/app/g/[slug]/planificador/page.tsx` — página de grupo
- `e2e/planner.spec.ts` — suite e2e

**Modificar:**
- `src/lib/db/schema.ts` — tablas `courts` y `plannerSlots` + tipos
- `src/lib/db/bootstrap.ts` + `bootstrap.test.ts` — CREATE TABLE de ambas
- `src/lib/auth/authorize.ts` + `authorize.test.ts` — `/planificador` exige sesión
- `src/lib/groups/resolve-slug.ts` + `resolve-slug.test.ts` — slug reservado `planificador`
- `src/components/shared/nav-links.tsx` — pestaña «Planificador»
- `src/components/pages/group-home-body.tsx` — enlace al planificador del grupo
- `e2e/README.md` — sección «Qué cubre»

---

### Task 1: Tablas `courts` y `planner_slots` (schema + bootstrap + migración prod)

**Files:**
- Modify: `src/lib/db/schema.ts` (tras el bloque de `tournamentMatches`, antes de `// ─── TYPES`)
- Modify: `src/lib/db/bootstrap.ts` (al final de `ensureAuxTables`)
- Modify: `src/lib/db/bootstrap.test.ts`
- Create: `src/app/api/migrate-planner/route.ts`

- [ ] **Step 1: Ampliar el test de bootstrap para que exija las tablas nuevas (failing test)**

En `src/lib/db/bootstrap.test.ts`, sustituir la consulta a `sqlite_master` y su aserción por:

```ts
    const t = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN " +
        "('bets','token_ledger','rewards','redemptions','penalties','push_subscriptions','player_achievements','courts','planner_slots')",
    );
    expect(t.rows.length).toBe(9);
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/lib/db/bootstrap.test.ts`
Expected: FAIL — `expected 7 to be 9`

- [ ] **Step 3: Añadir las tablas a `ensureAuxTables`**

Al final de `ensureAuxTables` en `src/lib/db/bootstrap.ts` (tras el bloque de `push_subscriptions`):

```ts
  // Planificador semanal (v1): pista por jugador + disponibilidad por slots de 30 min.
  await client.execute(`CREATE TABLE IF NOT EXISTS courts (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL DEFAULT 'lomeros',
    owner_player_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  await client.execute(`CREATE TABLE IF NOT EXISTS planner_slots (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL DEFAULT 'lomeros',
    week_start TEXT NOT NULL,
    day INTEGER NOT NULL,
    subject_type TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    slots TEXT NOT NULL,
    UNIQUE (week_start, day, subject_type, subject_id)
  )`);
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/lib/db/bootstrap.test.ts`
Expected: PASS

- [ ] **Step 5: Declarar las tablas en el schema Drizzle**

En `src/lib/db/schema.ts`, después de `tournamentMatches` y antes de `// ─── TYPES`:

```ts
// ─── PLANNER (planificador semanal) ──────────────────────────────────────────
// Pista propia de un jugador (una por jugador; solo su dueño la gestiona).
export const courts = sqliteTable('courts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  groupId: text('group_id').notNull().references(() => groups.id),
  ownerPlayerId: text('owner_player_id').notNull().unique().references(() => players.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// Disponibilidad de UN día de una semana para un sujeto (jugador o pista).
// `slots` = JSON con los minutos de inicio pintados, orden ascendente
// (p. ej. "[1200,1230,1260,1290]" = 20:00–22:00). Semana = fecha de su lunes.
export const plannerSlots = sqliteTable('planner_slots', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  groupId: text('group_id').notNull().references(() => groups.id),
  weekStart: text('week_start').notNull(), // lunes YYYY-MM-DD
  day: integer('day').notNull(),           // 0=lunes … 6=domingo
  subjectType: text('subject_type').notNull(), // 'player' | 'court'
  subjectId: text('subject_id').notNull(),     // players.id o courts.id según subjectType
  slots: text('slots').notNull(),
}, (t) => ([
  unique().on(t.weekStart, t.day, t.subjectType, t.subjectId),
]));
```

Y al final del bloque de tipos:

```ts
export type Court = typeof courts.$inferSelect;
export type NewCourt = typeof courts.$inferInsert;
export type PlannerSlotRow = typeof plannerSlots.$inferSelect;
export type NewPlannerSlot = typeof plannerSlots.$inferInsert;
```

- [ ] **Step 6: Crear la ruta de migración de producción**

Create `src/app/api/migrate-planner/route.ts` (mismo patrón que `src/app/api/migrate-push/route.ts`):

```ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

// POST /api/migrate-planner
// Crea las tablas del planificador semanal. Ejecutar UNA vez tras desplegar:
//   curl -X POST https://<dominio>/api/migrate-planner
export async function POST() {
  try {
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS courts (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL DEFAULT 'lomeros',
        owner_player_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await db.run(sql`
      CREATE TABLE IF NOT EXISTS planner_slots (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL DEFAULT 'lomeros',
        week_start TEXT NOT NULL,
        day INTEGER NOT NULL,
        subject_type TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        slots TEXT NOT NULL,
        UNIQUE (week_start, day, subject_type, subject_id)
      )
    `);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al migrar planner' }, { status: 500 });
  }
}
```

- [ ] **Step 7: Suite completa + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: PASS (sin tests nuevos rotos, sin errores de tipos)

- [ ] **Step 8: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/bootstrap.ts src/lib/db/bootstrap.test.ts src/app/api/migrate-planner/route.ts
git commit -m "feat(planner): tablas courts y planner_slots (schema + bootstrap + migrate-planner)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Config + helpers de semana (`weeks.ts`, TDD)

**Files:**
- Create: `src/lib/planner/config.ts`
- Create: `src/lib/planner/weeks.ts`
- Test: `src/lib/planner/weeks.test.ts`

- [ ] **Step 1: Crear la config (sin test propio: solo constantes)**

Create `src/lib/planner/config.ts`:

```ts
// Parámetros del planificador semanal. Las horas se manejan como minutos desde
// medianoche en hora local del grupo (Europe/Madrid); no se hace aritmética de
// zona horaria con los slots — solo madridTodayIso() consulta la TZ.
export const PLANNER = {
  slotMinutes: 30,   // tamaño de celda
  minBlockSlots: 3,  // bloque mínimo pintado = 1,5h (duración fija de partido)
  matchSlots: 3,     // ventana de partido = 3 slots
  dayStartMin: 480,  // 08:00 — primer slot del día
  dayEndMin: 1440,   // 24:00 — fin exclusivo (último slot empieza a las 23:30)
  minPlayers: 4,     // jugadores necesarios para «partido posible»
} as const;
```

- [ ] **Step 2: Escribir el test de semanas (failing)**

Create `src/lib/planner/weeks.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { addDaysIso, editableWeeks, isEditableWeek, madridTodayIso, mondayOf, weekDates } from './weeks';

describe('mondayOf', () => {
  it('devuelve el propio lunes para un lunes', () => {
    expect(mondayOf('2026-07-06')).toBe('2026-07-06');
  });
  it('devuelve el lunes de la semana para jueves y domingo', () => {
    expect(mondayOf('2026-07-09')).toBe('2026-07-06'); // jueves
    expect(mondayOf('2026-07-12')).toBe('2026-07-06'); // domingo
  });
  it('cruza límites de mes', () => {
    expect(mondayOf('2026-08-01')).toBe('2026-07-27'); // sábado 1 de agosto
  });
});

describe('addDaysIso', () => {
  it('suma días cruzando mes y año', () => {
    expect(addDaysIso('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDaysIso('2026-12-29', 7)).toBe('2027-01-05');
    expect(addDaysIso('2026-07-06', -1)).toBe('2026-07-05');
  });
});

describe('editableWeeks / isEditableWeek', () => {
  it('la semana actual y la siguiente son editables; pasada y +2 no', () => {
    const today = '2026-07-09'; // jueves → semana 2026-07-06
    expect(editableWeeks(today)).toEqual(['2026-07-06', '2026-07-13']);
    expect(isEditableWeek('2026-07-06', today)).toBe(true);
    expect(isEditableWeek('2026-07-13', today)).toBe(true);
    expect(isEditableWeek('2026-06-29', today)).toBe(false);
    expect(isEditableWeek('2026-07-20', today)).toBe(false);
  });
});

describe('weekDates', () => {
  it('devuelve las 7 fechas L→D', () => {
    const dates = weekDates('2026-07-06');
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe('2026-07-06');
    expect(dates[6]).toBe('2026-07-12');
  });
});

describe('madridTodayIso', () => {
  it('formatea YYYY-MM-DD en Europe/Madrid (UTC 23:30 de verano = día siguiente en Madrid)', () => {
    expect(madridTodayIso(new Date('2026-07-06T23:30:00Z'))).toBe('2026-07-07');
    expect(madridTodayIso(new Date('2026-07-06T10:00:00Z'))).toBe('2026-07-06');
  });
});
```

- [ ] **Step 3: Verificar que falla**

Run: `npx vitest run src/lib/planner/weeks.test.ts`
Expected: FAIL — `Cannot find module './weeks'`

- [ ] **Step 4: Implementar `weeks.ts`**

Create `src/lib/planner/weeks.ts`:

```ts
const TZ = 'Europe/Madrid';

// Fecha de "hoy" (YYYY-MM-DD) en Europe/Madrid; el servidor corre en UTC.
export function madridTodayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now); // en-CA → YYYY-MM-DD
}

// Suma días a una fecha ISO. Aritmética en UTC puro: sin efectos de TZ ni DST.
export function addDaysIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// Lunes (YYYY-MM-DD) de la semana de la fecha dada. Las semanas van L→D.
export function mondayOf(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=domingo … 6=sábado
  return addDaysIso(dateIso, dow === 0 ? -6 : 1 - dow);
}

// Semanas con escritura permitida: la actual y la siguiente. Los días ya pasados
// de la semana actual siguen siendo editables (v1: simplicidad).
export function editableWeeks(todayIso: string): [string, string] {
  const current = mondayOf(todayIso);
  return [current, addDaysIso(current, 7)];
}

export function isEditableWeek(weekStart: string, todayIso: string): boolean {
  return editableWeeks(todayIso).includes(weekStart);
}

// Las 7 fechas (L→D) de la semana.
export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i));
}
```

- [ ] **Step 5: Verificar que pasa**

Run: `npx vitest run src/lib/planner/weeks.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/planner/config.ts src/lib/planner/weeks.ts src/lib/planner/weeks.test.ts
git commit -m "feat(planner): config y helpers de semana (lunes, hoy-Madrid, semanas editables)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Validación y formato de slots (`slots.ts`, TDD)

**Files:**
- Create: `src/lib/planner/slots.ts`
- Test: `src/lib/planner/slots.test.ts`

- [ ] **Step 1: Escribir el test (failing)**

Create `src/lib/planner/slots.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatMin, isValidSlotList, slotsToRanges } from './slots';

describe('isValidSlotList', () => {
  it('acepta lista vacía (sin disponibilidad) y bloques de ≥3 slots', () => {
    expect(isValidSlotList([])).toBe(true);
    expect(isValidSlotList([1200, 1230, 1260])).toBe(true);         // 20:00–21:30
    expect(isValidSlotList([1200, 1230, 1260, 1290])).toBe(true);   // 20:00–22:00
    expect(isValidSlotList([480, 510, 540, 1200, 1230, 1260])).toBe(true); // dos bloques
  });
  it('rechaza bloques de menos de 3 slots (partido = 1,5h)', () => {
    expect(isValidSlotList([1200])).toBe(false);
    expect(isValidSlotList([1200, 1230])).toBe(false);
    expect(isValidSlotList([480, 510, 540, 1200, 1230])).toBe(false); // cola huérfana de 2
  });
  it('rechaza fuera de rango, no múltiplos de 30, desorden y duplicados', () => {
    expect(isValidSlotList([450, 480, 510])).toBe(false);   // antes de 08:00
    expect(isValidSlotList([1380, 1410, 1440])).toBe(false); // 24:00 no es slot
    expect(isValidSlotList([1350, 1380, 1410])).toBe(true);  // 22:30–24:00 sí
    expect(isValidSlotList([485, 515, 545])).toBe(false);    // no múltiplos
    expect(isValidSlotList([1260, 1230, 1200])).toBe(false); // desorden
    expect(isValidSlotList([1200, 1200, 1230, 1260])).toBe(false); // duplicado
  });
});

describe('formatMin', () => {
  it('formatea minutos como HH:MM', () => {
    expect(formatMin(480)).toBe('08:00');
    expect(formatMin(1410)).toBe('23:30');
    expect(formatMin(1440)).toBe('24:00');
  });
});

describe('slotsToRanges', () => {
  it('agrupa slots consecutivos en rangos [inicio, fin)', () => {
    expect(slotsToRanges([1200, 1230, 1260, 1290])).toEqual([{ startMin: 1200, endMin: 1320 }]);
    expect(slotsToRanges([480, 510, 540, 1200, 1230, 1260])).toEqual([
      { startMin: 480, endMin: 570 },
      { startMin: 1200, endMin: 1290 },
    ]);
    expect(slotsToRanges([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/lib/planner/slots.test.ts`
Expected: FAIL — `Cannot find module './slots'`

- [ ] **Step 3: Implementar `slots.ts`**

Create `src/lib/planner/slots.ts`:

```ts
import { PLANNER } from './config';

// ¿Lista de slots de un día válida? Minutos de inicio dentro del rango, múltiplos
// del tamaño de celda, ordenados sin duplicados, y cada bloque de consecutivos con
// ≥ minBlockSlots celdas: un partido dura 1,5h, bloques menores no cuadran nada.
export function isValidSlotList(slots: number[]): boolean {
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!Number.isInteger(s) || s % PLANNER.slotMinutes !== 0) return false;
    if (s < PLANNER.dayStartMin || s + PLANNER.slotMinutes > PLANNER.dayEndMin) return false;
    if (i > 0 && s <= slots[i - 1]) return false;
  }
  let run = 0;
  for (let i = 0; i < slots.length; i++) {
    run = i > 0 && slots[i] === slots[i - 1] + PLANNER.slotMinutes ? run + 1 : 1;
    const endOfRun = i === slots.length - 1 || slots[i + 1] !== slots[i] + PLANNER.slotMinutes;
    if (endOfRun && run < PLANNER.minBlockSlots) return false;
  }
  return true;
}

// "HH:MM" a partir de minutos desde medianoche.
export function formatMin(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

// Bloques maximales [inicio, fin) de una lista ORDENADA de slots.
export function slotsToRanges(slots: number[]): { startMin: number; endMin: number }[] {
  const out: { startMin: number; endMin: number }[] = [];
  for (const s of slots) {
    const last = out[out.length - 1];
    if (last && last.endMin === s) last.endMin = s + PLANNER.slotMinutes;
    else out.push({ startMin: s, endMin: s + PLANNER.slotMinutes });
  }
  return out;
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/lib/planner/slots.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/planner/slots.ts src/lib/planner/slots.test.ts
git commit -m "feat(planner): validación de listas de slots (bloques ≥3) y formato de horas

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Validación del payload de escritura (`validate.ts`, TDD)

**Files:**
- Create: `src/lib/planner/validate.ts`
- Test: `src/lib/planner/validate.test.ts`

- [ ] **Step 1: Escribir el test (failing)**

Create `src/lib/planner/validate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { writePayloadError } from './validate';

const TODAY = '2026-07-09'; // jueves → semana editable 2026-07-06 y 2026-07-13

describe('writePayloadError', () => {
  it('acepta un payload válido (null = sin error)', () => {
    expect(writePayloadError('2026-07-06', 2, [1200, 1230, 1260], TODAY)).toBeNull();
    expect(writePayloadError('2026-07-13', 0, [], TODAY)).toBeNull(); // borrar el día
  });
  it('rechaza semanas mal formadas o que no son lunes', () => {
    expect(writePayloadError('2026-7-6', 0, [], TODAY)).toMatch(/semana/i);
    expect(writePayloadError('2026-07-08', 0, [], TODAY)).toMatch(/semana/i); // miércoles
    expect(writePayloadError(42, 0, [], TODAY)).toMatch(/semana/i);
  });
  it('rechaza semanas no editables (pasada / +2)', () => {
    expect(writePayloadError('2026-06-29', 0, [], TODAY)).toMatch(/actual o la siguiente/i);
    expect(writePayloadError('2026-07-20', 0, [], TODAY)).toMatch(/actual o la siguiente/i);
  });
  it('rechaza día fuera de 0–6 o no entero', () => {
    expect(writePayloadError('2026-07-06', 7, [], TODAY)).toMatch(/día/i);
    expect(writePayloadError('2026-07-06', -1, [], TODAY)).toMatch(/día/i);
    expect(writePayloadError('2026-07-06', 1.5, [], TODAY)).toMatch(/día/i);
  });
  it('rechaza listas de slots inválidas (bloques <3, no-array, basura)', () => {
    expect(writePayloadError('2026-07-06', 0, [1200, 1230], TODAY)).toMatch(/tramos/i);
    expect(writePayloadError('2026-07-06', 0, 'nope', TODAY)).toMatch(/tramos/i);
    expect(writePayloadError('2026-07-06', 0, [485, 515, 545], TODAY)).toMatch(/tramos/i);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/lib/planner/validate.test.ts`
Expected: FAIL — `Cannot find module './validate'`

- [ ] **Step 3: Implementar `validate.ts`**

Create `src/lib/planner/validate.ts`:

```ts
import { isEditableWeek, mondayOf } from './weeks';
import { isValidSlotList } from './slots';

// Valida el payload de escritura de un día del planificador (API, no se fía del
// cliente). Devuelve el mensaje de error, o null si es válido.
export function writePayloadError(
  week: unknown, day: unknown, slots: unknown, todayIso: string,
): string | null {
  if (typeof week !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(week) || mondayOf(week) !== week) {
    return 'Semana inválida (usa la fecha del lunes, YYYY-MM-DD)';
  }
  if (!isEditableWeek(week, todayIso)) {
    return 'Solo se puede editar la semana actual o la siguiente';
  }
  if (!Number.isInteger(day) || (day as number) < 0 || (day as number) > 6) {
    return 'Día inválido (0=lunes … 6=domingo)';
  }
  if (!Array.isArray(slots) || !isValidSlotList(slots as number[])) {
    return 'Tramos inválidos: bloques de mínimo 1,5h en pasos de 30 min';
  }
  return null;
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/lib/planner/validate.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/planner/validate.ts src/lib/planner/validate.test.ts
git commit -m "feat(planner): validación de payload de escritura (semana editable, día, slots)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Matcher de coincidencias (`matcher.ts`, TDD)

**Files:**
- Create: `src/lib/planner/matcher.ts`
- Test: `src/lib/planner/matcher.test.ts`

- [ ] **Step 1: Escribir el test (failing)**

Create `src/lib/planner/matcher.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { findDayCoincidences } from './matcher';

const S = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i * 30);
// S(1200, 4) = [1200,1230,1260,1290] = 20:00–22:00

const p = (id: string, slots: number[]) => ({ id, name: id, slots });
const court = (id: string, ownerId: string, slots: number[]) => ({ id, name: id, ownerId, slots });

describe('findDayCoincidences', () => {
  it('4 jugadores + pista efectiva 20:00–22:00 → un tramo 20:00–22:00', () => {
    const players = ['a', 'b', 'c', 'd'].map((id) => p(id, S(1200, 4)));
    const out = findDayCoincidences(players, [court('pista', 'a', S(1200, 4))]);
    expect(out).toEqual([{
      startMin: 1200, endMin: 1320,
      courtNames: ['pista'], playerNames: ['a', 'b', 'c', 'd'],
    }]);
  });

  it('solo 3 jugadores → sin coincidencias', () => {
    const players = ['a', 'b', 'c'].map((id) => p(id, S(1200, 4)));
    expect(findDayCoincidences(players, [court('pista', 'a', S(1200, 4))])).toEqual([]);
  });

  it('4 jugadores sin pista → sin coincidencias', () => {
    const players = ['a', 'b', 'c', 'd'].map((id) => p(id, S(1200, 4)));
    expect(findDayCoincidences(players, [])).toEqual([]);
  });

  it('la pista NO cuenta si su dueño no está disponible (pista ∩ dueño)', () => {
    const players = ['a', 'b', 'c', 'd'].map((id) => p(id, S(1200, 4)));
    // Dueño 'z' sin disponibilidad → pista efectiva vacía.
    expect(findDayCoincidences(players, [court('pista', 'z', S(1200, 4))])).toEqual([]);
  });

  it('la pista solo cuenta donde su dueño llega: recorta el tramo', () => {
    // 4 jugadores 20:00–22:00, pero el dueño (uno de ellos) solo 20:00–21:30.
    const players = [p('a', S(1200, 3)), p('b', S(1200, 4)), p('c', S(1200, 4)), p('d', S(1200, 4))];
    const out = findDayCoincidences(players, [court('pista', 'a', S(1200, 4))]);
    // Única ventana posible: 20:00–21:30 (la de 20:30 requiere al dueño hasta 22:00).
    expect(out).toEqual([{
      startMin: 1200, endMin: 1290,
      courtNames: ['pista'], playerNames: ['a', 'b', 'c', 'd'],
    }]);
  });

  it('fusiona ventanas contiguas y une nombres (5º jugador solo al final)', () => {
    const players = [
      ...['a', 'b', 'c', 'd'].map((id) => p(id, S(1200, 5))), // 20:00–22:30
      p('e', S(1260, 3)), // solo 21:00–22:30 (entra en la última ventana activa)
    ];
    const out = findDayCoincidences(players, [court('pista', 'a', S(1200, 5))]);
    expect(out).toHaveLength(1);
    expect(out[0].startMin).toBe(1200);
    expect(out[0].endMin).toBe(1350); // 22:30
    expect(out[0].playerNames).toContain('e');
  });

  it('ventanas activas NO contiguas → tramos separados', () => {
    const players = ['a', 'b', 'c', 'd'].map((id) =>
      p(id, [...S(480, 3), ...S(1200, 3)])); // 08:00–09:30 y 20:00–21:30
    const out = findDayCoincidences(players, [court('pista', 'a', [...S(480, 3), ...S(1200, 3)])]);
    expect(out).toEqual([
      { startMin: 480, endMin: 570, courtNames: ['pista'], playerNames: ['a', 'b', 'c', 'd'] },
      { startMin: 1200, endMin: 1290, courtNames: ['pista'], playerNames: ['a', 'b', 'c', 'd'] },
    ]);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/lib/planner/matcher.test.ts`
Expected: FAIL — `Cannot find module './matcher'`

- [ ] **Step 3: Implementar `matcher.ts`**

Create `src/lib/planner/matcher.ts`:

```ts
import { PLANNER } from './config';

export interface SubjectDaySlots {
  id: string;
  name: string;
  slots: number[];
}
export interface CourtDaySlots extends SubjectDaySlots {
  ownerId: string;
}

export interface Coincidence {
  startMin: number;
  endMin: number;
  courtNames: string[];  // pistas efectivas en algún punto del tramo
  playerNames: string[]; // unión de jugadores disponibles en el tramo
}

// Coincidencias de UN día: ventanas de matchSlots slots consecutivos con
// ≥ minPlayers jugadores disponibles TODA la ventana y ≥1 pista efectiva
// (pista ∩ su dueño: el dueño tiene que poder jugar para que su pista cuente;
// él es uno de los minPlayers). Ventanas activas contiguas se fusionan en
// tramos maximales; huecos inactivos separan tramos aunque se solapen horas.
export function findDayCoincidences(
  players: SubjectDaySlots[],
  courts: CourtDaySlots[],
): Coincidence[] {
  const playerSets = players.map((p) => ({ ...p, set: new Set(p.slots) }));
  const courtSets = courts.map((c) => {
    const owner = playerSets.find((p) => p.id === c.ownerId);
    return { ...c, set: new Set(owner ? c.slots.filter((s) => owner.set.has(s)) : []) };
  });

  const windowMin = PLANNER.matchSlots * PLANNER.slotMinutes;
  const out: Coincidence[] = [];
  let lastActiveStart = -1;

  for (let w = PLANNER.dayStartMin; w + windowMin <= PLANNER.dayEndMin; w += PLANNER.slotMinutes) {
    const windowSlots = Array.from({ length: PLANNER.matchSlots }, (_, i) => w + i * PLANNER.slotMinutes);
    const avail = playerSets.filter((p) => windowSlots.every((s) => p.set.has(s)));
    const okCourts = courtSets.filter((c) => windowSlots.every((s) => c.set.has(s)));
    if (avail.length < PLANNER.minPlayers || okCourts.length === 0) continue;

    const last = out[out.length - 1];
    if (last && w === lastActiveStart + PLANNER.slotMinutes) {
      last.endMin = w + windowMin;
      last.courtNames = union(last.courtNames, okCourts.map((c) => c.name));
      last.playerNames = union(last.playerNames, avail.map((p) => p.name));
    } else {
      out.push({
        startMin: w,
        endMin: w + windowMin,
        courtNames: okCourts.map((c) => c.name),
        playerNames: avail.map((p) => p.name),
      });
    }
    lastActiveStart = w;
  }
  return out;
}

function union(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run src/lib/planner/matcher.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/planner/matcher.ts src/lib/planner/matcher.test.ts
git commit -m "feat(planner): matcher de coincidencias (ventanas 1,5h, pista∩dueño, fusión de tramos)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Queries de DB + vista de semana (`queries.ts`, `week-data.ts`)

Sin test unitario propio (tocan DB; el repo los cubre por e2e — Task 11). La parte con lógica (matcher/validación) ya está testada.

**Files:**
- Create: `src/lib/planner/queries.ts`
- Create: `src/lib/planner/week-data.ts`

- [ ] **Step 1: Implementar `queries.ts`**

Create `src/lib/planner/queries.ts` (patrón de `src/lib/players/queries.ts`):

```ts
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { courts, plannerSlots, players, type Court, type PlannerSlotRow } from '@/lib/db/schema';

// Pista del jugador en el grupo (cada jugador tiene como mucho una).
export async function getCourtByOwner(groupId: string, ownerPlayerId: string): Promise<Court | undefined> {
  const [c] = await db.select().from(courts)
    .where(and(eq(courts.groupId, groupId), eq(courts.ownerPlayerId, ownerPlayerId)));
  return c;
}

// Declara la pista del jugador (una por jugador; UNIQUE en owner_player_id).
export async function createCourt(groupId: string, ownerPlayerId: string, name: string): Promise<Court> {
  const [c] = await db.insert(courts).values({ groupId, ownerPlayerId, name }).returning();
  return c;
}

// Renombra la pista del jugador. undefined si no tiene pista en el grupo.
export async function renameCourt(groupId: string, ownerPlayerId: string, name: string): Promise<Court | undefined> {
  const [c] = await db.update(courts).set({ name })
    .where(and(eq(courts.groupId, groupId), eq(courts.ownerPlayerId, ownerPlayerId)))
    .returning();
  return c;
}

// Pistas del grupo con el nombre visible de su dueño.
export async function listCourtsInGroup(
  groupId: string,
): Promise<(Court & { ownerName: string })[]> {
  const rows = await db
    .select({ court: courts, ownerName: players.name, ownerNickname: players.nickname })
    .from(courts)
    .innerJoin(players, eq(courts.ownerPlayerId, players.id))
    .where(eq(courts.groupId, groupId));
  return rows.map((r) => ({ ...r.court, ownerName: r.ownerNickname ?? r.ownerName }));
}

// Todas las filas de disponibilidad (jugadores y pistas) de una semana del grupo.
export async function getWeekSlots(groupId: string, weekStart: string): Promise<PlannerSlotRow[]> {
  return db.select().from(plannerSlots)
    .where(and(eq(plannerSlots.groupId, groupId), eq(plannerSlots.weekStart, weekStart)));
}

// Upsert de los slots de UN día para un sujeto (jugador o pista). slots=[] borra la fila.
export async function upsertDaySlots(
  groupId: string,
  weekStart: string,
  day: number,
  subjectType: 'player' | 'court',
  subjectId: string,
  slots: number[],
): Promise<void> {
  if (slots.length === 0) {
    await db.delete(plannerSlots).where(and(
      eq(plannerSlots.groupId, groupId),
      eq(plannerSlots.weekStart, weekStart),
      eq(plannerSlots.day, day),
      eq(plannerSlots.subjectType, subjectType),
      eq(plannerSlots.subjectId, subjectId),
    ));
    return;
  }
  await db.insert(plannerSlots)
    .values({ groupId, weekStart, day, subjectType, subjectId, slots: JSON.stringify(slots) })
    .onConflictDoUpdate({
      target: [plannerSlots.weekStart, plannerSlots.day, plannerSlots.subjectType, plannerSlots.subjectId],
      set: { slots: JSON.stringify(slots) },
    });
}
```

- [ ] **Step 2: Implementar `week-data.ts`**

Create `src/lib/planner/week-data.ts`:

```ts
import { listAllPlayersInGroup } from '@/lib/players/queries';
import { getWeekSlots, listCourtsInGroup } from './queries';
import { findDayCoincidences, type Coincidence } from './matcher';
import { weekDates } from './weeks';

export interface WeekView {
  weekStart: string;
  dates: string[]; // 7 fechas ISO, L→D
  // byDay: índice 0=lunes … 6=domingo → slots pintados ese día
  players: { id: string; name: string; byDay: number[][] }[];
  courts: { id: string; name: string; ownerId: string; ownerName: string; byDay: number[][] }[];
  coincidences: (Coincidence & { day: number })[];
}

const emptyWeek = () => Array.from({ length: 7 }, () => [] as number[]);

// Vista completa de la semana de un grupo: disponibilidades, pistas y
// coincidencias calculadas en servidor. Única fuente para página y API.
export async function loadWeekView(groupId: string, weekStart: string): Promise<WeekView> {
  const [roster, courtRows, slotRows] = await Promise.all([
    listAllPlayersInGroup(groupId),
    listCourtsInGroup(groupId),
    getWeekSlots(groupId, weekStart),
  ]);
  const nameOf = new Map(roster.map((p) => [p.id, p.nickname ?? p.name]));

  const playerDays = new Map<string, number[][]>();
  const courtDays = new Map<string, number[][]>();
  for (const row of slotRows) {
    const map = row.subjectType === 'player' ? playerDays : courtDays;
    if (!map.has(row.subjectId)) map.set(row.subjectId, emptyWeek());
    map.get(row.subjectId)![row.day] = JSON.parse(row.slots);
  }

  // Jugadores con alguna disponibilidad (ignora filas de jugadores borrados del grupo).
  const playersView = [...playerDays.entries()]
    .filter(([id]) => nameOf.has(id))
    .map(([id, byDay]) => ({ id, name: nameOf.get(id)!, byDay }));

  const courtsView = courtRows.map((c) => ({
    id: c.id,
    name: c.name,
    ownerId: c.ownerPlayerId,
    ownerName: c.ownerName,
    byDay: courtDays.get(c.id) ?? emptyWeek(),
  }));

  const coincidences = Array.from({ length: 7 }, (_, day) =>
    findDayCoincidences(
      playersView.map((p) => ({ id: p.id, name: p.name, slots: p.byDay[day] })),
      courtsView.map((c) => ({ id: c.id, name: c.name, ownerId: c.ownerId, slots: c.byDay[day] })),
    ).map((c) => ({ ...c, day })),
  ).flat();

  return { weekStart, dates: weekDates(weekStart), players: playersView, courts: courtsView, coincidences };
}
```

- [ ] **Step 3: Typecheck + suite**

Run: `npx tsc --noEmit && npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/planner/queries.ts src/lib/planner/week-data.ts
git commit -m "feat(planner): queries de courts/planner_slots y loadWeekView con coincidencias

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Rutas API del planificador

**Files:**
- Create: `src/app/api/planner/route.ts`
- Create: `src/app/api/planner/availability/route.ts`
- Create: `src/app/api/planner/court/route.ts`
- Create: `src/app/api/planner/court/availability/route.ts`

- [ ] **Step 1: GET de la semana**

Create `src/app/api/planner/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireGroupSession } from '@/lib/auth/guard';
import { groupIdFromQuery } from '@/lib/groups/request-group';
import { loadWeekView } from '@/lib/planner/week-data';
import { isEditableWeek, madridTodayIso, mondayOf } from '@/lib/planner/weeks';

// GET /api/planner?week=YYYY-MM-DD&g=slug → vista completa de la semana del grupo:
// disponibilidades de todos, pistas y coincidencias calculadas en servidor.
// Sin ?week → semana actual.
export async function GET(request: NextRequest) {
  const auth = await requireGroupSession(await groupIdFromQuery(request));
  if ('response' in auth) return auth.response;
  try {
    const today = madridTodayIso();
    const week = request.nextUrl.searchParams.get('week') ?? mondayOf(today);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || mondayOf(week) !== week) {
      return NextResponse.json({ error: 'Semana inválida (usa el lunes, YYYY-MM-DD)' }, { status: 400 });
    }
    const view = await loadWeekView(auth.ctx.groupId, week);
    return NextResponse.json({ ...view, editable: isEditableWeek(week, today) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al cargar el planificador' }, { status: 500 });
  }
}
```

- [ ] **Step 2: PUT de mi disponibilidad**

Create `src/app/api/planner/availability/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireGroupSession } from '@/lib/auth/guard';
import { groupIdFromValue } from '@/lib/groups/request-group';
import { upsertDaySlots } from '@/lib/planner/queries';
import { writePayloadError } from '@/lib/planner/validate';
import { madridTodayIso } from '@/lib/planner/weeks';

// PUT /api/planner/availability — MI disponibilidad de un día.
// Body: { g?, week: 'YYYY-MM-DD' (lunes), day: 0-6, slots: number[] }
// Solo escribe la ficha del propio usuario (ctx.playerId); nadie edita la de otros.
export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  const auth = await requireGroupSession(await groupIdFromValue(body.g));
  if ('response' in auth) return auth.response;
  const playerId = auth.ctx.playerId;
  if (!playerId) {
    return NextResponse.json({ error: 'Tu cuenta no está vinculada a un jugador' }, { status: 403 });
  }
  try {
    const { week, day, slots } = body;
    const err = writePayloadError(week, day, slots, madridTodayIso());
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    await upsertDaySlots(auth.ctx.groupId, week, day, 'player', playerId, slots);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al guardar la disponibilidad' }, { status: 500 });
  }
}
```

- [ ] **Step 3: POST/PATCH de mi pista**

Create `src/app/api/planner/court/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireGroupSession } from '@/lib/auth/guard';
import { groupIdFromValue } from '@/lib/groups/request-group';
import { createCourt, getCourtByOwner, renameCourt } from '@/lib/planner/queries';

function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name.length >= 1 && name.length <= 60 ? name : null;
}

// POST /api/planner/court — declara MI pista. Body: { g?, name }
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  const auth = await requireGroupSession(await groupIdFromValue(body.g));
  if ('response' in auth) return auth.response;
  const playerId = auth.ctx.playerId;
  if (!playerId) {
    return NextResponse.json({ error: 'Tu cuenta no está vinculada a un jugador' }, { status: 403 });
  }
  try {
    const name = cleanName(body.name);
    if (!name) return NextResponse.json({ error: 'Nombre de pista inválido (1–60 caracteres)' }, { status: 400 });
    if (await getCourtByOwner(auth.ctx.groupId, playerId)) {
      return NextResponse.json({ error: 'Ya tienes una pista declarada' }, { status: 409 });
    }
    const court = await createCourt(auth.ctx.groupId, playerId, name);
    return NextResponse.json({ court }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al crear la pista' }, { status: 500 });
  }
}

// PATCH /api/planner/court — renombra MI pista. Body: { g?, name }
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  const auth = await requireGroupSession(await groupIdFromValue(body.g));
  if ('response' in auth) return auth.response;
  const playerId = auth.ctx.playerId;
  if (!playerId) {
    return NextResponse.json({ error: 'Tu cuenta no está vinculada a un jugador' }, { status: 403 });
  }
  try {
    const name = cleanName(body.name);
    if (!name) return NextResponse.json({ error: 'Nombre de pista inválido (1–60 caracteres)' }, { status: 400 });
    const court = await renameCourt(auth.ctx.groupId, playerId, name);
    if (!court) return NextResponse.json({ error: 'No tienes pista declarada' }, { status: 404 });
    return NextResponse.json({ court });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al renombrar la pista' }, { status: 500 });
  }
}
```

- [ ] **Step 4: PUT de la disponibilidad de mi pista**

Create `src/app/api/planner/court/availability/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireGroupSession } from '@/lib/auth/guard';
import { groupIdFromValue } from '@/lib/groups/request-group';
import { getCourtByOwner, upsertDaySlots } from '@/lib/planner/queries';
import { writePayloadError } from '@/lib/planner/validate';
import { madridTodayIso } from '@/lib/planner/weeks';

// PUT /api/planner/court/availability — disponibilidad de MI pista para un día.
// Body: { g?, week, day, slots }. Solo el dueño de la pista puede escribirla.
export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  const auth = await requireGroupSession(await groupIdFromValue(body.g));
  if ('response' in auth) return auth.response;
  const playerId = auth.ctx.playerId;
  if (!playerId) {
    return NextResponse.json({ error: 'Tu cuenta no está vinculada a un jugador' }, { status: 403 });
  }
  try {
    const court = await getCourtByOwner(auth.ctx.groupId, playerId);
    if (!court) return NextResponse.json({ error: 'No tienes pista declarada' }, { status: 404 });
    const { week, day, slots } = body;
    const err = writePayloadError(week, day, slots, madridTodayIso());
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    await upsertDaySlots(auth.ctx.groupId, week, day, 'court', court.id, slots);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al guardar la disponibilidad de la pista' }, { status: 500 });
  }
}
```

- [ ] **Step 5: Typecheck + guard de acceso a DB**

Run: `npx tsc --noEmit && npm run check:db-access && npm test`
Expected: PASS (las rutas no tocan tablas raíz directamente; todo va por `src/lib/planner/queries.ts`)

- [ ] **Step 6: Commit**

```bash
git add src/app/api/planner
git commit -m "feat(planner): API GET semana + PUT disponibilidad propia y de pista + alta/renombre de pista

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Cuadrícula pintable (client component)

**Files:**
- Create: `src/components/planner/availability-grid.tsx`

Sin unit test (componente interactivo; lo cubre el e2e de Task 11). La validación visual reutiliza la misma regla que el servidor.

- [ ] **Step 1: Implementar el componente**

Create `src/components/planner/availability-grid.tsx`:

```tsx
'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PLANNER } from '@/lib/planner/config';
import { formatMin } from '@/lib/planner/slots';

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function allSlotStarts(): number[] {
  const out: number[] = [];
  for (let s = PLANNER.dayStartMin; s + PLANNER.slotMinutes <= PLANNER.dayEndMin; s += PLANNER.slotMinutes) {
    out.push(s);
  }
  return out;
}

// Celdas en bloques de menos de minBlockSlots consecutivas (inválidas para guardar).
function invalidCells(day: Set<number>): Set<number> {
  const sorted = [...day].sort((a, b) => a - b);
  const bad = new Set<number>();
  let run: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    run.push(sorted[i]);
    const nextConsecutive = i + 1 < sorted.length && sorted[i + 1] === sorted[i] + PLANNER.slotMinutes;
    if (!nextConsecutive) {
      if (run.length < PLANNER.minBlockSlots) for (const s of run) bad.add(s);
      run = [];
    }
  }
  return bad;
}

// Cuadrícula pintable de disponibilidad semanal (slots de 30 min, L→D).
// Pintar con tap/drag; los bloques de <3 celdas se marcan en rojo y bloquean
// el guardado (el servidor revalida igualmente). Guardar hace un PUT por día
// modificado y refresca la página (coincidencias server-rendered).
export function AvailabilityGrid({
  title,
  dates,
  initial,
  week,
  g,
  endpoint,
}: {
  title: string;
  dates: string[];      // 7 fechas ISO L→D (cabecera)
  initial: number[][];  // slots por día 0..6
  week: string;         // lunes YYYY-MM-DD
  g?: string;           // slug del grupo (solo bajo /g/[slug])
  endpoint: '/api/planner/availability' | '/api/planner/court/availability';
}) {
  const router = useRouter();
  const [byDay, setByDay] = useState<Set<number>[]>(() => initial.map((d) => new Set(d)));
  const [dirty, setDirty] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const paintMode = useRef<'paint' | 'erase' | null>(null);

  useEffect(() => {
    const stop = () => { paintMode.current = null; };
    window.addEventListener('pointerup', stop);
    return () => window.removeEventListener('pointerup', stop);
  }, []);

  const starts = useMemo(allSlotStarts, []);
  const badByDay = byDay.map(invalidCells);
  const hasInvalid = badByDay.some((b) => b.size > 0);

  function applyCell(day: number, min: number, mode: 'paint' | 'erase') {
    setByDay((prev) => {
      const next = prev.map((s, i) => (i === day ? new Set(s) : s));
      if (mode === 'paint') next[day].add(min);
      else next[day].delete(min);
      return next;
    });
    setDirty((prev) => new Set(prev).add(day));
  }

  function startPaint(e: React.PointerEvent, day: number, min: number) {
    // Sin captura de puntero: el drag debe disparar pointerenter en otras celdas.
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    const mode = byDay[day].has(min) ? 'erase' : 'paint';
    paintMode.current = mode;
    applyCell(day, min, mode);
  }

  function continuePaint(day: number, min: number) {
    if (paintMode.current) applyCell(day, min, paintMode.current);
  }

  async function save() {
    setSaving(true);
    try {
      for (const day of [...dirty]) {
        const slots = [...byDay[day]].sort((a, b) => a - b);
        const res = await fetch(endpoint, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ g, week, day, slots }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? 'Error al guardar');
        }
      }
      setDirty(new Set());
      toast.success('Disponibilidad guardada');
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="lpt-card" style={{ padding: 14 }}>
      <div className="flex items-center justify-between gap-3" style={{ marginBottom: 10 }}>
        <h2 className="sec-title" style={{ fontSize: 17 }}>{title}</h2>
        <button
          className="lpt-btn primary"
          style={{ minHeight: 34, padding: '6px 14px' }}
          onClick={save}
          disabled={saving || hasInvalid || dirty.size === 0}
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
      {hasInvalid && (
        <p className="small" style={{ color: '#ef4444', margin: '0 0 8px' }}>
          Los bloques deben ser de mínimo 1,5h (3 casillas seguidas).
        </p>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '52px repeat(7, 1fr)',
          gap: 2,
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        <div />
        {dates.map((d, i) => (
          <div key={d} className="small muted" style={{ textAlign: 'center', fontWeight: 600 }}>
            {DAY_LABELS[i]} {Number(d.slice(8))}
          </div>
        ))}
        {starts.map((min) => (
          <Fragment key={min}>
            <div className="small muted" style={{ fontSize: 11, textAlign: 'right', paddingRight: 6, lineHeight: '22px' }}>
              {formatMin(min)}
            </div>
            {dates.map((_, day) => {
              const on = byDay[day].has(min);
              const bad = badByDay[day].has(min);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${DAY_LABELS[day]} ${formatMin(min)}`}
                  data-day={day}
                  data-min={min}
                  onPointerDown={(e) => { e.preventDefault(); startPaint(e, day, min); }}
                  onPointerEnter={() => continuePaint(day, min)}
                  style={{
                    height: 22,
                    borderRadius: 4,
                    border: '1px solid color-mix(in oklab, currentcolor 14%, transparent)',
                    background: on ? (bad ? '#ef4444' : '#22c55e') : 'transparent',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/planner/availability-grid.tsx
git commit -m "feat(planner): cuadrícula pintable de disponibilidad (tap/drag, validación de bloques)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Sección «Mi pista» + lista de coincidencias

**Files:**
- Create: `src/components/planner/court-section.tsx`
- Create: `src/components/planner/coincidences.tsx`

- [ ] **Step 1: Implementar `court-section.tsx`**

Create `src/components/planner/court-section.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AvailabilityGrid } from './availability-grid';

// Sección «Mi pista»: sin pista → alta con nombre; con pista → renombre +
// cuadrícula de disponibilidad de la pista (solo la ve/edita su dueño).
export function CourtSection({
  court,
  dates,
  initialByDay,
  week,
  g,
}: {
  court: { id: string; name: string } | null;
  dates: string[];
  initialByDay: number[][];
  week: string;
  g?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(court?.name ?? '');
  const [busy, setBusy] = useState(false);

  async function submitName(method: 'POST' | 'PATCH') {
    const clean = name.trim();
    if (!clean) { toast.error('Ponle un nombre a la pista'); return; }
    setBusy(true);
    const res = await fetch('/api/planner/court', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ g, name: clean }),
    });
    setBusy(false);
    if (res.ok) {
      toast.success(method === 'POST' ? 'Pista declarada' : 'Nombre actualizado');
      router.refresh();
    } else {
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? 'Error al guardar la pista');
    }
  }

  if (!court) {
    return (
      <div className="lpt-card" style={{ padding: 14 }}>
        <h2 className="sec-title" style={{ fontSize: 17, marginBottom: 6 }}>🎾 ¿Tienes pista propia?</h2>
        <p className="small muted" style={{ margin: '0 0 10px' }}>
          Si tienes pista en tu urbanización (o similar), declárala y marca cuándo está libre:
          las coincidencias la tendrán en cuenta.
        </p>
        <div className="flex gap-2">
          <input
            className="lpt-input"
            style={{ flex: 1, minHeight: 36 }}
            placeholder="Nombre de la pista (p. ej. Urb. Los Olivos)"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="lpt-btn primary"
            style={{ minHeight: 36, padding: '6px 14px' }}
            disabled={busy}
            onClick={() => submitName('POST')}
          >
            Tengo pista
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <AvailabilityGrid
        title={`Mi pista · ${court.name}`}
        dates={dates}
        initial={initialByDay}
        week={week}
        g={g}
        endpoint="/api/planner/court/availability"
      />
      <div className="flex gap-2 items-center">
        <input
          className="lpt-input"
          style={{ flex: 1, minHeight: 34 }}
          value={name}
          maxLength={60}
          aria-label="Nombre de la pista"
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="lpt-btn"
          style={{ minHeight: 34, padding: '6px 12px' }}
          disabled={busy || name.trim() === court.name}
          onClick={() => submitName('PATCH')}
        >
          Renombrar
        </button>
      </div>
    </div>
  );
}
```

Nota: si `lpt-input` no existe como clase en `globals.css`, usar la clase de input que usen los formularios existentes (buscar `<input` en `src/components/` y copiar su estilo).

- [ ] **Step 2: Implementar `coincidences.tsx` (server component, sin estado)**

Create `src/components/planner/coincidences.tsx`:

```tsx
import { formatMin } from '@/lib/planner/slots';
import { PLANNER } from '@/lib/planner/config';
import type { WeekView } from '@/lib/planner/week-data';

const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// Tramos con partido posible de la semana (≥4 jugadores + pista efectiva),
// calculados en servidor. Solo lectura, igual para todos los miembros.
export function Coincidences({ view }: { view: WeekView }) {
  return (
    <section className="section">
      <h2 className="sec-title" style={{ fontSize: 17, marginBottom: 8 }}>
        Coincidencias de la semana
      </h2>
      {view.coincidences.length === 0 ? (
        <p className="muted small">
          Aún no hay tramos con partido posible: hacen falta {PLANNER.minPlayers} jugadores
          y una pista (con su dueño disponible) coincidiendo 1,5h.
        </p>
      ) : (
        <ul className="space-y-2" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {view.coincidences.map((c) => (
            <li key={`${c.day}-${c.startMin}`} className="lpt-card" style={{ padding: 12 }}>
              <p style={{ margin: 0, fontWeight: 600 }}>
                {DAY_NAMES[c.day]} {Number(view.dates[c.day].slice(8))} · {formatMin(c.startMin)}–{formatMin(c.endMin)}
              </p>
              <p className="small muted" style={{ margin: '4px 0 0' }}>
                Pista: {c.courtNames.join(', ')} · {c.playerNames.length} disponibles: {c.playerNames.join(', ')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/planner/court-section.tsx src/components/planner/coincidences.tsx
git commit -m "feat(planner): sección Mi pista (alta/renombre) y lista de coincidencias

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: PlannerBody + páginas raíz y de grupo + navegación + edge

**Files:**
- Create: `src/components/pages/planner-body.tsx`
- Create: `src/app/planificador/layout.tsx`
- Create: `src/app/planificador/page.tsx`
- Create: `src/app/g/[slug]/planificador/page.tsx`
- Modify: `src/lib/auth/authorize.ts` + `src/lib/auth/authorize.test.ts`
- Modify: `src/lib/groups/resolve-slug.ts` + `src/lib/groups/resolve-slug.test.ts`
- Modify: `src/components/shared/nav-links.tsx`
- Modify: `src/components/pages/group-home-body.tsx`

- [ ] **Step 1: Test del edge (failing): `/planificador` exige sesión**

En `src/lib/auth/authorize.test.ts`, añadir dentro del describe existente (adaptar al estilo del fichero):

```ts
  it('/planificador exige sesión (raíz y bajo grupo)', () => {
    expect(decideAccess('/planificador', null)).toBe('redirect-login');
    expect(decideAccess('/g/grupo-test/planificador', null)).toBe('redirect-login');
    expect(decideAccess('/planificador', { userId: 'u1' })).toBe('allow');
    expect(decideAccess('/g/grupo-test/planificador', { userId: 'u1' })).toBe('allow');
  });
```

(Si el `SessionPayload` del fichero tiene otra forma, copiar cómo construyen el payload los tests vecinos.)

Run: `npx vitest run src/lib/auth/authorize.test.ts`
Expected: FAIL (`'allow'` ≠ `'redirect-login'`)

- [ ] **Step 2: Implementar en `decideAccess`**

En `src/lib/auth/authorize.ts`, antes del `return 'allow'` final:

```ts
  if (path === '/planificador' || path.startsWith('/planificador/')) {
    return payload ? 'allow' : 'redirect-login';
  }
  // /g/<slug>/planificador exige sesión, igual que la raíz.
  if (/^\/g\/[^/]+\/planificador(?:\/|$)/.test(path)) {
    return payload ? 'allow' : 'redirect-login';
  }
```

Run: `npx vitest run src/lib/auth/authorize.test.ts`
Expected: PASS

- [ ] **Step 3: Slug reservado (test primero)**

En `src/lib/groups/resolve-slug.test.ts`, en el test de segmentos reservados, añadir `'planificador'` a la lista del bucle:

```ts
    for (const r of ['g', 'api', 'admin', 'me', 'login', 'planificador']) {
```

Run: `npx vitest run src/lib/groups/resolve-slug.test.ts` → FAIL.

En `src/lib/groups/resolve-slug.ts`, añadir `'planificador'` al set `RESERVED_SLUGS` (tras `'eventos', 'info',`):

```ts
  'rankings', 'eventos', 'info', 'icon', 'apple-icon', 'planificador',
```

Run: `npx vitest run src/lib/groups/resolve-slug.test.ts` → PASS.

- [ ] **Step 4: Implementar `PlannerBody`**

Create `src/components/pages/planner-body.tsx`:

```tsx
import Link from 'next/link';
import { AvailabilityGrid } from '@/components/planner/availability-grid';
import { CourtSection } from '@/components/planner/court-section';
import { Coincidences } from '@/components/planner/coincidences';
import { loadWeekView } from '@/lib/planner/week-data';
import { editableWeeks, madridTodayIso } from '@/lib/planner/weeks';
import type { PageContext } from '@/lib/auth/page-context';

const emptyWeek = () => Array.from({ length: 7 }, () => [] as number[]);

// Cuerpo compartido de /planificador (raíz) y /g/[slug]/planificador.
// - Sin ficha en el grupo → bienvenida (el edge ya exigió sesión).
// - Con ficha → coincidencias + mi disponibilidad + mi pista, de la semana
//   actual o la siguiente (?week=<lunes-siguiente>).
export async function PlannerBody({ ctx, weekParam }: { ctx: PageContext; weekParam?: string }) {
  const { player, groupId, basePath } = ctx;
  const gSlug = basePath === '' ? undefined : ctx.group.slug;
  const home = basePath || '/';

  if (!player) {
    return (
      <div className="max-w-md mx-auto mt-10 text-center space-y-4">
        <div className="text-4xl">📅</div>
        <h1 className="display" style={{ fontSize: 28 }}>Planificador semanal</h1>
        <p className="muted">
          Tu cuenta no está vinculada a un jugador de este grupo. Pide al organizador
          que te vincule a tu ficha para marcar tu disponibilidad.
        </p>
        <Link href={home} className="sec-link" style={{ justifyContent: 'center' }}>
          Volver →
        </Link>
      </div>
    );
  }

  const [current, next] = editableWeeks(madridTodayIso());
  const week = weekParam === next ? next : current;
  const view = await loadWeekView(groupId, week);

  const mine = view.players.find((p) => p.id === player.id)?.byDay ?? emptyWeek();
  const myCourt = view.courts.find((c) => c.ownerId === player.id) ?? null;
  const base = `${basePath}/planificador`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="sec-title">Planificador semanal</h1>
        <div className="flex gap-2">
          <Link href={base} className={`lpt-btn ${week === current ? 'primary' : ''}`}
            style={{ minHeight: 34, padding: '6px 12px' }}>
            Esta semana
          </Link>
          <Link href={`${base}?week=${next}`} className={`lpt-btn ${week === next ? 'primary' : ''}`}
            style={{ minHeight: 34, padding: '6px 12px' }}>
            Próxima
          </Link>
        </div>
      </div>

      <Coincidences view={view} />

      <section className="section">
        <AvailabilityGrid
          key={`me-${week}`}
          title="Mi disponibilidad"
          dates={view.dates}
          initial={mine}
          week={week}
          g={gSlug}
          endpoint="/api/planner/availability"
        />
      </section>

      <section className="section">
        <CourtSection
          key={`court-${week}`}
          court={myCourt ? { id: myCourt.id, name: myCourt.name } : null}
          dates={view.dates}
          initialByDay={myCourt?.byDay ?? emptyWeek()}
          week={week}
          g={gSlug}
        />
      </section>
    </div>
  );
}
```

(Los `key={…-${week}}` fuerzan a remontar los componentes cliente al cambiar de semana: su estado inicial viene de props.)

- [ ] **Step 5: Páginas raíz y de grupo**

Create `src/app/planificador/layout.tsx` (idéntico a `src/app/me/layout.tsx` salvo el nombre):

```tsx
import { Navbar } from '@/components/shared/navbar';
import { BottomNav } from '@/components/shared/bottom-nav';
import { getSession } from '@/lib/auth/session';

export default async function PlanificadorLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const player = session?.player
    ? {
        id: session.player.id,
        name: session.player.name,
        nickname: session.player.nickname,
        avatarUrl: session.player.avatarUrl,
      }
    : null;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar session={session ? { role: session.role, player } : null} />
      <main className="screen">
        <div className="lpt-container">{children}</div>
      </main>
      <BottomNav />
    </div>
  );
}
```

Create `src/app/planificador/page.tsx`:

```tsx
import { resolvePageContext } from '@/lib/auth/page-context';
import { PlannerBody } from '@/components/pages/planner-body';

export const dynamic = 'force-dynamic';

// /planificador de raíz: contexto = grupo por defecto. Cuerpo compartido con /g/[slug].
export default async function PlanificadorPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const ctx = await resolvePageContext();
  return <PlannerBody ctx={ctx} weekParam={week} />;
}
```

Create `src/app/g/[slug]/planificador/page.tsx`:

```tsx
import { resolvePageContext } from '@/lib/auth/page-context';
import { PlannerBody } from '@/components/pages/planner-body';

export const dynamic = 'force-dynamic';

// /g/[slug]/planificador: planificador EN el grupo del slug. Hereda el chrome
// group-aware de g/[slug]/layout.tsx. El edge exige sesión; el gating de ficha
// lo hace PlannerBody (sin ficha → bienvenida).
export default async function GroupPlanificadorPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { slug } = await params;
  const { week } = await searchParams;
  const ctx = await resolvePageContext(slug); // notFound() si el slug no existe
  return <PlannerBody ctx={ctx} weekParam={week} />;
}
```

- [ ] **Step 6: Navegación**

En `src/components/shared/nav-links.tsx`:
1. Añadir `CalendarCheck` al import de `lucide-react`.
2. Añadir a `navLinks` (entre 'Eventos' y 'La Timba'):

```ts
  { href: '/planificador', label: 'Planificador', icon: CalendarCheck },
```

(`isNavActive` ya funciona por igualdad exacta para rutas sin subrutas.)

En `src/components/pages/group-home-body.tsx`, importar `Link` de `next/link` y `CalendarCheck` de `lucide-react`, y añadir justo después del `<p className="small muted">…jugadores</p>`:

```tsx
      <Link href={`${basePath}/planificador`} className="sec-link" style={{ marginBottom: 20 }}>
        <CalendarCheck size={16} /> Planificador semanal →
      </Link>
```

- [ ] **Step 7: Typecheck + lint + suite**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/pages/planner-body.tsx src/app/planificador src/app/g/\[slug\]/planificador \
  src/lib/auth/authorize.ts src/lib/auth/authorize.test.ts \
  src/lib/groups/resolve-slug.ts src/lib/groups/resolve-slug.test.ts \
  src/components/shared/nav-links.tsx src/components/pages/group-home-body.tsx
git commit -m "feat(planner): página /planificador (raíz + /g/[slug]) con selector de semana, nav y gating

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Suite e2e Playwright

**Files:**
- Create: `e2e/planner.spec.ts`
- Modify: `e2e/README.md` (sección «Qué cubre»)

Estado montado con inserciones directas en la DB de fichero (mismo patrón que `global-setup.ts`; `workers: 1` evita carreras) + la escritura propia se ejercita por UI. Los tests de un mismo fichero corren en orden.

- [ ] **Step 1: Escribir el spec**

Create `e2e/planner.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { createClient } from '@libsql/client';
import { TEST_ENV } from '../playwright.config';
import { madridTodayIso, mondayOf } from '../src/lib/planner/weeks';

const WEEK = mondayOf(madridTodayIso());
const S2000 = [1200, 1230, 1260, 1290]; // 20:00–22:00

test.beforeAll(async () => {
  const db = createClient({ url: TEST_ENV.DB_URL });
  // Pista de pl2 en Lomeros.
  await db.execute({
    sql: 'INSERT OR IGNORE INTO courts (id, group_id, owner_player_id, name) VALUES (?, ?, ?, ?)',
    args: ['court-pl2', 'lomeros', 'pl2', 'Urb. Los Olivos'],
  });
  const put = (day: number, type: string, id: string, slots: number[]) => db.execute({
    sql: `INSERT OR REPLACE INTO planner_slots (id, group_id, week_start, day, subject_type, subject_id, slots)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [`ps-${type}-${id}-${day}`, 'lomeros', WEEK, day, type, id, JSON.stringify(slots)],
  });
  // Miércoles (day 2): SOLO 3 jugadores + pista efectiva → falta 1 para partido.
  await put(2, 'player', 'pl2', S2000);
  await put(2, 'player', 'pl3', S2000);
  await put(2, 'player', 'pl4', S2000);
  await put(2, 'court', 'court-pl2', S2000);
  // Jueves (day 3): 4 jugadores pero la dueña de la pista (pl2) NO está → sin partido.
  await put(3, 'player', 'pl3', S2000);
  await put(3, 'player', 'pl4', S2000);
  await put(3, 'player', 'pl5', S2000);
  await put(3, 'player', 'pl6', S2000);
  await put(3, 'court', 'court-pl2', S2000);
});

test.describe('planner · gating de sesión', () => {
  test('sin sesión → redirect a /login', async ({ page }) => {
    await page.goto('/planificador');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('planner · flujo del jugador (pl1, Lomeros)', () => {
  test.use({ storageState: 'e2e/.auth/player.json' });

  test('sin 4º jugador no hay coincidencia; al pintar y guardar, aparece', async ({ page }) => {
    await page.goto('/planificador');
    await expect(page.getByRole('heading', { name: 'Planificador semanal' })).toBeVisible();
    // Estado inicial: miércoles tiene 3 jugadores → sin coincidencias.
    await expect(page.getByText('Aún no hay tramos con partido posible')).toBeVisible();

    // pl1 pinta miércoles 20:00–22:00 (4 celdas, day=2).
    for (const min of S2000) {
      await page.locator(`button[data-day="2"][data-min="${min}"]`).click();
    }
    await page.getByRole('button', { name: 'Guardar' }).first().click();
    await expect(page.getByText('Disponibilidad guardada')).toBeVisible();

    // Coincidencia del miércoles: tramo + pista + 4 disponibles (incluye a Jugador 1).
    const wed = page.getByText(/Miércoles \d+ · 20:00–22:00/);
    await expect(wed).toBeVisible();
    await expect(page.getByText(/Pista: Urb\. Los Olivos/)).toBeVisible();
    await expect(page.getByText(/4 disponibles:.*Jugador 1/)).toBeVisible();
    // El jueves NO aparece: 4 jugadores pero la dueña de la pista no está.
    await expect(page.getByText(/Jueves \d+ ·/)).toHaveCount(0);
  });

  test('la disponibilidad pintada persiste al recargar', async ({ page }) => {
    await page.goto('/planificador');
    for (const min of S2000) {
      await expect(page.locator(`button[data-day="2"][data-min="${min}"]`).first())
        .toHaveAttribute('aria-pressed', 'true');
    }
  });

  test('bloques de <3 casillas bloquean el guardado', async ({ page }) => {
    await page.goto('/planificador');
    // Dos celdas sueltas el viernes (day=4) → aviso y botón deshabilitado.
    await page.locator('button[data-day="4"][data-min="1200"]').click();
    await page.locator('button[data-day="4"][data-min="1230"]').click();
    await expect(page.getByText('Los bloques deben ser de mínimo 1,5h')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar' }).first()).toBeDisabled();
    // Completar el bloque a 3 → se puede guardar.
    await page.locator('button[data-day="4"][data-min="1260"]').click();
    await expect(page.getByRole('button', { name: 'Guardar' }).first()).toBeEnabled();
  });

  test('declarar mi pista y ver su cuadrícula', async ({ page }) => {
    await page.goto('/planificador');
    await page.getByPlaceholder(/Nombre de la pista/).fill('Pista de Jugador 1');
    await page.getByRole('button', { name: 'Tengo pista' }).click();
    await expect(page.getByText('Mi pista · Pista de Jugador 1')).toBeVisible();
  });

  test('no-fuga: el planificador de Lomeros no muestra datos de grupo-test', async ({ page }) => {
    await page.goto('/planificador');
    await expect(page.getByText('Jugador GT')).toHaveCount(0);
  });
});

test.describe('planner · paridad /g/[slug]', () => {
  test('jugador del grupo ve el planificador del grupo', async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e/.auth/gt-player.json' });
    const page = await context.newPage();
    const res = await page.goto('/g/grupo-test/planificador');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Planificador semanal' })).toBeVisible();
    await expect(page.getByText('Mi disponibilidad')).toBeVisible();
    await context.close();
  });

  test('admin de Lomeros sin ficha en el grupo → bienvenida, sin cuadrícula', async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
    const page = await context.newPage();
    const res = await page.goto('/g/grupo-test/planificador');
    expect(res?.status()).toBe(200);
    await expect(page.getByText(/no está vinculada a un jugador de este grupo/i)).toBeVisible();
    await expect(page.getByText('Mi disponibilidad')).toHaveCount(0);
    await context.close();
  });
});
```

Notas para el ejecutor:
- `global-setup.ts` crea pl1…pl8 (`Jugador 1`…`Jugador 8`) en Lomeros y el usuario `player.json` vinculado a pl1; `ensureAuxTables` (Task 1) ya crea `courts`/`planner_slots` en la DB de e2e.
- Si el toast de sonner desaparece antes de la aserción, sustituir esa aserción por esperar a la coincidencia directamente.
- Si `page.locator(...).click()` no pinta la celda (el handler es `onPointerDown`), usar `.dispatchEvent('pointerdown')` seguido de `page.mouse.up()` o `.click({ force: true })`.

- [ ] **Step 2: Correr el spec**

Run: `npx playwright test e2e/planner.spec.ts`
Expected: PASS (7 tests). Si `chromium` no está instalado: `npx playwright install chromium`.

- [ ] **Step 3: Suite e2e completa (regresiones)**

Run: `npm run e2e`
Expected: PASS — la suite entera, no solo el spec nuevo.

- [ ] **Step 4: Actualizar `e2e/README.md`**

Añadir al final de la sección «Qué cubre»:

```markdown
- **planner**: disponibilidad semanal pintable, validación de bloques (≥1,5h), alta de
  pista propia, coincidencias (4 jugadores + pista∩dueño), paridad `/g/[slug]/planificador`.
```

- [ ] **Step 5: Commit**

```bash
git add e2e/planner.spec.ts e2e/README.md
git commit -m "test(planner): e2e del planificador (pintar+guardar, coincidencias, pista, paridad de grupo)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Verificación final

- [ ] **Step 1: Todo verde de una tacada**

Run: `npm test && npm run lint && npm run check:db-access && npm run build && npm run e2e`
Expected: PASS todos. Si `npm run build` falla por env vars de Turso ausentes, exportar las de e2e: `TURSO_DATABASE_URL=file:./e2e/test.db TURSO_AUTH_TOKEN= npm run build`.

- [ ] **Step 2: Verificación funcional manual (skill superpowers:verification-before-completion)**

Levantar `npm run dev:e2e` (DB de e2e ya migrada) y comprobar en el navegador con la cookie de `e2e/.auth/player.json` (o vía dev-login): pintar, guardar, recargar, cambiar a «Próxima» semana, declarar pista. Confirmar que no hay errores en consola del navegador ni del server.

- [ ] **Step 3: Commit final si hubo retoques + resumen**

Recordatorio para el despliegue (NO lo hace este plan): tras mergear y desplegar, ejecutar UNA vez
`curl -X POST https://<dominio>/api/migrate-planner` para crear las tablas en producción.

---

## Self-review del plan (hecha al escribirlo)

- **Cobertura de la spec:** reglas de dominio (Tasks 2–5), modelo de datos (Task 1), API+permisos (Task 7), UI cuadrícula/pista/coincidencias (Tasks 8–9), multi-tenant + gating + nav (Task 10), tests unit+e2e (todas + Task 11). Futuro (push/proponer) fuera de alcance, como manda la spec.
- **Sin placeholders:** cada step con código completo y comandos con salida esperada.
- **Consistencia de tipos:** `WeekView` (week-data) es la única forma que consumen página/API; `writePayloadError` compartida por las dos rutas de escritura; `PLANNER` única fuente de constantes.
