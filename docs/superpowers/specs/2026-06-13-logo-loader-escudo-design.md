# Logo de marca (escudo) + loaders animados — Diseño

**Fecha:** 2026-06-13
**Estado:** Aprobado para implementación

## Objetivo

Sustituir el logo tipográfico actual ("LPT" en texto) por un **escudo de marca** y
mejorar las animaciones de carga (splash de arranque y loader entre pantallas) para
que la PWA se sienta más pulida y reconocible.

## Decisiones de diseño (cerradas en brainstorming)

- **Concepto de logo:** escudo / crest (rollo club / liga oficial).
- **Estilo del escudo:** **macizo** (relieno lima `#c8f03c`) con **palas de pádel
  cruzadas en negativo** (recortadas en el verde oscuro de fondo `#0c1715`), con
  los agujeritos de la pala en lima para que se reconozcan, y **"LPT"** en negativo
  debajo de las palas. El escudo es autónomo: funciona como logo completo y como
  icono de la app sin nada más.
- **Animación del splash de arranque:** "se dibuja solo" — el contorno del escudo se
  traza, luego se rellena de lima y finalmente entran palas + "LPT" (~1,4 s total).
- **Animación entre pantallas:** el escudo **ya dibujado** aparece con fade rápido +
  pulso suave. **No** se re-traza (evita parpadeos en navegaciones < 300 ms).

## Paleta y tipografía (sin cambios)

- Lima de marca: `#c8f03c`
- Verde oscuro de fondo (gradiente): `linear-gradient(160deg, #1d2f2c 0%, #0c1715 60%)`
- Verde sólido / negativo: `#0c1715`
- Tipo del wordmark: Barlow (`var(--font-barlow)`), 800, itálica.

## Arquitectura: una única fuente de verdad

El escudo se define **una sola vez** y se reutiliza en todos los puntos. Esto evita
que el logo derive entre el splash, el loader, los iconos y la UI.

### Nuevo: `src/components/shared/crest.tsx`

Módulo fuente del escudo. Exporta:

1. **`Crest`** — componente React que renderiza el SVG inline del escudo (estático,
   sin animación). Acepta `size` (px) y `className`/`aria` opcionales. Uso: cualquier
   sitio de la UI que quiera el logo (p. ej. cabeceras), y como base visual del loader.
2. **Constantes de geometría exportadas** como strings, para reusar el MISMO dibujo en
   contextos donde no puede entrar JSX/React:
   - `SHIELD_PATH` — el `d` del path del escudo (viewBox `0 0 128 138`).
   - `CREST_SVG_MARKUP` — el SVG completo del escudo como string (escudo + palas +
     "LPT"), parametrizable por tamaño. Se usa en el splash inline (`layout.tsx`) y
     para construir el data-URI de los iconos.

Geometría de referencia (viewBox `0 0 128 138`):

```
shield: M64 4 L118 25 V66 C118 104 93 124 64 134 C35 124 10 104 10 66 V25 Z
pala (silueta):
  - cabeza: ellipse cx=0 cy=-13 rx=14 ry=18 (fill #0c1715)
  - agujeros: 8 circles r=2 en lima dentro de la cabeza
  - mango: rect x=-3 y=3 w=6 h=24 rx=3 (fill #0c1715)
  - cruzadas: translate(64,52) rotate(±38)
LPT: text x=64 y=120 anchor=middle, Barlow 800, size 20, fill #0c1715
```

## Componentes y archivos

### 1. Splash de arranque — `src/app/layout.tsx`

- Reemplazar el markup actual (`#lpt-splash` con texto "LPT" + ring) por el SVG del
  escudo (a partir de `CREST_SVG_MARKUP`).
