# Fase 1 · Paso 1B-3 — Scoping de La Timba + premios (bets/settle, penalties, rewards/redemptions)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scopear por `group_id` el camino de **escritura + API** de La Timba y los premios — apuestas (`api/bets`), entradas/penalizaciones (`api/timba/entry`), catálogo de premios (`api/rewards*`) y canjes (`api/redemptions*`) — de modo que ningún miembro del grupo A pueda ver ni tocar apuestas/penalizaciones/premios/canjes del grupo B, **sin cambiar nada visible para Lomeros** (un solo grupo → filtrar no cambia el resultado).

**Architecture:** El scoping se logra **validando el padre en-grupo** y reutilizando los DAL ya existentes (1B-1 `players/queries.ts`, 1B-2 `matches/queries.ts`): una apuesta solo se crea/cancela/lista si su **partido** está en el grupo (`getMatchInGroup`); una entrada solo se da si el **jugador** está en el grupo (`getPlayerInGroup`); un canje solo se hace si el **premio** está en el grupo (`getRewardInGroup`). `rewards` es tabla **raíz** con `group_id` (filtro directo); `bets`/`token_ledger`/`penalties`/`redemptions` son **hijas sin `group_id`** que se scopean vía su FK padre (match o player). Se añaden dos módulos DAL nuevos (`betting/queries.ts`, `rewards/queries.ts`) y las rutas dejan de tocar `db` directo para estas tablas tenant.

**Tech Stack:** Next.js (App Router) · Drizzle ORM · libSQL/Turso · Vitest · Playwright.

**Alcance:** El **dominio Timba + premios** completo a nivel de **API**: `api/bets/route.ts`, `api/timba/entry/route.ts`, `api/rewards/route.ts`, `api/rewards/[id]/route.ts`, `api/redemptions/route.ts`, `api/redemptions/[id]/route.ts`, más los DAL `lib/betting/queries.ts` y `lib/rewards/queries.ts`. **Fuera (a sus pasos):** los **server components / páginas de lectura** que pintan la Timba (`currentMatchPools`, perfil, ranking de tokens) → 1B-5; torneos → 1B-4; los guards/JWT no se tocan.

---

## Decisiones clave

1. **`settle.ts` y `bank.ts` NO reciben `groupId` y quedan intactos.** Operan exclusivamente sobre filas **hija** (`bets`, `token_ledger`, `penalties`) alcanzadas por FK desde un padre (`match`/`player`) que el **llamador ya verificó en-grupo**. Sus tablas no tienen `group_id` que filtrar, así que un parámetro `groupId` no añadiría filtro real, solo ruido — y tocar el motor arriesga su atomicidad/idempotencia. La cadena de seguridad es: las rutas validan el padre (match/reward/player) → todas las hijas alcanzadas son in-group. (El spec 1B-design los lista como "reciben groupId"; en la práctica el `matchId`/`playerId` ya es group-correcto una vez validado el padre, igual que 1B-2 dejó `settle` intacto. El backstop de grep de 1B-5 whitelisteará `lib/betting/**` como DAL del dominio.)
2. **El scoping de apuestas se hereda del partido.** `POST`/`DELETE /api/bets` cambian su lookup de partido (`db.select().from(matches)`) por `getMatchInGroup(groupId, matchId)` (DAL de 1B-2): si el partido no es del grupo del apostante → 404, no se crea/cancela apuesta. Como un jugador solo puede apostar a partidos de su grupo, **todas** las apuestas de un partido in-group son de jugadores in-group → `settleMatchBets`/`refundOpenBets`/`reverseSettlement` (que escanean `bets WHERE matchId`) quedan automáticamente in-group.
3. **`GET /api/bets?matchId` (público) se scopea al grupo por defecto.** Antes listaba apuestas por `matchId` sin mirar el partido; ahora verifica `getMatchInGroup(getDefaultGroupId(), matchId)` → 404 si el partido no es del grupo por defecto. Comportamiento idéntico para Lomeros (su partido sí está en el grupo por defecto).
4. **`rewards` es raíz con `group_id`:** `GET` lista por grupo, `POST` fija `groupId` del contexto, `PUT`/`DELETE` scopean por `(id, groupId)` → 404 si el premio es de otro grupo. **`redemptions` es hija:** se scopea vía `players.groupId` del que canjea; `POST` valida el premio in-group antes de canjear; `PUT [id]` valida el canje in-group (join a `players`).
5. **`penalties` (hija de `players`):** `api/timba/entry` valida el jugador in-group (`getPlayerInGroup`) y luego lee/cumple su penalización por `playerId` (transitivamente in-group). La creación de penalizaciones sigue en `detectBankruptcies` (`settle.ts`), que ya opera sobre jugadores in-group.
6. **Las escrituras transaccionales de `bets` se quedan en la ruta `POST /api/bets`.** El alta/baja de apuesta va dentro de `db.transaction` junto al cobro (`applyTokenMovementTx`) para no perder fichas si algo falla; ese `tx.insert/tx.delete(bets)` es código de **motor**, no se extrae al DAL (rompería la composición transaccional). Las **lecturas** de `bets` sí pasan al DAL.

