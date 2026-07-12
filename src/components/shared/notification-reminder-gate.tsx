import { NotificationReminder } from './notification-reminder';

/**
 * Gate: only logged-in players (a user linked to a player) get the "enable
 * notifications" reminder. The reminder itself is about *their* matches,
 * results and achievements, so it has nothing to offer anonymous visitors.
 *
 * `hasPlayer` arrives as a prop instead of being resolved here: this gate is
 * mounted from the true app root layout (src/app/layout.tsx), which has no
 * group slug to resolve against, so the root itself computes the condition
 * (legitimate: it's a root, not a page that can render under a specific group).
 */
export function NotificationReminderGate({ hasPlayer }: { hasPlayer: boolean }) {
  if (!hasPlayer) return null;
  return <NotificationReminder />;
}
