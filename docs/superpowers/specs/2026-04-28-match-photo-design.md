# Foto del partido — Spec

## Contexto

Bloque 2 del roadmap acordado durante el brainstorming general. Se añade una foto opcional por partido — típicamente la foto de los 4 jugadores al final — y se surfacea en dos sitios: el detalle del partido y la match card. Bloque independiente del Bloque 1 (activity feed); puede ir en su propio PR.

Vercel Blob ya está configurado y operativo (`@vercel/blob` v2.3.3, `BLOB_READ_WRITE_TOKEN` en Production/Preview/Development). El endpoint actual `/api/upload` se usa para avatares; aquí añadimos un endpoint hermano para fotos de partido.

## Objetivos

- El admin puede subir una foto al meter el resultado del partido.
- Si no la subió en el momento, puede añadirla después editando el resultado.
- Una vez subida, la foto queda inmutable (no se reemplaza ni se borra desde la app).
- La foto se ve grande en `/matches/[id]` y como banner pequeño en cada `MatchCard` que muestre el partido.

## Fuera de alcance

- **Galería**: una sola foto por partido en v1. Si en el futuro se quiere ampliar, requiere tabla `match_photos` y rediseño del hero — fuera de scope.
- **Editar / borrar** una foto ya subida desde la app. Si la foto es errónea, hay que borrarla manualmente del Blob store y de BD.
- **OG image**: la pista cenital se queda. La foto es para la app, no para previews de WhatsApp.
- **Lightbox / zoom**: el hero del match detail muestra la foto al ancho completo del contenedor; se ve bien tal cual.
- **Compresión client-side**: Vercel Blob aguanta tamaños razonables; subimos el límite del endpoint a 5MB.
- **Backfill**: los partidos existentes empiezan con `photo_url` = null; se puede añadir foto a partidos antiguos editando el resultado (si lifecycle B lo permite — ver abajo).

---

## Diseño

### 1. Schema

Añadir una columna a `matches` en `src/lib/db/schema.ts`:

```ts
photoUrl: text('photo_url'),  // Vercel Blob URL or null
```

Nullable, sin default. Los tipos `Match` derivados con `$inferSelect` heredan automáticamente.

### 2. Migración

Extender `src/app/api/migrate-db/route.ts` para que ejecute (idempotente):

```sql
ALTER TABLE matches ADD COLUMN photo_url TEXT
```

Patrón: catch del error si la columna ya existe (igual que las migraciones anteriores en este file).

### 3. Endpoint nuevo `/api/upload/match-photo`

Nuevo route handler en `src/app/api/upload/match-photo/route.ts`. Mismo patrón que el endpoint existente de avatares pero con dos diferencias:

- Carpeta destino en Blob: `match-photos/<uuid>.<ext>` en lugar de `avatars/`.
- Límite de tamaño: **5MB** (vs 2MB de avatares).

El endpoint de avatares (`/api/upload/route.ts`) NO se toca — sigue dedicado a avatares.

### 4. UX en `result-form.tsx` (lifecycle B)

Tres estados visuales según el valor de `initialData.photoUrl`:

**Estado A — `photoUrl === null` (creación o edit-result sin foto):**
- Bloque "📷 Subir foto del partido (opcional)" encima del marcador.
- File input + preview tras seleccionar fichero.
- Al seleccionar fichero, fetch a `/api/upload/match-photo`, recibe URL, almacena en form state.
- Mismo patrón que `player-form.tsx` para avatares.

**Estado B — `photoUrl !== null` (edit-result con foto ya subida):**
- Thumbnail read-only de la foto + texto "✅ Foto del partido subida — no editable".
- No hay file input.
- El form NO envía cambios al campo `photo_url`.

**Estado C — preview tras seleccionar fichero (transitorio entre A y submit):**
- Imagen pre-vista en grande, botón "Cambiar" hasta hacer submit.

