# Paridad completa bajo /g/[slug] (Tarea 2b) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un grupo nuevo tiene la app completa bajo `/g/[slug]`: páginas públicas de detalle (partido con La Timba, jugador, rankings×3, eventos, pozo/torneo), `/me` completo (cartera + editar), navegación con paridad (tabs + bottom-nav), y el admin entero (pozos/torneos, avisos, premios, canjes, timba, editar/lados de partido).

**Architecture:** Enfoque híbrido validado en spec `docs/superpowers/specs/2026-07-12-multitenant-fase2-tarea2b-paridad-completa-design.md`: cuerpos compartidos `XxxBody({ctx})` (patrón `MeBody`/`AdminPlayersBody`) para páginas grandes; copias-parametrizadas (patrón T10/T11 de la Tarea 2) para wrappers finos; forms client con prop `groupSlug` → `body.g`/`?g=`. CERO cambios de API (todo es group-aware desde B1-B3+C). Lomeros byte-idéntico en raíz (`basePath=''`, props ausentes).

**Tech Stack:** Next.js App Router (¡breaking changes! leer `node_modules/next/dist/docs/` antes de tocar páginas), Playwright e2e (`npx playwright test <spec> --reporter=line`; server raro → `lsof -ti :3100 | xargs kill -9; rm -f e2e/test.db`), vitest.

**Reglas transversales (aplican a TODAS las tasks):**
- Al extraer un cuerpo: MOVER markup sin cambiar comportamiento; la página raíz queda `const ctx = await resolvePageContext(); return <XxxBody ctx={ctx} … />;`. Sustituciones mecánicas dentro del cuerpo: `getDefaultGroupId()`→`ctx.groupId`; `resolvePageContext()` interno→prop `ctx`; hrefs `'/x'`→`` `${ctx.basePath}/x` ``.
- **Regla nueva del repo:** un server component que pueda renderizarse bajo grupo NUNCA llama `resolvePageContext()` sin slug — el contexto viaja por props.
- Forms client: prop opcional `groupSlug?: string`; `const basePath = groupSlug ? `/g/${groupSlug}` : '';`; mutaciones añaden `g: groupSlug` SOLO si hay slug; `router.push` con basePath. (Patrón exacto de `player-form.tsx`/`match-form.tsx`.)
- Páginas de grupo heredan gates de los layouts existentes (`g/[slug]/layout` público; `g/[slug]/admin/layout` rol admin) — NO duplicar gates.
- e2e: nombres/slug únicos por run; jugadores GT libres = `gt-pl5..8`; NO mutar `gt-match1` ni jugadores de Lomeros; aserciones de no-fuga por CONTENIDO (notFound() devuelve 200 en request.get).
- Verificación mínima por task: spec(s) e2e afectados + `npx tsc --noEmit` + al cierre de la task `npm run lint`. Commit por task.

---

### Task 1: Navegación con paridad (tabs + bottom-nav + isNavActive)

**Files:**
- Modify: `src/components/shared/nav-links.ts`
- Modify: `src/app/g/[slug]/layout.tsx`
- Test: `src/components/shared/nav-links.test.ts` (nuevo), `e2e/group-parity.spec.ts` (nuevo, primer describe)

- [ ] **Step 1: unit test que falla** — crear `src/components/shared/nav-links.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isNavActive } from './nav-links';

describe('isNavActive (basePath-aware)', () => {
  it('raíz: comportamiento intacto', () => {
    expect(isNavActive('/', '/')).toBe(true);
    expect(isNavActive('/', '/rankings')).toBe(false);
    expect(isNavActive('/rankings', '/players/pl1')).toBe(true);
    expect(isNavActive('/matches', '/matches/abc')).toBe(true);
    expect(isNavActive('/eventos', '/pozos/xyz')).toBe(true);
    expect(isNavActive('/rankings/pairs', '/rankings/pairs')).toBe(true);
  });
  it('grupo: mismos patrones con prefijo /g/<slug>', () => {
    expect(isNavActive('/g/gt', '/g/gt')).toBe(true);
    expect(isNavActive('/g/gt', '/g/gt/rankings')).toBe(false);
    expect(isNavActive('/g/gt/rankings', '/g/gt/players/pl1')).toBe(true);
    expect(isNavActive('/g/gt/matches', '/g/gt/matches/abc')).toBe(true);
    expect(isNavActive('/g/gt/eventos', '/g/gt/pozos/xyz')).toBe(true);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/components/shared/nav-links.test.ts` → FAIL (casos de grupo).

