# Fase 2 · Tarea 1 · Paso B2 — `/api` group-aware: resto de dominios (EXCLUYE torneos) — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps usan checkbox (`- [ ]`).

**Goal:** Hacer group-aware (aceptar grupo objetivo + autorizar/operar contra él) los dominios `/api` restantes — **matches, rewards, rankings, pairings, timba/entry, redemptions, bets, me** — reutilizando la plantilla de B1. Mantener Lomeros idéntico cuando no se indica grupo.

**EXCLUSIÓN EXPLÍCITA (decisión del usuario 2026-06-29):** **NO migrar torneos/pozos** (`src/app/api/tournaments/**`). Esa funcionalidad sigue en verificación y se quiere mantener en **modo test, solo en el grupo Lomeros**. Al dejar sus rutas SIN migrar, conservan el patrón viejo (`requireAdmin` + grupo por defecto): no aceptan `?g=` y un admin de otro grupo no puede usarlas → de facto solo-Lomeros. **No tocar `src/app/api/tournaments/**` en este paso.**

**Base/decisión (de B1, ya en prod `f44ff73`):** Paso B migra por dominio CON authz por grupo objetivo. Helpers ya existen: `groupIdFromQuery(request)` / `groupIdFromValue(value)` (`src/lib/groups/request-group.ts`) y `requireGroupAdmin(targetGroupId?)` (`src/lib/auth/guard.ts`). Convención: GET/DELETE → grupo en `?g=<slug>`; POST/PUT/PATCH → `body.g`. Sin grupo → fallback a única membership (Lomeros) = idéntico.

**No-rotura de Lomeros (rector):** sin `?g=`/`body.g`, todo resuelve a la única membership (Lomeros) → comportamiento byte-a-byte idéntico. `getSession`, `getGroupContext` (core), `proxy.ts`, `requireAdmin`/`requireSession` NO se tocan. Suite e2e existente (incl. no-fuga) verde.

**Tech Stack:** Next 16, Drizzle/Turso, Vitest, Playwright. Helpers de dominio ya toman `groupId`. DB-access guard (`npm run check:db-access`) debe seguir verde.

---

## Pieza nueva reutilizable: `requireGroupSession`

Las rutas de jugador (bets, redemptions personales, me) usan hoy `requireSession()` + `session.player`. `session.player` lo resuelve `getSession` contra el grupo **por defecto** (deuda de Paso C). Para hacerlas group-aware **sin** tocar `getSession`, se usa `getGroupContext({targetGroupId}).playerId`, que YA es group-aware. `requireGroupSession` devuelve ese contexto.

**Task G — añadir a `src/lib/auth/guard.ts`** (additivo; no tocar lo existente) + unit `guard.test.ts` (ampliar):

```ts
// Miembro (cualquier rol) o super_admin del GRUPO OBJETIVO. 401 sin sesión; 403 sin acceso
// a ese grupo. Devuelve el contexto (incl. ctx.playerId = ficha del usuario EN ESE grupo,
// null si super_admin o sin ficha). Las rutas de jugador usan ctx.playerId en vez de
// session.player (que está horneado al grupo por defecto).
export async function requireGroupSession(
  targetGroupId?: string | null,
): Promise<{ ctx: GroupContext } | { response: NextResponse }> {
  const session = await getSession();
  if (!session) {
    return { response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  }
  const ctx = await getGroupContext(targetGroupId ? { targetGroupId } : {});
  if (!ctx) {
    return { response: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) };
  }
  return { ctx };
}
```

Tests nuevos en `guard.test.ts`: `requireGroupSession` → 401 sin sesión; 403 si `getGroupContext` null; `{ctx}` para cualquier rol (admin/player/super_admin) con contexto.

---

## Recetas de migración

### Receta A — rutas admin + lecturas públicas (calcan a players de B1)
- **GET público:** `const groupId = (await groupIdFromQuery(request)) ?? (await getDefaultGroupId());` (sin auth).
- **POST/PUT/PATCH admin:** leer body con `const body = await request.json().catch(() => null); if (!body) return 400;`, luego `const auth = await requireGroupAdmin(await groupIdFromValue(body.g)); if ('response' in auth) return auth.response; const groupId = auth.ctx.groupId;`.
- **DELETE admin:** `const auth = await requireGroupAdmin(await groupIdFromQuery(request)); if ('response' in auth) return auth.response; const groupId = auth.ctx.groupId;`.
- Quitar imports de `requireAdmin`/`getGroupContext` que queden sin uso; añadir `groupIdFromQuery`/`groupIdFromValue`/`requireGroupAdmin`.

