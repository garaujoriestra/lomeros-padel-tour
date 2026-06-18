# Fase 1 — Multi-tenant core (diseño de implementación)

**Fecha:** 2026-06-18
**Estado:** Diseño validado en brainstorming. Pendiente de plan de implementación.
**Contexto / base estratégica:** `2026-06-14-comercializacion-estrategia.md` (decisiones de
negocio y arquitectura ya cerradas: cliente = grupos de amigos, monetización por marca,
**arquitectura multi-tenant Opción A** = una sola DB + columna `groupId`, roles por grupo).

Este documento es el primer spec de implementación que cuelga de esa estrategia. Cubre el
**estado objetivo** de la Fase 1 (modelo de datos + arquitectura de acceso + auth) y el
**rollout en 4 pasos** desplegables. No incluye routing por slug, onboarding self-service ni
marca/paywall: eso es Fase 2+ (ver §11).

---

## 0. Principio rector: NO romper Lomeros

Lomeros Padel Tour está **en producción y en uso**. Es la restricción que manda sobre todo lo
demás. Garantías de diseño:

- **Cada uno de los 4 pasos es desplegable por separado y de comportamiento idéntico** para
  Lomeros. Nada de big-bang.
- **Patrón expand→contract:** primero se añade (columnas/tablas nullable + backfill), luego se
  migra el código, y solo al final —cuando la nueva fuente de verdad está probada en
  producción— se contrae (borrar lo viejo). `users.role`/`users.playerId` **no se tocan** hasta
  el paso 1C.
- **Backfill antes de exigir:** ninguna columna `groupId` se vuelve obligatoria hasta que todas
  las filas existentes apuntan a Lomeros.
- **Migraciones idempotentes** (cada paso comprueba si ya está hecho), siguiendo el patrón
  `/api/migrate-*` que ya usa el proyecto.
- **Red de seguridad en código:** durante la migración ruta a ruta, el grupo por defecto resuelve
  a Lomeros, de modo que una query aún-no-migrada sigue funcionando (todos los datos son de
  Lomeros).
- **Toda la suite e2e existente debe quedar verde en cada paso**, además de los tests nuevos.
- **Verificación post-migración en prod:** check de integridad (toda fila tenant tiene
  `groupId`=Lomeros; los conteos cuadran antes/después).

---

## 1. Alcance de la Fase 1 ("fontanería invisible")

**Dentro:**
- Tablas `groups` y `memberships`; columna `groupId` en las tablas raíz tenant.
- Migrar Lomeros como **grupo #1**, sin cambio visible.
- Resolución del grupo activo **en servidor** (sin URLs nuevas).
- Capa de acceso estructural que **siempre** inyecta `groupId`.
- Roles y enlace user↔ficha pasan a `memberships`.
- Gancho de enforcement del **súper-admin** (concepto + bypass de lectura).
- Plumbing de los transversales (cron, push, blob, OG) para que lean del grupo.

**Fuera (Fase 2+):** routing por slug / subdominio, onboarding self-service, marca propia +
paywall (Stripe), UX de cambio de grupo / vista cross-grupo del súper-admin, i18n, empty states
para terceros. Ver §11.

**Resultado esperado de la Fase 1:** el modelo es multi-tenant y todas las queries van scopeadas
y testadas contra fuga, pero para un usuario de Lomeros **no cambia absolutamente nada visible**.

---

## 2. Modelo de datos objetivo

Estado actual: **17 tablas, ninguna con `groupId`** (Drizzle ORM + Turso/libSQL). Schema en
`src/lib/db/schema.ts`.

### Identidad global vs. dato de grupo

- **`users`** → identidad global pura (email). **Pierde** `role` y `playerId` (migran a
  `memberships`, se borran en 1C).
- **`groups`** (nueva, raíz): `id`, `slug` (único), `name`, `createdAt`. Branding/colores/logo se
  añaden en Fase 3; aquí solo lo mínimo.
- **`memberships`** (nueva): `id`, `userId`→users, `groupId`→groups, `role` ('admin'|'player'),
  `playerId`→players (nullable). **Único `(userId, groupId)`.** Resuelve a la vez el **rol** y el
  **enlace user↔ficha por grupo** (un user puede ser admin con ficha en su tour y nada en otro).

### Tablas tenant

- **Raíz tenant** → reciben `groupId` NOT NULL: `players`, `matches`, `rewards`, `tournaments`.
- **Hijas** → **heredan el grupo vía su FK padre**, sin columna propia (evita desincronización):
  `matchSets`, `pairStats`, `ratingHistory`, `playerAchievements`, `bets`, `tokenLedger`,
  `redemptions`, `penalties`, y la jerarquía de torneo (`tournamentCourts`,
  `tournamentParticipants`, `tournamentGroups`, `tournamentPairs`, `tournamentMatches`).
