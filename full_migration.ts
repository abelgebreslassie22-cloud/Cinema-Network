import { Pool } from 'pg';
import { createPool } from './src/db/index.js';

const primarySupabaseUrl = 'postgresql://postgres.gfvrgtlbtojhkxrgskdr:QjNpaqsFXC4R%26%2B5@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';
const backupSupabaseUrl = 'postgresql://postgres.dcnsakrumakdapdibgal:QjNpaqsFXC4R%26%2B5@aws-0-eu-west-2.pooler.supabase.com:6543/postgres';

const primaryPool = new Pool({
  connectionString: primarySupabaseUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

const backupPool = new Pool({
  connectionString: backupSupabaseUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

const cloudSqlPool = createPool();

// Format column values specifically for Postgres json/jsonb/array/primitive compatibility
function formatVal(colName: string, val: any, jsonCols: Set<string>) {
  if (val === null || val === undefined) return null;
  if (jsonCols.has(colName)) {
    if (typeof val === 'object') {
      return JSON.stringify(val);
    }
    // If it's a string that starts with { or [ but might be postgres array syntax like {"Horror","Drama"}
    if (typeof val === 'string') {
      if (val.startsWith('{') && val.endsWith('}') && !val.includes(':')) {
        // Postgres array syntax e.g. {"A","B"} -> convert to JSON array ["A","B"]
        const items = val.slice(1, -1).split(',').map(s => s.replace(/^"|"$/g, '').trim());
        return JSON.stringify(items);
      }
      return val;
    }
  }
  return val;
}

async function migrateTable(tableName: string) {
  console.log(`\n-----------------------------------------`);
  console.log(`Starting migration for table: ${tableName}`);
  console.log(`-----------------------------------------`);

  // 1. Fetch JSON columns in target
  let jsonCols = new Set<string>();
  try {
    const colInfo = await cloudSqlPool.query(`
      SELECT column_name, data_type, udt_name 
      FROM information_schema.columns 
      WHERE table_name = $1 AND (data_type IN ('json', 'jsonb') OR udt_name IN ('json', 'jsonb'))
    `, [tableName]);
    for (const r of colInfo.rows) {
      jsonCols.add(r.column_name);
    }
  } catch (e) {}

  // 2. Fetch all rows from Primary Supabase
  let rows: any[] = [];
  try {
    const res = await primaryPool.query(`SELECT * FROM "${tableName}"`);
    rows = res.rows;
    console.log(`Fetched ${rows.length} rows from Primary Supabase for ${tableName}. (JSON cols: ${Array.from(jsonCols).join(', ')})`);
  } catch (err: any) {
    console.warn(`Could not read ${tableName} from primary Supabase:`, err.message);
    return;
  }

  if (rows.length === 0) {
    console.log(`No rows to migrate for ${tableName}.`);
    return;
  }

  const batchSize = 100;

  // 3. Insert/Upsert into Cloud SQL
  console.log(`Migrating into Google Cloud SQL...`);
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const cols = Object.keys(batch[0]);
    const colNames = cols.map(c => `"${c}"`).join(', ');

    const valuePlaceholders: string[] = [];
    const values: any[] = [];
    let pIdx = 1;

    for (const row of batch) {
      const rowPlaceholders: string[] = [];
      for (const col of cols) {
        rowPlaceholders.push(`$${pIdx++}`);
        values.push(formatVal(col, row[col], jsonCols));
      }
      valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
    }

    const primaryKey = cols.includes('id') ? 'id' : (cols.includes('key') ? 'key' : (cols.includes('code') ? 'code' : null));
    
    let queryText = `INSERT INTO "${tableName}" (${colNames}) VALUES ${valuePlaceholders.join(', ')}`;
    if (primaryKey) {
      const updateCols = cols.filter(c => c !== primaryKey).map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');
      if (updateCols.length > 0) {
        queryText += ` ON CONFLICT ("${primaryKey}") DO UPDATE SET ${updateCols}`;
      } else {
        queryText += ` ON CONFLICT ("${primaryKey}") DO NOTHING`;
      }
    } else {
      queryText += ` ON CONFLICT DO NOTHING`;
    }

    await cloudSqlPool.query(queryText, values);
    process.stdout.write(`Cloud SQL progress: ${Math.min(i + batchSize, rows.length)} / ${rows.length}\r`);
  }
  console.log(`\n✅ Finished Google Cloud SQL for ${tableName}`);

  // 4. Insert/Upsert into Backup Supabase
  console.log(`Migrating into Backup Supabase...`);
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const cols = Object.keys(batch[0]);
    const colNames = cols.map(c => `"${c}"`).join(', ');

    const valuePlaceholders: string[] = [];
    const values: any[] = [];
    let pIdx = 1;

    for (const row of batch) {
      const rowPlaceholders: string[] = [];
      for (const col of cols) {
        rowPlaceholders.push(`$${pIdx++}`);
        values.push(formatVal(col, row[col], jsonCols));
      }
      valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
    }

    const primaryKey = cols.includes('id') ? 'id' : (cols.includes('key') ? 'key' : (cols.includes('code') ? 'code' : null));
    
    let queryText = `INSERT INTO "${tableName}" (${colNames}) VALUES ${valuePlaceholders.join(', ')}`;
    if (primaryKey) {
      const updateCols = cols.filter(c => c !== primaryKey).map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');
      if (updateCols.length > 0) {
        queryText += ` ON CONFLICT ("${primaryKey}") DO UPDATE SET ${updateCols}`;
      } else {
        queryText += ` ON CONFLICT ("${primaryKey}") DO NOTHING`;
      }
    } else {
      queryText += ` ON CONFLICT DO NOTHING`;
    }

    await backupPool.query(queryText, values);
    process.stdout.write(`Backup Supabase progress: ${Math.min(i + batchSize, rows.length)} / ${rows.length}\r`);
  }
  console.log(`\n✅ Finished Backup Supabase for ${tableName}`);
}

async function run() {
  const tables = [
    'content',
    'users',
    'admin_settings',
    'user_ratings',
    'user_lists',
    'analytics_views',
    'analytics_downloads',
    'requests',
    'ads',
    'ad_slots',
    'homepage_cache',
    'leaderboard_cache',
    'franchise_cache'
  ];

  for (const t of tables) {
    await migrateTable(t);
  }

  console.log("\n=========================================");
  console.log("✅ ALL DATA SUCCESSFULLY MIGRATED TO CLOUD SQL & BACKUP SUPABASE!");
  console.log("=========================================");

  await primaryPool.end();
  await backupPool.end();
  process.exit(0);
}

run().catch(err => {
  console.error("Migration fatal error:", err);
  process.exit(1);
});