Patrón concreto reutilizable de `player-form.tsx`:
- `useRef<HTMLInputElement>` para el file input oculto.
- `useState<boolean>` para `uploading`.
- `useState<string>` para `preview` URL.
- `URL.createObjectURL(file)` para preview inmediato.
- POST a `/api/upload/match-photo` con FormData.
- Si la respuesta es OK, `setForm({ ...form, photoUrl: data.url })`.

### 5. API: PUT del resultado acepta `photoUrl`

En `src/app/api/matches/[id]/route.ts` (o equivalente — el endpoint que `result-form.tsx` invoca al hacer submit), aceptar `photoUrl` en el body **solo si no había foto previa** (lifecycle B). Si ya existía, ignorar el campo (no permitir reemplazo desde la app — es la red de seguridad backend).

Implementación:
```ts
// Server-side check
if (existingMatch.photoUrl !== null && body.photoUrl !== existingMatch.photoUrl) {
  // Silently ignore — photo is locked
} else if (existingMatch.photoUrl === null && body.photoUrl) {
  // Allow setting for the first time
  updates.photoUrl = body.photoUrl;
}
```

### 6. Display — Match detail hero

En `src/app/(public)/matches/[id]/page.tsx`, si `match.photoUrl` existe, render encima del bloque verde existente:

```tsx
{match.photoUrl && (
  <div className="rounded-2xl overflow-hidden bg-gray-100 mb-6 sm:mb-8">
    <img
      src={match.photoUrl}
      alt={`Foto del partido ${match.date}`}
      className="w-full h-auto max-h-[400px] object-cover"
    />
  </div>
)}
```

- `max-h-[400px]` evita que fotos verticales rompan el viewport.
- `object-cover` recorta hacia los lados si la imagen es muy panorámica.
- `bg-gray-100` evita flash blanco durante la carga.
- ESLint disable comment para `<img>` (no usar `next/image` aquí porque la URL es de un dominio externo y `next/image` requiere config extra; `<img>` simple es perfectamente válido).

### 7. Display — MatchCard banner

En `src/components/shared/match-card.tsx`:

- Añadir `photoUrl?: string | null` a la interfaz `MatchCardData`.
- Si `match.photoUrl` existe, render banner antes del strip de fecha/ubicación:

```tsx
{match.photoUrl && (
  <div className="h-20 bg-gray-100 overflow-hidden">
    <img
      src={match.photoUrl}
      alt=""
      className="w-full h-full object-cover"
    />
  </div>
)}
```

- 80px de alto fijo, `object-cover` recorta.
- `alt=""` (foto decorativa; el card ya tiene info textual del partido).
- Si no hay foto, el card se mantiene exactamente igual que hoy.

### 8. Pasar `photoUrl` desde los call sites

Allí donde se renderice `<MatchCard>` (dashboard, /matches, perfiles), incluir `photoUrl` en el `match` prop. Como `match` es la fila de drizzle (que ahora incluye `photoUrl`), basta con pasar el match completo o asegurarse de que el subset incluye el campo.

---

## Archivos afectados

| Archivo | Cambio |
|---|---|
| `src/lib/db/schema.ts` | Añadir `photoUrl` a `matches` |
| `src/app/api/migrate-db/route.ts` | `ALTER TABLE matches ADD COLUMN photo_url` (idempotente) |
| `src/app/api/upload/match-photo/route.ts` | Nuevo endpoint, 5MB, sube a `match-photos/` en Blob |
| `src/components/admin/result-form.tsx` | Estados A/B/C según `photoUrl`, fetch al nuevo endpoint |
| `src/app/api/matches/[id]/route.ts` | Aceptar `photoUrl` en body solo si no había foto previa |
| `src/app/(public)/matches/[id]/page.tsx` | Hero photo si existe |
| `src/components/shared/match-card.tsx` | Banner photo si existe + prop `photoUrl` en `MatchCardData` |
| `src/app/(public)/page.tsx` | Pasar `photoUrl` a `<MatchCard>` (en el feed) |
| `src/components/shared/activity-feed-item.tsx` | Si el evento es `match_completed`, exponer `photoUrl` al card que enlaza al match — pero el feed no usa MatchCard sino su propio item; aquí no toca, el feed sigue con icono ✅ |

