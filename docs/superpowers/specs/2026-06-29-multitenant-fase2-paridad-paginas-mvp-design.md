# Fase 2 · Tarea 1 — Paridad de páginas `/g/[slug]` (MVP) — diseño

**Fecha:** 2026-06-29
**Estado:** Diseño validado en brainstorming. Pendiente de plan de implementación (writing-plans).
**Contexto / base:**
- Spec slug routing: `2026-06-29-multitenant-fase2-tarea1-slug-routing-design.md` (Paso A: landing `/g/[slug]`, proxy, `getGroupBySlug`).
- Planes B1/B2 (en prod, origin/main `c820482`): `/api` group-aware (excepto torneos, en modo test solo-Lomeros).
- **Paso C APLAZADO** (quitar horneado de `getSession` + aterrizaje): bloqueado por torneos (usa `requireAdmin`→`session.role`) y por no existir páginas `/g/[slug]` ni miembros no-Lomeros. Este MVP de paridad es el trabajo donde la limpieza de `getSession` tiene propósito; el Paso C se retomará al completar la paridad / migrar torneos.

Este spec cubre el **MVP de paridad de páginas**: el conjunto mínimo de páginas bajo `/g/[slug]` que hace un grupo no-por-defecto **usable** de punta a punta, compartiendo lógica con las páginas de raíz (Lomeros) y sin cambiar el comportamiento de Lomeros.

---

## 0. Principio rector: NO romper Lomeros

Lomeros está en producción en la raíz. Garantías:
- Las páginas raíz del MVP (home, `/me`, `/admin`, `admin/players`, `admin/matches`) pasan a renderizar **el mismo cuerpo compartido** con `resolvePageContext()` (grupo por defecto). Es un **refactor de comportamiento idéntico**, cubierto por la suite e2e existente.
- `getSession` **NO se toca** (sigue horneando rol/ficha del grupo por defecto, que aún consumen páginas no migradas + `requireAdmin`/torneos).
- `getGroupContext` (core), `proxy.ts` salvo el matcher additivo, y todos los dominios `/api` ya migrados: sin cambios de semántica.
- Toda la suite e2e existente verde en cada paso.

---

## 1. Alcance MVP

**Dentro (páginas bajo `/g/[slug]`, más su refactor en raíz):**
- **Home de grupo:** enriquecer la landing `/g/[slug]` (hoy solo roster) con ranking (podio/clasificación) + próximos/últimos partidos del grupo.
- **`/g/[slug]/me`:** perfil del jugador en ese grupo (+ chrome).
- **`/g/[slug]/admin`** (dashboard) + **`/g/[slug]/admin/players`** (listar/crear/editar jugadores) + **`/g/[slug]/admin/matches`** (listar/crear/registrar partidos).

**Fuera (diferido a iteraciones posteriores de paridad):** rankings/pairs/tokens, players/[id], matches/[id] detalle, eventos, info, rewards, timba, redemptions, notifications, me/edit, me/tokens, y sub-rutas admin (matches/new, matches/[id]/result|sides, players/new, players/[id]/edit).

**Fuera (por decisión, modo test solo-Lomeros):** torneos/pozos (no hay rutas `/g/[slug]/torneos|pozos`; el chrome de grupo no los enlaza).

**Resultado esperado:** un grupo sembrado (`grupo-test`) es usable de punta a punta por su admin (gestiona jugadores y partidos) y sus jugadores (ven su ficha y la home del grupo) bajo `/g/[slug]`, sin que Lomeros note nada en raíz.

---

## 2. Arquitectura — resolutor de contexto + cuerpos compartidos

### `resolvePageContext(slug?)`
Nuevo helper de servidor (junto a `src/lib/auth/group-context.ts`). Resuelve, una vez por request de página, lo que página/layout necesitan:

```ts
interface PageContext {
  groupId: string;
  group: { id: string; slug: string; name: string };
  role: 'admin' | 'player' | 'super_admin';
  player: Player | null;   // objeto completo, cargado desde ctx.playerId
  isSuperAdmin: boolean;
  basePath: '' | `/g/${string}`;  // '' en raíz; '/g/<slug>' bajo el grupo
}
```

Reglas:
- **Con slug** (`/g/[slug]`): `getGroupBySlug(slug)` → si null `notFound()`. Resuelve `getGroupContext({ targetGroupId })`; si null (no miembro ni super-admin de ese grupo) → según la página (público vs gated). `basePath = '/g/<slug>'`.
- **Sin slug** (raíz): grupo por defecto (`getDefaultGroupId`); `getGroupContext()` (única membership). `basePath = ''`.
- Carga el `player` completo desde el `playerId` del contexto (los helpers de página necesitan name/nickname/avatar/tokenBalance, no solo el id). Reutiliza la query de players por id.
- Es el equivalente "de página" de lo que `getGroupContext` hace para `/api`: la fuente única de grupo/rol/ficha en el árbol de páginas migrado.

### Cuerpos compartidos
Cada página MVP se extrae a un componente de servidor que recibe el `PageContext` (o los datos derivados de él) y contiene **toda la lógica de render**:
- `GroupHomeBody`, `MeBody`, `AdminDashboardBody`, `AdminPlayersBody`, `AdminMatchesBody`.
- La ruta **raíz** la renderiza con `resolvePageContext()`; la ruta **`/g/[slug]`** con `resolvePageContext(slug)`. Una sola fuente de lógica por página; cero duplicación.
- Ubicación: componentes compartidos en `src/components/pages/` (o junto a su dominio), siguiendo el patrón modular existente.

---

## 3. Chrome / navbar group-aware