- [ ] **Step 3: implementar.** En `nav-links.ts`:
  - Nueva función `export function navLinksFor(basePath: string): NavLink[]` que mapea `navLinks` prefijando href (`href === '/' ? (basePath || '/') : `${basePath}${href}``) y **EXCLUYE `/info` cuando basePath !== ''** (contenido con storytelling de Lomeros; literales = Fase 4 — comentar el porqué).
  - `isNavActive` se reescribe normalizando: si `href` empieza por `/g/`, extraer el prefijo `/g/<slug>` común, strip de href y pathname, y aplicar la MISMA lógica actual sobre los paths desnudos (implementación sugerida: helper interno `strip(base, p)`; el href raíz del grupo es exactamente `/g/<slug>`). Mantener la lógica raíz intacta (byte-igual cuando no hay prefijo).
- [ ] **Step 4:** unit verde. `npx tsc --noEmit` limpio.
- [ ] **Step 5:** `g/[slug]/layout.tsx`: `<Navbar session={...} basePath={ctx.basePath} links={navLinksFor(ctx.basePath)} />` + añadir `<BottomNav basePath={ctx.basePath} />` (ya acepta basePath) en el mismo lugar estructural que los layouts raíz (leer `(public)/layout.tsx`). OJO: el navbar raíz usa `navLinks` directamente — verificar cómo recibe `links` (default) y NO cambiar la raíz.
- [ ] **Step 6: e2e** — crear `e2e/group-parity.spec.ts` con un describe de navegación: como gt-player, `/g/grupo-test` muestra tabs (link Ranking con href `/g/grupo-test/rankings`, Partidos, Eventos, Planificador) y bottom-nav; el link Info NO existe bajo grupo; en `/` (sin sesión) las tabs siguen siendo las de siempre (href `/rankings` etc.). Correr: los asserts de tabs de grupo pasan ya con este task (las páginas destino aún 404 — los links existen igualmente; no navegar aún).
- [ ] **Step 7: Commit** — `feat(paridad): navegación de grupo (tabs + bottom-nav) e isNavActive basePath-aware`

---

### Task 2: MatchDetailBody + detalle de partido bajo grupo (con La Timba)

**Files:**
- Create: `src/components/pages/match-detail-body.tsx` (extraído de `src/app/(public)/matches/[id]/page.tsx`)
- Modify: `src/app/(public)/matches/[id]/page.tsx` (queda wrapper + generateMetadata)
- Create: `src/app/g/[slug]/matches/[id]/page.tsx`
- Modify: `src/components/betting/bets-summary.tsx` (ctx por props), `src/components/shared/notification-reminder-gate.tsx` (player por props), y sus call-sites raíz
- Modify: `src/components/betting/betting-card.tsx` (prop `groupSlug` → `body.g` en el POST de apuesta y en el cancel/DELETE con `?g=`) — leer el componente para los fetchs exactos
- Test: `e2e/group-parity.spec.ts`

