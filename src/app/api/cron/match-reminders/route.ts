import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { matches, notificationLog } from '@/lib/db/schema';
import { madridDateParts, selectReminders } from '@/lib/push/reminders';
import { buildReminderNotification } from '@/lib/push/notifications';
import { sendToUsers, userIdsForPlayers } from '@/lib/push/send';

export const dynamic = 'force-dynamic';

// GET /api/cron/match-reminders?kind=day|eve
// Lo invoca Vercel Cron con el header Authorization: Bearer <CRON_SECRET>.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const kindParam = new URL(request.url).searchParams.get('kind');
  const wantKind = kindParam === 'eve' ? 'reminder_eve' : 'reminder_day';

  const { today, tomorrow } = madridDateParts(new Date());
  const scheduled = await db.select().from(matches).where(eq(matches.status, 'scheduled'));
  const due = selectReminders(scheduled, today, tomorrow).filter((r) => r.kind === wantKind);

  let sent = 0;
  for (const r of due) {
    // Idempotencia: insertar en notification_log; si choca con UNIQUE, ya se envió.
    try {
      await db.insert(notificationLog).values({ matchId: r.matchId, kind: r.kind });
    } catch {
      continue;
    }
    const m = scheduled.find((x) => x.id === r.matchId);
    if (!m) continue;
    const playerIds = [m.team1Player1Id, m.team1Player2Id, m.team2Player1Id, m.team2Player2Id];
    const userIds = await userIdsForPlayers(playerIds);
    const detail = m.location ?? '';
    await sendToUsers(userIds, buildReminderNotification(r.kind, detail, r.matchId));
    sent++;
  }

  return NextResponse.json({ ok: true, kind: wantKind, sent });
}
