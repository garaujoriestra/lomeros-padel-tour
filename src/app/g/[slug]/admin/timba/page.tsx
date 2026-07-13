import { db } from '@/lib/db';
import { penalties, tokenLedger } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { resolvePageContext } from '@/lib/auth/page-context';
import { listAllPlayersInGroup } from '@/lib/players/queries';
import { potEuros } from '@/lib/betting/pot';
import { TimbaEntries, type TimbaPlayerRow } from '@/components/admin/timba-entries';

export const dynamic = 'force-dynamic';

// Réplica de admin/timba/page.tsx (Task 8, paridad 2b): por debajo del umbral de
// extracción de body compartido, se copia con sustituciones (getGroupContext →
// resolvePageContext(slug), groupSlug threaded a TimbaEntries para el POST con
// body.g). `potEuros(groupId)` scopea el bote a este grupo (fix de corrección de
// esta misma task — antes sumaba TODOS los grupos). Hereda el gate admin-del-grupo
// del layout de /g/[slug]/admin.
export default async function GroupAdminTimbaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await resolvePageContext(slug);
  const groupId = ctx.groupId;
  const groupSlug = ctx.basePath ? ctx.group.slug : undefined;
  const [allPlayers, pendingPen, entries, pot] = await Promise.all([
    listAllPlayersInGroup(groupId),
    db.select().from(penalties).where(eq(penalties.status, 'pending')),
    db.select({ playerId: tokenLedger.playerId, reason: tokenLedger.reason })
      .from(tokenLedger).where(inArray(tokenLedger.reason, ['buyin', 'rebuy'])),
    potEuros(groupId),
  ]);
  const bankrupt = new Set(pendingPen.map((p) => p.playerId));
  const entered = new Set(entries.map((e) => e.playerId));

  const rows: TimbaPlayerRow[] = allPlayers.map((p) => ({
    id: p.id, name: p.name, nickname: p.nickname, tokenBalance: p.tokenBalance,
    hasEntered: entered.has(p.id), bankrupt: bankrupt.has(p.id),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sec-title">💰 La Timba — entradas y bote</h1>
        <p className="muted text-sm mt-1.5">Registra el pago de 5 € (entrada o recompra) y consulta el bote</p>
      </div>
      <TimbaEntries players={rows} potEuros={pot} groupSlug={groupSlug} />
    </div>
  );
}