- **`pushSubscriptions`** cuelga de `users` (identidad), **no** de grupo. A quién notificar se
  decide al consultar (vía membership del grupo), no en la fila.

### Súper-admin: NO está en el modelo de datos

El súper-admin es un **allowlist de emails por env** (`SUPER_ADMIN_EMAILS`), **no** una columna,
**no** una membership, **no** un rol del esquema. Por eso es invisible (ver §6).

### Diagrama de relaciones (resumen)

```
users (global) ──< memberships >── groups
                         │  (role, playerId)
                         ▼
                      players (groupId) ──< matches (groupId) ──< matchSets
                         │                      │
                         ├─< bets ──────────────┘  (grupo vía match/player)
                         ├─< tokenLedger
                         ├─< redemptions >── rewards (groupId)
                         ├─< penalties
                         ├─< playerAchievements
                         ├─< pairStats
                         └─< ratingHistory
                      tournaments (groupId) ──< courts/participants/groups/pairs/matches
```

---

## 3. Resolución del contexto de grupo

Una pieza nueva, `getGroupContext()`, junto a `lib/auth/session.ts`/`guard.ts`. Produce un
**`GroupContext`** resuelto **una vez por request**:

```ts
type GroupContext = {
  groupId: string
  role: 'admin' | 'player' | 'super_admin'
  membershipId: string | null   // null si super_admin sin membership
  playerId: string | null       // ficha en ESTE grupo (null para super_admin)
  isSuperAdmin: boolean
}
```

Regla de resolución (dado un grupo objetivo; en Fase 1 el objetivo es implícito = grupo por
defecto):

1. ¿El user tiene **membership** en ese grupo? → usa esa membership (rol y `playerId` reales).
2. Si **no**, ¿el email está en `SUPER_ADMIN_EMAILS`? → contexto **`super_admin` solo-lectura**,
   `playerId=null`, `membershipId=null`.
3. Si nada → **403**.

**Contexto para páginas públicas / no-auth:** grupo por defecto vía env `DEFAULT_GROUP_SLUG`
(=`lomeros`). El resolutor se diseña para aceptar un **grupo explícito** más adelante (cuando la
Fase 2 meta el slug en la URL) sin reescribirlo.

---

## 4. Capa de acceso scopeada (DAL)

Hoy las queries están **dispersas** en ~50 rutas `/api` + módulos `lib/*`, cada una haciendo
`db.select()` directo. No hay capa de acceso. El blindaje de la Opción A vive aquí.

**No** un wrapper mágico (Drizzle no se envuelve limpio). En su lugar, **helpers de consulta por
dominio**, consolidando/extendiendo la estructura modular que ya existe (`lib/players`,
`lib/betting`, `lib/rating`, `lib/tournament`, …):

- **Regla dura:** toda lectura/escritura a una tabla tenant recibe el `GroupContext` (o un
  `groupId`) e inyecta el filtro. Las rutas **dejan de** llamar `db.select().from(tablaTenant)`
  directo.
- **Raíz tenant:** el helper añade `eq(tabla.groupId, ctx.groupId)`.
- **Hijas:** se scopean **vía el FK padre** (join/where contra el padre del grupo), no por
  columna propia.
- **Inserts:** el helper **fija `groupId` desde ctx**; no se confía en el caller.
- **Backstop de CI:** un guard por `grep`/lint que marque accesos directos a `db` sobre tablas
  tenant fuera del DAL. Secundario; los helpers son la defensa primaria.

**Migración ruta a ruta (paso 1B), por dominio:** players → matches → betting/timba →
tournaments → rewards/redemptions/penalties → rating/achievements/pairs. Con la red de seguridad
del §0 (groupId por defecto = Lomeros) nada se rompe a mitad de migración.

---

## 5. Refactor de auth / guard

- **`getSession()`** pasa a cargar también las **memberships** del user (Fase 1: una).
- **`getGroupContext()`** aplica la regla de los 3 pasos (§3).
- **`requireAdmin()` → `requireGroupAdmin()`:** 401 sin sesión, **403 si `ctx.role !== 'admin'`**.
  El `super_admin` es **solo-lectura**: las rutas de escritura admin lo rechazan (coherente con
  "no admin en otros grupos"). En Lomeros el dueño es admin **real** vía membership, así que ahí
  sí entra a todo.
- **`requireSession()`** sigue para "cualquier logueado", pero ahora también resuelve contexto de
  grupo.
