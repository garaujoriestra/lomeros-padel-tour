// src/lib/betting/pot.ts
// Bote real (€) = suma de todas las fichas en circulación × 1 céntimo.
// Por construcción (pari-mutuel + buy-in) el bote siempre respalda las fichas.
import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
import { BETTING } from './config';

export async function potEuros(): Promise<number> {
  const [{ total }] = await db
    .select({ total: sql<number>`coalesce(sum(${players.tokenBalance}), 0)` })
    .from(players);
  return (Number(total) * BETTING.centsPerToken) / 100;
}
