# Fase 1 · Paso 1B — Contexto de grupo + capa de acceso scopeada (diseño)

**Fecha:** 2026-06-18
**Estado:** Diseño validado en brainstorming. Pendiente de plan de implementación.
**Contexto:** Cuelga de `2026-06-18-multitenant-fase1-design.md` (diseño global de la Fase 1,
§3 contexto y §4 capa de acceso) y continúa el paso **1A** (ya en producción: tablas `groups`
y `memberships`, y columna física `group_id` en las tablas raíz tenant —
`2026-06-18-multitenant-fase1-1a-esquema.md`).

1B es el corazón del multi-tenant y **el paso más grande y delicado**: enruta los ~145 puntos
de acceso a datos por `group_id` para que ninguna query pueda filtrar datos entre grupos. No
añade migración de DB (la columna física ya existe); es trabajo de **código**, troceado por
dominios para que cada entrega sea segura.

---

## 0. Principio rector: NO romper Lomeros (sigue mandando)

- **1B no tiene migración de esquema:** la columna `group_id` ya existe en prod (1A). Declarar
  `groupId` en el schema Drizzle ahora es **deploy ventana-cero** (la columna existe → reads y
  writes no fallan).
- **Comportamiento idéntico:** hoy todos los datos son de Lomeros, así que filtrar por el grupo
  de Lomeros devuelve exactamente lo mismo. Ningún usuario nota nada.
- **Red de seguridad durante la migración:** el `getGroupContext` por defecto resuelve a Lomeros
  y el DEFAULT físico de la columna cubre inserts en SQL crudo, así que una query aún-no-migrada
  sigue funcionando mientras se migra dominio a dominio.
- **Despliegue dominio a dominio:** cada sub-paso es desplegable por separado, reversible y de
  bajo riesgo. Toda la suite (unit + e2e existente + el nuevo test de no-fuga) verde en cada uno.

---

## 1. Arquitectura de la capa de acceso

### `GroupContext` + resolutor
Pieza nueva junto a `src/lib/auth/session.ts`/`guard.ts`. Resuelto **una vez por request**:

```ts
interface GroupContext {
  groupId: string
  role: 'admin' | 'player' | 'super_admin'
  membershipId: string | null   // null si super_admin sin membership
  playerId: string | null       // ficha en ESTE grupo (null para super_admin)
  isSuperAdmin: boolean
}
```

`getGroupContext({ explicitGroupId? })` aplica la regla de los 3 pasos del spec global (§3):
1. ¿El user tiene **membership** en el grupo objetivo? → usa esa membership (rol, ficha reales).
2. Si no, ¿email en `SUPER_ADMIN_EMAILS`? → contexto **`super_admin` solo-lectura**.
3. Si nada → 403.

`getDefaultGroupId()` resuelve el grupo por defecto para páginas **públicas/no-auth** (vía env
`DEFAULT_GROUP_SLUG`, hoy `lomeros`; cacheado por request). En Fase 1 `explicitGroupId` es
implícito; el resolutor se diseña para aceptarlo explícito en Fase 2 (slug en URL) sin reescribir.

### Módulos de consulta por dominio (el DAL)
Hoy las ~145 queries están dispersas en rutas, páginas (server components) y módulos `lib`. 1B
las enruta por **módulos de consulta por dominio** (`src/lib/<dominio>/queries.ts`) que **siempre
reciben `groupId` e inyectan el filtro**. Las rutas/páginas dejan de tocar `db` directo para
tablas tenant.
- **Tablas raíz** (`players`, `matches`, `rewards`, `tournaments`): `eq(tabla.groupId, groupId)`.
- **Tablas hijas** (`bets`, `match_sets`, `token_ledger`, `redemptions`, `penalties`,
  `player_achievements`, `pair_stats`, `rating_history`, sub-tablas de torneo): se scopean **vía
  su FK padre** (join/where contra el padre del grupo); no llevan `group_id` propio.
- **Inserts**: el helper **fija `groupId` del contexto** (no se confía en el caller).
- Los módulos pesados del motor (`lib/rating/process-match.ts`, `lib/betting/settle.ts`,
  `lib/tournament/event-store.ts` y los `*-run.ts`) **reciben `groupId` como parámetro**
  enhebrado desde su llamador.

### `groupId` entra ahora en el schema Drizzle
Se añade `groupId` a `players`, `matches`, `rewards`, `tournaments`. **En dos tiempos para no
romper el build ni el comportamiento:**
- **1B-0 (cimientos):** se declara `groupId: text('group_id').notNull().default(LOMEROS_GROUP_ID).references(() => groups.id)`.
  El `.default()` mantiene el campo **opcional** en los inserts → todos los call-sites existentes
  siguen compilando y escribiendo Lomeros sin tocarlos (comportamiento idéntico). Como Drizzle
  inyecta el default en cada INSERT, hay que **re-añadir `group_id`** a los DDL en memoria del
  harness de torneo (`schema-ddl.ts`, `test-db.ts`) — los que 1A revirtió; ahora es su sitio.
- **1B-5 (capstone):** una vez el DAL fija siempre `groupId` explícito en cada insert, se
  **elimina el `.default()`** del schema. A partir de ahí un insert que olvide `groupId` falla en
  compilación (TS) en vez de caer silenciosamente en Lomeros. (El DEFAULT físico de la columna
  queda solo como backstop de SQL crudo.)