NOTA sobre el feed: el `activity-feed-item.tsx` (creado en Bloque 1) renderiza su propia card del evento "match_completed" sin usar `<MatchCard>`. La foto NO entra en el feed (por la decisión del brainstorm de Bloque 2: surfaces = match detail + MatchCard, NO feed).

---

## Configuración / operativa

- Sin nuevos env vars (Vercel Blob ya configurado).
- Tras el deploy, ejecutar la migración una vez (igual que se hizo con la columna de sides en su día). Memoria del usuario lo recuerda — yo lo curlearé directamente al endpoint de migración tras el deploy.

---

## Testing

### Sin tests unitarios

No hay lógica con ramificación que merezca un test unit. Toda la complejidad es UI + DB pass-through. La validación se hace manualmente.

### Verificación manual (post-deploy + migración)

1. **Crear partido nuevo + meter resultado con foto:**
   - Crear partido programado.
   - Ir a "Meter resultado", subir una foto, meter marcador, guardar.
   - Verificar `matches.photo_url` en BD comienza con `https://*.public.blob.vercel-storage.com/match-photos/...`.
   - Verificar que la foto aparece en `/matches/[id]` (hero arriba) y como banner en `<MatchCard>` (en dashboard, en `/matches`).

2. **Meter resultado sin foto, después editar y añadir foto (lifecycle B):**
   - Crear partido + meter resultado SIN foto.
   - Verificar que aparece sin banner en MatchCard y sin hero en match detail.
   - Editar resultado: el bloque de upload está visible.
   - Subir foto, guardar.
   - Verificar que ahora aparece en ambas surfaces.

3. **Editar resultado con foto ya subida (lifecycle B locked):**
   - Editar el resultado de un partido con foto.
   - Verificar que aparece thumbnail read-only con texto "✅ Foto subida — no editable".
   - Verificar que no hay file input.

4. **Backend lock test:**
   - Hacer un PUT al endpoint del partido pasando un `photoUrl` diferente cuando ya hay uno.
   - Verificar que la BD no se actualiza.

5. **Validación de tamaño:**
   - Intentar subir una imagen > 5MB. Verificar que el endpoint devuelve 400.

---

## Riesgos / consideraciones

- **Espacio en Vercel Blob:** una foto típica de móvil moderno son 2-4MB. Para un grupo activo (50 partidos al año), unos 200MB anuales. El free tier de Vercel Blob es de 1GB de storage, sobra.
- **Privacy:** las fotos contienen caras. Vercel Blob "public" significa que cualquiera con la URL puede verla. Las URLs son aleatorias (UUIDs) así que no son adivinables, pero técnicamente no son privadas. Para un grupo de amigos esto es aceptable. Si en el futuro se quiere algo más estricto, considerar `access: 'private'` y servir mediante un proxy autenticado.
- **Imágenes verticales muy largas:** `max-h-[400px]` + `object-cover` evita que rompan el layout, pero hay riesgo de cortar caras importantes. Aceptable como trade-off; si se observa el problema, considerar `object-contain` o pedir aspect ratio en el upload.
- **next/image vs `<img>`:** usamos `<img>` porque las URLs de Blob requieren config en `next.config.ts` para `next/image`. Aceptable; las páginas son dinámicas (no se beneficiarían tanto del optimizador).
- **Lifecycle B en el backend:** el bloqueo en el server (rechazar reemplazo de `photoUrl` cuando ya hay uno) es la red de seguridad. La UI también lo bloquea, pero sin server check, alguien con acceso al admin podría modificar la BD vía API.

---

## Open questions

Ninguna. Todas las decisiones están cerradas:
- Schema: `photo_url TEXT` nullable.
- Lifecycle: B (puede añadirse si falta, locked si ya existe).
- Surfaces: match detail + MatchCard. Feed y OG no se tocan.
- Subida: nuevo endpoint `/api/upload/match-photo`, 5MB.
- Tests: sólo verificación manual.
