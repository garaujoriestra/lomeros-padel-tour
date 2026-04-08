import { createClient } from '@libsql/client';

const client = createClient({ url: 'file:./local.db' });

async function reset() {
  // Delete in order to respect foreign keys
  await client.execute('DELETE FROM match_sets');
  await client.execute('DELETE FROM pair_stats');
  await client.execute('DELETE FROM matches');
  await client.execute('DELETE FROM players');

  // Verify
  const tables = ['players', 'matches', 'match_sets', 'pair_stats'];
  for (const t of tables) {
    const r = await client.execute(`SELECT count(*) as c FROM ${t}`);
    console.log(`${t}: ${r.rows[0][0]} filas`);
  }
  console.log('\n✅ Base de datos limpiada. Lista para empezar de cero.');
}

reset().catch((e) => { console.error('❌ ERROR:', e.message); process.exit(1); });