- Reescribir `SPLASH_STYLE` (CSS inline en `<head>`) con la animación "se dibuja solo":
  - `outline` (path stroked, sin fill): `stroke-dasharray` + `stroke-dashoffset`
    animado de longitud→0 (~0,5 s) y luego se desvanece.
  - `fill` (escudo relleno lima): opacidad 0→1 tras el trazado (~0,2 s).
  - `ink` (palas + "LPT" en negativo): escala 0,7→1 + fade tras el relleno (~0,3 s).
  - Mantener el `SPLASH_SCRIPT` actual que oculta el splash cuando el contenido carga
    (sin cambios funcionales) y el `setTimeout` de seguridad.
  - `@media (prefers-reduced-motion: reduce)` → escudo ya dibujado, sin animación.
- El splash debe seguir pintándose **antes** de que cargue React/CSS: todo el estilo
  va inline en `SPLASH_STYLE`, sin depender de `globals.css` ni del componente `Crest`.
  El markup del escudo se incrusta como string (`CREST_SVG_MARKUP`), no como `<Crest/>`.

### 2. Loader entre pantallas — `src/components/shared/screen-loader.tsx`

- Sustituir el `LPT` de texto + ring por `<Crest/>` (escudo ya dibujado).
- Animación: fade-in rápido (la `.screen-loader` ya arranca invisible y se revela tras
  ~100 ms) + pulso suave de opacidad sobre el escudo. Sin re-trazado.

### 3. Estilos del loader — `src/app/globals.css`

- Reescribir el bloque `.screen-loader*` (líneas ~446-488):
  - `.screen-loader` mantiene el fondo y el `screenLoaderReveal` tras 100 ms.
  - Sustituir `.screen-loader__logo` / `.screen-loader__ring` por una clase para el
    escudo (`.screen-loader__crest`) con pulso suave (`lpt-splash-pulse` reutilizable).
  - Eliminar el ring (`lpt-splash-spin`) si ya no se usa en ningún sitio; conservar
    `lpt-splash-pulse`.
  - `prefers-reduced-motion` → sin pulso.

### 4. Iconos PWA — `src/app/icon.tsx` (192px) y `src/app/apple-icon.tsx` (180px)

- `next/og` (Satori) no renderiza SVG inline arbitrario de forma fiable. Solución:
  renderizar el escudo como `<img src="data:image/svg+xml,<...>" />` dentro del
  `ImageResponse`, construyendo el data-URI a partir de `CREST_SVG_MARKUP`.
- Fondo: el gradiente verde de marca; el escudo centrado, ocupando ~70 % del lienzo.
- Mantener `size` y `contentType` actuales de cada ruta.

### 5. favicon — `src/app/favicon.ico`

- El `favicon.ico` actual es estático y antiguo. Next.js sirve `icon.tsx` para la
  mayoría de navegadores modernos, así que el escudo ya aparecerá como favicon.
- Acción: **eliminar** `src/app/favicon.ico` para que Next use `icon` como favicon, o
  dejarlo si genera conflicto. Generar un `.ico` multi-resolución requiere un paso
  manual con herramientas externas; si hace falta, se documenta como tarea aparte.
  Decisión por defecto: eliminar el `.ico` y dejar que `/icon` haga de favicon.

## Accesibilidad

- Splash: `aria-hidden="true"` (ya lo está) — es decorativo, el script lo oculta.
- Screen-loader: mantener `role="status"`, `aria-busy`, `aria-label="Cargando"`.
- `prefers-reduced-motion: reduce` respetado en splash y screen-loader (sin trazado ni
  pulso; el escudo aparece estático).

## No incluido (YAGNI)

- No se añade el escudo a la navbar ni a otras pantallas en esta tarea (el componente
  `Crest` queda disponible para hacerlo después si se quiere).
- No se crean variantes de color del escudo (solo lima sobre verde).
- No se genera un `.ico` multi-resolución a mano salvo que sea necesario.

## Verificación

- `npm run build` (o `npm run lint` + typecheck) pasa.
- Visual: arrancar la app y comprobar (a) splash con trazado en frío, (b) loader entre
  pantallas con pulso sin parpadeo, (c) `/icon` y `/apple-icon` devuelven el escudo,
  (d) favicon muestra el escudo.
- Comprobar `prefers-reduced-motion` (escudo estático, sin animación).
