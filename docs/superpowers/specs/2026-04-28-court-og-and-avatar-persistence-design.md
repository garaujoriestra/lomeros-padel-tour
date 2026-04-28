# Compartir partido con tarjeta de pista + persistencia de avatares — Spec

## Contexto

Dos problemas en producción que se atacan juntos porque están relacionados (el OG image consume avatares):

1. **Avatares se pierden tras cada deploy.** `src/app/api/upload/route.ts` escribe a `public/avatars/` con `writeFile`. En Vercel el filesystem de funciones serverless es efímero — los ficheros desaparecen entre deploys o reciclados de instancia. La carpeta `public/avatars/` del repo solo contiene `.gitkeep`. Resultado observado: la imagen de Guillermo (y cualquier otro avatar subido) ha desaparecido. Las URLs (`/avatars/xxx.jpg`) siguen guardadas en BD pero apuntan a ficheros que ya no existen.

2. **Compartir partido es texto plano poco atractivo.** El botón usa `navigator.share` con fallback a `wa.me/?text=...`, enviando un mensaje tipo `🎾 Pedro/Juan vs Luis/Marcos · 6-3 / 7-5 · LPT` + URL. La OG image existente es genérica y no aprovecha bien el potencial visual.

## Objetivos

- Avatares subidos persisten entre deploys (Vercel Blob).
- El botón "Compartir" abre WhatsApp directamente con **solo la URL** del partido. Al enviarse, WhatsApp muestra la nueva tarjeta de preview.
- La OG image es una **representación cenital de una pista de pádel** con los 4 jugadores en su lado (drive/revés) y el marcador grande, con el equipo ganador claramente destacado.

## Fuera de alcance

- Migración de avatares antiguos (todos perdidos; se asume re-upload manual desde admin tras el deploy).
- Cambios al schema de BD.
- Cambios al componente `<Avatar>` (sigue consumiendo `avatar_url` igual; se beneficia automáticamente del fix).
- Otros sitios donde aparecen avatares (perfil, ranking, etc.) — el fix los cubre transparentemente.

---

## Diseño

### 1. Persistencia de avatares — Vercel Blob

**Archivo:** `src/app/api/upload/route.ts`

**Cambio:** sustituir `writeFile` al filesystem por `put()` de `@vercel/blob`.

```ts
import { put } from '@vercel/blob';
// ...
const blob = await put(`avatars/${filename}`, file, {
  access: 'public',
  contentType: file.type,
});
return NextResponse.json({ url: blob.url });
```

- La URL devuelta (`https://*.public.blob.vercel-storage.com/...`) se guarda en `players.avatar_url` igual que antes.
- Validación de mime-type y tamaño ≤ 2MB se mantiene tal cual.
- `BLOB_READ_WRITE_TOKEN` se inyecta automáticamente en Vercel al vincular el Blob store. Para desarrollo local: `vercel env pull` lo pone en `.env.local`.

**Schema:** sin cambios. Las filas de `players` con `avatar_url = '/avatars/xxx.jpg'` quedan rotas — el avatar se ve como fallback (inicial) hasta que se re-suba.

### 2. Botón de compartir — WhatsApp + URL sola

**Archivos:**
- `src/components/shared/share-match-button.tsx`
- `src/app/(public)/matches/[id]/page.tsx`

**Comportamiento:**
- Click → abre `https://wa.me/?text=${encodeURIComponent(matchUrl)}` en nueva ventana/app.
- Solo la URL en el mensaje pre-rellenado. WhatsApp resuelve el preview rich con la OG image.
- No hay rama `navigator.share` — WhatsApp es el destino exclusivo.

**Cambios concretos:**

`share-match-button.tsx`:
- Reducir props a `{ url: string }`. Eliminar `title` y `text`.
- Eliminar `useState` de loading (la apertura de ventana es síncrona, no necesita feedback intermedio).
- Eliminar try/catch + toast (no hay error path real de `window.open`).
- Copy: `"Compartir por WhatsApp"`.
- Icono: SVG inline de WhatsApp (no emoji 📤).
- Color: verde WhatsApp `#25D366` (con hover `#1ebe57`).

`page.tsx`:
- Eliminar el cálculo de `t1NamesShort`, `t2NamesShort`, `setsString`, `shareText` (ya no se usan).
- En `<ShareMatchButton>`, pasar solo `url={matchUrl}`.

### 3. OG image — pista de pádel cenital

