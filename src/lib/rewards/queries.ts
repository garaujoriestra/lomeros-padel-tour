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

// Premios ACTIVOS del grupo, por coste (catálogo de canje del jugador).
export async function listActiveRewardsInGroup(groupId: string): Promise<Reward[]> {
  return db.select().from(rewards)
    .where(and(eq(rewards.groupId, groupId), eq(rewards.active, true)))
    .orderBy(rewards.cost);
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
