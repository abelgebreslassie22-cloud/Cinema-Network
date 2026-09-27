import { db } from './src/db/index.js';
import { sql } from 'drizzle-orm';

async function main() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS leaderboard_cache (
      id TEXT PRIMARY KEY,
      period TEXT,
      category TEXT,
      items JSONB,
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS franchise_cache (
      id TEXT PRIMARY KEY,
      name TEXT,
      description TEXT,
      movie_count INTEGER,
      average_rating REAL,
      year_range TEXT,
      poster_url TEXT,
      backdrop_url TEXT,
      category TEXT,
      associated_ids JSONB,
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  console.log('Tables created');
  process.exit(0);
}
main();