---

## File Structure

**Crear:**
- `src/lib/betting/queries.ts` — lecturas de `bets` scopeadas por FK + helpers de `penalties`.
- `src/lib/rewards/queries.ts` — `rewards` (raíz, por `groupId`) + `redemptions` (hija, vía `players.groupId`).
- `e2e/no-fuga-timba.spec.ts` — aislamiento de apuestas + entradas/penalizaciones.
- `e2e/no-fuga-premios.spec.ts` — aislamiento de premios + canjes.

**Modificar:**
- `src/app/api/bets/route.ts` — cablear groupId vía partido (DAL de matches) + DAL de bets.
- `src/app/api/timba/entry/route.ts` — validar jugador in-group + helpers de penalties.
- `src/app/api/rewards/route.ts` — listar/crear por grupo.
- `src/app/api/rewards/[id]/route.ts` — editar/desactivar scopeado.
- `src/app/api/redemptions/route.ts` — listar(admin)/míos/canjear scopeado.
- `src/app/api/redemptions/[id]/route.ts` — resolver canje scopeado.
- `e2e/global-setup.ts` — crear tablas de Timba en la DB de test + sembrar estado del 2º grupo.

---

## Task 1: Módulos de consulta (betting + rewards/redemptions)

**Files:**
- Create: `src/lib/betting/queries.ts`
- Create: `src/lib/rewards/queries.ts`

- [ ] **Step 1: Crear `src/lib/betting/queries.ts`**

```ts
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bets, penalties, players, type Bet, type Penalty } from '@/lib/db/schema';

// Apuestas de un partido + datos del apostante (lista pública). El partido ya fue
// verificado en-grupo por el caller; las apuestas heredan el grupo por su FK matchId.
export async function getBetsWithBettorForMatch(matchId: string) {
  return db
    .select({
      id: bets.id, matchId: bets.matchId, playerId: bets.playerId,
      market: bets.market, predictedTeam: bets.predictedTeam,
      predictedScore: bets.predictedScore, amount: bets.amount,
      odds: bets.odds, status: bets.status, payout: bets.payout,
      createdAt: bets.createdAt,
      playerName: players.name, playerNickname: players.nickname,
      playerAvatarUrl: players.avatarUrl,
    })
    .from(bets)
    .innerJoin(players, eq(players.id, bets.playerId))
    .where(eq(bets.matchId, matchId))
    .orderBy(desc(bets.createdAt));
}

// Mis apuestas (el jugador es su propia ficha en su grupo).
export async function getMyBets(playerId: string): Promise<Bet[]> {
  return db.select().from(bets)
    .where(eq(bets.playerId, playerId))
    .orderBy(desc(bets.createdAt));
}

// La apuesta del jugador en un mercado de un partido (para sustituir/cancelar).
export async function getBetInMarket(
  matchId: string,
  playerId: string,
  market: string,
): Promise<Bet | undefined> {
  const [b] = await db.select().from(bets).where(and(
    eq(bets.matchId, matchId), eq(bets.playerId, playerId), eq(bets.market, market),
  ));
  return b;
}

// Borra una apuesta por id (cancelación; el cobro se devuelve aparte por el caller).
export async function deleteBet(id: string): Promise<void> {
  await db.delete(bets).where(eq(bets.id, id));
}

// Penalización pendiente del jugador (el jugador ya fue verificado en-grupo por el caller).
export async function getPendingPenalty(playerId: string): Promise<Penalty | undefined> {
  const [p] = await db.select().from(penalties)
    .where(and(eq(penalties.playerId, playerId), eq(penalties.status, 'pending')));
  return p;
}

// Marca una penalización como cumplida (al pagar la recompra).
export async function fulfillPenalty(penaltyId: string, at: string): Promise<void> {
  await db.update(penalties).set({ status: 'fulfilled', fulfilledAt: at }).where(eq(penalties.id, penaltyId));
}
```

- [ ] **Step 2: Crear `src/lib/rewards/queries.ts`**

