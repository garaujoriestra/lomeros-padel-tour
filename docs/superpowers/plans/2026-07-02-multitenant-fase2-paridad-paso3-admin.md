# Fase 2 · Paridad `/g/[slug]` · Paso 3 — admin compartido — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) o superpowers:executing-plans para implementar tarea a tarea. Steps con checkbox (`- [ ]`).

**Goal:** Que `/g/[slug]/admin` (dashboard) + `/g/[slug]/admin/players` + `/g/[slug]/admin/matches` funcionen para el admin **de ese grupo**, extrayendo cuerpos compartidos (`AdminDashboardBody`/`AdminPlayersBody`/`AdminMatchesBody`) que las páginas `/admin*` de raíz (Lomeros) también renderizan, con gating de rol **por grupo de la URL** y gating de sesión en el edge, sin cambiar el comportamiento de Lomeros.

**Architecture:** Se extraen los cuerpos de `admin/page.tsx`, `admin/players/page.tsx` y `admin/matches/page.tsx` a server components en `src/components/pages/` que reciben `ctx: PageContext`. Las páginas raíz los renderizan con `resolvePageContext()` (grupo por defecto) y las nuevas páginas `/g/[slug]/admin*` con `resolvePageContext(slug)`. El gating: el edge exige **sesión** en `/g/<slug>/admin*` (rama nueva de `decideAccess` + matcher del proxy) y un layout nuevo `g/[slug]/admin/layout.tsx` exige **rol admin en el grupo de la URL** (`ctx.role === 'admin'`; no-admin → redirect a `${basePath}/me`) — mismo patrón que el `admin/layout.tsx` de raíz pero con el rol del grupo, no `session.role`. Bajo grupo, los cuerpos **omiten** los enlaces/acciones a sub-rutas diferidas del MVP (`players/new`, `players/[id]/edit`, `matches/new`, `matches/[id]/result|sides`, `notifications`) para no enlazar 404s; los botones de borrado pasan el grupo explícito (`?g=<slug>`) a la API ya group-aware (B1/B2).

**Tech Stack:** Next 16 (App Router, server components, `params: Promise`, proxy/`decideAccess`), Drizzle/Turso, Vitest, Playwright. Reutiliza: `resolvePageContext`/`PageContext` (Paso 1), `AdminSidebar`, queries group-scoped (`listPlayersByElo`, `listMatchesByDate`, `listMatchSetsInGroup`, `listAllPlayersInGroup`, `countPlayersInGroup`, `countMatchesInGroup`), API players/matches con `?g=`/`body.g` (B1/B2), fixtures e2e `gt-admin.json`/`gt-player.json`/`admin.json`.

**Alcance de ESTE plan:** las 3 páginas admin del MVP (dashboard + lista de players + lista de matches) en raíz y bajo `/g/[slug]`, con gating. **Fuera (diferido de propósito):** sub-rutas admin (`players/new`, `players/[id]/edit`, `matches/new`, `matches/[id]/result|sides`), `notifications`, `rewards`, `redemptions`, `timba`, `pozos`, `torneos` bajo grupo (torneos/pozos además son modo test solo-Lomeros). El conmutador de súper-admin es Tarea 3 (aquí `super_admin` sin membership admin → redirect a `/me` del grupo, como cualquier no-admin).

---

## 0. NO romper Lomeros
- `admin/layout.tsx` de raíz **NO se toca** (sigue con `getSession` + `session.role`, su chrome y su gate actuales — igual que en Paso 2 no se tocó `me/layout.tsx`). Solo cambian los **cuerpos** de las 3 páginas raíz, que pasan a renderizar los bodies compartidos con `resolvePageContext()` (grupo por defecto) — render idéntico (mismos hrefs con `basePath=''`, mismas acciones en raíz).
- `getSession` **intacto** (lo consumen páginas no migradas + `requireAdmin`/torneos).
- `decideAccess` en raíz: **sin cambios de semántica**; solo se **añade** la rama `/g/<slug>/admin`.
- `AdminSidebar` en raíz: mismos 9 enlaces, mismo activo (el cambio de `isActive` a `href.endsWith('/admin')` es equivalente en raíz).
- `DeletePlayerButton`/`DeleteMatchButton` en raíz: sin prop `g` → fetch idéntico al actual.
- Toda la suite e2e existente verde.

---

