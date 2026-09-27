import { Pool } from 'pg';
import { createPool } from './src/db/index.js';

async function check() {
  const cloudSqlPool = createPool();
  const backupPool = new Pool({
    connectionString: 'postgresql://postgres.dcnsakrumakdapdibgal:QjNpaqsFXC4R%26%2B5@aws-0-eu-west-2.pooler.supabase.com:6543/postgres',
    ssl: { rejectUnauthorized: false }
  });

  const cRes = await cloudSqlPool.query('SELECT count(*) as c FROM content');
  const bRes = await backupPool.query('SELECT count(*) as c FROM content');

  console.log(`Current content rows in Cloud SQL: ${cRes.rows[0].c}`);
  console.log(`Current content rows in Backup Supabase: ${bRes.rows[0].c}`);

  await backupPool.end();
  process.exit(0);
}

check();