```ts
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { rewards, redemptions, players, type Reward, type Redemption } from '@/lib/db/schema';

// ─── REWARDS (tabla raíz con group_id) ───────────────────────────────────────
export async function listRewardsInGroup(groupId: string): Promise<Reward[]> {
  return db.select().from(rewards)
    .where(eq(rewards.groupId, groupId))
    .orderBy(rewards.cost, desc(rewards.createdAt));
}

export async function getRewardInGroup(groupId: string, id: string): Promise<Reward | undefined> {
  const [r] = await db.select().from(rewards).where(and(eq(rewards.id, id), eq(rewards.groupId, groupId)));
  return r;
}

export async function createRewardInGroup(
  groupId: string,
  values: { title: string; description: string | null; cost: number },
): Promise<Reward> {
  const [r] = await db.insert(rewards).values({ ...values, groupId }).returning();
  return r;
}

export async function updateRewardInGroup(
  groupId: string,
  id: string,
  fields: Partial<{ title: string; description: string | null; cost: number; active: boolean }>,
): Promise<Reward | undefined> {
  const [r] = await db.update(rewards).set(fields)
    .where(and(eq(rewards.id, id), eq(rewards.groupId, groupId)))
    .returning();
  return r;
}

export async function deactivateRewardInGroup(groupId: string, id: string): Promise<Reward | undefined> {
  const [r] = await db.update(rewards).set({ active: false })
    .where(and(eq(rewards.id, id), eq(rewards.groupId, groupId)))
    .returning();
  return r;
}

// ─── REDEMPTIONS (hija; scopeada vía players.groupId del que canjea) ──────────
// Lista de admin: todos los canjes del grupo (vía el jugador que canjeó).
export async function listRedemptionsAllInGroup(groupId: string) {
  return db
    .select({
      id: redemptions.id, playerId: redemptions.playerId, cost: redemptions.cost,
      status: redemptions.status, requestedAt: redemptions.requestedAt,
      rewardTitle: rewards.title, playerName: players.name, playerNickname: players.nickname,
    })
    .from(redemptions)
    .innerJoin(rewards, eq(rewards.id, redemptions.rewardId))
    .innerJoin(players, eq(players.id, redemptions.playerId))
    .where(eq(players.groupId, groupId))
    .orderBy(desc(redemptions.requestedAt));
}

// Mis canjes (el jugador es su propia ficha en su grupo).
export async function getMyRedemptions(playerId: string) {
  return db
    .select({
      id: redemptions.id, cost: redemptions.cost, status: redemptions.status,
      requestedAt: redemptions.requestedAt, rewardTitle: rewards.title,
    })
    .from(redemptions)
    .innerJoin(rewards, eq(rewards.id, redemptions.rewardId))
    .where(eq(redemptions.playerId, playerId))
    .orderBy(desc(redemptions.requestedAt));
}

// Un canje del grupo (vía players.groupId), para resolverlo (fulfill/cancel).
export async function getRedemptionInGroup(groupId: string, id: string): Promise<Redemption | undefined> {
  const [r] = await db
    .select({
      id: redemptions.id, playerId: redemptions.playerId, rewardId: redemptions.rewardId,
      cost: redemptions.cost, status: redemptions.status,
      requestedAt: redemptions.requestedAt, resolvedAt: redemptions.resolvedAt,
    })
    .from(redemptions)
    .innerJoin(players, eq(players.id, redemptions.playerId))
    .where(and(eq(redemptions.id, id), eq(players.groupId, groupId)));
  return r;
}

export async function insertRedemption(playerId: string, rewardId: string, cost: number): Promise<Redemption> {
  const [r] = await db.insert(redemptions).values({ playerId, rewardId, cost }).returning();
  return r;
}

export async function deleteRedemption(id: string): Promise<void> {
  await db.delete(redemptions).where(eq(redemptions.id, id));
}

export async function updateRedemptionStatus(
  id: string,
  status: string,
  at: string,
): Promise<Redemption | undefined> {
  const [r] = await db.update(redemptions).set({ status, resolvedAt: at }).where(eq(redemptions.id, id)).returning();
  return r;
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/lib/betting/queries.ts src/lib/rewards/queries.ts
git commit -m "feat(multitenant): DAL de betting (lecturas+penalties) y rewards/redemptions (1B-3)"
```

---

## Task 2: Rutas de Timba (apuestas + entradas)

**Files:**
- Modify: `src/app/api/bets/route.ts`
- Modify: `src/app/api/timba/entry/route.ts`

- [ ] **Step 1: `src/app/api/bets/route.ts`**

Reemplazar el contenido completo por:

