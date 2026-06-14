# Estrategia de comercialización — de tour de amigos a producto

**Fecha:** 2026-06-14
**Estado:** Estrategia validada en brainstorming. Pendiente de diseñar Fase 1.

Este documento recoge las decisiones de negocio y arquitectura para convertir la
app (hoy un tour privado para un grupo de amigos) en un producto usable por
muchos grupos. No es un spec de implementación; es la base de la que cuelgan los
specs de cada fase.

---

## 1. Decisiones de negocio

### Ambición
**Side project con ingresos.** Que se pague solo y dé un extra, con crecimiento
orgánico y sin prisa. No es una startup a tiempo completo. Esto impone tres
restricciones de diseño que aplican a todo lo demás:
- **Bajo coste de mantenimiento** (poco soporte, poca operación).
- **Monetización simple** (nada de ventas activas ni facturación manual).
- **Nada que robe tiempo de vida** (sin SLAs, sin soporte 24/7).

### Cliente objetivo: **grupos de amigos**
Grupos auto-organizados que juegan de forma recurrente. Descartados para el
arranque:
- **Clubs**: ticket más alto pero venta B2B lenta, esperan factura/soporte/SLA y
  hay competencia brutal (Playtomic, Matchi, Nox). Contradice "low-maintenance".
- **Organizadores de torneos**: churn por diseño (evento puntual), retención baja.

**Diferencial:** no es "otra app de rankings de pádel", es la **capa social y de
gamificación** — La Timba (apuestas pari-mutuel con tokens), logros, rankings de
parejas, penalizaciones, feed, notificaciones push. Eso es lo pegajoso y lo que
hace que un grupo enseñe la app a otro grupo. Cada grupo que entra trae 8-20
personas que ven la marca → crecimiento orgánico real.

### Monetización: **pago por identidad/marca** ("Pase de Temporada")
- **Todo gratis y sin límites**, para siempre. La capa social (Timba, logros,
  rankings, push, feed, fotos) e incluso el historial **no se capan jamás**:
  son el motor de viralidad y retención. Capar uso = autogol en un producto de
  crecimiento orgánico con coste de captación cero.
- **Se cobra solo por identidad:** marca propia (nombre, logo, colores del tour),
  quitar el "hecho con X", y modo torneo. La gente de este segmento **paga por
  sentir que es SU tour**, no por función. El propio "Lomeros Padel Tour" es la
  prueba: ese nombre es identidad, no utilidad.
- **Precio:** ~20 €/año por grupo, **pago único anual** posicionado como
  "Pase de Temporada" (no suscripción mensual agresiva). Lo paga el organizador;
  repartido entre 8-20 jugadores es calderilla.
- **Gancho social** (robado al modelo de donación): los grupos de pago lucen un
  sutil **"⭐ Tour Oficial"** en su marca, rankings compartidos y OG images.
  Crea aspiración en los grupos gratis sin capar nada.

### Dos líneas rojas (protegen el "low-maintenance")
1. **La Timba sigue con tokens de juego, nunca dinero real.** Apuestas con dinero
   real = infierno legal y de pagos.
2. **Pagos con Stripe**, suscripción/pago simple. Nada de facturación manual.

### Principio rector de la monetización
No optimizar el precio ahora. **La monetización es casi irrelevante hasta que
exista el grupo nº2** (los costes de infra son ~0). El riesgo real del proyecto
no es "¿15 o 30 €?", es **"¿lo adopta algún grupo más allá del mío?"**. Por tanto:
fijar el modelo, y volcar el esfuerzo en el multi-tenant + onboarding
self-service. El precio se afina con datos cuando haya 5-10 grupos.

---

## 2. Hoja de ruta por fases

Cada fase es entregable y de-riesga la siguiente. Lo técnico va primero; lo
comercial cuando ya hay producto multi-grupo.

