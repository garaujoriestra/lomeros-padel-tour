import { db } from '@/lib/db';
import { billingEvents } from '@/lib/db/schema';

// Registra un evento de Stripe. Devuelve true solo la PRIMERA vez (idempotencia:
// reintentos del mismo event.id no reaplican el efecto).
export async function recordBillingEvent(id: string, groupId: string, type: string): Promise<boolean> {
  const res = await db.insert(billingEvents).values({ id, groupId, type }).onConflictDoNothing();
  return (res as { rowsAffected: number }).rowsAffected > 0;
}