- [ ] **Step 1: e2e que falla** — describe "detalle de partido del grupo": gt-player navega desde `/g/grupo-test` al partido `gt-match1` (link de la home) → URL `/g/grupo-test/matches/gt-match1`, ve a `Jugador GT` y la sección de La Timba (gt-match1 es scheduled con apuesta abierta gt-bet1); apuesta 10 fichas al equipo 1 → el saldo mostrado baja (gt-pl1 parte del balance que tenga; leer la BettingCard para el selector del saldo y el botón de apostar; puede requerir que gt-pl1 tenga fichas — mira e2e/timba-*.spec.ts cómo siembran/apuestan y replica). No-fuga: `request.get('/g/grupo-test/matches/gt-match1')` como admin de Lomeros NO revela… (los partidos de grupo son públicos dentro de su URL de grupo — el aislamiento aquí es que `/matches/gt-match1` en RAÍZ sigue sin revelar contenido, ya cubierto por no-fuga existente; añade la inversa: `/g/grupo-test/matches/<partido-de-lomeros>` no revela su contenido).
- [ ] **Step 2: extraer `MatchDetailBody`.** Firma: `export async function MatchDetailBody({ ctx, matchId }: { ctx: PageContext; matchId: string })`. Mover TODO el cuerpo de la página raíz (desde `getMatchInGroup` hasta el JSX final) aplicando las reglas transversales: `groupId = ctx.groupId`; `pageCtx` interno → prop `ctx`; hrefs de jugadores/volver → `${ctx.basePath}/...`; `matchUrl` para compartir → incluir basePath. `TeamBlock` y helpers se mueven con el cuerpo. La página raíz conserva `generateMetadata` (usa default group — correcto en raíz) y renderiza el body.
- [ ] **Step 3: página de grupo:**

```tsx
// src/app/g/[slug]/matches/[id]/page.tsx
import { resolvePageContext } from '@/lib/auth/page-context';
import { MatchDetailBody } from '@/components/pages/match-detail-body';

export const dynamic = 'force-dynamic';

export default async function GroupMatchDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const ctx = await resolvePageContext(slug);
  return <MatchDetailBody ctx={ctx} matchId={id} />;
}
```
(generateMetadata de grupo: mismo shape que la raíz pero resolviendo el grupo del slug; si se complica, diferir el metadata de grupo con un comentario y título genérico — decisión del implementador, anotarla.)
- [ ] **Step 4: fix de contexto por props.** `BetsSummary({ matchId })` → `BetsSummary({ matchId, myPlayerId })` (el body le pasa `ctx.player?.id ?? null`; eliminar su `resolvePageContext()`); `NotificationReminderGate()` → `({ player }: { player: boolean })` o similar (call-sites: grep — está en layouts/páginas raíz; el que esté en páginas SOLO-raíz puede seguir recibiendo el dato desde su página; leer call-sites reales y pasar el dato desde arriba en todos).
- [ ] **Step 5: `BettingCard` group-aware** (prop `groupSlug`; el body se la pasa desde `ctx.basePath`/slug). POST `/api/bets` body + DELETE cancel con g (leer betting-card.tsx para los fetch exactos; APIs B2 ya lo aceptan).
- [ ] **Step 6:** e2e del describe verde + `npx playwright test matches-scoping no-fuga-matches timba-dos-mercados timba-celebration --reporter=line` verde (regresión raíz de la Timba y partidos) + tsc.
- [ ] **Step 7: Commit** — `feat(paridad): detalle de partido bajo /g/[slug] con La Timba (MatchDetailBody compartido)`

---

### Task 3: Ficha pública de jugador bajo grupo + enlaces del perfil

**Files:**
- Modify: `src/components/shared/player-profile-view.tsx` (prop `basePath` en enlaces internos)
- Modify: `src/components/pages/me-body.tsx` (pasar basePath; des-gatear tokens/edit — ver Task 6)
- Create: `src/app/g/[slug]/players/[id]/page.tsx` (wrapper: `resolvePageContext(slug)` + `getPlayerInGroup` gate + `loadPlayerProfile` — leer la página raíz `src/app/(public)/players/[id]/page.tsx` y copiar su estructura con ctx)
- Modify: página raíz de players/[id] si extraer un body compartido resulta más limpio que copiar (criterio del implementador: si el cuerpo raíz es >80 líneas, extraer `PlayerProfileBody`; si no, copiar). Anotar la decisión.
- Test: `e2e/group-parity.spec.ts`

