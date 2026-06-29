# Fase 2 · Tarea 1 — Routing por slug `/g/[slug]` (diseño de implementación)

**Fecha:** 2026-06-29
**Estado:** Diseño validado en brainstorming. Pendiente de plan de implementación (writing-plans).
**Contexto / base:**
- Estrategia: `2026-06-14-comercializacion-estrategia.md` (multi-tenant Opción A, monetización por marca).
- Fase 1 (completa y en prod): `2026-06-18-multitenant-fase1-design.md` (modelo de datos `groups`/`memberships`,
  DAL scopeado, súper-admin por env, transversales por grupo).
- Arranque Fase 2: `2026-06-23-multitenant-fase2-arranque.md` (Tarea 0 = previews con BBDD aislada, ya en prod;
  el resto de Fase 2 esperaba este brainstorming).

**Descomposición de Fase 2** (decidida en este brainstorming): tres sub-tareas independientes con su propio
ciclo spec→plan→implementación.

1. **Tarea 1 (este doc)** — Routing por slug `/g/[slug]`: el cimiento. Mete el grupo en la URL y resuelve la
   deuda técnica de auth. Sin features de usuario nuevas más allá de las URLs.
2. **Tarea 2** — Onboarding self-service (crear grupo → admin → invitar → reclamar ficha).
3. **Tarea 3** — Conmutador de grupo del súper-admin (UI para saltar entre grupos en solo-lectura).

---

## 0. Principio rector: NO romper Lomeros (énfasis explícito del usuario)

Lomeros Padel Tour está **en producción y en uso**, con enlaces ya compartidos (OG de partidos en redes,
marcadores). Esta restricción manda sobre todo lo demás. Garantías de diseño, **concretas y verificables**:

- **Lomeros se sirve en RAÍZ, sin cambios.** El grupo por defecto conserva exactamente sus URLs actuales
  (`/`, `/me`, `/admin`, `/matches/[id]`, `/pozo/...`, `/torneo/...`). Ningún enlace existente cambia ni se
  rompe. El routing por slug `/g/[slug]` solo aplica a grupos **no-por-defecto**.
- **Invisibilidad total para Lomeros:** un usuario de Lomeros no percibe ningún cambio (ni URLs, ni UI, ni
  comportamiento). Esta tarea no introduce nada visible para el grupo por defecto.
- **Expand→contract, igual que Fase 1.** Primero se añade (árbol `/g/[slug]` + helpers, aditivo), luego se
  migran las rutas `/api` con **red de seguridad** (sin grupo explícito → grupo por defecto = Lomeros), y solo
  al final se contrae (refactor de `getSession`/`requireAdmin`). El path de lectura/escritura de Lomeros no se
  toca hasta que la nueva resolución está probada.
- **Fallback al grupo por defecto** en toda ruta `/api` aún no migrada: una petición sin grupo explícito
  resuelve a Lomeros → comportamiento idéntico durante toda la migración.
- **`getSession()` se refactoriza EL ÚLTIMO** (Paso C), no el primero: es el punto que afecta a toda ruta
  autenticada de Lomeros, así que se cambia cuando el resto ya es group-aware y está verde.
- **Toda la suite e2e existente debe quedar verde en cada paso**, además de los tests nuevos. La suite ya
  cubre el flujo real de Lomeros; es la red de regresión.
- **Checks de no-rotura específicos** (ver §7): URLs de raíz de Lomeros responden idéntico; `/g/lomeros` →
  308 a raíz; rol/ficha de un miembro de Lomeros sin cambios; OG de un partido de Lomeros idéntica.

---

## 1. Objetivo y alcance

**Dentro:**
- Meter el grupo en la URL: activar el routing por slug para grupos **no-por-defecto**, manteniendo Lomeros en
  raíz sin cambios.
- Cablear `getGroupContext({ targetGroupId })` —que ya existe en `src/lib/auth/group-context.ts` pero **no está
  usado en ninguna ruta** ("Aún no cableado en rutas (1B-1+)")— en páginas y en `/api`.
- **Resolver la deuda técnica de auth:** hoy `getSession()` resuelve rol/ficha **siempre contra el grupo por
  defecto** (`session.ts:50`, `getDefaultGroupId()` = Lomeros) y `requireAdmin()` mira `session.role`. Con un 2º
  grupo en la URL eso da el rol equivocado. Pasa a resolverse contra el grupo **de la URL**.

**Fuera (otras tareas / fases):**
- Crear grupos / invitar por link-código / reclamar ficha → **Tarea 2** (onboarding).
- Conmutador multi-grupo del súper-admin (UI) → **Tarea 3**.
- Subdominios / dominios propios → posterior (los subdominios añaden dolor de redirect-URIs de Google; el
  arranque fijó path-based `/g/[slug]`).
