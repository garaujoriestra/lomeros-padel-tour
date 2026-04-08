import { createClient } from '@libsql/client';

const client = createClient({ url: 'file:./local.db' });

async function migrate() {
  // 1. Add status column (silently skip if already exists)
  try {
    await client.execute("ALTER TABLE matches ADD COLUMN status TEXT NOT NULL DEFAULT 'completed'");
    console.log('✓ Columna status añadida');
  } catch (e) {
    if (e.message.includes('duplicate column') || e.message.includes('already exists')) {
      console.log('— Columna status ya existe, se omite');
    } else {
      throw e;
    }
  }

  // 2. Check if winner_team is still NOT NULL
  const info = await client.execute('PRAGMA table_info(matches)');
  const winnerCol = info.rows.find((r) => r[1] === 'winner_team');
  const isNotNull = winnerCol && Number(winnerCol[3]) === 1;

  if (isNotNull) {
    console.log('winner_team sigue siendo NOT NULL — recreando tabla...');

    await client.execute('BEGIN');
    try {
      await client.execute(`
        CREATE TABLE matches_new (
          id TEXT NOT NULL PRIMARY KEY,
          date TEXT NOT NULL,
          location TEXT,
          team1_player1_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          team1_player2_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          team2_player1_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          team2_player2_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          winner_team INTEGER,
          status TEXT NOT NULL DEFAULT 'completed',
          notes TEXT,
          created_at TEXT NOT NULL
        )
      `);
      await client.execute(`
        INSERT INTO matches_new
          SELECT id, date, location, team1_player1_id, team1_player2_id,
                 team2_player1_id, team2_player2_id, winner_team, status, notes, created_at
          FROM matches
      `);
      await client.execute('DROP TABLE matches');
      await client.execute('ALTER TABLE matches_new RENAME TO matches');
      await client.execute('COMMIT');
      console.log('✓ Tabla recreada con winner_team nullable');
    } catch (e) {
      await client.execute('ROLLBACK');
      throw e;
    }
  } else {
    console.log('— winner_team ya es nullable, no hace falta recrear tabla');
  }

  // 3. Verify final state
  const info2 = await client.execute('PRAGMA table_info(matches)');
  console.log('\nEsquema final:');
  for (const r of info2.rows) {
    console.log(`  ${r[1]}  notNull=${r[3]}  default=${r[4]}`);
  }
  const count = await client.execute('SELECT count(*) FROM matches');
  console.log(`\nPartidos en la BD: ${count.rows[0][0]}`);
  console.log('\n✅ Migración completada con éxito');
}

migrate().catch((e) => {
  console.error('❌ ERROR EN MIGRACIÓN:', e.message);
  process.exit(1);
});
