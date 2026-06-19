import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notificationLog } from '@/lib/db/schema';
import { listGroups } from '@/lib/groups/queries';
import { listScheduledMatches } from '@/lib/matches/queries';
import { madridDateParts, selectReminders } from '@/lib/push/reminders';
import { buildReminderNotification } from '@/lib/push/notifications';
import { sendToUsers, userIdsForPlayers } from '@/lib/push/send';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/cron/match-reminders?kind=day|eve
// Lo invoca Vercel Cron con el header Authorization: Bearer <CRON_SECRET>.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const kindParam = new URL(request.url).searchParams.get('kind');
  const wantKind = kindParam === 'eve' ? 'reminder_eve' : 'reminder_day';

  const { today, tomorrow } = madridDateParts(new Date());
  const groups = await listGroups();

  let sent = 0;
  for (const group of groups) {
    const scheduled = await listScheduledMatches(group.id);
    const due = selectReminders(scheduled, today, tomorrow).filter((r) => r.kind === wantKind);

    for (const r of due) {
      // Idempotencia: insertar en notification_log; si choca con UNIQUE, ya se envió.
      try {
        await db.insert(notificationLog).values({ matchId: r.matchId, kind: r.kind });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('UNIQUE') && !msg.includes('constraint')) {
          console.error('notification_log insert failed unexpectedly', r.matchId, err);
        }
        continue;
      }
      const m = scheduled.find((x) => x.id === r.matchId);
      if (!m) continue;
      const playerIds = [m.team1Player1Id, m.team1Player2Id, m.team2Player1Id, m.team2Player2Id];
      const userIds = await userIdsForPlayers(group.id, playerIds);
      await sendToUsers(
        userIds,
        buildReminderNotification(r.kind, { time: m.time, location: m.location }, r.matchId),
      );
      sent++;
    }
  }

  return NextResponse.json({ ok: true, kind: wantKind, sent });
}
