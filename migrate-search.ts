import { db as supabaseDb } from './src/db/index.js';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('Running search optimization migrations...');
  
  try {
    console.log('1. Enabling pg_trgm...');
    await supabaseDb.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);

    console.log('2. Dropping existing search_text column if it exists...');
    await supabaseDb.execute(sql`ALTER TABLE content DROP COLUMN IF EXISTS search_text;`);

    console.log('3. Adding generated search_text column...');
    await supabaseDb.execute(sql`
      ALTER TABLE content
      ADD COLUMN search_text TEXT
      GENERATED ALWAYS AS (
        regexp_replace(
          COALESCE(title, '') || ' ' ||
          COALESCE(original_title, '') || ' ' ||
          COALESCE(name, '') || ' ' ||
          COALESCE(original_name, '') || ' ' ||
          COALESCE(director, '') || ' ' ||
          COALESCE(franchise, '') || ' ' ||
          COALESCE(franchise_name, '') || ' ' ||
          COALESCE(overview, '') || ' ' ||
          COALESCE(description, '') || ' ' ||
          COALESCE("cast"::text, '') || ' ' ||
          COALESCE(genres::text, '') || ' ' ||
          COALESCE(actors_data::text, ''),
          '[^a-zA-Z0-9\\s]', '', 'g'
        )
      ) STORED;
    `);

    console.log('4. Creating GIN index on search_text...');
    await supabaseDb.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_content_search_text_trgm
      ON content USING GIN (search_text gin_trgm_ops);
    `);

    console.log('5. Creating category indexes...');
    await supabaseDb.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_content_category ON content (category);
      CREATE INDEX IF NOT EXISTS idx_content_category_created ON content (category, created_at DESC);
    `);

    console.log('Migrations completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

main();
