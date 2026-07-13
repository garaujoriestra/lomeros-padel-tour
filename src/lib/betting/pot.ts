// src/lib/betting/pot.ts
// Bote real (€) del grupo = suma de las fichas en circulación DE SUS jugadores × 1
// céntimo. Por construcción (pari-mutuel + buy-in) el bote siempre respalda las
// fichas. Task 8 (paridad 2b): antes sumaba players de TODOS los grupos sin WHERE
// — un grupo veía el bote de Lomeros y Lomeros veía el suyo inflado con las fichas
// de los demás grupos. Ahora exige groupId y solo cuenta sus jugadores.
import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { BETTING } from './config';

export async function potEuros(groupId: string): Promise<number> {
  const [{ total }] = await db
    .select({ total: sql<number>`coalesce(sum(${players.tokenBalance}), 0)` })
    .from(players)
    .where(eq(players.groupId, groupId));
  return (Number(total) * BETTING.centsPerToken) / 100;
}
