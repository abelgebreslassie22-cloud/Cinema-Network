import { Pool } from 'pg';
import { db } from './src/db/index.js';
import * as schema from './src/db/schema.js';
import { sql, desc } from 'drizzle-orm';

async function check() {
  const primarySupabaseUrl = 'postgresql://postgres.gfvrgtlbtojhkxrgskdr:QjNpaqsFXC4R%26%2B5@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';
  const backupSupabaseUrl = 'postgresql://postgres.dcnsakrumakdapdibgal:QjNpaqsFXC4R%26%2B5@aws-0-eu-west-2.pooler.supabase.com:6543/postgres';

  const primaryPool = new Pool({ connectionString: primarySupabaseUrl, ssl: { rejectUnauthorized: false } });
  const backupPool = new Pool({ connectionString: backupSupabaseUrl, ssl: { rejectUnauthorized: false } });

  const pRes = await primaryPool.query('SELECT count(*) as c FROM content');
  const bRes = await backupPool.query('SELECT count(*) as c FROM content');
  const cRes = await db.select({ count: sql<number>`count(*)` }).from(schema.content);

  console.log(`\n================ CURRENT CONTENT ROW COUNTS ================`);
  console.log(`1. Primary Supabase:   ${pRes.rows[0].c}`);
  console.log(`2. Google Cloud SQL:   ${cRes[0]?.count}`);
  console.log(`3. Backup Supabase:    ${bRes.rows[0].c}`);

  const pLatest = await primaryPool.query('SELECT title, updated_at FROM content ORDER BY updated_at DESC LIMIT 3');
  const cLatest = await db.select({ title: schema.content.title, updatedAt: schema.content.updatedAt }).from(schema.content).orderBy(desc(schema.content.updatedAt)).limit(3);
  
  console.log(`\nLatest in Primary Supabase:`, pLatest.rows);
  console.log(`Latest in Cloud SQL:`, cLatest);

  await primaryPool.end();
  await backupPool.end();
  process.exit(0);
}

check();