- Branding configurable (nombre/logo/colores) + paywall → **Fase 3**.

**Resultado esperado:** un grupo no-por-defecto (p. ej. el "Grupo Demo" sembrado en staging) es usable de punta
a punta bajo `/g/[slug]`, con rol resuelto contra el grupo de la URL; el súper-admin ve cualquier `/g/[slug]` en
solo-lectura; y **para Lomeros no cambia nada**.

---

## 2. Modelo de URLs

- **Grupo por defecto (Lomeros):** raíz, como hoy. `/`, `/me`, `/admin`, `/matches/[id]`, `/pozo/...`,
  `/torneo/...`. **Canónico.**
- **Grupos no-por-defecto:** el mismo árbol bajo prefijo `/g/[slug]/...` (`/g/[slug]`, `/g/[slug]/me`,
  `/g/[slug]/admin`, `/g/[slug]/matches/[id]`, etc.).
- **`/g/lomeros/*` → redirect 308** a la raíz equivalente. Un único canónico por grupo por defecto: evita
  contenido duplicado/SEO y enlaces divergentes.
- **Slug:** minúsculas `[a-z0-9-]`, único (ya hay `groups.slug` UNIQUE en el esquema). Se reservan los
  segmentos que colisionan con rutas reales de primer nivel: `g`, `api`, `_next`, `me`, `admin`, `login`,
  `logout`, `matches`, `pozo`, `torneo`, `dev-login`, … La **validación al elegir** slug es de Tarea 2; aquí solo
  se **reserva/valida en el resolutor** (un slug reservado o inexistente → 404).

---

## 3. Resolución de grupo (servidor)

- **Páginas `/g/[slug]`:** el layout del segmento lee `params.slug` → busca `groups.slug` → `targetGroupId`; si
  no existe (o es reservado) → **404**. Llama `getGroupContext({ targetGroupId })`.
- **Páginas en raíz:** `targetGroupId = getDefaultGroupId()` (Lomeros). `getGroupContext({ targetGroupId })`.
- **Rutas `/api`:** reciben el grupo **explícito** en la petición (query `?g=<slug|id>` o body, según sea GET o
  mutación). Resuelven el mismo `getGroupContext({ targetGroupId })` y autorizan. **Fallback:** sin grupo
  explícito → grupo por defecto (red de seguridad para callers de raíz aún no migrados → Lomeros, idéntico).
  - Decisión de formato: **GET → query `?g=`**; **mutaciones (POST/PATCH/DELETE) → campo en el body**
    (`groupId`/`slug`). Coherente y testeable; nada de cookies/headers implícitos.
- **Autorización (misma semántica, ahora por grupo de la URL — ya la implementa `resolveGroupContext`):**
  1. ¿Miembro del grupo objetivo? → su **rol real** (admin/player) y `playerId` de esa membership.
  2. Si no, ¿email en `SUPER_ADMIN_EMAILS`? → contexto **`super_admin` solo-lectura** (`playerId=null`,
     `membershipId=null`); las escrituras admin lo rechazan.
  3. Nada → **403**.

  El único cambio respecto a Fase 1 es **pasarle el `targetGroupId` de la URL**; la lógica de decisión ya existe.

---

## 4. Refactor de auth (la deuda técnica)

- **`getSession()`** deja de hornear rol/ficha del grupo por defecto. Devuelve identidad (`userId`, `email`) +
  las memberships del usuario (o delega la resolución de rol/ficha a `getGroupContext`). El rol/ficha **siempre**
  salen de `getGroupContext({ targetGroupId })` con el grupo de la URL.
  - *Impacto en consumidores actuales de `session.role`/`session.player`:* se inventarían y migran a obtener el
    contexto por grupo. Mientras tanto, en raíz el `targetGroupId` por defecto = Lomeros → mismo resultado.
- **`requireAdmin()` → `requireGroupAdmin(targetGroup)`** (en `src/lib/auth/guard.ts`): 401 sin sesión; **403 si
  `ctx.role !== 'admin'`** para *ese* grupo; súper-admin = solo lectura (rechaza escrituras admin). Coherente con
  "no admin real en otros grupos".
- **`admin/layout.tsx`** (raíz) y nuevo **`/g/[slug]/admin/layout.tsx`:** gate server-side con el rol del grupo
  de la URL (hoy el edge solo comprueba sesión; el rol se exige en el layout — ver `authorize.ts`).
- **`proxy.ts` (middleware):** el `matcher` añade `/g/:slug/*` (hoy `['/admin/:path*','/me/:path*']`); el edge
  sigue comprobando **solo presencia de sesión** (el rol se exige server-side, como hoy).