| Fase | Qué | Nota |
|---|---|---|
| **0. Decidir arquitectura tenant** | Cómo se aíslan los datos por grupo | Decisión casi irreversible (ver §3) |
| **1. Multi-tenant core** | Tabla `groups`, scoping por grupo, roles **por grupo**, migrar el grupo actual como nº1 | El corazón; sin esto no hay nada |
| **2. Onboarding self-service** | Crear grupo → ser admin → invitar por link/código → cada jugador reclama su ficha | Permite que exista el grupo nº2 sin intervención manual |
| **3. Marca propia + paywall** | Branding (nombre/logo/colores), subdominio o ruta, Stripe "Pase de Temporada", badge ⭐ Tour Oficial | Aquí se enciende la caja |
| **4. Pulido para terceros** | Landing pública, **empty states** (un grupo nace vacío), quitar literales "Lomeros", legal mínima (privacidad/términos), quizá i18n | Separa "demo para amigos" de "producto" |
| **5. Crecimiento (opcional)** | Discovery/rankings globales, terminar modo torneo, recap de temporada | Solo con tracción |

**Ojo a la Fase 4:** hoy la app está llena de datos y de "Lomeros". Un grupo
nuevo la abre vacía. El first-run (estados vacíos, textos genéricos, semillas) es
lo que hace que el grupo nº2 se quede o se vaya.

### Secuencia recomendada de lanzamiento
1. Construir Fases 1-2 (multi-tenant + onboarding).
2. **Lanzar gratis del todo** a 3-5 grupos reales además del propio.
3. Cuando se observe que **se ponen nombre propio y se invitan entre grupos** →
   encender el "Pase de Temporada" (Fase 3). Ese comportamiento *es* la señal de
   compra.

---

## 3. Arquitectura multi-tenant

Estado actual: **todo single-tenant**. 14 tablas (`players`, `matches`, `bets`,
etc.) y **ninguna cuelga de un "grupo"**. El trabajo es introducir ese concepto.

### Opción A — Una sola DB, columna `groupId` (row-level tenancy) ← **ELEGIDA**
Tabla `groups` + columna `groupId` en las tablas raíz (`players`, `matches`,
`rewards`, `penalties`…). El resto (`bets`, `match_sets`, `achievements`…)
heredan el grupo vía FK padre. Cada query filtra por `groupId`.
- ✅ Infra mínima (una DB, gratis hasta mucho volumen).
- ✅ **Features entre grupos triviales** (rankings globales, badge Tour Oficial,
  discovery) → justo el motor de crecimiento y monetización.
- ⚠️ Disciplina: una query sin `groupId` filtra datos entre grupos. Se mitiga
  con una **capa de acceso que siempre inyecta el tenant** (no queries sueltas).

### Opción B — Una DB por grupo (Turso multi-db) ← descartada
Cada grupo su propia base; un control plane mapea grupo→DB.
- ✅ Aislamiento perfecto; migración trivial (la DB actual = grupo nº1).
- ⚠️ Features **entre grupos** difíciles (rankings globales, discovery, badge
  aspiracional) y migraciones de esquema en N bases.

**Motivo de elegir A:** la monetización y el crecimiento **dependen de la
visibilidad entre grupos**. En A es gratis; en B es una pelea constante. El
riesgo de fuga de datos de A se resuelve una vez con una capa de queries con
tenant obligatorio.

### Cambios concretos que conlleva la Opción A
- **Roles dejan de ser globales.** Hoy `users.role` es global. Pasa a ser por
  grupo → nueva tabla `memberships (userId, groupId, role)`. Un usuario puede ser
  admin de su tour y jugador en el de un amigo.
- **`players` se vuelve dato de grupo**; un mismo `user` (cuenta) puede ligarse a
  varias fichas de jugador en grupos distintos.
- **Onboarding nuevo** reemplaza el flujo manual de Gmail en `/admin`.
- **Cron de recordatorios** itera por grupo. **Push y blobs** (avatares/fotos) se
  namespacean por grupo.
- **La Timba/tokens/ledger** no cambian de lógica: heredan grupo vía `player→group`.

La migración es con chicha pero **mecánica y acotada**. El código ya está
modularizado (`lib/players`, `lib/betting`, `lib/rankings`…), lo que ayuda.

---

## 4. Próximo paso
Diseñar a fondo la **Fase 1 (multi-tenant core)** como primer spec de
implementación.
