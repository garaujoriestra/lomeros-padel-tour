# Diseño: Autenticación con Google y sistema de roles

**Fecha:** 2026-06-11
**Estado:** Aprobado para planificación

## 1. Objetivo

Añadir autenticación real y roles a la app del tour de pádel:

- **Admin** (Guillermo): único administrador, da de alta jugadores y autoriza sus accesos.
- **Jugador**: inicia sesión, ve su perfil y sus partidos (igual que el perfil público de jugador, pero "lo suyo") y puede editar su propio perfil.

Login mediante **Google (Gmail)**. Se mantienen los jugadores actuales y se vinculan a su cuenta de Google. **No hay auto-registro**: solo entra quien el admin haya autorizado previamente (lista blanca).

## 2. Decisiones tomadas

| Tema | Decisión |
|------|----------|
| Control de acceso | **Lista blanca**: solo emails que el admin autoriza. Sin auto-registro. |
| Login del admin | Su **Gmail** marcado con `role='admin'`. Se elimina la contraseña actual. |
| Permisos del jugador | Ver su perfil y sus partidos (solo lectura de datos de juego) + **editar su propio perfil** (apodo, avatar, zurdo/diestro). No registra resultados. |
| Implementación OAuth | **Opción A**: Google OAuth/OIDC "a mano" + cookie de sesión JWT firmada con `jose`. Sin librería de auth pesada. |
| Sesiones | Stateless: JWT firmado en cookie httpOnly. Sin tabla de sesiones. |

## 3. Modelo de datos

Se **separa** la cuenta de acceso (`users`) del jugador del torneo (`players`). Motivo: el admin puede no ser jugador, y así no se ensucian rankings/elo con cuentas administrativas. Conceptos aislados: `users` = quién entra y con qué rol; `players` = datos deportivos.

### Tabla nueva `users`

```
users
  id         text  PK           (uuid)
  email      text  UNIQUE NOT NULL   ← Gmail autorizado (la lista blanca ES esta tabla)
  role       text  NOT NULL          ← 'admin' | 'player'
  playerId   text  FK→players.id  NULLABLE   ← vínculo opcional al jugador
  createdAt  text  NOT NULL DEFAULT (datetime('now'))
```

- `players` **no cambia** (no se añade email ahí). El vínculo vive en `users.playerId`.
- `email` único garantiza un acceso por persona.
- `playerId` nullable: un admin puede no estar vinculado a ningún jugador.

### Gestión de la lista blanca

Se gestiona desde el **formulario de jugador del admin** (`/admin/players/[id]/edit` y `/admin/players/new`), no en una pantalla aparte:

- Se añade un campo **"Email de Gmail"**.
- Al guardar, se hace **upsert** de la fila `users` correspondiente: `role='player'`, `playerId` = ese jugador, `email` = el introducido.
- Editar el email de un jugador actualiza su fila `users`. Borrar el email desautoriza (elimina/orfana la fila `users`).

### Seed inicial

Una fila admin: `users(email='garaujoriestra@gmail.com', role='admin', playerId=null)`. Si el admin además juega, se le asigna su `playerId` más adelante.

## 4. Flujo de autenticación

### Login con Google (OAuth 2.0 / OIDC)

1. Usuario pulsa **"Entrar con Google"** en `/login`.
2. Redirección a Google con `state` aleatorio (anti-CSRF, guardado en cookie temporal de corta vida).
3. Google devuelve al callback `/api/auth/callback` con `code` y `state` (se valida el `state`).
4. Se intercambia el `code` por el **ID token** de Google y se verifica (firma JWKS de Google + `aud` = client id) con `jose`. Se extrae el `email` verificado (`email_verified === true`).
5. Búsqueda en `users` por email:
   - **Existe** → se crea la sesión.
   - **No existe** → pantalla *"Tu cuenta de Google no está autorizada. Pide al organizador que te dé de alta."* No se crea nada.

### Sesión (stateless)

- JWT firmado con `jose` (secreto `AUTH_SECRET`) con payload `{ userId, role }` y expiración ~30 días.
- Cookie `session`: **httpOnly, secure (en prod), sameSite=lax** (lax para que el redirect desde Google conserve la cookie), `path=/`.
- **Logout** = borrar la cookie. Sin estado en servidor.

### Lectura de sesión

Función `getSession()` (server-only): lee la cookie, verifica el JWT, devuelve `{ userId, role, player? } | null`. La usan las páginas server, los route handlers y `proxy.ts`.

