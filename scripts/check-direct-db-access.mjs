// Guard: prohíbe acceso DIRECTO a las tablas tenant RAÍZ (players/matches/rewards/tournaments)
// vía Drizzle en src/app/**. La capa app debe ir por src/lib/<dominio>/queries.ts (o motores en
// src/lib). Allowlist: endpoints de migración (backfill/mantenimiento global a propósito).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT_TABLES = ['players', 'matches', 'rewards', 'tournaments'];
const PATTERN = new RegExp(
  `\\.(from|innerJoin|leftJoin|rightJoin|fullJoin|insert|update|delete)\\(\\s*(${ROOT_TABLES.join('|')})\\s*[\\),]`,
);
const ALLOWLIST = new Set([
  'src/app/api/migrate-db/route.ts',
  'src/app/api/migrate-avatars/route.ts',
  'src/app/api/init-db/route.ts',
]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

export function findRootTableAccess(root = 'src/app') {
  const offenders = [];
  for (const file of walk(root)) {
    const rel = file.replace(/\\/g, '/');
    if (ALLOWLIST.has(rel)) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (PATTERN.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
  }
  return offenders;
}

// Ejecutado directamente (node scripts/check-direct-db-access.mjs): falla si hay infractores.
if (import.meta.url === `file://${process.argv[1]}`) {
  const offenders = findRootTableAccess();
  if (offenders.length) {
    console.error('❌ Acceso directo a tablas tenant raíz en src/app (usa src/lib/<dominio>/queries.ts):');
    for (const o of offenders) console.error('  ' + o);
    process.exit(1);
  }
  console.log('✅ Sin acceso directo a tablas tenant raíz en src/app.');
}
