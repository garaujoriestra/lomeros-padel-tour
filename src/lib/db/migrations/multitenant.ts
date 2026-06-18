import type { Client } from '@libsql/client';
import {
  LOMEROS_GROUP_ID,
  LOMEROS_GROUP_SLUG,
  LOMEROS_GROUP_NAME,
} from '@/lib/groups/constants';

/** Tablas raíz tenant que reciben la columna group_id en la Fase 1. */
const TENANT_ROOT_TABLES = ['players', 'matches', 'rewards', 'tournaments'] as const;

export interface MultitenantMigrationReport {
  groupsTotal: number;
  usersTotal: number;
  membershipsTotal: number;
  tables: Record<string, { total: number; withGroup: number }>;
}

async function tableExists(client: Client, table: string): Promise<boolean> {
  const res = await client.execute({
    sql: `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`,
    args: [table],
  });
  return res.rows.length > 0;
}

async function columnExists(client: Client, table: string, column: string): Promise<boolean> {
  const res = await client.execute(`PRAGMA table_info(${table})`);
  return res.rows.some((r) => r[1] === column); // r[1] = nombre de la columna
}

async function count(client: Client, sqlText: string): Promise<number> {
  const res = await client.execute(sqlText);
  return Number(res.rows[0][0]);
}

/**
 * Migración idempotente de la Fase 1 multi-tenant (paso 1A).
 * - Crea `groups` y siembra Lomeros (grupo #1).
 * - Crea `memberships` y backfilla una membership en Lomeros por cada user
 *   (preservando role y player_id).
 * - Añade `group_id` NOT NULL DEFAULT '<lomeros>' a las tablas raíz tenant: el
 *   DEFAULT backfilla las filas existentes y sirve de red de seguridad durante
 *   la migración ruta-a-ruta del paso 1B.
 * NO borra `users.role` ni `users.player_id` (contract del paso 1C).
 */
export async function migrateMultitenant(client: Client): Promise<MultitenantMigrationReport> {
  // 1) groups + Lomeros
  await client.execute(`
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await client.execute({
    sql: `INSERT INTO groups (id, slug, name) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING`,
    args: [LOMEROS_GROUP_ID, LOMEROS_GROUP_SLUG, LOMEROS_GROUP_NAME],
  });

  // 2) memberships + backfill desde users
  await client.execute(`
    CREATE TABLE IF NOT EXISTS memberships (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'player',
      player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, group_id)
    )
  `);
  await client.execute({
    sql: `
      INSERT INTO memberships (id, user_id, group_id, role, player_id)
      SELECT lower(hex(randomblob(16))), u.id, ?, u.role, u.player_id
      FROM users u
      WHERE NOT EXISTS (
        SELECT 1 FROM memberships m WHERE m.user_id = u.id AND m.group_id = ?
      )
    `,
    args: [LOMEROS_GROUP_ID, LOMEROS_GROUP_ID],
  });

  // 3) group_id en tablas raíz tenant (NOT NULL DEFAULT lomeros = backfill + red de seguridad)
  for (const table of TENANT_ROOT_TABLES) {
    if (!(await tableExists(client, table))) continue;
    if (await columnExists(client, table, 'group_id')) continue;
    await client.execute(
      `ALTER TABLE ${table} ADD COLUMN group_id TEXT NOT NULL DEFAULT '${LOMEROS_GROUP_ID}'`,
    );
  }

  // 4) Reporte de verificación (sirve de check de integridad tras el curl en prod)
  const tables: MultitenantMigrationReport['tables'] = {};
  for (const table of TENANT_ROOT_TABLES) {
    if (!(await tableExists(client, table))) continue;
    tables[table] = {
      total: await count(client, `SELECT count(*) FROM ${table}`),
      withGroup: await count(
        client,
        `SELECT count(*) FROM ${table} WHERE group_id = '${LOMEROS_GROUP_ID}'`,
      ),
    };
  }

  return {
    groupsTotal: await count(client, `SELECT count(*) FROM groups`),
    usersTotal: await count(client, `SELECT count(*) FROM users`),
    membershipsTotal: await count(client, `SELECT count(*) FROM memberships`),
    tables,
  };
}
