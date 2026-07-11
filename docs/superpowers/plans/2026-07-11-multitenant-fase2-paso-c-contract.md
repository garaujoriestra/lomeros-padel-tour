# Fase 2 · Tarea 1 · Paso C — Contract: getSession sin horneado + aterrizaje grupo-hogar

**Contexto.** Último paso del rollout expand→contract del slug routing (spec
`2026-06-29-multitenant-fase2-tarea1-slug-routing-design.md` §6). Desbloqueado al migrar
torneos (Paso B3, PR #24). Todo `/api` es ya group-aware; la paridad de páginas MVP existe
(`resolvePageContext`). Queda: (1) quitar de `getSession` el rol/ficha horneados al grupo
por defecto, (2) borrar `requireAdmin` (sin consumidores tras migrar los 3 restantes),
(3) aterrizaje "grupo-hogar" post-login.

## C1 — `Session` adelgaza a `{ userId, email }`

`getSession` pasa de 3 queries (user + membership del grupo por defecto + player) a 1
(user). Rol/ficha se obtienen SIEMPRE por grupo: páginas → `resolvePageContext(slug?)`
(sin slug = grupo por defecto → mismo resultado que hoy en raíz); API → `requireGroupAdmin`/
`requireGroupSession`.

Consumidores migrados (mecánico, `session.role/player` → `ctx.role/player`):

- **Layouts raíz** `(public)`, `me`, `planificador`: navSession para `<Navbar>` con el
  patrón EXACTO de `g/[slug]/layout.tsx` (ctx.role no-super_admin → {role, player}).
  *Cambio de borde aceptado:* un logueado SIN membership (p.ej. user "pelado" de dev-login)
  ve el navbar de visitante (hoy veía rol 'player' fantasma). Ningún miembro de Lomeros
  afectado.
- **`admin/layout.tsx` + `admin/notifications/page.tsx`**: gate = `getSession()` (401→login)
  + `resolvePageContext().role !== 'admin'` → `/me`. Idéntico para Lomeros (rol venía de la
  misma membership); super_admin sigue sin entrar (role 'super_admin' ≠ 'admin').
- **`me/edit`, `me/tokens`**: sesión → login; `ctx.player` → gate ficha; `ctx.groupId`.
- **Páginas públicas** `rankings`, `matches/[id]`, `pozos/[id]`, `torneos/[id]` +
  componentes `bets-summary`, `notification-reminder-gate`: `myPlayerId`/`me` desde
  `resolvePageContext()` (React cache dedupe por request; solo se montan en raíz).
- **API restantes con `requireAdmin`** → `requireGroupAdmin()` (sin target = única
  membership, idéntico): `push/broadcast` (usa `ctx.groupId`), `upload/match-photo`,
  `migrate-tournaments-v2`.
- **BORRAR `api/admin/flip-sides`**: one-shot ya ejecutado en prod, sin referencias;
  el security-review (2026-07-09) pedía scopearlo o eliminarlo.
- **BORRAR `requireAdmin`** de `guard.ts` (+ sus unit tests → adaptar a los guards nuevos).

## C2 — Aterrizaje grupo-hogar (post-login)

Helper puro `resolveHomePath(memberships, defaultGroupId)` + wrapper
`homePathForUser(userId)` en `src/lib/auth/home-path.ts`:

- Sin memberships → `/me` (bienvenida/onboarding).
- Con membership en el grupo por defecto → `/me` (Lomeros idéntico).
- Exactamente una (no-default) → `/g/<slug>/me`.
- Varias no-default → la de `created_at` más reciente (chooser multi-grupo = Tarea 3).

Cableado en: `api/auth/callback` (`dest = from interno ?? homePathForUser`) y
`api/auth/dev-login` (devuelve `home` en el JSON; el form navega ahí en vez de `/`).
DECISIÓN: `/` NO redirige a nadie (el spec menciona "/ y post-login", pero redirigir la
home pública de Lomeros para miembros sería un cambio visible → principio nº1; la home
raíz queda como está).

## TDD

1. Unit `home-path.test.ts` (resolver puro: 4 casos).
2. e2e `home-landing.spec.ts`: dev-login con `gt-admin@test.com` aterriza en
   `/g/grupo-test/me`; dev-login con el admin de Lomeros aterriza en `/me`; login con
   `?from=` interno lo respeta. (Rojo: hoy el form va a `/`.)
3. Implementar C1+C2; suite COMPLETA verde (unit + e2e + tsc + lint + check:db-access) —
   la suite existente es la red de regresión de "Lomeros idéntico".

## Fuera de alcance

- Chooser multi-grupo y conmutador súper-admin (Tarea 3).
- Onboarding self-service (Tarea 2).
- Gatear `/api/migrate-*`+`init-db` tras CRON_SECRET/isDevToolingEnabled (higiene aparte).