**Archivo:** `src/app/(public)/matches/[id]/opengraph-image.tsx` (reescritura completa).

**Lienzo:** 1200×630, PNG via `next/og` `ImageResponse`.

**Layout vertical:**

| Zona     | Altura | Contenido                                                       |
| -------- | ------ | --------------------------------------------------------------- |
| Header   | 80px   | `🎾 Lomeros Padel Tour` (izda) · fecha + 📍 location (dcha)     |
| Pista    | ~470px | Court con 4 jugadores y marcador                                |
| Footer   | 80px   | 🏆 + nombres del equipo ganador (banner verde) — vacío si pendiente |

**La pista (centrada, ~1080×440):**
- Fondo: gradient `#14532d → #064e3b`.
- Borde blanco sólido 4px (perímetro de la pista).
- Línea blanca vertical 4px en el centro horizontal de la pista (la red).
- En cada mitad, línea blanca horizontal 2px a ⅓ desde el borde superior (línea de saque).
- Esquinas redondeadas, radius 16px.

**Posicionamiento de los 4 jugadores (cuadrantes):**
- Mitad **izquierda** (equipo 1):
  - Arriba = jugador con `side === 'drive'`
  - Abajo = jugador con `side === 'reves'`
- Mitad **derecha** (equipo 2):
  - Arriba = jugador con `side === 'reves'`
  - Abajo = jugador con `side === 'drive'`
- Resultado visual: drives en diagonal (top-left ↔ bottom-right), revés en la otra diagonal.

**Fallback de sides:** si `team{N}Player1Side` es null o no es `'drive'`/`'reves'`, colocar `team{N}Player1Id` arriba y `team{N}Player2Id` abajo en su mitad, sin badges D/R.

**Cada jugador (en su cuadrante):**
- Avatar circular 120px diámetro.
  - Si `player.avatarUrl`: `<img src={absoluteUrl}>` con `border-radius: 50%`, `object-fit: cover`.
  - Si no: círculo gradient azul/verde + inicial blanca grande (estilo consistente con el fallback de la app).
- Nombre debajo: blanco, font-weight 800, 28px.
- Badge `D` o `R` al lado del nombre: 22×22px, fondo semi-transparente blanco, texto bold.

**Marcador (sets detallados grandes):**
- Centrado verticalmente sobre la red.
- Texto: `6-3 · 7-5` (o `6-3 · 7-5 · 6-2` si hay tercer set), font 80–90px, weight 900, mono, color blanco.
- Sombra/halo oscuro detrás para legibilidad encima del avatar/línea.
- Sin "sets ganados" separado — solo los detalles.

**Ganador (claramente destacado):**
- La mitad de pista del equipo ganador:
  - Overlay verde brillante `rgba(74, 222, 128, 0.28)` sobre toda la mitad.
  - Borde interior 6px verde lime `#4ade80` (a 8px del perímetro de la pista, dentro de su mitad).
- Footer: banner con bg verde `#4ade80`/`#22c55e`, texto en negro/blanco con `🏆 [Nombres del equipo ganador]` a 36px font-weight 900.

**Match programado (status !== 'completed'):**
- Sin marcador en la red. En su lugar: `VS` grande (90px, weight 900, color blanco con sombra).
- Sin halo de ganador, sin overlay.
- Footer: vacío (no banner verde, no texto).

**Implementación con Satori (constraints de `next/og`):**
- Todo `<div>` con múltiples hijos requiere `display: flex`. No hay `grid`.
- Posiciones absolutas dentro del contenedor de la pista (`position: relative` en el court, `position: absolute` en cada jugador/marcador).
- `<img>` admite URLs absolutas. Las URLs de Vercel Blob son fetcheables desde el runtime de OG.
- Los avatares se cargan con un fetch interno de Satori; si falla (404, timeout), proteger con try/catch que renderice el fallback de inicial. Estrategia: dentro del `Image()` async, hacer `Promise.all` de fetches HEAD a las URLs antes de pasar al JSX y, si falla, no incluir el `<img>` y usar la inicial.

### 4. Metadata por partido (mejora del preview de WhatsApp)

**Archivo:** `src/app/(public)/matches/[id]/page.tsx`

Añadir export `generateMetadata`:

- **Completado:**
  - `title: "{Pedro/Juan} vs {Luis/Marcos} · 6-3 / 7-5 — LPT"`
  - `description: "Resultado del partido del {fecha}{ en {location}}."`
