# Lefty Flag (Feature B) — Lomeros Padel Tour

**Fecha:** 2026-04-27
**Estado:** Aprobado, pendiente de plan de implementación
**Alcance:** Marcar jugadores como zurdos y mostrar un badge "🤚 Zurdo" en su perfil. Cambio aditivo trivial — primer cambio de schema del proyecto, calentando para el de "lado de pista" (Feature C).

---

## Contexto

El usuario quiere indicar si un jugador es zurdo, visible en el perfil del jugador. Es información útil de cara a Feature C (lado de pista) — saber que alguien es zurdo influye en qué lado de la pista juega habitualmente.

Visibilidad acordada: **solo en el perfil** (no en tabla de ranking ni en match cards). Si después se quiere extender a otros sitios, es cambio aditivo trivial.

## Decisiones de diseño

**Schema:** boolean no-nullable con default `false`. SQLite no tiene tipo BOOLEAN nativo — se guarda como INTEGER 0/1 vía `integer('is_left_handed', { mode: 'boolean' })`.

**Migración:** se reutiliza el patrón existente en `src/app/api/migrate-db/route.ts` (ALTER TABLE idempotente vía try/catch). No introducimos drizzle-kit migrations todavía — el proyecto no las usa y el patrón ad-hoc funciona bien para una columna nueva con default. Después del deploy, un único `curl -X POST /api/migrate-db` aplica el cambio en la DB de Turso. Filas existentes quedan con `0` (no zurdo).

**Display:** badge azul "🤚 Zurdo" en la fila de badges del hero del perfil, junto al ELO y la racha. Color azul para diferenciar de verde (ELO/win) y rojo (loss/streak).

## Cambios

### 1. Schema (`src/lib/db/schema.ts`)

Añadir al `players` table:

```ts
isLeftHanded: integer('is_left_handed', { mode: 'boolean' }).notNull().default(false),
```

### 2. Migración (`src/app/api/migrate-db/route.ts`)

Añadir un nuevo paso ALTER TABLE idempotente al final de los pasos existentes:

```ts
try {
  await db.run(sql`ALTER TABLE players ADD COLUMN is_left_handed INTEGER NOT NULL DEFAULT 0`);
} catch {
  // Column already exists — skip silently
}
```

### 3. API routes

`src/app/api/players/route.ts` (POST):
- Destructurar `isLeftHanded` del body junto con `name`, `nickname`, `avatarUrl`.
- Pasarlo al `db.insert(players).values({ ..., isLeftHanded: !!isLeftHanded })`.

`src/app/api/players/[id]/route.ts` (PUT):
- Destructurar `isLeftHanded` del body.
- Añadirlo al `db.update(players).set({ ..., isLeftHanded: !!isLeftHanded })`.

Coerción `!!` defensiva — si el front no manda el campo o lo manda como undefined, se guarda como `false`.

### 4. PlayerForm (`src/components/admin/player-form.tsx`)

- Añadir `isLeftHanded: boolean | null` al tipo de `initialData` (null para retro-compatibilidad si la fila aún no tiene la columna).
- Añadir `isLeftHanded` al estado del form: `isLeftHanded: initialData?.isLeftHanded ?? false`.
- Añadir un nuevo bloque `<div className="space-y-2">` debajo del Apodo con un checkbox simple:

```tsx
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
```

### 5. Profile display (`src/app/(public)/players/[id]/page.tsx`)

En la fila `flex flex-wrap gap-2 mt-3 justify-center sm:justify-start` del hero (donde están el badge ELO y la racha), añadir condicionalmente:

```tsx
{player.isLeftHanded && (
  <span className="px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/40 text-blue-300 text-sm font-bold">
    🤚 Zurdo
  </span>
)}
```

## Orden de despliegue

1. Merge + push a `main` → Vercel buildea y deploya en ~40s.
2. **Aplicar migración una sola vez:**
   ```bash
   curl -X POST https://lomeros-padel-tour.vercel.app/api/migrate-db
   ```
3. Probar: editar un jugador → marcar checkbox → guardar → ver badge en su perfil.

Si paso 2 se omite y se intenta crear un jugador nuevo, el INSERT fallará. Lecturas y display de jugadores existentes seguirán funcionando porque Drizzle hace `SELECT *` y `player.isLeftHanded` será `undefined` (cae en falsy → no muestra badge).

## Verificación

- `npx tsc --noEmit && npm run lint && npm test` — todo verde, los 23 tests de Elo siguen pasando (no se toca lógica de rating).
- Manual post-deploy:
  1. Aplicar migración.
  2. Editar un jugador existente → marcar zurdo → guardar.
  3. Abrir su perfil → verificar que aparece el badge "🤚 Zurdo".
  4. Abrir el perfil de otro jugador no marcado → confirmar que NO aparece el badge.
  5. Crear un jugador nuevo desde admin sin marcar zurdo → confirmar que se crea correctamente y su perfil no muestra badge.

## Archivos afectados

**Modificados (5):**
- `src/lib/db/schema.ts` (nueva columna)
- `src/app/api/migrate-db/route.ts` (nuevo step ALTER TABLE)
- `src/app/api/players/route.ts` (POST acepta isLeftHanded)
- `src/app/api/players/[id]/route.ts` (PUT acepta isLeftHanded)
- `src/components/admin/player-form.tsx` (nuevo checkbox)
- `src/app/(public)/players/[id]/page.tsx` (badge condicional)

**Creados:** ninguno.

**Sin tocar:** Tabla de ranking, match cards, lógica de Elo, Podium, recommend-pairs.
