# Diseño — Notificaciones Push (Web Push / PWA)

**Fecha:** 2026-06-11
**Estado:** Aprobado (brainstorming)

## Objetivo

Enviar notificaciones push a los usuarios que tengan la PWA instalada (principalmente
iPhone, iOS 16.4+), reutilizando el stack actual sin servicios de terceros.

## Enfoque

**Web Push nativo con VAPID** (librería `web-push`). Sin OneSignal/Firebase: las
suscripciones se guardan en Turso y el envío sale de las propias rutas/cron de Vercel.
Funciona en iPhone (PWA instalada), Android y desktop.

### Restricción iOS (clave)

En iOS, Web Push **solo funciona si la app está añadida a la pantalla de inicio**
(`display-mode: standalone`) y en iOS 16.4+. La suscripción debe iniciarse desde un
**gesto del usuario** (clic en un botón). La UI debe detectar y comunicar esto.

## Alcance v1

Cuatro tipos de notificación (misma infraestructura, distintos disparadores):

1. **Recordatorio de partido** — la **víspera** y la **mañana** del partido.
2. **Resultado registrado** — al registrar el resultado de un partido.
3. **Logro desbloqueado** — cuando un jugador gana un logro nuevo.
4. **Aviso manual del admin** — broadcast a todos.

Preferencias: **on/off global** por usuario (sin granularidad por tipo en v1).

## Modelo de datos

Dos tablas nuevas (`src/lib/db/schema.ts`):

```ts
// push_subscriptions — una fila por dispositivo. "Activado" = el user tiene ≥1 fila.
push_subscriptions {
  id: text PK (uuid),
  userId: text NOT NULL FK users(id) onDelete cascade,
  endpoint: text NOT NULL UNIQUE,   // identificador del push service
  p256dh: text NOT NULL,            // clave pública del cliente
  auth: text NOT NULL,              // secreto de autenticación
  userAgent: text,                  // para mostrar "iPhone", etc. (informativo)
  createdAt: text NOT NULL default datetime('now')
}

// notification_log — idempotencia de recordatorios (evita reenvíos por reintentos de cron).
notification_log {
  id: text PK (uuid),
  matchId: text NOT NULL,
  kind: text NOT NULL,              // 'reminder_eve' | 'reminder_day'
  sentAt: text NOT NULL default datetime('now'),
  UNIQUE(matchId, kind)
}
```

No hay tabla de preferencias (decisión: on/off global). Un usuario puede tener varios
dispositivos; cada uno es una fila independiente.

## Infraestructura de envío

- **Claves VAPID** (generadas una vez) en env vars de Vercel:
  - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (un `mailto:`)
  - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (expuesta al cliente para suscribirse)
- **Helper `src/lib/push/send.ts`** (librería `web-push`, **Node runtime**):
  - `sendToUsers(userIds: string[], payload)` — busca suscripciones de esos usuarios y envía.
  - `sendToAll(payload)` — para el broadcast.
  - Limpieza automática: si el push service responde **404/410**, borra la fila muerta.
  - `payload` tipado: `{ title, body, url?, tag? }`.
- **Service worker `public/sw.js`** (archivo estático):
  - `push` → `self.registration.showNotification(title, { body, data: { url } })`.
  - `notificationclick` → enfoca una pestaña abierta o abre `data.url`.

## Flujo de activación en el cliente (`/me`)

Componente cliente "Notificaciones" en la página `/me`:

1. **Detección de capacidad**:
   - Si no hay `Notification`/`serviceWorker`/`PushManager` → "no soportado".
   - Si es iOS y **no** está en `standalone` → aviso: *"Añade la app a tu pantalla de
     inicio para activar las notificaciones"* (con mini-instrucción Compartir → Añadir).
2. **Activar** (handler de clic, requisito iOS):
   - `Notification.requestPermission()` → si concede:
   - registra el SW, `registration.pushManager.subscribe({ userVisibleOnly: true,
     applicationServerKey: <VAPID public> })`.
   - `POST /api/push/subscribe` con la suscripción serializada.
3. **Desactivar**: `subscription.unsubscribe()` local + `POST /api/push/unsubscribe`
   con el `endpoint`.
4. **Estado**: el botón refleja si ya está suscrito en este dispositivo.

