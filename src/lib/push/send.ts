import webpush from 'web-push';
import { inArray, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { pushSubscriptions, users } from '@/lib/db/schema';
import type { PushPayload } from './types';

const DEFAULT_ICON = '/icon';

let configured = false;
function ensureVapid() {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
  const privateKey = process.env.VAPID_PRIVATE_KEY || '';
  if (!publicKey || !privateKey) {
    console.warn('push: faltan claves VAPID, no se enviarán notificaciones');
    return;
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    publicKey,
    privateKey,
  );
  configured = true;
}

export function shouldDeleteSubscription(statusCode: number): boolean {
  return statusCode === 404 || statusCode === 410;
}

type SubRow = typeof pushSubscriptions.$inferSelect;

async function sendToSubscriptions(subs: SubRow[], payload: PushPayload): Promise<void> {
  if (subs.length === 0) return;
  ensureVapid();
  const body = JSON.stringify({ icon: DEFAULT_ICON, ...payload });
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
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
}

// Returns the userIds linked to any of the given playerIds.
export async function userIdsForPlayers(playerIds: string[]): Promise<string[]> {
  if (playerIds.length === 0) return [];
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.playerId, playerIds));
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

export async function sendToAll(payload: PushPayload): Promise<void> {
  const subs = await db.select().from(pushSubscriptions);
  await sendToSubscriptions(subs, payload);
}