```ts
// src/app/api/bets/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bets } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/guard';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { getMatchInGroup } from '@/lib/matches/queries';
import { getBetsWithBettorForMatch, getMyBets, getBetInMarket, deleteBet } from '@/lib/betting/queries';
import { BETTING } from '@/lib/betting/config';
import { isBettingOpen } from '@/lib/betting/close-time';
import { applyTokenMovement, applyTokenMovementTx } from '@/lib/betting/bank';
import { hasPendingPenalty } from '@/lib/betting/settle';

// GET /api/bets?matchId=… → apuestas (públicas) de un partido del grupo por defecto
// GET /api/bets?mine=1   → mis apuestas (requiere sesión)
export async function GET(request: NextRequest) {
  try {
    const matchId = request.nextUrl.searchParams.get('matchId');
    const mine = request.nextUrl.searchParams.get('mine');

    if (matchId) {
      // El partido debe ser del grupo por defecto; si no, no se exponen sus apuestas.
      const groupId = await getDefaultGroupId();
      const match = await getMatchInGroup(groupId, matchId);
      if (!match) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
      const rows = await getBetsWithBettorForMatch(matchId);
      return NextResponse.json(rows);
    }

    if (mine) {
      const auth = await requireSession();
      if ('response' in auth) return auth.response;
      if (!auth.session.player) return NextResponse.json([]);
      const rows = await getMyBets(auth.session.player.id);
      return NextResponse.json(rows);
    }

    return NextResponse.json({ error: 'Falta matchId o mine' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Error al obtener apuestas' }, { status: 500 });
  }
}

// POST /api/bets
// Body: { matchId, market: 'winner'|'exact_score', predictedTeam: 1|2,
//         predictedScore?: '2-0'|'2-1', amount }
// Pari-mutuel: solo se registra la selección + cantidad (sin cuota congelada).
export async function POST(request: NextRequest) {
  const auth = await requireSession();
  if ('response' in auth) return auth.response;
  const player = auth.session.player;
  if (!player) {
    return NextResponse.json({ error: 'Tu cuenta no está vinculada a un jugador' }, { status: 403 });
  }
  try {
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    const body = await request.json();
    const { matchId, market, predictedTeam, predictedScore, amount } = body;

    if (market !== 'winner' && market !== 'exact_score') {
      return NextResponse.json({ error: 'Mercado inválido' }, { status: 400 });
    }
    if (predictedTeam !== 1 && predictedTeam !== 2) {
      return NextResponse.json({ error: 'Equipo inválido' }, { status: 400 });
    }
    if (market === 'exact_score' && predictedScore !== '2-0' && predictedScore !== '2-1') {
      return NextResponse.json({ error: 'Marcador inválido' }, { status: 400 });
    }
    if (!Number.isInteger(amount) || amount < BETTING.minBet || amount > BETTING.maxBet) {
      return NextResponse.json(
        { error: `La apuesta debe estar entre ${BETTING.minBet} y ${BETTING.maxBet} tokens` },
        { status: 400 },
      );
    }

    // El partido debe ser del grupo del apostante (no se apuesta a partidos de otro grupo).
    const match = await getMatchInGroup(groupId, matchId);
    if (!match) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
    if (!isBettingOpen(match)) {
      return NextResponse.json({ error: 'Las apuestas de este partido están cerradas' }, { status: 400 });
    }

    // Auto-apuesta: si el jugador juega el partido, solo «ganador» a su pareja.
    const inTeam1 = [match.team1Player1Id, match.team1Player2Id].includes(player.id);
    const inTeam2 = [match.team2Player1Id, match.team2Player2Id].includes(player.id);
    if (inTeam1 || inTeam2) {
      const ownTeam = inTeam1 ? 1 : 2;
      if (market !== 'winner' || predictedTeam !== ownTeam) {
        return NextResponse.json(
          { error: 'Si juegas el partido solo puedes apostar a tu propia victoria (mercado ganador)' },
          { status: 403 },
        );
      }
    }

    if (await hasPendingPenalty(player.id)) {
      return NextResponse.json(
        { error: 'Estás en bancarrota: cumple tu penalización para volver a apostar' },
        { status: 403 },
      );
    }

    // Apuesta previa abierta en este mercado (si la hay): se sustituye.
    const previous = await getBetInMarket(matchId, player.id, market);
    if (previous && previous.status !== 'open') {
      return NextResponse.json({ error: 'Esa apuesta ya está liquidada' }, { status: 400 });
    }

    // Sustituir-previa + cobro + alta de la apuesta van en UNA sola transacción.
    // Si el insert falla por lo que sea, el rollback deshace el cobro: nunca se
    // descuentan fichas sin que quede registrada la apuesta.
    const { bet, balance } = await db.transaction(async (tx) => {
      if (previous) {
        await applyTokenMovementTx(tx, player.id, previous.amount, 'bet_cancelled', previous.id);
        await tx.delete(bets).where(eq(bets.id, previous.id));
      }
      const balance = await applyTokenMovementTx(tx, player.id, -amount, 'bet_placed');
      const [bet] = await tx.insert(bets).values({
        matchId,
        playerId: player.id,
        market,
        predictedTeam,
        predictedScore: market === 'exact_score' ? predictedScore : null,
        amount,
      }).returning();
      return { bet, balance };
    });

    return NextResponse.json({ bet, balance }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // El cobro y el alta van en la misma transacción, así que cualquier fallo
    // deja el saldo intacto (rollback). Solo hay que mapear el error a respuesta.
    if (msg.includes('SALDO_INSUFICIENTE')) {
      return NextResponse.json({ error: 'No tienes saldo suficiente' }, { status: 400 });
    }
    if (msg.includes('UNIQUE')) {
      return NextResponse.json({ error: 'Apuesta duplicada; inténtalo de nuevo' }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ error: 'Error al apostar' }, { status: 500 });
  }
}

// DELETE /api/bets?matchId=…&market=… — cancela mi apuesta abierta
export async function DELETE(request: NextRequest) {
  const auth = await requireSession();
  if ('response' in auth) return auth.response;
  const player = auth.session.player;
  if (!player) return NextResponse.json({ error: 'Sin jugador vinculado' }, { status: 403 });
  try {
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    const matchId = request.nextUrl.searchParams.get('matchId');
    const market = request.nextUrl.searchParams.get('market');
    if (!matchId || (market !== 'winner' && market !== 'exact_score')) {
      return NextResponse.json({ error: 'Falta matchId o market válido' }, { status: 400 });
    }

    const match = await getMatchInGroup(groupId, matchId);
    if (!match) return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
    if (!isBettingOpen(match)) {
      return NextResponse.json({ error: 'Las apuestas ya están cerradas' }, { status: 400 });
    }

    const bet = await getBetInMarket(matchId, player.id, market);
    if (!bet || bet.status !== 'open') {
      return NextResponse.json({ error: 'No tienes apuesta abierta en ese mercado' }, { status: 404 });
    }

    await applyTokenMovement(player.id, bet.amount, 'bet_cancelled', bet.id);
    await deleteBet(bet.id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Error al cancelar la apuesta' }, { status: 500 });
  }
}
```