- [ ] e2e primero: desde `/g/grupo-test/matches/gt-match1`, click en `Jugador GT` → `/g/grupo-test/players/gt-pl1` con su ficha; los enlaces de partidos de su historial apuntan a `/g/grupo-test/matches/...`. No-fuga: `/g/grupo-test/players/pl1` (jugador de Lomeros) no revela "Jugador 1".
- [ ] Implementar → verde (incluye `npx playwright test player-routes-scoping rankings-you --reporter=line` de regresión) → commit `feat(paridad): ficha pública de jugador bajo /g/[slug]`.

---

### Task 4: Rankings (×3) y Eventos bajo grupo

**Files:**
- Create: `src/components/pages/rankings-body.tsx`, `rankings-pairs-body.tsx`, `rankings-tokens-body.tsx`, `eventos-body.tsx` (extraídos de `src/app/(public)/rankings/page.tsx`, `rankings/pairs/page.tsx`, `rankings/tokens/page.tsx`, `eventos/page.tsx` — verificar rutas reales con `find "src/app/(public)" -name page.tsx`)
- Modify: las 4 páginas raíz (wrappers)
- Create: `src/app/g/[slug]/rankings/page.tsx`, `rankings/pairs/page.tsx`, `rankings/tokens/page.tsx`, `eventos/page.tsx` (wrappers con `resolvePageContext(slug)`)
- Test: `e2e/group-parity.spec.ts`

- [ ] e2e primero: `/g/grupo-test/rankings` lista `Jugador GT` y NO `Jugador 1`; tab Ranking activa; `/g/grupo-test/eventos` lista `Torneo GT`; enlaces de eventos → `/g/grupo-test/pozos/...` (aún 404 hasta Task 5 — asertar solo el href). Regresión: `npx playwright test rankings-you eventos --reporter=line`.
- [ ] Extraer bodies (reglas transversales; los hrefs de jugadores/eventos con `ctx.basePath`) → wrappers raíz + grupo → verde → commit `feat(paridad): rankings y eventos bajo /g/[slug]`.

---

### Task 5: Pozo y Torneo públicos bajo grupo

**Files:**
- Create: `src/components/pages/pozo-public-body.tsx`, `torneo-public-body.tsx` (extraídos de `src/app/(public)/pozos/[id]/page.tsx` y `torneos/[id]/page.tsx`)
- Modify: las 2 páginas raíz (wrappers)
- Create: `src/app/g/[slug]/pozos/[id]/page.tsx`, `src/app/g/[slug]/torneos/[id]/page.tsx`
- Test: `e2e/group-parity.spec.ts`

- [ ] e2e primero: `/g/grupo-test/pozos/gt-tournament1` muestra "Torneo GT" (draft → lo que muestre el estado draft en raíz; leer pozo-public.spec para el patrón); no-fuga inversa (pozo de Lomeros bajo grupo-test no revela nombre). Regresión: `npx playwright test pozo-public torneo-public --reporter=line`.
- [ ] Extraer (gate `getTournamentInGroup(ctx.groupId, id)` se mantiene; "tu próximo partido" usa `ctx.player`) → verde → commit `feat(paridad): pozo y torneo públicos bajo /g/[slug]`.

---

### Task 6: /me completo bajo grupo (cartera + editar perfil)

