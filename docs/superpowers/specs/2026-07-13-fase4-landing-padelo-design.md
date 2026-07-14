# Fase 4 · Landing pública de Padelo + alta abierta

**Fecha:** 2026-07-13
**Estado:** Diseño validado en brainstorming. Pendiente de plan de implementación.
**Fase:** 4 (Pulido para terceros) — pieza «Landing pública». Continúa tras las Piezas 1
(empty states + literales, #31) y 2 (PWA por-grupo, #32), ya en prod.

> Cómo se construye (encargo explícito del brainstorming): el diseño visual lo dirige
> **taste-skill** (dirección de marketing anti-slop) y lo vigila **impeccable** (a11y,
> tokens, rendimiento, reglas propias del sistema). Ver §7.

---

## 1. Contexto y problema

`PLATFORM_NAME = 'Padelo'` (`src/lib/groups/constants.ts:10`) es hoy **solo un nombre**:
sin tagline, sin color de plataforma, sin voz, y **sin ninguna superficie de captación**.
Un organizador de otra peña que ve un recap compartido no tiene a dónde ir para entender
qué es esto ni cómo conseguirlo para su grupo. La Fase 4 lo llama «landing pública» y es
la pieza que separa «demo para amigos» de «producto».

Además, el alta es hoy **beta cerrada**: crear grupo exige un enlace de invitación firmado
que emite a mano el súper-admin (`src/app/crear-grupo/page.tsx`, `create-group/route.ts:17`).
Eso es fricción máxima y **contradice la propia estrategia de comercialización**, que pide
literalmente *«lanzar gratis del todo a 3-5 grupos»* y sitúa el riesgo real del proyecto en
*«¿lo adopta algún grupo más allá del mío?»*. Sin un CTA que funcione de verdad, la landing
no tiene sentido.

## 2. Decisiones (validadas en brainstorming)

1. **Landing en `/padelo`.** La raíz `/` se queda como la home viva del grupo insignia
   Lomeros (bloqueado por e2e; no se toca). Un dominio propio `padelo.*` apuntando a esta
   ruta queda para infra/Fase 5 y no bloquea nada.
2. **Se abre el alta self-serve** tras login de Google, gobernada por un flag
   `PUBLIC_SIGNUP_ENABLED` (por defecto **ON**). El camino de invitación firmada sigue
   existiendo como respaldo. El flag permite volver a «solo invitación» en runtime sin
   rediseñar la landing.
3. **CTA primario:** «Crea tu grupo gratis» → `/crear-grupo`. **CTA secundario:**
   «Ver un tour en marcha» → `/` (la app viva de Lomeros = la mejor demo, según la propia
   estrategia de viralidad). **No hay lista de espera** (un alta gratis y abierta convierte
   mejor y da menos mantenimiento que un formulario de espera).
4. **Dirección visual: «Broadcast elevado».** La landing ES la identidad «Pista Central»
   del app convertida en página premium de marca deportiva. Se construye sobre el
   **vocabulario de tokens que ya existe** para que Padelo y el app se sientan un solo mundo.
5. **Legal mínima incluida:** dos páginas cortas y honestas (privacidad + términos)
   enlazadas desde el footer, porque abrimos alta pública con login Google y no queremos
   lanzar con enlaces muertos. La revisión legal a fondo sigue siendo pieza aparte.
6. **Fuera de alcance** (cada una su propia pieza): i18n (la landing nace es-ES), revisión
   legal a fondo, cambios de pricing/paywall (sigue apagado), discovery/rankings globales,
   OG image generada dinámica (se acepta una OG estática de marca).

## 3. Arquitectura de rutas y componentes

Todo lo nuevo son **superficies de plataforma** (marca Padelo), así que quedan sujetas al
guard existente «sin literal Lomeros» (test que verifica que los ficheros de plataforma no
contienen «Lomeros»).

```
src/app/
  padelo/
    layout.tsx        // chrome de marketing: SIN topbar/bottom-nav del app;
                      // header propio (wordmark Padelo + botón "Crea tu grupo") + footer con legal
    page.tsx          // la landing (compone las secciones de §5)
  legal/
    layout.tsx        // layout sobrio y legible (prosa), sin chrome del app
    privacidad/page.tsx
    terminos/page.tsx
src/components/marketing/
    hero.tsx          // hero broadcast + los dos CTAs
    section.tsx       // primitiva de sección (kicker + título display + contenido)
    feature-showcase.tsx  // bloque feature con captura real enmarcada como gráfico de broadcast
    steps.tsx         // "Cómo funciona" (3 pasos)
    pricing.tsx       // "gratis para siempre" + Pase de Temporada
    final-cta.tsx     // cierre
    site-footer.tsx   // footer de marketing con enlaces legales
src/lib/onboarding/
    public-signup.ts  // isPublicSignupEnabled() — lectura pura del flag
```

`/padelo` y `/legal/*` son segmentos top-level: **no** heredan `(public)/layout.tsx` (el
chrome del app vive en ese route-group), solo el root `src/app/layout.tsx` (html/body,
fuentes `next/font`, splash de marca). Las fuentes (Archivo + Barlow Condensed) ya están
cargadas globalmente → disponibles sin trabajo extra.

> **Nota de implementación:** el splash animado del root layout aparecería también en
> `/padelo`. Es on-brand, pero el plan debe verificarlo y, si molesta en marketing,
> condicionarlo por ruta.

## 4. Abrir el alta (cambio de backend, pequeño y acotado)

**Nuevo helper** `src/lib/onboarding/public-signup.ts` (espeja el patrón de `paid.ts`):

```ts
// Alta abierta por defecto; PUBLIC_SIGNUP_ENABLED=false vuelve a "solo invitación".
export function isPublicSignupEnabled(): boolean {
  return process.env.PUBLIC_SIGNUP_ENABLED !== 'false';
}
```

**`POST /api/onboarding/create-group`** — hoy exige token válido siempre (`route.ts:17`).
Nueva lógica:
- Si `isPublicSignupEnabled()` → basta sesión autenticada; el token deja de ser obligatorio
  (si viene y es válido, también vale — respaldo).
- Si NO → comportamiento actual (token obligatorio).
- **Guard anti-abuso** (barato, no gambling): límite de grupos creados por usuario
  (p. ej. máx. 3-5, configurable) apoyado en que el alta ya exige cuenta Google real. El
  mecanismo exacto se fija en el plan; la sesión + el cap cubren el 99%.

**`src/app/crear-grupo/page.tsx`** — deja de ser un callejón sin token cuando el flag está ON:
- Flag ON + sin sesión → «Entra con Google para crear tu grupo» (reusa el flujo de login,
  vuelve a `/crear-grupo`).
- Flag ON + con sesión → muestra `<CreateGroupForm>` directamente (sin token).
- Flag OFF → comportamiento actual (token o «pide una invitación»).
`<CreateGroupForm>` debe poder enviar el POST **sin** `t` cuando el alta es abierta.

Esto **no** toca el aislamiento multi-tenant (la capa de queries scopeada por `groupId` y su
suite no-fuga siguen igual): abrir la creación no cambia cómo se aíslan los datos.

## 5. La landing: narrativa y secciones

**Columna narrativa:** *«Tu peña merece una liga»* — la fantasía de la Pista Central aplicada
al grupo del visitante. Cada sección, una idea; layouts variados (no todo texto-izq/imagen-der);
escalas de hero y CTAs variados (principio taste-skill).

1. **Hero broadcast.** Titular condensado gigante («TU PEÑA MERECE UNA LIGA»), subtítulo con
   el qué (Elo 2vs2, La Timba, torneos, logros), los dos CTAs, y una línea de confianza
   («Gratis para siempre · se instala como app, sin nada que descargar»). Visual: escenario
   verde profundo, lima como único foco, guiño a marcador/podio.
2. **El giro** *(second-read).* Del caos del grupo de WhatsApp + nota del móvil a un marcador
   de verdad. Corto y con gancho.
3. **La capa social (el diferencial).** La Timba (apuestas con **fichas, nunca dinero real**),
   logros, rankings de parejas. Es lo pegajoso y lo que hace que una peña enseñe la app a otra.
   Capturas reales enmarcadas como gráficos de broadcast.
4. **El motor competitivo.** Elo 2vs2, historial, torneos y pozos, con el dramatismo de datos
   del app (quién sube, quién cae, rachas).
5. **Planificador semanal.** Cuándo puede jugar la peña; disponibilidad y coincidencias.
6. **Cómo funciona.** 3 pasos: **Crea tu grupo → Invita a tu peña (link) → Juega y pícate.**
7. **Precio honesto.** «Todo gratis, para siempre. Solo pagas por hacerlo TUYO: nombre, logo y
   colores de tu tour por ~20 €/año (Pase de Temporada), y luces el ⭐ Tour Oficial.» Refuerzo
   explícito anti-casino / anti-SaaS (coherente con las anti-referencias de PRODUCT.md).
8. **Cierre + CTA final** («Crea tu grupo gratis» + demo) + **footer** con enlaces a
   `/legal/privacidad` y `/legal/terminos`.

**Metadata/SEO de `/padelo`:** título y descripción de marca Padelo (nunca «Lomeros» — guard),
OG estática de marca para que compartir la landing luzca. Sin i18n (es-ES).

## 6. Legal mínima

`/legal/privacidad` y `/legal/terminos`: prosa corta, honesta y en español, con layout legible
propio (sin chrome del app). Cubren lo esencial de una beta gratuita con login Google (qué datos
se guardan —cuenta Google, datos de juego del grupo—, para qué, La Timba = fichas sin valor
monetario, contacto). Marcadas como mínimas; **no** son asesoría legal ni pretenden serlo. La
revisión a fondo es pieza posterior.

## 7. Cómo aplicamos taste-skill + impeccable (el corazón del encargo)

**taste-skill dirige el diseño de la capa de marketing:**
- Leer el brief e inferir dirección; **generar una imagen de referencia por sección**
  (imagegen-frontend-web) → implementar clavando esas referencias (image-to-code).
- Reglas taste-skill: anti-slop, composición variada, escalas de hero variadas, CTAs variados,
  una idea por sección, «second-read moments», pre-flight check.

**impeccable es el guardarraíl** (no un segundo estilo que compita):
- La landing se construye sobre los **tokens que ya existen** (`globals.css`): lima `#c8f03c`,
  verde profundo `#0c1715`/`#1d2f2c`, escala oklch, radios, Barlow itálica 800 + Archivo. Nada
  de un sistema de color paralelo → Padelo y el app se sienten un solo mundo.
- Al terminar, **pasar la crítica de impeccable**: contraste AA, targets ≥44px,
  `prefers-reduced-motion` respetado, reglas propias «Tinta-sobre-Lima» y «un solo acento
  protagonista por pantalla», y rendimiento (imágenes optimizadas, sin `transition: all`).

## 8. Unidades y aislamiento

- `isPublicSignupEnabled()` — lectura pura de env, testeable en aislamiento.
- Componentes de `components/marketing/*` — presentacionales, sin dependencias de datos
  (contenido estático). Se pueden entender y testear sin backend.
- Páginas `/legal/*` — estáticas.
- Cambio en `create-group/route.ts` — una única rama sobre el flag; no altera el aislamiento
  de tenants.

## 9. Testing (según AGENTS.md: e2e Playwright obligatorio + unit)

**e2e** (`e2e/landing-padelo.spec.ts`, patrón montar-estado-por-API / aserción-por-UI):
- `/padelo` renderiza hero y **ambos** CTAs; primario enruta a `/crear-grupo`, secundario a `/`.
- `/padelo` **no** contiene el literal «Lomeros» (superficie de plataforma).
- La raíz `/` sigue siendo «Lomeros Padel Tour» (insignia intacta) — reforzar aserción.
- `/crear-grupo` en modo abierto (flag ON): con sesión forjada y **sin token** muestra el
  formulario; enviarlo crea el grupo y aterriza en `/g/<slug>`.
- `/legal/privacidad` y `/legal/terminos` renderizan y están enlazadas desde el footer.

**unit** (Vitest):
- `isPublicSignupEnabled()`: ON por defecto; OFF solo con `'false'`.
- `create-group` route: modo abierto acepta sin token; modo cerrado exige token (actualizar el
  test existente que asume token siempre).
- Guard anti-abuso: el cap de grupos por usuario rechaza al superar el límite.
- Actualizar el guard «sin literal Lomeros» para que cubra los ficheros nuevos de `padelo/`,
  `legal/` y `components/marketing/`.

## 10. Riesgos y mitigaciones

- **Abuso al abrir el alta:** login Google obligatorio + cap de grupos por usuario + el flag
  como kill-switch instantáneo. Coste de infra ~0 (row-level tenancy, una DB).
- **Fuga de marca (Lomeros en superficie Padelo):** el guard de literal + el test e2e lo atrapan.
- **Splash de marca en `/padelo`:** verificar en el plan; condicionar por ruta si molesta.
- **Legal como falsa sensación de cobertura:** textos honestos, marcados como mínimos; revisión
  a fondo explícitamente diferida.
- **Regresión de deploy (lección de Piezas 1/2):** CI corre `tsc --noEmit` y Vercel typechea el
  build → correr `tsc` y esperar checks verdes antes de mergear. `npm install` en el worktree.

## 11. Próximo paso

Escribir el plan de implementación (skill writing-plans) descomponiendo en pasos verificables:
(A) flag + apertura del alta, (B) rutas y layouts marketing/legal, (C) secciones de la landing
con el ciclo taste-skill, (D) legal, (E) crítica impeccable, (F) tests.