- [ ] **Step 2: `src/app/api/timba/entry/route.ts`**

Reemplazar el contenido completo por:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { getPlayerInGroup } from '@/lib/players/queries';
import { getPendingPenalty, fulfillPenalty } from '@/lib/betting/queries';
import { applyTokenMovement } from '@/lib/betting/bank';
import { BETTING } from '@/lib/betting/config';

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// POST /api/timba/entry — admin registra que un jugador pagó la entrada (5 €).
// Body: { playerId }. Si tiene penalización pendiente → recompra (rebuy) y la
// marca cumplida; si no → entrada (buyin). En ambos casos +500 fichas.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    const { playerId } = await request.json();
    const player = await getPlayerInGroup(groupId, playerId);
    if (!player) return NextResponse.json({ error: 'Jugador no encontrado' }, { status: 404 });

    const pending = await getPendingPenalty(playerId);

    if (pending) {
      await applyTokenMovement(playerId, BETTING.buyInTokens, 'rebuy', pending.id);
      await fulfillPenalty(pending.id, now());
    } else {
      await applyTokenMovement(playerId, BETTING.buyInTokens, 'buyin');
    }

    const updated = await getPlayerInGroup(groupId, playerId);
    return NextResponse.json({ playerId, balance: updated?.tokenBalance ?? 0, kind: pending ? 'rebuy' : 'buyin' });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Error al registrar la entrada' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verificar tipos y suite unit**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npx vitest run`
Expected: toda la suite unit verde (no se toca `settle.ts`/`bank.ts`; sus tests de atomicidad/idempotencia siguen pasando).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/bets/route.ts src/app/api/timba/entry/route.ts
git commit -m "feat(multitenant): rutas de La Timba (apuestas + entradas) scopeadas por grupo (1B-3)"
```

---

## Task 3: Rutas de premios y canjes

**Files:**
- Modify: `src/app/api/rewards/route.ts`
- Modify: `src/app/api/rewards/[id]/route.ts`
- Modify: `src/app/api/redemptions/route.ts`
- Modify: `src/app/api/redemptions/[id]/route.ts`

- [ ] **Step 1: `src/app/api/rewards/route.ts`**

Reemplazar el contenido completo por:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { listRewardsInGroup, createRewardInGroup } from '@/lib/rewards/queries';

// GET /api/rewards — catálogo del grupo por defecto (la UI pública filtra por active)
export async function GET() {
  try {
    const groupId = await getDefaultGroupId();
    const all = await listRewardsInGroup(groupId);
    return NextResponse.json(all);
  } catch {
    return NextResponse.json({ error: 'Error al obtener premios' }, { status: 500 });
  }
}

// POST /api/rewards — crear premio (admin)
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    const { title, description, cost } = await request.json();
    if (!title?.trim()) return NextResponse.json({ error: 'El título es obligatorio' }, { status: 400 });
    if (!Number.isInteger(cost) || cost <= 0) {
      return NextResponse.json({ error: 'El coste debe ser un entero positivo' }, { status: 400 });
    }
    const reward = await createRewardInGroup(groupId, {
      title: title.trim(),
      description: description?.trim() || null,
      cost,
    });
    return NextResponse.json(reward, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Error al crear premio' }, { status: 500 });
  }
}
```

- [ ] **Step 2: `src/app/api/rewards/[id]/route.ts`**

Reemplazar el contenido completo por:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { updateRewardInGroup, deactivateRewardInGroup } from '@/lib/rewards/queries';

// PUT /api/rewards/[id] — editar premio (admin). Body: { title?, description?, cost?, active? }
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    const body = await request.json();
    const fields: { title?: string; description?: string | null; cost?: number; active?: boolean } = {};
    if (typeof body.title === 'string' && body.title.trim()) fields.title = body.title.trim();
    if (body.description !== undefined) fields.description = body.description?.trim() || null;
    if (Number.isInteger(body.cost) && body.cost > 0) fields.cost = body.cost;
    if (typeof body.active === 'boolean') fields.active = body.active;
    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
    }
    const updated = await updateRewardInGroup(groupId, id, fields);
    if (!updated) return NextResponse.json({ error: 'Premio no encontrado' }, { status: 404 });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Error al actualizar premio' }, { status: 500 });
  }
}