## Estructura de ficheros
- **Modificar** `src/lib/auth/authorize.test.ts` — casos para la rama `/g/<slug>/admin`.
- **Modificar** `src/lib/auth/authorize.ts` — `decideAccess` añade rama `/g/<slug>/admin` (exige sesión). Raíz inalterado.
- **Modificar** `src/proxy.ts` — añadir `/g/:slug/admin/:path*` al `config.matcher`.
- **Modificar** `src/app/admin/players/delete-player-button.tsx` — prop opcional `g` → `?g=` en el DELETE.
- **Modificar** `src/app/admin/matches/delete-match-button.tsx` — ídem.
- **Modificar** `src/components/admin/admin-sidebar.tsx` — prop `basePath`; bajo grupo solo los 3 enlaces MVP.
- **Crear** `src/components/pages/admin-dashboard-body.tsx` — `AdminDashboardBody({ ctx })`.
- **Crear** `src/components/pages/admin-players-body.tsx` — `AdminPlayersBody({ ctx })`.
- **Crear** `src/components/pages/admin-matches-body.tsx` — `AdminMatchesBody({ ctx })`.
- **Modificar** `src/app/admin/page.tsx`, `src/app/admin/players/page.tsx`, `src/app/admin/matches/page.tsx` — renderizan los bodies con `resolvePageContext()`.
- **Crear** `src/app/g/[slug]/admin/layout.tsx` — gate de rol por grupo + `AdminSidebar` con `basePath`.
- **Crear** `src/app/g/[slug]/admin/page.tsx`, `src/app/g/[slug]/admin/players/page.tsx`, `src/app/g/[slug]/admin/matches/page.tsx`.
- **Crear** `e2e/group-admin.spec.ts`.
- **NO se toca** `src/app/admin/layout.tsx`, `g/[slug]/layout.tsx`, `getSession`, `resolvePageContext`, `Navbar`, nada de torneos/pozos ni sub-rutas admin.

---

## Task 0: Baseline en el worktree
- [ ] **Step 1:** `npm install` → sin errores.
- [ ] **Step 2:** `npm test` → PASS; `npm run check:db-access` → `✅`.

---

## Task 1: Gating edge de `/g/<slug>/admin` (`decideAccess` + matcher)

**Files:**
- Modify: `src/lib/auth/authorize.test.ts`
- Modify: `src/lib/auth/authorize.ts`
- Modify: `src/proxy.ts`

- [ ] **Step 1: Test que falla** — en `src/lib/auth/authorize.test.ts`, añadir dentro de `describe('decideAccess', ...)` (tras el `it('no gatea la landing pública del grupo /g/<slug>', ...)`):

```ts
  it('gatea /g/<slug>/admin solo por sesión (el rol lo exige el layout del grupo)', () => {
    expect(decideAccess('/g/grupo-test/admin', null)).toBe('redirect-login');
    expect(decideAccess('/g/grupo-test/admin', { userId: 'u' })).toBe('allow');
    expect(decideAccess('/g/grupo-test/admin/players', null)).toBe('redirect-login');
    expect(decideAccess('/g/grupo-test/admin/matches', { userId: 'u' })).toBe('allow');
  });
```

- [ ] **Step 2: Falla** — `npx vitest run src/lib/auth/authorize.test.ts` → FAIL (`/g/grupo-test/admin` con `null` devuelve hoy `'allow'`).

- [ ] **Step 3: Implementar** — en `src/lib/auth/authorize.ts`, añadir tras la rama `/g/<slug>/me` (antes del `return 'allow'` final):

```ts
  // Paso 3: /g/<slug>/admin (y sub-rutas) exigen sesión, igual que /admin en raíz.
  // El rol admin DEL GRUPO lo exige g/[slug]/admin/layout.tsx server-side.
  if (/^\/g\/[^/]+\/admin(?:\/|$)/.test(path)) {
    return payload ? 'allow' : 'redirect-login';
  }
```

- [ ] **Step 4: Pasa** — `npx vitest run src/lib/auth/authorize.test.ts` → PASS.

- [ ] **Step 5: Matcher del proxy** — en `src/proxy.ts`, ampliar `config.matcher` a:

```ts
export const config = {
  matcher: ['/admin/:path*', '/me/:path*', '/g/:slug', '/g/:slug/me/:path*', '/g/:slug/admin/:path*'],
};
```

(El bloque `slugMatch` (`^\/g\/([^/]+)$`) solo casa un segmento, así que `/g/<slug>/admin*` cae al `verifySession`+`decideAccess`, que ahora lo gatea.)

- [ ] **Step 6: Lint** — `npm run lint` → sin errores nuevos.

- [ ] **Step 7: Commit**
```bash
git add src/lib/auth/authorize.ts src/lib/auth/authorize.test.ts src/proxy.ts
git commit -m "feat(fase2): gating edge de /g/[slug]/admin (sesión requerida) (paridad Paso 3)"
```

---

## Task 2: Botones de borrado con grupo explícito (`?g=`)

**Files:**
- Modify: `src/app/admin/players/delete-player-button.tsx`
- Modify: `src/app/admin/matches/delete-match-button.tsx`

La API DELETE de players/matches ya es group-aware por `?g=<slug>` (B1/B2) con fallback a la única membership. Bajo `/g/[slug]` el grupo debe ir **explícito** (un admin con varias memberships no puede depender del fallback). En raíz no se pasa `g` → fetch idéntico al actual.

- [ ] **Step 1: `DeletePlayerButton`** — en `src/app/admin/players/delete-player-button.tsx`, cambiar la firma y el fetch:

```tsx
export function DeletePlayerButton({ id, name, g }: { id: string; name: string; g?: string }) {
```

y dentro de `handleDelete()`:

```tsx
    const res = await fetch(`/api/players/${id}${g ? `?g=${encodeURIComponent(g)}` : ''}`, { method: 'DELETE' });
```

(El resto del componente, sin cambios.)

- [ ] **Step 2: `DeleteMatchButton`** — en `src/app/admin/matches/delete-match-button.tsx`, ídem:

```tsx
export function DeleteMatchButton({ id, g }: { id: string; g?: string }) {
```

```tsx
    const res = await fetch(`/api/matches/${id}${g ? `?g=${encodeURIComponent(g)}` : ''}`, { method: 'DELETE' });
```

- [ ] **Step 3: Lint** — `npm run lint` → sin errores nuevos.

- [ ] **Step 4: Commit**
```bash
git add src/app/admin/players/delete-player-button.tsx src/app/admin/matches/delete-match-button.tsx
git commit -m "feat(fase2): botones de borrado admin aceptan grupo explícito ?g= (paridad Paso 3)"
```

---

## Task 3: `AdminSidebar` group-aware (`basePath` + solo enlaces MVP bajo grupo)

**Files:**
- Modify: `src/components/admin/admin-sidebar.tsx`

- [ ] **Step 1: Implementar** — reemplazar `src/components/admin/admin-sidebar.tsx` ENTERAMENTE por:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Swords, Bell, Gift, Ticket, Coins, Trophy, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const adminLinks: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/players', label: 'Jugadores', icon: Users },
  { href: '/admin/matches', label: 'Partidos', icon: Swords },
  { href: '/admin/pozos', label: 'Pozos', icon: Trophy },
  { href: '/admin/torneos', label: 'Torneos', icon: Trophy },
  { href: '/admin/notifications', label: 'Avisos', icon: Bell },
  { href: '/admin/rewards', label: 'Premios', icon: Gift },
  { href: '/admin/redemptions', label: 'Canjes', icon: Ticket },
  { href: '/admin/timba', label: 'La Timba', icon: Coins },
];

// Bajo /g/[slug] solo existen las páginas MVP de la paridad (dashboard/players/matches);
// el resto de secciones se omite para no enlazar 404s. En raíz se muestra todo.
const GROUP_MVP_LINKS = new Set(['/admin', '/admin/players', '/admin/matches']);

function isActive(href: string, pathname: string) {
  return href.endsWith('/admin') ? pathname === href : pathname.startsWith(href);
}