**Files:**
- Create: `src/components/pages/tokens-body.tsx` (extraído de `src/app/me/tokens/page.tsx`, que ya usa resolvePageContext — mover el cuerpo tras los gates)
- Modify: `src/app/me/tokens/page.tsx` (wrapper con sus redirects), `src/components/betting/redeem-button.tsx` (prop `groupSlug` → `body.g`)
- Create: `src/app/g/[slug]/me/tokens/page.tsx` (gates: sesión → login con from de grupo; `ctx.player` → redirect a `/g/<slug>/me`)
- Create: `src/app/g/[slug]/me/edit/page.tsx` + Modify `src/components/me/me-profile-form.tsx` (prop `groupSlug` → `body.g` en el PUT /api/me + router.push con basePath)
- Modify: `src/components/pages/me-body.tsx`: los bloques de cartera y "editar" gateados con `isRoot` pasan a mostrarse SIEMPRE con `${basePath}/me/tokens` y editable con basePath (leer el gate exacto: líneas ~42-44 y el prop `editable` de PlayerProfileView).
- Test: `e2e/group-parity.spec.ts`

- [ ] e2e primero: gt-player ve en `/g/grupo-test/me` el enlace a su cartera → `/g/grupo-test/me/tokens` con su saldo; edita su apodo en `/g/grupo-test/me/edit` (PUT con g) y el cambio aparece; regresión `npx playwright test group-me player-routes-scoping --reporter=line`.
- [ ] Implementar → verde → commit `feat(paridad): cartera y edición de perfil bajo /g/[slug]/me`.

---

### Task 7: Admin pozos y torneos bajo grupo

**Files:**
- Modify (props `groupSlug`): `src/components/admin/event-form.tsx`, `event-panel.tsx`, `generate-button.tsx`, `pairs-editor.tsx`, `delete-event-button.tsx`, `share-event-button.tsx` (leer cada uno; los fetch a `/api/tournaments*` añaden `g` en body para POST/PUT/PATCH y `?g=` para GET/DELETE; los router.push y links con basePath; share-event usa la URL pública → `${basePath}/pozos/...`)
- Create: `src/app/g/[slug]/admin/pozos/page.tsx`, `pozos/new/page.tsx`, `pozos/[id]/page.tsx`, `torneos/page.tsx`, `torneos/new/page.tsx`, `torneos/[id]/page.tsx` — patrón: leer las 6 raíz; listas y paneles usan queries con `ctx.groupId` (copiar con sustitución, o extraer body si >80 líneas — criterio, anotar)
- Modify: `src/components/admin/admin-sidebar.tsx` — ELIMINAR el filtro `GROUP_MVP_LINKS` (todas las secciones bajo grupo)
- Test: `e2e/group-parity.spec.ts` + AJUSTAR `e2e/group-admin.spec.ts` (el dashboard test asegura que no hay links a sub-rutas diferidas → ya no aplica; revisar aserciones que cambian de signo)
- OJO: `admin-dashboard-body.tsx` gatea accesos rápidos con `isRoot` — des-gatear con basePath los que ya existan bajo grupo (a estas alturas: todos).

- [ ] e2e primero: gt-admin crea un pozo (roster gt-pl5..8) desde `/g/grupo-test/admin/pozos/new`, lo genera, registra un resultado desde el panel, lo comparte (href público `/g/grupo-test/pozos/<id>`), y lo BORRA al final (idempotencia entre runs). Regresión: `npx playwright test tournaments-scoping no-fuga-tournaments pozo-americano event-create event-delete --reporter=line`.
- [ ] Implementar → verde → commit `feat(paridad): admin de pozos y torneos bajo /g/[slug]/admin`.

---

### Task 8: Admin avisos, premios, canjes y timba bajo grupo

**Files:**
- Create bodies: `src/components/pages/admin-notifications-body.tsx`, `admin-rewards-body.tsx`, `admin-redemptions-body.tsx`, `admin-timba-body.tsx` (extraídos de las páginas raíz correspondientes; notifications ya usa resolvePageContext del Paso C — mover cuerpo tras gates)
- Modify: 4 páginas raíz (wrappers con sus gates) + Create 4 páginas de grupo (`g/[slug]/admin/{notifications,rewards,redemptions,timba}/page.tsx` — gates heredados del layout de grupo; el gate interno `ctx.role !== 'admin'` de notifications raíz se conserva en su wrapper raíz)
- Modify (props `groupSlug`): `src/components/admin/broadcast-form.tsx` (body.g — API ya lo acepta del Paso C), `rewards-manager.tsx`, `redemptions-manager.tsx`, `timba-entries.tsx` (fetchs con g; leer cada uno)
- Test: `e2e/group-parity.spec.ts`