---

## 2. Descomposición en sub-pasos (cada uno desplegable y de comportamiento idéntico)

Cada sub-paso es su propio ciclo plan → implementación → review → merge. Orden por riesgo
creciente, cimientos primero.

| Sub-paso | Qué | Tablas/áreas | Riesgo |
|---|---|---|---|
| **1B-0 Cimientos** | `groupId` al schema Drizzle de las 4 raíz (con `.default` temporal → build verde, sin tocar inserts; re-añadir `group_id` al harness de torneo); `getGroupContext()` + `getDefaultGroupId()` con tests unit; **arnés del test e2e de no-fuga** (helper para sembrar un 2º grupo "Test" vía API/DB). Sin scopear queries de negocio aún. | schema, auth/guard, e2e harness | Bajo |
| **1B-1 Jugadores (tabla `players`)** | `lib/players/queries.ts` scopeado; migrar `api/players*` y `admin/players*` (listar/CRUD). **Montar el arnés del test e2e de no-fuga** (2º grupo) + primeras aserciones de aislamiento. *(Afinado: rankings y perfil agregan tablas hijas sin `group_id` → viajan con ellas en 1B-2.)* | players | Bajo |
| **1B-2 Partidos + rating + logros + rankings/perfil** | `lib/matches/queries.ts`; threading de `groupId` en `process-match.ts` (elo, pairStats, ratingHistory, achievements); `api/matches*`, páginas de partidos; **y las vistas que agregan hijas**: rankings (elo/parejas/tokens), `profile-data.ts`, perfiles. | matches, matchSets, ratingHistory, pairStats, playerAchievements | Medio |
| **1B-3 Timba + premios** | `bets`/`settle` (preservando atomicidad e idempotencia del ledger), penalties, `rewards`/`redemptions`. | bets, tokenLedger, penalties, rewards, redemptions | Medio |
| **1B-4 Torneos** | `event-store.ts` + `pozo-run`/`torneo-run`/`pair-store`; `api/tournaments*`, páginas públicas de pozo/torneo. Lo más enrevesado (~50 ops). | tournaments + 5 sub-tablas | Alto |
| **1B-5 Lecturas públicas + capstone** | Cablear `getDefaultGroupId()` en home/OG/manifest y demás páginas públicas; scopear la **lectura** de `matches` del cron de recordatorios. **Quitar el `.default()` de `groupId`** del schema (todos los inserts ya lo fijan explícito). Cerrar con el **guard de CI por grep** (acceso directo a `db` sobre tabla tenant fuera del DAL = fallo). | home, OG, cron (lectura), schema | Medio |

**Fuera de 1B (queda para 1D):** iteración del cron **por grupo**, segmentación de **push** por
grupo, namespacing de **blobs** (`avatars/{groupId}`), y **branding** (nombre/colores) desde el
grupo. 1B solo garantiza que las **lecturas** de datos tenant van scopeadas; la operativa
multi-grupo de fondo es 1D.

---

## 3. Test de no-fuga entre grupos (la pieza de seguridad central)

El arnés se monta en 1B-0 y **crece con cada dominio**:
- **Seed:** vía API/DB, dos grupos — Lomeros (el de siempre) y un **"Grupo Test"** con sus
  propios players/matches/bets/etc. Cookies de sesión forjadas para un admin y un jugador de cada
  grupo (extiende el patrón de `e2e/global-setup.ts`).
- **Aserciones (se añaden por dominio a medida que se scopea):** como miembro del grupo A,
  **nunca** se ven datos del grupo B por ninguna lista/perfil/ranking/Timba/torneo; y el
  **súper-admin ve ambos pero no aparece en el roster ni en la lista de miembros de ninguno**.
- **Backstop de CI (1B-5):** un script/grep que falla si encuentra acceso directo a `db`
  (`db.select/insert/update/delete from <tabla tenant>`) fuera de los módulos `lib/<dominio>/queries.ts`.

Además: **unit** de `getGroupContext` (los 3 caminos: membership / super_admin / 403) y de los
helpers del DAL (dado un `groupId`, la query incluye el filtro; el insert fija `groupId`).

---

## 4. Seguridad de deploy (resumen)

- Sin migración de DB nueva.
- Cada sub-paso: comportamiento idéntico para Lomeros (un solo grupo → filtrar no cambia nada),
  desplegable y reversible por separado.
- Suite completa verde en cada sub-paso (unit + e2e existente + no-fuga creciente).
- `git pull` en el checkout raíz tras cada merge a main.

---

## 5. Fuera de alcance (pasos siguientes)

- **1C:** roles y enlace user↔ficha pasan a leerse de `memberships` (`requireGroupAdmin`,
  vincular Gmail → membership); **borrar** `users.role`/`users.playerId`. La sesión/JWT pasa a no
  llevar `role`.
- **1D:** cron por grupo, push por grupo, blobs namespaceados, branding desde el grupo.
- **Fase 2+:** routing por slug, onboarding self-service, UX de cambio de grupo / vista
  cross-grupo del súper-admin.

---

## 6. Próximo paso
Invocar **writing-plans** para el plan de implementación del **sub-paso 1B-0 (cimientos + arnés
de no-fuga)**. Los sub-pasos 1B-1..1B-5 tendrán su propio plan cuando el anterior esté en
producción.