- `Navbar` y `BottomNav` aceptan `basePath` (de `resolvePageContext`). Sus enlaces pasan de `/`, `/admin`, `/me`, … a `${basePath}/`, `${basePath}/admin`, `${basePath}/me`, … En raíz `basePath=''` → idéntico a hoy.
- Los 3 layouts (`(public)/layout.tsx`, `me/layout.tsx`, `admin/layout.tsx`) y sus equivalentes bajo `/g/[slug]` resuelven el contexto y pasan `basePath` + `role` + `player` al chrome, **reemplazando su uso actual de `session.role`/`session.player`**.
- **En contexto de grupo**, el chrome **omite** los enlaces a secciones no incluidas en el MVP (eventos, torneos, rankings detalle, etc.) para no generar 404. En raíz, el chrome de Lomeros muestra todo como hoy.

---

## 4. Gating de auth bajo `/g/[slug]`

- **Edge (`proxy.ts`):** añadir al matcher `/g/:slug/me/:path*` y `/g/:slug/admin/:path*` para exigir **presencia de sesión** (redirect a `/login?from=…`), igual que hoy con `/me` y `/admin` en raíz. El check existente de slug de un solo segmento (404 / 308 lomeros→`/`) se mantiene. (El proxy ya corre en runtime Node, así que el lookup de slug es seguro.)
- **Server-side:**
  - Layout `/g/[slug]/admin`: exige `ctx.role === 'admin'` para ESE grupo (vía `resolvePageContext(slug)`); no-admin → redirect a `/g/[slug]/me`. (Mismo patrón que el `admin/layout.tsx` de raíz, pero con rol del grupo de la URL en vez de `session.role`.)
  - Página/layout `/g/[slug]/me`: exige ficha en ese grupo (`ctx.player`); sin ficha → mensaje "no tienes ficha en este grupo" (no redirect-loop).

---

## 5. Manejo de `getSession` (límite con el Paso C aplazado)

- Se **introduce** `resolvePageContext` y lo usan las páginas/layouts del MVP (raíz + `/g/[slug]`), que dejan de leer `session.role`/`session.player`.
- `getSession` **se mantiene intacto** (sigue horneando rol/ficha del grupo por defecto) porque lo consumen las páginas **no migradas** y `requireAdmin` (torneos). 
- Por tanto este MVP **avanza** hacia la limpieza de `getSession` (las páginas migradas ya son group-aware) pero **no la completa**: quitar el horneado es el **Paso C, aplazado**, a ejecutar cuando toda la paridad esté hecha y/o se migren torneos.

---

## 6. Rollout (cada paso desplegable, Lomeros idéntico)

| Paso | Qué | Garantía |
|---|---|---|
| **1 — Fundamentos + home** | `resolvePageContext`; `basePath` en `Navbar`/`BottomNav`; migrar los 3 layouts; `GroupHomeBody` (raíz + `/g/[slug]`, ranking+partidos). | Raíz renderiza el mismo cuerpo con grupo por defecto → idéntico. |
| **2 — `/me`** | Extraer `MeBody`; `/me` raíz + `/g/[slug]/me`; gating de ficha. | `/me` de Lomeros idéntico. |
| **3 — admin** | `AdminDashboardBody` + `AdminPlayersBody` + `AdminMatchesBody`; `/admin*` raíz + `/g/[slug]/admin*`; gating de rol + matcher de proxy. | admin de Lomeros idéntico; gating por grupo de la URL. |

El plan de implementación arranca por el Paso 1.

---

## 7. Testing (e2e Playwright + unit, según `AGENTS.md`)

**Nuevos (cubren el MVP):**
- **Home de grupo:** `/g/grupo-test` muestra ranking/partidos de grupo-test; no aparece nada de Lomeros.
- **Jugador:** con `gt-player.json`, `/g/grupo-test/me` → 200 con la ficha gt-pl1 y datos de grupo-test.
- **Admin propio:** con `gt-admin.json`, `/g/grupo-test/admin` → 200 (dashboard), `/g/grupo-test/admin/players` permite ver/crear jugadores de grupo-test.
- **Admin ajeno:** con `admin.json` (admin de Lomeros), `/g/grupo-test/admin` → redirect a `/g/grupo-test/me` (no es admin de ese grupo).
- **Gating edge:** `/g/grupo-test/me` y `/g/grupo-test/admin` sin sesión → redirect a `/login`.
- **Unit:** `resolvePageContext` (slug→contexto; sin slug→por defecto; carga del player desde playerId; slug inválido→notFound).

**No-rotura de Lomeros (regresión):**
- Toda la suite e2e existente verde.
- Las páginas raíz del MVP (home, `/me`, `/admin`, admin/players, admin/matches) renderizan idéntico (mismo cuerpo compartido, contexto = grupo por defecto).
- `/g/lomeros` → 308 a `/` (Paso A).

---

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Romper páginas vivas de Lomeros al extraer cuerpos | Refactor de comportamiento idéntico (mismo render, grupo por defecto) + suite e2e existente verde en cada paso |
| Enlaces del chrome rotos bajo `/g/[slug]` | `basePath` en navbar/bottom-nav; en grupo se omiten secciones no-MVP |
| Acceso a `/g/[slug]/admin` por no-admin del grupo | Gating server-side por `ctx.role` del grupo de la URL + matcher de proxy para sesión |
| Fuga entre grupos en páginas | `resolvePageContext(slug)` resuelve y scopea por el grupo de la URL; los helpers de datos ya toman groupId |
| Confundir este MVP con la limpieza de `getSession` | `getSession` intacto; limpieza completa = Paso C aplazado (§5) |

---

## 9. Próximo paso

Invocar **writing-plans** para el plan de implementación del MVP, empezando por el **Paso 1 (fundamentos + home)**.