- [ ] e2e primero: gt-admin crea premio "Premio 2b <ts>" → gt-player lo canjea desde su cartera (saldo baja) → gt-admin lo marca entregado en canjes; gt-admin envía aviso (POST broadcast 200 con g); timba: la página lista el estado del grupo. No-fuga: los premios de grupo-test no aparecen en el admin raíz (regresión `npx playwright test rewards-scoping no-fuga-premios no-fuga-timba 1d-namespacing --reporter=line`).
- [ ] Implementar → verde → commit `feat(paridad): avisos, premios, canjes y timba bajo /g/[slug]/admin`.

---

### Task 9: Partidos editar + lados bajo grupo

**Files:**
- Modify: `src/components/admin/edit-result-form.tsx`, `match-sides-form.tsx` (prop `groupSlug`; fetchs con g; router.push basePath — leer para los endpoints exactos)
- Create: `src/app/g/[slug]/admin/matches/[id]/edit/page.tsx`, `[id]/sides/page.tsx` (patrón T11-result: copiar la raíz, `resolvePageContext(slug)`, `groupSlug={slug}`)
- Modify: `src/components/pages/admin-matches-body.tsx` — des-gatear «Lados» y «Editar» (`isRoot` fuera, basePath en hrefs)
- Test: `e2e/group-parity.spec.ts` + ajustar `e2e/group-admin.spec.ts` (aserción "Lados/Editar count 0" cambia de signo)

- [ ] e2e primero: gt-admin asigna lados al partido creado en su flujo (o a uno nuevo con gt-pl5..8, limpiándolo), edita el resultado; regresión `npx playwright test edit-result matches-scoping --reporter=line`.
- [ ] Implementar → verde → commit `feat(paridad): editar partido y lados bajo /g/[slug]/admin`.

---

### Task 10: Cierre — no-fuga transversal, suite completa y regresión

**Files:**
- Modify: `e2e/group-parity.spec.ts` (describe final de no-fuga cruzada)
- Posible ajuste: specs existentes cuyos gates cambiaron (inventariar con un run completo)

- [ ] **Step 1:** describe no-fuga transversal: con las URLs de grupo nuevas, grupo-test NUNCA revela contenido de Lomeros ni viceversa — matriz mínima: matches/[id], players/[id], pozos/[id], rankings, eventos (5 aserciones por dirección, por contenido).
- [ ] **Step 2:** suite completa desde limpio:
```bash
lsof -ti :3100 | xargs kill -9 2>/dev/null; rm -f e2e/test.db
npm run test && npm run lint && npm run check:db-access && npx tsc --noEmit && npm run e2e
```
TODO verde (fallo → spec aislado antes de asumir regresión).
- [ ] **Step 3:** Commit final `test(paridad): no-fuga transversal de las superficies nuevas`. El push/PR lo hace el controlador.

---

## Self-review del plan

- **Cobertura del spec:** §1→T2-T5 · §2→T6 · §3→T1 · §4→T7-T9 · §5 reglas transversales (cabecera) · §6→e2e por task + T10. Decisión nueva documentada: `/info` fuera de las tabs de grupo (T1, literales Lomeros = Fase 4); `/rankings/pairs` y `/rankings/tokens` incluidas (T4) porque las tabs las exigen.
- **Consistencia:** prop `groupSlug` en todos los client components; `ctx: PageContext` en todos los bodies; basePath desde `ctx.basePath`.
- **Riesgos señalados:** metadata de grupo en matches/[id] (T2, con salida documentada); criterio copiar-vs-extraer en páginas medianas (T3/T7, anotar decisión); call-sites de NotificationReminderGate (T2, grep antes); aserciones de group-admin.spec que cambian de signo (T7/T9).