// DELETE /api/rewards/[id] — desactivar (soft delete; los canjes lo referencian)
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    const updated = await deactivateRewardInGroup(groupId, id);
    if (!updated) return NextResponse.json({ error: 'Premio no encontrado' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Error al desactivar premio' }, { status: 500 });
  }
}
```

- [ ] **Step 3: `src/app/api/redemptions/route.ts`**

Reemplazar el contenido completo por:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import {
  listRedemptionsAllInGroup, getMyRedemptions, getRewardInGroup,
  insertRedemption, deleteRedemption,
} from '@/lib/rewards/queries';
import { applyTokenMovement } from '@/lib/betting/bank';
import { hasPendingPenalty, detectBankruptcies } from '@/lib/betting/settle';

// GET /api/redemptions?all=1 (admin) | sin params → los míos
export async function GET(request: NextRequest) {
  try {
    const all = request.nextUrl.searchParams.get('all');
    if (all) {
      const auth = await requireAdmin();
      if ('response' in auth) return auth.response;
      const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
      const rows = await listRedemptionsAllInGroup(groupId);
      return NextResponse.json(rows);
    }

    const auth = await requireSession();
    if ('response' in auth) return auth.response;
    if (!auth.session.player) return NextResponse.json([]);
    const rows = await getMyRedemptions(auth.session.player.id);
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({ error: 'Error al obtener canjes' }, { status: 500 });
  }
}

// POST /api/redemptions — canjear. Body: { rewardId }
export async function POST(request: NextRequest) {
  const auth = await requireSession();
  if ('response' in auth) return auth.response;
  const player = auth.session.player;
  if (!player) return NextResponse.json({ error: 'Sin jugador vinculado' }, { status: 403 });
  try {
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    const { rewardId } = await request.json();
    const reward = await getRewardInGroup(groupId, rewardId);
    if (!reward || !reward.active) {
      return NextResponse.json({ error: 'Premio no disponible' }, { status: 404 });
    }
    if (await hasPendingPenalty(player.id)) {
      return NextResponse.json({ error: 'Estás en bancarrota: cumple tu penalización antes' }, { status: 403 });
    }

    const redemption = await insertRedemption(player.id, reward.id, reward.cost);

    try {
      await applyTokenMovement(player.id, -reward.cost, 'redemption', redemption.id);
    } catch {
      await deleteRedemption(redemption.id);
      return NextResponse.json({ error: 'No tienes saldo suficiente' }, { status: 400 });
    }

    await detectBankruptcies([player.id]);
    return NextResponse.json(redemption, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Error al canjear' }, { status: 500 });
  }
}
```

- [ ] **Step 4: `src/app/api/redemptions/[id]/route.ts`**

Reemplazar el contenido completo por:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { getDefaultGroupId, getGroupContext } from '@/lib/auth/group-context';
import { getRedemptionInGroup, updateRedemptionStatus } from '@/lib/rewards/queries';
import { applyTokenMovement, hasLedgerEntry } from '@/lib/betting/bank';

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// PUT /api/redemptions/[id] — admin. Body: { status: 'fulfilled' | 'cancelled' }
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;
  try {
    const { id } = await params;
    const groupId = (await getGroupContext())?.groupId ?? (await getDefaultGroupId());
    const { status } = await request.json();
    if (status !== 'fulfilled' && status !== 'cancelled') {
      return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
    }
    const redemption = await getRedemptionInGroup(groupId, id);
    if (!redemption) return NextResponse.json({ error: 'Canje no encontrado' }, { status: 404 });
    if (redemption.status !== 'pending') {
      return NextResponse.json({ error: 'Este canje ya está resuelto' }, { status: 400 });
    }

    if (status === 'cancelled' && !(await hasLedgerEntry('redemption_refunded', redemption.id))) {
      await applyTokenMovement(redemption.playerId, redemption.cost, 'redemption_refunded', redemption.id);
    }
    const updated = await updateRedemptionStatus(id, status, now());
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Error al resolver canje' }, { status: 500 });
  }
}
```

- [ ] **Step 5: Verificar tipos y suite unit**

Run: `npx tsc --noEmit`
Expected: sin errores.

Run: `npx vitest run`
Expected: toda la suite unit verde.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/rewards/route.ts "src/app/api/rewards/[id]/route.ts" src/app/api/redemptions/route.ts "src/app/api/redemptions/[id]/route.ts"
git commit -m "feat(multitenant): rutas de premios y canjes scopeadas por grupo (1B-3)"
```

---

## Task 4: Arnés y tests e2e de no-fuga (Timba + premios)

**Files:**
- Modify: `e2e/global-setup.ts`
- Create: `e2e/no-fuga-timba.spec.ts`
- Create: `e2e/no-fuga-premios.spec.ts`

- [ ] **Step 1: Crear las tablas de La Timba en la DB de test**

En `e2e/global-setup.ts`, justo **después** del bloque `CREATE TABLE IF NOT EXISTS bets (...)` (el que termina con `UNIQUE (match_id, player_id, market)`) y **antes** del `for (let i = 1; i <= 8; i++)`, añadir:

```ts
  // Las tablas de tokens/premios/penalizaciones/canjes de La Timba tampoco las crea
  // /api/init-db ni las migraciones del global-setup (en prod se crearon en su propia
  // migración). El schema drizzle las consulta (DAL de betting/rewards), así que las
  // creamos aquí (idempotente), reflejando el esquema de producción.
  await db.execute(`CREATE TABLE IF NOT EXISTS token_ledger (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    ref_id TEXT,
    balance_after INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (reason, ref_id)
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS rewards (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL DEFAULT 'lomeros',
    title TEXT NOT NULL,
    description TEXT,
    cost INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS redemptions (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    reward_id TEXT NOT NULL,
    cost INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    requested_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT
  )`);
  await db.execute(`CREATE TABLE IF NOT EXISTS penalties (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    recharge_amount INTEGER NOT NULL DEFAULT 250,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    fulfilled_at TEXT
  )`);
```

- [ ] **Step 2: Sembrar estado de Timba/premios del 2º grupo**

En `e2e/global-setup.ts`, justo **después** del bloque que siembra `gt-match1` (el `INSERT OR IGNORE INTO matches ... 'gt-match1' ...`) y **antes** del comentario `// 3) storageStates`, añadir:

```ts
  // Estado de La Timba y premios del "Grupo Test", para no-fuga: una apuesta abierta
  // de gt-pl1 en su partido, una penalización pendiente suya, un premio de su grupo y
  // un canje. Lomeros nunca debe ver ni tocar nada de esto.
  await db.execute({
    sql: `INSERT OR IGNORE INTO bets (id, match_id, player_id, market, predicted_team, amount, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: ['gt-bet1', 'gt-match1', 'gt-pl1', 'winner', 1, 50, 'open'],
  });
  await db.execute({
    sql: `INSERT OR IGNORE INTO penalties (id, player_id, status) VALUES (?, ?, ?)`,
    args: ['gt-penalty1', 'gt-pl1', 'pending'],
  });
  await db.execute({
    sql: `INSERT OR IGNORE INTO rewards (id, group_id, title, cost, active) VALUES (?, ?, ?, ?, ?)`,
    args: ['gt-reward1', 'grupo-test', 'Premio GT', 100, 1],
  });
  await db.execute({
    sql: `INSERT OR IGNORE INTO redemptions (id, player_id, reward_id, cost, status) VALUES (?, ?, ?, ?, ?)`,
    args: ['gt-redemption1', 'gt-pl1', 'gt-reward1', 100, 'pending'],
  });
```

- [ ] **Step 3: Crear `e2e/no-fuga-timba.spec.ts` (falla sin el scoping de la Task 2)**

```ts
import { test, expect } from '@playwright/test';

// Aislamiento entre grupos para La Timba. El global-setup crea en "Grupo Test" un
// partido `gt-match1`, una apuesta abierta `gt-bet1` de `gt-pl1`, y una penalización
// pendiente suya. Lomeros (grupo por defecto) nunca debe verlos ni tocarlos.
test.describe('no-fuga · timba (público)', () => {
  test('las apuestas de un partido de otro grupo no se exponen (404)', async ({ request }) => {
    const res = await request.get('/api/bets?matchId=gt-match1');
    expect(res.status()).toBe(404);
  });
});

test.describe('no-fuga · timba (admin de Lomeros)', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('un admin de Lomeros no puede dar entrada a un jugador de otro grupo (404)', async ({ request }) => {
    const res = await request.post('/api/timba/entry', { data: { playerId: 'gt-pl1' } });
    expect(res.status()).toBe(404);
  });
});

test.describe('no-fuga · timba (jugador de Lomeros)', () => {
  test.use({ storageState: 'e2e/.auth/player.json' });

  test('un jugador de Lomeros no puede apostar en un partido de otro grupo (404)', async ({ request }) => {
    const res = await request.post('/api/bets', {
      data: { matchId: 'gt-match1', market: 'winner', predictedTeam: 1, amount: 20 },
    });
    expect(res.status()).toBe(404);
  });
});
```

- [ ] **Step 4: Crear `e2e/no-fuga-premios.spec.ts` (falla sin el scoping de la Task 3)**

```ts
import { test, expect } from '@playwright/test';

// Aislamiento entre grupos para premios y canjes. El global-setup crea `gt-reward1`
// (premio de "Grupo Test") y `gt-redemption1` (canje de gt-pl1). Lomeros nunca debe
// verlos ni tocarlos.
test.describe('no-fuga · premios (público)', () => {
  test('el catálogo público no incluye premios de otro grupo', async ({ request }) => {
    const res = await request.get('/api/rewards');
    expect(res.ok()).toBeTruthy();
    const list = (await res.json()) as Array<{ id: string }>;
    expect(list.map((r) => r.id)).not.toContain('gt-reward1');
  });
});