- **Programado:**
  - `title: "{Pedro/Juan} vs {Luis/Marcos} · {fecha} — LPT"`
  - `description: "Partido programado{ en {location}}."`

WhatsApp usa estos campos como el texto del preview rich junto a la OG image. Sustituyen al título genérico `"Lomeros Padel Tour"` heredado del root layout.

Implementación: lookup de la match + players + sets dentro de `generateMetadata`. Implica una segunda query al render del HTML, pero la página ya hace consultas pesadas, así que el coste relativo es bajo. Alternativa (no recomendada en este alcance): cachear la query.

---

## Archivos afectados

| Archivo                                                       | Cambio                                                                |
| ------------------------------------------------------------- | --------------------------------------------------------------------- |
| `package.json`                                                | Añadir `@vercel/blob`                                                 |
| `src/app/api/upload/route.ts`                                 | Migrar a `put()` de `@vercel/blob`                                    |
| `src/components/shared/share-match-button.tsx`                | Simplificar: WhatsApp + URL solo; nuevo icono y copy                  |
| `src/app/(public)/matches/[id]/page.tsx`                      | Quitar `shareText` & co. ; añadir `generateMetadata`                  |
| `src/app/(public)/matches/[id]/opengraph-image.tsx`           | Reescritura completa: pista cenital                                   |

---

## Configuración y operativa

- **Vercel:** crear Blob store. Vercel inyectará automáticamente `BLOB_READ_WRITE_TOKEN` en Production y Preview.
- **Local:** ejecutar `vercel env pull` después de crear el store para que esté disponible en `.env.local`.
- **Post-deploy manual:** desde admin, re-subir el avatar de Guillermo (y cualquier otro que se hubiera perdido).

## Testing

**Avatar upload:**
- Subir un avatar desde el admin tras el deploy. Verificar que la URL guardada en `players.avatar_url` empieza con `https://*.public.blob.vercel-storage.com/`.
- Verificar que el avatar aparece en el perfil del jugador y en match cards.
- Hacer un nuevo deploy. Verificar que el avatar sigue accesible (no devuelve 404).

**Share button:**
- Click en desktop: abre `wa.me/?text=https%3A%2F%2F...` con solo la URL.
- Click en móvil: abre app de WhatsApp directamente (no share sheet del SO).
- Verificar que el texto pre-rellenado contiene solo la URL.

**OG image:**
- Visitar directamente `/matches/{id}/opengraph-image` en el browser — debe renderizar la pista con jugadores y marcador.
- Probar con partido completado: ganador claramente destacado, marcador legible.
- Probar con partido programado: "VS" en lugar de marcador, sin halo de ganador.
- Probar con partido sin `*_Side` definidos: jugadores en orden por defecto, sin badges D/R.
- Probar con jugador sin avatar: fallback de inicial visible.
- Pegar URL de un partido completado en WhatsApp Web → verificar que aparece el preview con la nueva tarjeta.

**Metadata:**
- `view-source:` en la página de un partido completado → verificar `<meta property="og:title">` con nombres y marcador.
- Idem para programado.

## Riesgos y consideraciones

- **Caché de WhatsApp.** Si la URL ya se compartió antes, WhatsApp puede seguir mostrando el preview viejo. La caché normalmente se renueva en días; añadir query strings dummy fuerza refresh si es urgente. Para este alcance, asumir caché natural.
- **Avatares fallidos en OG.** Si una URL de Blob falla durante la generación, Satori puede romper el render. Mitigación: try/catch o pre-fetch HEAD antes de incluir `<img>`.
- **`force-dynamic` en `page.tsx`.** La página es dinámica; los crawlers funcionan pero el preview puede tardar. Si se observa lentitud, evaluar ISR.
- **Next.js no-stock (AGENTS.md).** Antes de implementar, leer `node_modules/next/dist/docs/` los apartados de `next/og` (`ImageResponse`) y `Metadata` (`generateMetadata`). Las APIs pueden tener diferencias respecto a Next.js standard 16.x.
- **Coste extra de query en `generateMetadata`.** Implica una query adicional al render de cada página de partido. Bajo en términos absolutos, pero conviene saberlo.

---

## Open questions

Ninguna — todas las decisiones están cerradas:
- Persistencia: Vercel Blob.
- Share: WhatsApp + URL sola, sin texto adicional.
- OG: pista cenital, drives en diagonal, sets grandes como marcador, ganador muy visible.
- Metadata: per-partido con nombres y resultado.
