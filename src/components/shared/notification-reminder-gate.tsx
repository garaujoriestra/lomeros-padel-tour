import { getSession } from '@/lib/auth/session';
import { NotificationReminder } from './notification-reminder';

/**
 * Server gate: only logged-in players (a user linked to a player) get the
 * "enable notifications" reminder. The reminder itself is about *their* matches,
 * results and achievements, so it has nothing to offer anonymous visitors.
 */
export async function NotificationReminderGate() {
  const session = await getSession();
  if (!session?.player) return null;
  return <NotificationReminder />;
}