test.describe('no-fuga · premios (admin de Lomeros)', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test('un admin de Lomeros no puede editar un premio de otro grupo (404)', async ({ request }) => {
    const res = await request.put('/api/rewards/gt-reward1', { data: { cost: 1 } });
    expect(res.status()).toBe(404);
  });

  test('un admin de Lomeros no puede desactivar un premio de otro grupo (404)', async ({ request }) => {
    const res = await request.delete('/api/rewards/gt-reward1');
    expect(res.status()).toBe(404);
  });

  test('la lista de canjes (admin) no incluye canjes de otro grupo', async ({ request }) => {
    const res = await request.get('/api/redemptions?all=1');
    expect(res.ok()).toBeTruthy();
    const list = (await res.json()) as Array<{ id: string }>;
    expect(list.map((r) => r.id)).not.toContain('gt-redemption1');
  });

  test('un admin de Lomeros no puede resolver un canje de otro grupo (404)', async ({ request }) => {
    const res = await request.put('/api/redemptions/gt-redemption1', { data: { status: 'cancelled' } });
    expect(res.status()).toBe(404);
  });
});

test.describe('no-fuga · premios (jugador de Lomeros)', () => {
  test.use({ storageState: 'e2e/.auth/player.json' });

  test('un jugador de Lomeros no puede canjear un premio de otro grupo (404)', async ({ request }) => {
    const res = await request.post('/api/redemptions', { data: { rewardId: 'gt-reward1' } });
    expect(res.status()).toBe(404);
  });
});
```

- [ ] **Step 5: Ejecutar la suite e2e completa**

Run: `npm run e2e`
Expected: PASS — todos los specs verdes, incluidos `no-fuga-timba` (3 tests) y `no-fuga-premios` (5 tests), además de los `no-fuga-players`/`no-fuga-matches` previos. El resto sigue verde (comportamiento idéntico para Lomeros).

(Nota TDD: sin la Task 2, el `GET /api/bets?matchId=gt-match1` listaría la apuesta en vez de 404, y el `POST /api/timba/entry` daría 200; sin la Task 3, el catálogo incluiría `gt-reward1` y el `PUT`/`DELETE`/canje no darían 404 → los tests fallarían, confirmando que verifican el scoping real.)

- [ ] **Step 6: Commit**

```bash
git add e2e/global-setup.ts e2e/no-fuga-timba.spec.ts e2e/no-fuga-premios.spec.ts
git commit -m "test(e2e): no-fuga de La Timba y premios + tablas/seed del 2º grupo (1B-3)"
```

---

## Self-review (cobertura del spec 1B para 1B-3)

- **`bets`/`settle` scopeados preservando atomicidad e idempotencia del ledger (spec §2 fila 1B-3):** `settle.ts`/`bank.ts` intactos (Decisión 1); el scoping entra por validar el partido in-group en las rutas (`getMatchInGroup`, Decisiones 2-3). Las apuestas de un partido in-group son todas in-group → `settleMatchBets`/`refundOpenBets`/`reverseSettlement` quedan group-correctos sin tocarse. ✔
- **`penalties` scopeadas (tabla hija sin group_id, vía FK player) (spec §1, §2):** `api/timba/entry` valida el jugador in-group; `getPendingPenalty`/`fulfillPenalty` operan por `playerId` ya verificado. Creación vía `detectBankruptcies` sobre jugadores in-group. ✔
- **`rewards` como tabla raíz con group_id (spec §1):** `rewards/queries.ts` filtra/fija `groupId`; `GET` por grupo, `POST` fija contexto, `PUT`/`DELETE` scopean `(id, groupId)`. ✔
- **`redemptions` (hija vía FK player) (spec §1):** scopeada por `players.groupId` (lista admin + `getRedemptionInGroup`); `POST` valida premio in-group. ✔
- **Rutas dejan de tocar `db` directo para tablas tenant; groupId del contexto (spec §1):** 6 rutas migradas a `getGroupContext()/getDefaultGroupId()` + DAL. (Las escrituras transaccionales de `bets` en `POST /api/bets` se quedan como motor — Decisión 6; las lecturas pasan al DAL.) ✔
- **Test e2e de no-fuga creciente + seed del 2º grupo (spec §3):** Task 4, 8 aserciones nuevas (apuestas, entrada, premios, canjes) + creación de tablas Timba en la DB de test. ✔
- **Páginas de lectura (server components: `currentMatchPools`, perfil, ranking de tokens) → 1B-5:** no se tocan aquí. ✔
- **Comportamiento idéntico para Lomeros (spec §0):** un solo grupo real → filtrar por su grupo devuelve lo mismo; suite existente verde. ✔

Sin placeholders. Nombres consistentes entre DAL, rutas y specs: `getBetsWithBettorForMatch`/`getMyBets`/`getBetInMarket`/`deleteBet`/`getPendingPenalty`/`fulfillPenalty` (betting); `listRewardsInGroup`/`getRewardInGroup`/`createRewardInGroup`/`updateRewardInGroup`/`deactivateRewardInGroup`/`listRedemptionsAllInGroup`/`getMyRedemptions`/`getRedemptionInGroup`/`insertRedemption`/`deleteRedemption`/`updateRedemptionStatus` (rewards); reutiliza `getMatchInGroup` (1B-2) y `getPlayerInGroup` (1B-1).