- **Middleware `src/proxy.ts`:** apenas cambia en Fase 1 (grupo implícito): sigue gateando
  `/admin/*` y `/me/*` por sesión + rol del contexto.
- **Vincular Gmail a ficha** (`upsertPlayerUser` en `lib/auth/users.ts`): pasa a escribir/borrar
  una `membership(user, grupo, role, playerId)` en lugar de `users.role`/`users.playerId`
  (trabajo del paso 1C).

---

## 6. Súper-admin (capacidad global de visualización, invisible)

Dos planos, ortogonales:

- **En Lomeros (tu grupo):** miembro **normal y visible** —
  `membership(user, lomeros, role='admin', playerId=tu ficha)`. Sales en el roster, juegas,
  administras. Nada especial.
- **En el resto de grupos (cuando existan):** **súper-admin** — ve todo en **modo lectura**, pero
  **sin membership ni ficha**. Como no tiene filas en `memberships`/`players` de ese grupo (de
  donde salen las listas de miembros y el roster), es **automáticamente invisible**: ni admin, ni
  jugador.

**Implementación:** allowlist de emails por env `SUPER_ADMIN_EMAILS` (ahí va el Gmail del dueño,
`garaujoriestra@gmail.com`). El resolutor del §3 concede el contexto `super_admin` solo cuando el
user **no** tiene membership en el grupo objetivo. Por defecto cross-grupo es **solo lectura**
(las rutas de escritura admin lo rechazan).

**Reparto Fase 1 vs. después:** en Fase 1 aterriza el **concepto + gancho de enforcement** (el
resolutor y el `GroupContext` ya entienden `super_admin` y el bypass de lectura). La **UX de
verlo de verdad** (selector para saltar entre grupos) es **Fase 2**, porque hoy no hay 2º grupo
ni routing para elegirlo. Así no es un retrofit.

---

## 7. Transversales (paso 1D — plumbing, sin cambio visible)

Dejar enchufado lo que la Fase 3 (marca) necesitará, leyendo del grupo aunque los valores de
Lomeros no cambien:

- **Cron de recordatorios** (`src/app/api/cron/match-reminders/route.ts`): **itera por grupo**
  (hoy consulta todos los matches sin filtrar).
- **Push** (`src/lib/push/send.ts`, `/api/push/broadcast`): scopear destinatarios por grupo (vía
  membership).
- **Blob de avatares** (`src/app/api/upload/route.ts`): rutas namespaceadas
  `avatars/{groupId}/{uuid}.{ext}`.
- **OG image** (`src/app/(public)/matches/[id]/opengraph-image.tsx`) y branding (manifest, layout,
  navbar, crest): **resuelven nombre/colores desde el grupo**. En Fase 1 siguen mostrando los
  valores de Lomeros (leídos del registro del grupo), no literales hardcodeados. La sustitución a
  fondo de los ~13 literales "Lomeros" y el branding configurable son Fase 3-4; aquí solo se
  cablea la fuente.

---

## 8. Migración (paso 1A)

Siguiendo el patrón propio de rutas `/api/migrate-*` (drizzle-kit está configurado pero sin usar).
Nueva ruta idempotente **`/api/migrate-multitenant`** (protegida por secreto/admin) que:

1. Crea `groups` + inserta **Lomeros** (id estable; `slug='lomeros'`). `DEFAULT_GROUP_SLUG=lomeros`
   en env lo resuelve.
2. Crea `memberships`; **backfill desde `users`:** cada user → `membership(userId, lomerosId,
   role=users.role, playerId=users.playerId)`.
3. Añade `group_id` a las raíz tenant (`players`, `matches`, `rewards`, `tournaments`) con
   `ALTER TABLE ADD COLUMN group_id TEXT NOT NULL DEFAULT 'lomeros'`. SQLite permite NOT NULL con
   DEFAULT no nulo → **sin recrear tablas**; el DEFAULT backfilla las filas existentes en el acto y
   queda como red de seguridad para inserts en SQL crudo durante 1B.
4. **No borra** `users.role`/`users.playerId` (eso es el contract del paso 1C).

Cada paso comprueba si ya existe (idempotente). La lógica vive en `src/lib/db/migrations/multitenant.ts`
(consumida por la ruta `/api/migrate-multitenant`, por el setup de e2e y por un test de integración).