export function AdminSidebar({ basePath = '' }: { basePath?: string }) {
  const pathname = usePathname();
  const links = basePath ? adminLinks.filter((l) => GROUP_MVP_LINKS.has(l.href)) : adminLinks;
  return (
    <aside className="md:w-48 md:shrink-0">
      <nav className="flex md:flex-col gap-1.5 overflow-x-auto md:overflow-visible -mx-4 px-4 md:mx-0 md:px-0 pb-1 md:pb-0">
        {links.map((link) => {
          const Icon = link.icon;
          const href = `${basePath}${link.href}`;
          const active = isActive(href, pathname);
          return (
            <Link
              key={link.href}
              href={href}
              className={cn(
                'nav-tab whitespace-nowrap shrink-0 md:shrink min-h-[40px]',
                active ? 'active' : 'bg-surface md:bg-transparent border border-line md:border-transparent'
              )}
            >
              <Icon size={15} strokeWidth={2.2} /> {link.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
```

(En raíz `basePath=''` → mismos hrefs y mismo activo que hoy: `isActive('/admin', p)` sigue siendo exacto porque `'/admin'.endsWith('/admin')`.)

- [ ] **Step 2: Lint** — `npm run lint` → sin errores nuevos.

- [ ] **Step 3: Commit**
```bash
git add src/components/admin/admin-sidebar.tsx
git commit -m "feat(fase2): AdminSidebar group-aware (basePath + solo MVP bajo grupo) (paridad Paso 3)"
```

---

## Task 4: `AdminDashboardBody` + `/admin` raíz lo renderiza (Lomeros idéntico)

**Files:**
- Create: `src/components/pages/admin-dashboard-body.tsx`
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Crear el body** — Create `src/components/pages/admin-dashboard-body.tsx`:

```tsx
import Link from 'next/link';
import { countPlayersInGroup } from '@/lib/players/queries';
import { countMatchesInGroup } from '@/lib/matches/queries';
import { UserPlus, Swords, Users, Bell, BarChart3, ChevronRight } from 'lucide-react';
import type { PageContext } from '@/lib/auth/page-context';

// Cuerpo compartido de /admin (raíz) y /g/[slug]/admin. El gating de rol lo hace el
// layout correspondiente (session.role en raíz; ctx.role del grupo bajo /g/[slug]).
// Bajo grupo se omiten las acciones/enlaces a sub-rutas diferidas del MVP
// (players/new, matches/new, notifications) para no enlazar 404s.
export async function AdminDashboardBody({ ctx }: { ctx: PageContext }) {
  const { groupId, basePath } = ctx;
  const isRoot = basePath === '';
  const [playerCount, matchCount] = await Promise.all([
    countPlayersInGroup(groupId),
    countMatchesInGroup(groupId),
  ]);

  const quickLinks = [
    { href: `${basePath}/admin/players`, icon: Users, label: 'Jugadores', desc: 'Gestionar el equipo y autorizar cuentas' },
    { href: `${basePath}/admin/matches`, icon: Swords, label: 'Partidos', desc: 'Ver, programar o registrar resultados' },
    { href: basePath || '/', icon: BarChart3, label: 'Dashboard público', desc: 'Rankings y estadísticas del tour' },
    ...(isRoot
      ? [{ href: '/admin/notifications', icon: Bell, label: 'Notificaciones', desc: 'Enviar avisos y ver quién las tiene activadas' }]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">Administración</h1>
        <p className="muted text-sm mt-1.5">Gestiona jugadores y partidos</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {([
          [playerCount, 'Jugadores'],
          [matchCount, 'Partidos jugados'],
        ] as [number, string][]).map(([n, label]) => (
          <div key={label} className="lpt-card card-pad">
            <div className="kicker">{label}</div>
            <div className="display num" style={{ fontSize: 'clamp(28px, 6vw, 38px)', marginTop: 6 }}>{n}</div>
          </div>
        ))}
      </div>

      {isRoot && (
        <div className="flex flex-wrap gap-2.5">
          <Link href="/admin/players/new" className="lpt-btn primary">
            <UserPlus size={15} /> Añadir jugador
          </Link>
          <Link href="/admin/matches/new" className="lpt-btn">
            <Swords size={15} /> Registrar partido
          </Link>
        </div>
      )}

      <div className="lpt-card">
        {quickLinks.map((q) => {
          const Icon = q.icon;
          return (
            <Link key={q.href} href={q.href} className="feed-row items-center" style={{ padding: 'calc(13px * var(--sp)) calc(16px * var(--sp))' }}>
              <span className="feed-ico"><Icon size={16} /></span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-sm">{q.label}</span>
                <span className="block small muted">{q.desc}</span>
              </span>
              <ChevronRight size={16} className="muted shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Página raíz** — reemplazar `src/app/admin/page.tsx` ENTERAMENTE por:

```tsx
import { resolvePageContext } from '@/lib/auth/page-context';
import { AdminDashboardBody } from '@/components/pages/admin-dashboard-body';

export const dynamic = 'force-dynamic';

// /admin de raíz: contexto = grupo por defecto. Cuerpo compartido con /g/[slug]/admin.
export default async function AdminDashboard() {
  const ctx = await resolvePageContext();
  return <AdminDashboardBody ctx={ctx} />;
}
```

- [ ] **Step 3: Lint** — `npm run lint` → sin errores nuevos.

- [ ] **Step 4: Commit**
```bash
git add src/components/pages/admin-dashboard-body.tsx src/app/admin/page.tsx
git commit -m "feat(fase2): AdminDashboardBody compartido + /admin raíz lo renderiza (paridad Paso 3)"
```

---

## Task 5: `AdminPlayersBody` + `/admin/players` raíz lo renderiza (Lomeros idéntico)

**Files:**
- Create: `src/components/pages/admin-players-body.tsx`
- Modify: `src/app/admin/players/page.tsx`

- [ ] **Step 1: Crear el body** — Create `src/components/pages/admin-players-body.tsx`:

```tsx
import { listPlayersByElo } from '@/lib/players/queries';
import Link from 'next/link';
import { Pencil, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { DeletePlayerButton } from '@/app/admin/players/delete-player-button';
import type { PageContext } from '@/lib/auth/page-context';

// Cuerpo compartido de /admin/players (raíz) y /g/[slug]/admin/players.
// Bajo grupo: alta/edición ocultas (sub-rutas diferidas del MVP); el borrado
// funciona vía API group-aware con ?g= explícito.
export async function AdminPlayersBody({ ctx }: { ctx: PageContext }) {
  const { groupId, basePath } = ctx;
  const isRoot = basePath === '';
  const gSlug = isRoot ? undefined : ctx.group.slug;
  const allPlayers = await listPlayersByElo(groupId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="sec-title">Jugadores</h1>
          <p className="muted text-sm mt-1.5">{allPlayers.length} jugador{allPlayers.length !== 1 ? 'es' : ''} registrado{allPlayers.length !== 1 ? 's' : ''}</p>
        </div>
        {isRoot && (
          <Link href="/admin/players/new" className="lpt-btn primary shrink-0" style={{ minHeight: 38, padding: '7px 13px', fontSize: 12.5 }}>
            <UserPlus size={15} /> Nuevo
          </Link>
        )}
      </div>

      {allPlayers.length === 0 ? (
        <div className="text-center py-12 text-ink-3">
          <p className="text-4xl mb-2">👤</p>
          <p>No hay jugadores todavía.</p>
          {isRoot && (
            <Link href="/admin/players/new">
              <Button className="mt-4">Añadir el primero</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Jugador</TableHead>
                <TableHead className="text-center">ELO</TableHead>
                <TableHead className="text-center hidden sm:table-cell">P</TableHead>
                <TableHead className="text-center hidden sm:table-cell">W</TableHead>
                <TableHead className="text-center hidden sm:table-cell">L</TableHead>
                <TableHead className="text-center hidden sm:table-cell">Win%</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allPlayers.map((player) => {
                const winRate = player.matchesPlayed > 0
                  ? Math.round((player.wins / player.matchesPlayed) * 100)
                  : 0;
                return (
                  <TableRow key={player.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{player.name}</p>
                        {player.nickname && (
                          <p className="text-xs text-ink-3">{player.nickname}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">{Math.round(player.eloRating)}</Badge>
                    </TableCell>
                    <TableCell className="text-center text-sm hidden sm:table-cell">{player.matchesPlayed}</TableCell>
                    <TableCell className="text-center text-sm text-win font-medium hidden sm:table-cell">{player.wins}</TableCell>
                    <TableCell className="text-center text-sm text-loss font-medium hidden sm:table-cell">{player.losses}</TableCell>
                    <TableCell className="text-center text-sm hidden sm:table-cell">{winRate}%</TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        {isRoot && (
                          <Link href={`/admin/players/${player.id}/edit`} aria-label={`Editar a ${player.name}`}>
                            <Button variant="ghost" size="sm"><Pencil size={16} /></Button>
                          </Link>
                        )}
                        <DeletePlayerButton id={player.id} name={player.name} g={gSlug} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Página raíz** — reemplazar `src/app/admin/players/page.tsx` ENTERAMENTE por:

```tsx
import { resolvePageContext } from '@/lib/auth/page-context';
import { AdminPlayersBody } from '@/components/pages/admin-players-body';

export const dynamic = 'force-dynamic';

// /admin/players de raíz: contexto = grupo por defecto. Cuerpo compartido con /g/[slug]/admin/players.
export default async function PlayersAdminPage() {
  const ctx = await resolvePageContext();
  return <AdminPlayersBody ctx={ctx} />;
}
```

- [ ] **Step 3: Lint** — `npm run lint` → sin errores nuevos.

- [ ] **Step 4: Regresión raíz dirigida** — `npx playwright test e2e/1c-roles-memberships.spec.ts` → PASS (cubre `/admin/players` de raíz en UI).

- [ ] **Step 5: Commit**
```bash
git add src/components/pages/admin-players-body.tsx src/app/admin/players/page.tsx
git commit -m "feat(fase2): AdminPlayersBody compartido + /admin/players raíz lo renderiza (paridad Paso 3)"
```

---

## Task 6: `AdminMatchesBody` + `/admin/matches` raíz lo renderiza (Lomeros idéntico)

**Files:**
- Create: `src/components/pages/admin-matches-body.tsx`
- Modify: `src/app/admin/matches/page.tsx`

- [ ] **Step 1: Crear el body** — Create `src/components/pages/admin-matches-body.tsx`:

```tsx
import { listMatchesByDate, listMatchSetsInGroup } from '@/lib/matches/queries';
import { listAllPlayersInGroup } from '@/lib/players/queries';
import Link from 'next/link';
import { Calendar, MapPin, Plus, RectangleVertical, ClipboardPen } from 'lucide-react';
import { ScoreGrid, StatusPill, formatMatchDate } from '@/components/lpt/ui';
import { DeleteMatchButton } from '@/app/admin/matches/delete-match-button';
import type { PageContext } from '@/lib/auth/page-context';

const smallBtn = { minHeight: 38, padding: '7px 13px', fontSize: 12.5 } as const;

// Cuerpo compartido de /admin/matches (raíz) y /g/[slug]/admin/matches.
// Bajo grupo: nuevo/resultado/lados ocultos (sub-rutas diferidas del MVP);
// el borrado funciona vía API group-aware con ?g= explícito.
export async function AdminMatchesBody({ ctx }: { ctx: PageContext }) {
  const { groupId, basePath } = ctx;
  const isRoot = basePath === '';
  const gSlug = isRoot ? undefined : ctx.group.slug;
  const allMatches = await listMatchesByDate(groupId);
  const allSets = await listMatchSetsInGroup(groupId);
  const allPlayers = await listAllPlayersInGroup(groupId);

  const playerMap = Object.fromEntries(allPlayers.map((p) => [p.id, p]));
  const setsMap: Record<string, typeof allSets> = {};
  for (const set of allSets) {
    if (!setsMap[set.matchId]) setsMap[set.matchId] = [];
    setsMap[set.matchId].push(set);
    setsMap[set.matchId].sort((a, b) => a.setNumber - b.setNumber);
  }

  const scheduled = allMatches.filter((m) => m.status === 'scheduled');
  const completed = allMatches.filter((m) => m.status === 'completed' || m.status === 'injury_aborted');

  const meta = (match: (typeof allMatches)[number]) => (
    <div className="flex items-center gap-3 flex-wrap small muted" style={{ fontWeight: 600 }}>
      <span className="inline-flex items-center gap-1.5"><Calendar size={12} /> {formatMatchDate(match.date)}</span>
      {match.location && <span className="inline-flex items-center gap-1.5"><MapPin size={12} /> {match.location}</span>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="sec-title">Partidos</h1>
          <p className="muted text-sm mt-1.5">
            {scheduled.length > 0 && <span style={{ color: 'var(--acc-text)', fontWeight: 600 }}>{scheduled.length} pendiente{scheduled.length !== 1 ? 's' : ''} · </span>}
            {completed.length} completado{completed.length !== 1 ? 's' : ''}
          </p>
        </div>
        {isRoot && (
          <Link href="/admin/matches/new" className="lpt-btn primary shrink-0" style={smallBtn}>
            <Plus size={15} /> Partido
          </Link>
        )}
      </div>

      {allMatches.length === 0 ? (
        <div className="text-center py-12 muted">
          <p className="text-4xl mb-2">🎾</p>
          <p>No hay partidos todavía.</p>
          {isRoot && (
            <Link href="/admin/matches/new" className="lpt-btn primary mt-4 inline-flex">Registrar el primero</Link>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Programados */}
          {scheduled.length > 0 && (
            <div className="space-y-3">
              <p className="kicker">Próximos partidos</p>
              {scheduled.map((match) => {
                const t1 = [playerMap[match.team1Player1Id], playerMap[match.team1Player2Id]];
                const t2 = [playerMap[match.team2Player1Id], playerMap[match.team2Player2Id]];
                return (
                  <div key={match.id} className="lpt-card card-pad" style={{ borderColor: 'color-mix(in oklab, var(--acc) 35%, var(--line))' }}>
                    <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                      {meta(match)}
                      <StatusPill status="scheduled" />
                    </div>
                    <ScoreGrid team1={t1} team2={t2} sets={[]} compact />
                    <div className="flex items-center justify-end gap-2 flex-wrap mt-3 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
                      {isRoot && (
                        <>
                          <Link href={`/admin/matches/${match.id}/result`} className="lpt-btn primary" style={smallBtn}>
                            <ClipboardPen size={14} /> Resultado
                          </Link>
                          <Link href={`/admin/matches/${match.id}/sides`} className="lpt-btn" style={smallBtn}>
                            <RectangleVertical size={14} /> Lados
                          </Link>
                        </>
                      )}
                      <DeleteMatchButton id={match.id} g={gSlug} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Completados */}
          {completed.length > 0 && (
            <div className="space-y-3">
              {scheduled.length > 0 && <p className="kicker">Partidos completados</p>}
              {completed.map((match) => {
                const sets = (setsMap[match.id] || []).map((s) => ({ team1Games: s.team1Games, team2Games: s.team2Games }));
                const t1 = [playerMap[match.team1Player1Id], playerMap[match.team1Player2Id]];
                const t2 = [playerMap[match.team2Player1Id], playerMap[match.team2Player2Id]];
                const isInjury = match.status === 'injury_aborted';
                return (
                  <div key={match.id} className="lpt-card card-pad" style={isInjury ? { borderColor: 'color-mix(in oklab, var(--loss) 35%, var(--line))' } : undefined}>
                    <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                      {meta(match)}
                      <div className="flex items-center gap-2">
                        {isInjury && <StatusPill status="injury_aborted" />}
                        {isRoot && (
                          <Link href={`/admin/matches/${match.id}/sides`} className="lpt-btn" style={smallBtn}>
                            <RectangleVertical size={14} /> Lados
                          </Link>
                        )}
                        <DeleteMatchButton id={match.id} g={gSlug} />
                      </div>
                    </div>
                    <ScoreGrid
                      team1={t1}
                      team2={t2}
                      sets={sets}
                      winnerTeam={isInjury ? null : match.winnerTeam}
                      injuredPlayerId={match.injuredPlayerId}
                      compact
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Página raíz** — reemplazar `src/app/admin/matches/page.tsx` ENTERAMENTE por:

```tsx
import { resolvePageContext } from '@/lib/auth/page-context';
import { AdminMatchesBody } from '@/components/pages/admin-matches-body';

export const dynamic = 'force-dynamic';

// /admin/matches de raíz: contexto = grupo por defecto. Cuerpo compartido con /g/[slug]/admin/matches.
export default async function MatchesAdminPage() {
  const ctx = await resolvePageContext();
  return <AdminMatchesBody ctx={ctx} />;
}
```

- [ ] **Step 3: Lint** — `npm run lint` → sin errores nuevos.

- [ ] **Step 4: Commit**
```bash
git add src/components/pages/admin-matches-body.tsx src/app/admin/matches/page.tsx
git commit -m "feat(fase2): AdminMatchesBody compartido + /admin/matches raíz lo renderiza (paridad Paso 3)"
```

---

## Task 7: `/g/[slug]/admin*` (layout con gate de rol por grupo + 3 páginas) + e2e (TDD)

**Files:**
- Create: `e2e/group-admin.spec.ts`
- Create: `src/app/g/[slug]/admin/layout.tsx`
- Create: `src/app/g/[slug]/admin/page.tsx`
- Create: `src/app/g/[slug]/admin/players/page.tsx`
- Create: `src/app/g/[slug]/admin/matches/page.tsx`

- [ ] **Step 1: e2e que falla** — Create `e2e/group-admin.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

// Nota de estado compartido: players-scoping.spec.ts crea 'Nuevo GT' en grupo-test;
// aquí se usa 'Alta Paso3 GT' para no chocar. gt-match1 (scheduled) nunca se muta
// (los intentos cross-grupo de otros specs se rechazan con 403/404).

test.describe('paridad · /g/[slug]/admin · admin del grupo (gt-admin)', () => {
  test.use({ storageState: 'e2e/.auth/gt-admin.json' });

  test('dashboard 200 con contadores; sin acciones a sub-rutas diferidas', async ({ page }) => {
    const res = await page.goto('/g/grupo-test/admin');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Administración' })).toBeVisible();
    await expect(page.getByText('Partidos jugados', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /Añadir jugador|Registrar partido|Notificaciones/ })).toHaveCount(0);
  });

  test('players lista jugadores del grupo, no de Lomeros; sin alta/edición', async ({ page }) => {
    await page.goto('/g/grupo-test/admin/players');
    await expect(page.getByText('Jugador GT', { exact: true })).toBeVisible();
    await expect(page.getByText('Jugador 1', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Nuevo' })).toHaveCount(0);
    await expect(page.getByLabel(/^Editar a /)).toHaveCount(0);
  });

  test('crear jugador vía API (body.g) y verlo en la lista', async ({ page, request }) => {
    const res = await request.post('/api/players', { data: { g: 'grupo-test', name: 'Alta Paso3 GT' } });
    expect(res.ok()).toBeTruthy();
    await page.goto('/g/grupo-test/admin/players');
    await expect(page.getByText('Alta Paso3 GT', { exact: true })).toBeVisible();
  });

  test('matches lista el partido del grupo; sin nuevo/resultado/lados', async ({ page }) => {
    await page.goto('/g/grupo-test/admin/matches');
    await expect(page.getByRole('heading', { name: 'Partidos', exact: true })).toBeVisible();
    await expect(page.getByText('Jugador GT', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /^(Partido|Resultado|Lados)$/ })).toHaveCount(0);
  });
});

test.describe('paridad · /g/[slug]/admin · gating de rol por grupo', () => {
  test.describe('admin de Lomeros (ajeno al grupo)', () => {
    test.use({ storageState: 'e2e/.auth/admin.json' });
    test('redirige a /g/grupo-test/me', async ({ page }) => {
      await page.goto('/g/grupo-test/admin');
      await expect(page).toHaveURL(/\/g\/grupo-test\/me$/);
    });
  });

  test.describe('jugador del grupo (no admin)', () => {
    test.use({ storageState: 'e2e/.auth/gt-player.json' });
    test('redirige a /g/grupo-test/me', async ({ page }) => {
      await page.goto('/g/grupo-test/admin/players');
      await expect(page).toHaveURL(/\/g\/grupo-test\/me$/);
    });
  });

  test.describe('sin sesión', () => {
    test('redirige a /login', async ({ page }) => {
      await page.goto('/g/grupo-test/admin');
      await expect(page).toHaveURL(/\/login/);
    });
  });
});
```

- [ ] **Step 2: Falla** — `npx playwright test e2e/group-admin.spec.ts` → FAIL (la ruta `/g/grupo-test/admin` aún no existe → 404).

- [ ] **Step 3: Layout con gate de rol por grupo** — Create `src/app/g/[slug]/admin/layout.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { resolvePageContext } from '@/lib/auth/page-context';

export const dynamic = 'force-dynamic';

// Chrome + gate del admin DE GRUPO: exige rol admin EN el grupo de la URL (ctx.role,
// no session.role). El edge ya exigió sesión (decideAccess); aquí un logueado que no
// es admin de ese grupo (jugador, no-miembro, súper-admin hasta Tarea 3) va a su /me
// del grupo. Hereda navbar/container de g/[slug]/layout.tsx; añade el sidebar.
export default async function GroupAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await resolvePageContext(slug); // notFound() si el slug no existe
  if (ctx.role !== 'admin') redirect(`${ctx.basePath}/me`);

  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-8">
      <AdminSidebar basePath={ctx.basePath} />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
```

(Para `/g/lomeros/admin`, el layout padre `g/[slug]/layout.tsx` ya hace `permanentRedirect('/')` — la raíz es el canónico del grupo por defecto.)

- [ ] **Step 4: Las 3 páginas** — Create `src/app/g/[slug]/admin/page.tsx`:

```tsx
import { resolvePageContext } from '@/lib/auth/page-context';
import { AdminDashboardBody } from '@/components/pages/admin-dashboard-body';

export const dynamic = 'force-dynamic';

export default async function GroupAdminDashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await resolvePageContext(slug);
  return <AdminDashboardBody ctx={ctx} />;
}
```

Create `src/app/g/[slug]/admin/players/page.tsx`:

```tsx
import { resolvePageContext } from '@/lib/auth/page-context';
import { AdminPlayersBody } from '@/components/pages/admin-players-body';

export const dynamic = 'force-dynamic';

export default async function GroupAdminPlayersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await resolvePageContext(slug);
  return <AdminPlayersBody ctx={ctx} />;
}
```

Create `src/app/g/[slug]/admin/matches/page.tsx`:

```tsx
import { resolvePageContext } from '@/lib/auth/page-context';
import { AdminMatchesBody } from '@/components/pages/admin-matches-body';

export const dynamic = 'force-dynamic';

export default async function GroupAdminMatchesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await resolvePageContext(slug);
  return <AdminMatchesBody ctx={ctx} />;
}
```

- [ ] **Step 5: Pasa** — `npx playwright test e2e/group-admin.spec.ts` → PASS (7 tests).

- [ ] **Step 6: Lint** — `npm run lint` → sin errores nuevos.

- [ ] **Step 7: Commit**
```bash
git add "src/app/g/[slug]/admin" e2e/group-admin.spec.ts
git commit -m "feat(fase2): /g/[slug]/admin* (dashboard/players/matches + gating de rol por grupo) (paridad Paso 3)"
```

---

## Task 8: Regresión + no-rotura de Lomeros
- [ ] **Step 1:** `npm test` → PASS (incluye `authorize.test.ts` con la rama nueva).
- [ ] **Step 2:** `npm run e2e` → PASS (toda la suite existente + `group-admin.spec.ts`). El admin de Lomeros (raíz) renderiza idéntico: mismos enlaces (basePath=''), acciones de alta/edición/resultado visibles, sidebar completo.
- [ ] **Step 3:** `npm run check:db-access` → `✅`.
- [ ] **Step 4:** `git diff --name-status main` → `M` solo en `authorize.ts`, `authorize.test.ts`, `proxy.ts`, `delete-player-button.tsx`, `delete-match-button.tsx`, `admin-sidebar.tsx`, `admin/page.tsx`, `admin/players/page.tsx`, `admin/matches/page.tsx`; resto `A`. **NO** se modifican `admin/layout.tsx` (raíz), `g/[slug]/layout.tsx`, `getSession`, `resolvePageContext`, `Navbar`, ni nada de torneos/pozos.

---

## Self-Review (autor)
**Cobertura spec (Paso 3):** `AdminDashboardBody`+`AdminPlayersBody`+`AdminMatchesBody` (Tasks 4-6); `/admin*` raíz + `/g/[slug]/admin*` compartiendo cuerpos (Tasks 4-7); gating de rol por grupo de la URL = layout nuevo (Task 7); matcher de proxy + `decideAccess` (Task 1); chrome admin group-aware sin enlaces 404 (Task 3 + flags `isRoot` en bodies); e2e de admin propio/ajeno/jugador/sin-sesión + crear-vía-API-ver-en-UI (Task 7); Lomeros idéntico (Tasks 4-6 con `basePath=''` + Task 8). ✅
**Decisiones de alcance:** sub-rutas admin diferidas → acciones ocultas bajo grupo (alta/edición/resultado/lados/notificaciones solo en raíz); borrado sí (API ya group-aware, `?g=` explícito vía prop nueva en los botones); `super_admin` sin membership admin → redirect a `/me` del grupo (conmutador = Tarea 3); torneos/pozos fuera (modo test solo-Lomeros).
**Placeholders:** cada step con código/comando completo. Sin TBD.
**Consistencia:** `AdminXxxBody({ ctx }: { ctx: PageContext })` definidos en Tasks 4-6 y consumidos idéntico en Task 7; `DeletePlayerButton`/`DeleteMatchButton` con `g?: string` (Task 2) y llamados con `g={gSlug}` (Tasks 5-6); `AdminSidebar` con `basePath?: string` (Task 3) y llamado con `basePath={ctx.basePath}` (Task 7); nombre e2e `Alta Paso3 GT` no colisiona con `Nuevo GT` de `players-scoping.spec.ts`.

---

## Próximo paso
Con la paridad MVP completa (Pasos 1-3): retomar **Paso C** (limpieza del horneado de rol/ficha en `getSession` + aterrizaje grupo-hogar), **migrar torneos** (solo con OK explícito del usuario), y después Tarea 2 (onboarding) y Tarea 3 (conmutador de súper-admin).
