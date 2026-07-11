# Fase 2 · Tarea 1 · Paso B3 — Migrar torneos/pozos al patrón group-aware

**Contexto.** Torneos/pozos era el único dominio de `/api` excluido del Paso B (decisión del
usuario 2026-06-29, modo test solo-Lomeros). Con su OK (2026-07-11) se migra al mismo patrón
que players/matches/rewards/etc.: grupo objetivo explícito por request + authz contra ese
grupo. Los DATOS ya están scopeados desde 1B-4 (`getTournamentInGroup`/`getTournamentMatchInGroup`);
lo que cambia es la CAPA DE AUTH: `requireAdmin` (rol del grupo por defecto) →
`requireGroupAdmin(targetGroupId)` (rol del grupo objetivo).

**Convención (idéntica al Paso B):** GET/DELETE → `?g=<slug>`; POST/PUT/PATCH → `body.g`.
Sin `g` → `getGroupContext` cae a la única membership (Lomeros) = comportamiento idéntico.
Slug desconocido → `groupIdFrom*` devuelve null → mismo fallback (deuda conocida del Paso B,
consistente).

## Superficie (5 ficheros, 8 handlers — todos admin)

| Handler | Grupo desde | Cambio |
|---|---|---|
| GET `/api/tournaments` | `?g` | `requireGroupAdmin(groupIdFromQuery)`; `groupId = ctx.groupId` |
| POST `/api/tournaments` | `body.g` | parsear body ANTES del guard (400 si JSON inválido); `createdBy` vía `getSession()` extra (GroupContext no lleva userId; mismo trade-off que B1) |
| GET `/api/tournaments/[id]` | `?g` | ídem |
| PATCH `/api/tournaments/[id]` | `body.g` | body antes del guard |
| DELETE `/api/tournaments/[id]` | `?g` | ídem |
| PUT `[id]/pairs` | `body.g` | body antes del guard; validación de pairs donde estaba |
| POST `[id]/generate` | `body.g` | body ya se parsea con catch → moverlo antes del guard |
| POST `[id]/matches/[matchId]/result` | `body.g` | body antes del guard; validación de marcador después |

En todos: `const groupId = auth.ctx.groupId` sustituye a
`(await getGroupContext())?.groupId ?? (await getDefaultGroupId())`. Los gates
`getTournamentInGroup`/`getTournamentMatchInGroup` quedan como están (defensa de datos).

## Semántica resultante

- Admin de Lomeros SIN `g` → idéntico a hoy (fallback a su única membership).
- Admin de Lomeros con `g=grupo-test` → **403** (no es admin de ese grupo) — antes el `g` se
  ignoraba y caía en 404 por el gate de datos.
- Admin de grupo-test (con o sin `g`) → opera SOLO sus torneos.
- super_admin → 403 en escrituras (rol `super_admin` ≠ `admin`), igual que el resto del Paso B.

## TDD

1. **e2e nuevo `e2e/tournaments-scoping.spec.ts`** (espejo de `players-scoping.spec.ts`;
   fixtures ya existen: `gt-admin.json`, `gt-tournament1` en grupo-test, roster `gt-pl1..8`):
   - Lomeros admin + `g=grupo-test` → 403 en: GET lista, POST create, GET/PATCH/DELETE por id,
     PUT pairs, POST generate, POST result.
   - gt-admin sin `g` → lista pozos incluye `gt-tournament1` y NO los de Lomeros; GET detalle 200.
   - gt-admin con `g=grupo-test` → POST create 201 (roster GT).
   Rojo antes de implementar (hoy: 200/404 en vez de 403).
2. Implementar los 5 ficheros.
3. Verde: spec nuevo + `no-fuga-tournaments.spec.ts` + suites de torneos existentes
   (pozo-americano, pozo-fixed-pairs, torneo-single-elim, torneo-groups-elim, event-create,
   event-delete, eventos, pozo-public, torneo-public) + unit + tsc + lint + check:db-access.

## Fuera de alcance

- Páginas `/admin/pozos|torneos` (siguen scopeadas al grupo por defecto vía `getGroupContext()`;
  la paridad de páginas de grupo para torneos quedó fuera del MVP a propósito).
- Paso C (limpieza `getSession` + aterrizaje grupo-hogar) — se desbloquea con esto; siguiente PR.