### Receta B — rutas de jugador (sesión) → `requireGroupSession` + `ctx.playerId`
- Reemplazar `const auth = await requireSession(); ... const player = auth.session.player; if (!player) 403;` por:
  `const auth = await requireGroupSession(<grupo>); if ('response' in auth) return auth.response; const playerId = auth.ctx.playerId; if (!playerId) return NextResponse.json({ error: 'Sin jugador vinculado' }, { status: 403 });`
  donde `<grupo>` = `await groupIdFromQuery(request)` (GET/DELETE) o `await groupIdFromValue(body.g)` (POST/PATCH).
- Usar `playerId` en vez de `player.id`, y `auth.ctx.groupId` en vez de `getGroupContext()?.groupId ?? getDefaultGroupId()`.
- Ramas admin dentro de una ruta mixta (p. ej. `redemptions?all=1`, `redemptions/[id]` PUT) → Receta A (`requireGroupAdmin`).

---

## Mapa de auth por dominio (qué receta por ruta)

**matches** (Receta A):
- `matches/route.ts`: GET público (`?g=`); POST admin (`body.g`).
- `matches/[id]/route.ts`: GET público (`?g=`); PUT admin (`body.g`); DELETE admin (`?g=`).
- `matches/[id]/abandon/route.ts`: (mutación admin — leer; usar `body.g` si POST/PUT).
- `matches/[id]/sides/route.ts`: (mutación admin — leer; `body.g`).

**rewards** (Receta A):
- `rewards/route.ts`: GET público (`?g=`); POST admin (`body.g`).
- `rewards/[id]/route.ts`: (admin — leer métodos; PUT/PATCH→`body.g`, DELETE→`?g=`).

**rankings** (Receta A): `rankings/route.ts`: GET público (`?g=`). (trivial)

**pairings** (Receta A): `pairings/preview/route.ts`: (leer; admin — `?g=` si GET, `body.g` si POST).

**timba** (Receta A): `timba/entry/route.ts`: POST admin (`body.g`).

**redemptions** (mixta A+B):
- `redemptions/route.ts`: GET `?all=1`→admin (Receta A, `?g=`); GET personal→sesión (Receta B, `?g=`); POST→sesión (Receta B, `body.g`).
- `redemptions/[id]/route.ts`: PUT admin (Receta A, `body.g`).

**bets** (Receta B + público):
- `bets/route.ts`:
  - GET `?matchId=`→público: grupo `?g=`; resolver `getMatchInGroup(groupId, matchId)`; el resto igual.
  - GET `?mine=1`→sesión (Receta B, `?g=`): `getMyBets(ctx.playerId)`.
  - POST→sesión (Receta B, `body.g`): usar `playerId`/`ctx.groupId`; el resto de la lógica (auto-apuesta, penalización, transacción) **sin cambios** salvo sustituir `player.id`→`playerId`.
  - DELETE→sesión (Receta B, `?g=`): `playerId`.

**me** (Receta B): `me/route.ts`: PATCH sesión (`body.g`): `updatePlayerInGroup(ctx.groupId, ctx.playerId, …)`.

---

## Orden de ejecución (subagent-driven)

- **Task G:** `requireGroupSession` + tests (review: authz).
- **Task M:** matches (Receta A) + e2e.
- **Task R:** rewards + rankings + pairings + timba/entry (Receta A) + e2e.
- **Task S:** me + redemptions + bets (Receta B, mixtas) + e2e (review a fondo: authz + ficha por grupo).
- **Task Z:** regresión (unit + e2e + guard + diff) + verificar que `tournaments/**` NO está en el diff + review final + merge.

Cada dominio: e2e con `?g=grupo-test` (lectura pública del otro grupo) + authz cross-grupo (admin de Lomeros → 403 en grupo-test; admin/jugador de grupo-test → OK con `g`). Usar fixtures `e2e/.auth/admin.json` (admin Lomeros) y `e2e/.auth/gt-admin.json` (admin grupo-test). Para rutas de jugador, el jugador de grupo-test (gt-pl*) no tiene usuario/sesión salvo gt-admin (que no tiene ficha) — los tests de jugador se centran en Lomeros (player.json) + el 403 cross-grupo; sembrar más fixtures solo si hace falta.

---

## No-rotura / verificación final (Task Z)
- `npm test` (unit, incl. tests nuevos de guard) + `npm run e2e` (incl. no-fuga) verdes.
- `npm run check:db-access` verde.
- `git diff --name-status main`: **NINGÚN** fichero bajo `src/app/api/tournaments/`. Solo dominios migrados + `guard.ts`/`guard.test.ts` + e2e.
- Review final del conjunto antes de merge a main.