### Rutas API (protegidas con `getSession()`)

- `POST /api/push/subscribe` — guarda/actualiza la suscripción del usuario actual
  (upsert por `endpoint`).
- `POST /api/push/unsubscribe` — borra por `endpoint`.

## Disparadores

| Tipo | Disparo | Destinatarios |
|------|---------|---------------|
| Recordatorio (víspera + día) | 2 Vercel Cron → `/api/cron/match-reminders` | 4 jugadores del partido |
| Resultado registrado | Tras `processMatchRatings()` en `/api/matches` y `/api/matches/[id]` | 4 jugadores (con cambio de ELO) |
| Logro | `processMatchRatings()` devuelve logros nuevos → push | jugador que lo desbloquea |
| Aviso manual admin | `POST /api/push/broadcast` (solo admin) | todas las suscripciones |

### Recordatorios (cron)

- `vercel.json` con 2 entradas de cron apuntando a `/api/cron/match-reminders`.
- La ruta:
  1. Calcula `hoy` y `mañana` en **Europe/Madrid**.
  2. `reminder_day`: partidos `scheduled` con `date == hoy`.
  3. `reminder_eve`: partidos `scheduled` con `date == mañana`.
  4. Antes de enviar, consulta/inserta en `notification_log` (UNIQUE matchId+kind) para
     no duplicar.
  5. Resuelve los 4 jugadores → sus `users` → suscripciones → `sendToUsers`.
- **Protección**: la ruta valida `Authorization: Bearer <CRON_SECRET>` (Vercel inyecta
  el header en crons; rechaza llamadas externas).
- **Timezone**: Vercel Cron corre en **UTC**. Para ~9:00 y ~18:00 hora de Madrid se
  configuran los cron en UTC (Madrid = UTC+1 invierno / UTC+2 verano). Se documenta el
  desfase estacional; la precisión a la hora exacta no es crítica para un recordatorio.

### Resultado y logro

`processMatchRatings()` (en `src/lib/rating/process-match.ts`) es el punto central:
ya calcula los cambios de ELO y otorga logros. Se ajusta para **devolver** los cambios
de ELO por jugador y los logros nuevos. Las rutas `/api/matches` (POST) y
`/api/matches/[id]` (PUT) consumen ese retorno y, tras guardar, llaman al helper de push
(resultado a los 4 jugadores; logro al jugador correspondiente). El envío es
**best-effort**: un fallo de push no debe romper el registro del partido (try/catch,
log).

### Aviso manual + visibilidad admin: `/admin/notifications`

Página solo-admin con dos partes:

1. **Listado de usuarios y su estado**: `LEFT JOIN users ↔ push_subscriptions`. Cada
   usuario muestra email/jugador y un indicador 🔔 **Activadas** (con conteo de
   dispositivos si >1) / 🔕 **Desactivadas**.
2. **Formulario de broadcast**: título + cuerpo + URL opcional → `POST /api/push/broadcast`
   (valida sesión admin) → `sendToAll`.

## Orden de despliegue

Siguiendo el patrón existente de `/api/migrate-auth`:

1. Añadir env vars en Vercel (VAPID_*, CRON_SECRET) **antes** de activar.
2. Deploy.
3. Ejecutar `/api/migrate-push` (nueva ruta) para crear las 2 tablas en Turso.
4. Probar suscripción desde un iPhone con la PWA instalada.

## Consideraciones / riesgos

- **Runtime**: las rutas que usan `web-push` deben ser Node (no edge) por `crypto`.
- **iOS gotchas**: PWA instalada obligatoria, iOS 16.4+, suscripción dentro de gesto.
- **Suscripciones muertas**: se limpian en el primer 404/410 al enviar.
- **Idempotencia**: solo crítica en recordatorios (cron puede reintentar) → resuelta con
  `notification_log`. Resultado/logro se disparan una sola vez por registro de partido.
- **Privacidad**: las suscripciones son del propio grupo; no salen a terceros.

## Fuera de alcance (v1)

- Preferencias por tipo de notificación.
- Recordatorio "X horas antes" con campo hora en los partidos.
- Notificaciones por cambios de ranking (solo logros explícitos en v1).
- Agrupación/rich media en las notificaciones.
