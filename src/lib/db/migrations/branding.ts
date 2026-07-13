import type { Client } from '@libsql/client';

export interface BrandingMigrationReport {
  columnsAdded: string[];
}

// Columnas de la Fase 3 en groups: branding (logo/color) + Pase de Temporada.
const GROUP_COLUMNS = ['logo_url TEXT', 'accent_color TEXT', 'paid_until TEXT'] as const;

/**
 * Migración idempotente de la Fase 3 (marca + pase). ALTER ADD COLUMN tolerante a
 * "ya existe" (mismo patrón que ensureAuxTables) + tabla billing_events para la
 * idempotencia del webhook de Stripe (una fila por event.id procesado).
 */
export async function migrateBranding(client: Client): Promise<BrandingMigrationReport> {
  const columnsAdded: string[] = [];
  for (const col of GROUP_COLUMNS) {
    try {
      await client.execute(`ALTER TABLE groups ADD COLUMN ${col}`);
      columnsAdded.push(col.split(' ')[0]);
    } catch {
      /* ya existe */
    }
  }
  await client.execute(`CREATE TABLE IF NOT EXISTS billing_events (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    type TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  return { columnsAdded };
}