**Deploy ventana-cero (no romper Lomeros):** Drizzle inyecta defaults en cada INSERT y enumera
columnas en cada SELECT, así que declarar `groupId` en el schema Drizzle de las tablas raíz haría
que, entre el deploy y el `curl` de migración, las lecturas del núcleo hicieran `SELECT group_id`
sobre una columna inexistente → 500. Por eso en 1A el schema Drizzle **solo** declara las tablas
nuevas `groups`/`memberships`; la columna física `group_id` la crea la migración, y su declaración
en el schema Drizzle (con su FK/uso en queries) se difiere al paso **1B**, cuando la columna ya
existe en prod. Resultado: el deploy de 1A no toca el path de lectura/escritura existente.

**Verificación post-migración (prod):** la función de migración devuelve un reporte
(`groupsTotal`, `usersTotal`, `membershipsTotal`, y por tabla `total`/`withGroup`) que sirve de
check de integridad: `membershipsTotal === usersTotal`, `groupsTotal === 1`, y `withGroup === total`
en cada tabla.

---

## 9. Rollout en 4 pasos (cada uno shippable y verde)

| Paso | Qué | Garantía de no-rotura |
|---|---|---|
| **1A — Esquema + backfill** | `groups` (Lomeros sembrado) + `memberships` (backfill desde users); `groupId` nullable→backfill→NOT NULL en raíz tenant. No borra nada. | Todo cae en un grupo; comportamiento idéntico. Migración de datos pura y aislada. |
| **1B — Contexto + DAL scopeado** | `getGroupContext()`; helpers por dominio que inyectan groupId; migrar rutas/módulos dominio a dominio. Test e2e de no-fuga. | Un solo grupo real + red de seguridad (default=Lomeros) → comportamiento idéntico, ya con blindaje y test. |
| **1C — Roles/enlace → memberships (contract)** | `requireGroupAdmin()` y vínculo Gmail leen de `memberships`; **borrar** `users.role`/`users.playerId`. | El blindaje de 1B ya vive; solo cambia la fuente de verdad del rol/enlace. |
| **1D — Namespacing transversal** | Cron por grupo; push scopeado; blob `avatars/{groupId}/…`; OG/branding desde el grupo. | Solo cablea la fuente; valores de Lomeros sin cambiar. |

El plan de implementación arranca por **1A**.

---

## 10. Testing

Manda `AGENTS.md`: **toda feature lleva e2e Playwright + unit**. La suite e2e corre contra SQLite
de fichero aislado (las migraciones deben aplicarse también ahí).

- **Pieza central (1B) — e2e de no-fuga entre grupos:** sembrar vía API 2 grupos (Lomeros + "Grupo
  Test") con sus propios players/matches/bets; aseverar que como miembro de A **nunca** se ven
  datos de B por ninguna lista/perfil/ranking/Timba, y que el **súper-admin ve ambos pero no
  aparece en el roster ni en la lista de miembros de ninguno**.
- **Unit del DAL:** dado un `ctx`, las queries siempre incluyen el filtro de grupo; los inserts
  fijan `groupId` desde el contexto.
- **Regresión:** toda la suite e2e existente verde en cada paso (garantía del §0).
- **Verificación de migración:** test del check de integridad post-1A.

---

## 11. Fuera de alcance (fases siguientes)

- **Fase 2 — Onboarding self-service:** crear grupo → ser admin → invitar por link/código → cada
  jugador reclama ficha. Routing por slug (`/g/[slug]`) y **UX de cambio de grupo / vista
  cross-grupo del súper-admin**.
- **Fase 3 — Marca + paywall:** branding configurable (nombre/logo/colores), Stripe "Pase de
  Temporada", badge ⭐ Tour Oficial, quitar el "hecho con X".
- **Fase 4 — Pulido para terceros:** landing, empty states, sustituir literales "Lomeros", legal,
  quizá i18n.
- **Fase 5 — Crecimiento:** discovery/rankings globales, recap de temporada compartible.

---

## 12. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Fuga de datos entre grupos por un filtro olvidado | DAL estructural (§4) + test e2e de no-fuga (§10) + backstop grep en CI |
| Romper Lomeros en la migración | Expand→contract, backfill antes de exigir, idempotencia, verificación post-migración (§0, §8) |
| SQLite/Turso no hace ALTER a NOT NULL | Recreación de tabla (patrón ya usado en `scripts/migrate.mjs`) |
| Desincronización de grupo en tablas hijas | Las hijas **no** llevan `groupId`; heredan del padre (§2) |
| Súper-admin visible o con poder de más | No es membership ni rol de DB (invisible); cross-grupo solo-lectura (§6) |
| Migración a mitad deja queries sin scopear | Red de seguridad: groupId por defecto = Lomeros durante 1B (§0, §4) |

---

## 13. Próximo paso

Invocar la skill **writing-plans** para generar el plan de implementación detallado, empezando por
el **paso 1A (esquema + backfill)**.