### Qué se elimina

El login por contraseña actual: `/api/login`, `/api/logout`, `ADMIN_PASSWORD`, `admin-token`/`ADMIN_SECRET`. Una sola vía de acceso.

## 5. Rutas y permisos

### Zona privada del jugador — `/me`

- `/me` → perfil propio. Reutiliza los componentes existentes de `/players/[id]` (elo, stats, logros, gráfica de evolución, partidos) con los datos del jugador vinculado a la sesión + botón **"Editar perfil"**. Si `users.playerId` es `null`, se muestra un aviso amable ("tu cuenta aún no está vinculada a un jugador").
- `/me/edit` → formulario de edición de **lo propio**: apodo (`nickname`), avatar/foto (`avatarUrl`), zurdo/diestro (`isLeftHanded`). Datos deportivos (elo, victorias) intactos.

### Panel admin — `/admin/*`

Igual que hoy, pero protegido por **rol `admin`** en vez de por contraseña.

### Reglas en `proxy.ts` (middleware de Next 16)

| Ruta | Quién pasa |
|------|-----------|
| `/admin/*` | sesión válida **y** `role === 'admin'` |
| `/me/*` | cualquier sesión válida |
| resto (público) | todos, sin login |

- Sin sesión → redirige a `/login?from=<pathname>`.
- Sesión con rol insuficiente (jugador en `/admin`) → redirige a `/me` (o pantalla "sin permiso").

### Navegación (navbar / bottom-nav)

- Sin sesión → botón **"Entrar"**.
- Jugador → **"Mi perfil"** (`/me`) + **"Salir"**.
- Admin → además acceso al panel admin.

### Endpoint de edición de perfil

`PATCH /api/me`: solo modifica `nickname`, `avatarUrl`, `isLeftHanded` del **jugador vinculado a la sesión** (resuelto con `getSession()` en servidor, nunca con un id del cliente). Rechaza si la sesión no tiene `playerId`.

## 6. Setup manual (una vez)

### Google Cloud Console

1. Crear/usar un proyecto → **APIs & Services → Credentials → Create OAuth client ID** (tipo *Web application*).
2. **Authorized redirect URIs**:
   - `https://<dominio-produccion>/api/auth/callback`
   - `http://localhost:3000/api/auth/callback`
3. Obtener **Client ID** y **Client Secret**.

### Variables de entorno (Vercel Production + `.env.local`)

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `AUTH_SECRET` — aleatorio largo para firmar los JWT (se genera al implementar).
- `APP_URL` — base para construir el redirect URI según entorno.

> Nota de entorno: `npm run dev` falla en local sin las env vars de Turso (hoy solo están en Production de Vercel). Para probar el login en local hacen falta esas + las de Google. A tener en cuenta en la verificación.

## 7. Orden de implementación (incremental, sin romper lo público)

1. Tabla `users` (schema + `drizzle-kit generate` migración) + script de seed admin.
2. Capa de auth: dependencia `jose`, `getSession()`, flujo OAuth (`/api/auth/login`, `/api/auth/callback`, `/api/auth/logout`).
3. Nueva `/login` con botón de Google; retirar login por contraseña.
4. `proxy.ts` por roles.
5. Campo "Email de Gmail" en formulario de jugador → upsert en `users`.
6. Zona `/me` (perfil + `/me/edit`) y `PATCH /api/me`.
7. Navegación según sesión.

Todo el sitio público (rankings, partidos, perfiles) sigue accesible sin login. Solo `/admin` y `/me` quedan protegidos.

## 8. Seguridad — notas

- Verificación del ID token de Google: comprobar firma (JWKS), `aud`, `iss`, expiración y `email_verified`.
- `state` anti-CSRF en el flujo OAuth.
- Cookie de sesión httpOnly + secure + sameSite=lax.
- Autorización siempre en servidor (`getSession()`); el cliente nunca decide a quién pertenece un recurso.
- Lista blanca por defecto cerrada: email no presente en `users` ⇒ acceso denegado.

## 9. Fuera de alcance (YAGNI por ahora)

- Registro abierto / auto-alta.
- Códigos de invitación (se podrían añadir encima de la lista blanca más adelante).
- Que el jugador registre o confirme resultados de partidos.
- Múltiples admins (el modelo lo soporta, pero no se construye UI para ello ahora).
- Refresh tokens / sesiones revocables en servidor (JWT stateless es suficiente a esta escala).
