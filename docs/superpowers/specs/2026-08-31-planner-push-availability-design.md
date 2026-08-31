# Aviso push al marcar disponibilidad en el planificador

Fecha: 2026-08-31

## Problema

El planificador semanal solo se ve si entras. Quien marca su disponibilidad no
tiene forma de avisar al grupo, y quien no entra no se entera de que hay gente
con intención de jugar. La semana se queda sin cuadrar por falta de señal, no
por falta de interés.

## Decisión

Cuando alguien **añade** disponibilidad, el resto del grupo recibe un push.

Tres decisiones tomadas con el usuario:

1. **Disparador**: alguien marca disponibilidad (no «cuando ya hay 4 que
   coinciden»). El valor está en enterarse del primer movimiento: sin ese aviso
   puede que nunca se llegue a 4.
2. **Destinatarios**: todos los miembros del grupo con notificaciones
   activadas, menos quien acaba de pintar.
3. **Antispam**: como máximo un aviso por jugador, semana y ventana de 6 horas.

## Contexto que condiciona el diseño

La cuadrícula autoguarda con debounce de 1 s **por día**: pintar una semana
entera dispara hasta 7 `PUT /api/planner/availability` casi simultáneos. Sin
antispam serían 7 notificaciones. El antispam no es un extra: es lo que hace la
feature usable.

«Notificaciones activadas» significa tener permiso de push concedido en el
navegador (fila en `push_subscriptions`). La app no tiene preferencias por tipo
de aviso: quien acepta push recibe todos. Un panel de preferencias granular es
una feature aparte, fuera de este alcance.

## Flujo

```
PUT /api/planner/availability
  → leer slots previos del día (getPlayerDaySlots)
  → upsertDaySlots (como hoy)
  → ¿hasNewSlots(prev, next)?  ── no ──> responder {success:true}
        │ sí
        ↓
     after(): responder ya, notificar después
        → claimNotificationSlot('planner:<g>:<week>:<player>', 6h)
              ── false (cooldown o carrera) ──> silencio
              │ true
              ↓
        loadWeekView → disponibilidad completa del actor esa semana
        → buildPlannerAvailabilityNotification(...)
        → sendToGroupExceptUsers(groupId, userIdsDelActor, payload)
```

### Antispam sin carreras

Tabla `notification_throttle (key TEXT PRIMARY KEY, sent_at TEXT NOT NULL)`.

Clave: `planner:<groupId>:<weekStart>:<playerId>`. Incluye la semana a
propósito: marcar esta semana y la próxima son dos avisos legítimos.

Reclamar turno es atómico:

1. `UPDATE notification_throttle SET sent_at = datetime('now')
   WHERE key = ? AND sent_at <= datetime('now', '-6 hours')`
   → si afecta a 1 fila, turno concedido.
2. Si afecta a 0 filas: `INSERT` la fila. Si el INSERT choca con la PRIMARY KEY,
   la fila existía y estaba en cooldown (o la creó otro PUT de la misma ráfaga)
   → turno denegado.

Así los 7 PUTs del autoguardado producen exactamente un aviso, sin depender del
orden de llegada.

### Fuera del camino crítico

El envío no debe alargar el autoguardado. Se usa `after()` de `next/server`
(estable en Next 16): la respuesta sale de inmediato y el push se manda
después. Errores en el aviso nunca afectan al guardado — `notifyPlannerAvailability`
captura todo y loguea, como `notifyMatchResult`.

### Solo al añadir

`hasNewSlots(prev, next)` es cierto si `next` contiene algún minuto que no
estaba en `prev`. Borrar huecos, reordenar o guardar lo mismo no notifica.

## Contenido del aviso

Título: `📅 Marcos ha marcado su disponibilidad`

El cuerpo describe la disponibilidad **completa** del actor en esa semana,
releída de la base de datos tras guardar (no solo el día del PUT):

- 1 día: `Esta semana · Jue 19:00–21:00`
- 1 día, 2 tramos: `Esta semana · Jue 12:00–14:00 y 19:00–21:00`
- 1 día, 3+ tramos: `Esta semana · Jue · 3 tramos`
- 2-3 días: `Próxima semana · Mar, Jue y Sáb`
- 4+ días: `Esta semana · 5 días marcados`

`url`: `/planificador` en el grupo raíz, `/g/<slug>/planificador` en el resto;
con `?week=<lunes>` si es la semana siguiente.

`tag`: `planner-<groupId>-<weekStart>-<playerId>`, para que en el móvil el aviso
se reemplace en vez de apilarse.

## Módulos

| Fichero | Responsabilidad |
|---|---|
| `src/lib/push/throttle.ts` | `claimNotificationSlot(key, windowHours)`: el UPDATE/INSERT atómico |
| `src/lib/push/planner-events.ts` | Orquesta el aviso. Best-effort, nunca lanza |
| `src/lib/push/notifications.ts` | `+ buildPlannerAvailabilityNotification()` (pura) |
| `src/lib/push/send.ts` | `+ sendToGroupExceptUsers()` |
| `src/lib/planner/queries.ts` | `+ getPlayerDaySlots()`, `+ hasNewSlots()` |
| `src/app/api/planner/availability/route.ts` | Engancha el aviso tras el upsert |

## Migración

`notification_throttle` se añade a `POST /api/migrate-push` (ya idempotente con
`CREATE TABLE IF NOT EXISTS`) y a `ensureAuxTables` para e2e y staging.

Recordatorio del proyecto: migrar producción **antes** de desplegar. Esta tabla
no la lee el build (solo la API), pero la regla se mantiene.

## Tests

**Unit (vitest, puros):** las cinco formas del cuerpo del aviso; `hasNewSlots`
en sus casos (añadir sí, quitar no, igual no, día vacío a pintado sí); la
construcción de la URL con y sin slug y con `?week=`.

**E2E (Playwright):** pintar en la cuadrícula crea la fila de
`notification_throttle`; volver a pintar en la misma ventana no cambia
`sent_at` (un solo aviso); borrar huecos no crea fila.

El envío real de web-push no es verificable en e2e (no hay claves VAPID ni
suscripciones), así que la evidencia observable del disparo es la fila de
throttle. Los destinatarios y el texto quedan cubiertos por los unit.
