import webpush from 'web-push';
import { inArray, eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { pushSubscriptions, memberships } from '@/lib/db/schema';
import type { PushPayload } from './types';

const DEFAULT_ICON = '/icon';

let configured = false;
let warnedMissingVapid = false;
function ensureVapid() {
  if (configured) return;
  const pub = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
  const priv = process.env.VAPID_PRIVATE_KEY || '';
  if (!pub || !priv) {
    if (!warnedMissingVapid) {
      console.warn('push: faltan claves VAPID, no se enviarán notificaciones');
      warnedMissingVapid = true;
    }
    return;
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    pub,
    priv,
  );
  configured = true;
}

export function shouldDeleteSubscription(statusCode: number): boolean {
  return statusCode === 404 || statusCode === 410;
}

type SubRow = typeof pushSubscriptions.$inferSelect;

async function sendToSubscriptions(subs: SubRow[], payload: PushPayload): Promise<number> {
  if (subs.length === 0) return 0;
  ensureVapid();
  const body = JSON.stringify({ icon: DEFAULT_ICON, ...payload });
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        sent++;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode ?? 0;
        if (shouldDeleteSubscription(statusCode)) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, s.endpoint));
        } else {
          console.error('push send error', statusCode, err);
        }
      }
    }),
  );
  return sent;
}

// Returns the userIds linked (vía membership del grupo) to any of the given playerIds.
export async function userIdsForPlayers(groupId: string, playerIds: string[]): Promise<string[]> {
  if (playerIds.length === 0) return [];
  const rows = await db
    .select({ id: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.groupId, groupId), inArray(memberships.playerId, playerIds)));
  return rows.map((r) => r.id);
}

export async function sendToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (userIds.length === 0) return;
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, userIds));
  await sendToSubscriptions(subs, payload);
}

// Envía a TODOS los miembros del grupo (vía sus suscripciones). Reemplaza a sendToAll,
// que enviaba sin scoping. Los miembros = users con membership en el grupo.
export async function sendToGroup(groupId: string, payload: PushPayload): Promise<number> {
  const memberRows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.groupId, groupId));
  const userIds = memberRows.map((r) => r.userId);
  if (userIds.length === 0) return 0;
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, userIds));
  return sendToSubscriptions(subs, payload);
}