- **Aterrizaje (`/` y post-login):** resolver "grupo-hogar":
  - Miembro del grupo por defecto → `/me`.
  - Miembro de **exactamente un** grupo no-por-defecto → `/g/[slug]/me`.
  - Miembro de **varios** → grupo por defecto / más reciente (el **chooser multi-grupo se difiere a la Tarea 3**).
  - Sin sesión → home público del grupo por defecto.

---

## 5. Páginas públicas + transversales

- Las vistas públicas (`matches/[id]`, pozo, torneo) tienen su variante `/g/[slug]/...`. **OG/branding ya leen el
  nombre desde el grupo (1D)**, así que la OG de un partido de un grupo no-por-defecto mostrará su nombre en
  cuanto su `groupId` se resuelva desde el slug — sin trabajo extra.
- **Cron, push y blob ya están scopeados por grupo (1D):** no cambian en esta tarea.

---

## 6. Rollout incremental (cada paso desplegable, Lomeros idéntico)

| Paso | Qué | Garantía de no-rotura |
|---|---|---|
| **A — Aditivo** | Helpers de resolución (`slug→groupId`, lista de slugs reservados) + segmento `/g/[slug]` con su layout que resuelve contexto y renderiza leyendo datos con el `groupId` resuelto. Raíz intacta; `/api` aún sin tocar. | Puro añadido: no toca ninguna ruta de raíz ni `getSession`. Lomeros, idéntico. |
| **B — Migrar `/api` por dominio** | Cada ruta `/api` acepta grupo explícito + `getGroupContext`, con **fallback al por defecto**. Orden: players → matches → betting/timba → tournaments → rewards/redemptions → rating/achievements (igual que 1B). | Sin grupo explícito → Lomeros. Un dominio migrado no afecta a los demás. e2e verde en cada dominio. |
| **C — Contract** | Refactor de `getSession`/`requireAdmin` a resolución por grupo de la URL + aterrizaje "grupo-hogar"; quitar el horneado de rol del grupo por defecto en `getSession`. | Se hace cuando el resto ya es group-aware; en raíz el grupo objetivo por defecto = Lomeros → mismo rol/ficha. |

Cada paso: **suite e2e existente verde** + tests nuevos del paso. El plan de implementación arranca por el Paso A.

---

## 7. Testing (e2e Playwright + unit, según `AGENTS.md`)

**Nuevos (cubren la feature):**
- **No-fuga por slug:** sembrar 2 grupos; como miembro de A navegando `/g/[slugB]/...` no se ven datos de B
  salvo lo público; escrituras admin sobre un grupo donde no eres admin → **403**.
- **Rol por grupo de la URL:** usuario admin en A y player en B → admin en `/g/[slugA]/admin`, **403** en
  `/g/[slugB]/admin`. *(Es el test que prueba que la deuda quedó resuelta.)*
- **Súper-admin:** ve `/g/[slug]` de cualquier grupo en solo-lectura, **no aparece** en roster/lista de
  miembros, escrituras admin → 403.
- **Aterrizaje:** miembro de grupo no-por-defecto cae en `/g/[slug]/me` tras login.
- **Unit:** `resolveGroupContext` con `targetGroupId` de URL; helper `slug→groupId` con slug inexistente (404) y
  reservado.

**De no-rotura de Lomeros (red de regresión, §0):**
- Toda la suite e2e existente verde sin tocar URLs de raíz.
- `/g/lomeros/*` → 308 a la raíz equivalente.
- Un miembro de Lomeros conserva rol/ficha y ve lo mismo que hoy en `/`, `/me`, `/admin`.
- La OG de un partido de Lomeros es idéntica.

---

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| **Romper Lomeros** al tocar `getSession` | Expand→contract; fallback a por defecto; `getSession` se refactoriza **al final** (Paso C); suite e2e existente verde en cada paso (§0) |
| Fuga entre grupos por slug | `getGroupContext` explícito por request + e2e no-fuga por slug + guard grep en CI (ya existe) |
| Colisión slug ↔ ruta real | Lista de segmentos reservados validada en el resolutor (§2) |
| Enlaces de Lomeros divergentes (`/g/lomeros` vs raíz) | 308 a raíz como único canónico |
| Caller `/api` olvida pasar el grupo durante la migración | Fallback al por defecto = Lomeros (comportamiento idéntico, no error) hasta que ese dominio esté migrado |

---

## 9. Próximo paso

Invocar **writing-plans** para el plan de implementación de la Tarea 1, empezando por el **Paso A (aditivo)**.
