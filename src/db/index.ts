import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import * as schema from './schema.js';
import 'dotenv/config';

// 1. Primary Supabase URL (Provided by user)
const SUPABASE_PRIMARY_URL = process.env.DATABASE_URL || 'postgresql://postgres.gfvrgtlbtojhkxrgskdr:QjNpaqsFXC4R%26%2B5@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';

// 2. Backup Supabase URL (Provided by user for write-only mirror replication)
const SUPABASE_BACKUP_URL = process.env.SUPABASE_BACKUP_URL || 'postgresql://postgres.dcnsakrumakdapdibgal:QjNpaqsFXC4R%26%2B5@aws-0-eu-west-2.pooler.supabase.com:6543/postgres';

declare global {
  var _supabasePrimaryPool: Pool | undefined;
  var _supabaseBackupPool: Pool | undefined;
  var _pgliteClient: PGlite | undefined;
  var _primaryDrizzle: any;
  var _primaryDbFailed: boolean | undefined;
  var _isRecoveringFromPrimary: boolean | undefined;
  var _lastRecoveryAttempt: number | undefined;
  var _recoveryProgress: {
    inProgress: boolean;
    reason: string | null;
    currentTable: string | null;
    completedTables: number;
    totalTables: number;
    lastRecoveredAt: string | null;
    lastError: string | null;
  } | undefined;
}

export function getRecoveryStatus() {
  if (!global._recoveryProgress) {
    global._recoveryProgress = {
      inProgress: false,
      reason: null,
      currentTable: null,
      completedTables: 0,
      totalTables: 14,
      lastRecoveredAt: null,
      lastError: null
    };
  }
  return global._recoveryProgress;
}

export function getPgliteClient(): PGlite {
  if (!global._pgliteClient) {
    global._pgliteClient = new PGlite();
    global._primaryDrizzle = drizzlePglite(global._pgliteClient, { schema });
  }
  return global._pgliteClient;
}

export function getPrimaryDrizzle() {
  if (!global._pgliteClient) {
    global._pgliteClient = new PGlite();
    global._primaryDrizzle = drizzlePglite(global._pgliteClient, { schema });
  } else if (!global._primaryDrizzle) {
    global._primaryDrizzle = drizzlePglite(global._pgliteClient, { schema });
  }
  return global._primaryDrizzle;
}

export async function resetPgliteClient(): Promise<PGlite> {
  console.log('[DB Recovery] Re-instantiating fresh local PGLite database...');
  try {
    if (global._pgliteClient) {
      await global._pgliteClient.close().catch(() => {});
    }
  } catch (err: any) {
    console.warn('[DB Recovery] Non-critical warning closing previous PGLite client:', err.message);
  }
  global._pgliteClient = new PGlite();
  global._primaryDrizzle = drizzlePglite(global._pgliteClient, { schema });
  return global._pgliteClient;
}

export const primaryDb = new Proxy({} as ReturnType<typeof drizzlePglite<typeof schema>>, {
  get(target, prop, receiver) {
    const active = getPrimaryDrizzle();
    const value = Reflect.get(active, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(active);
    }
    return value;
  }
});

export const pgliteClient = new Proxy({} as PGlite, {
  get(target, prop, receiver) {
    const client = getPgliteClient();
    const val = Reflect.get(client, prop, receiver);
    if (typeof val === 'function') {
      return val.bind(client);
    }
    return val;
  }
});

if (!global._supabasePrimaryPool) {
  global._supabasePrimaryPool = new Pool({
    connectionString: SUPABASE_PRIMARY_URL,
    max: 10,
    connectionTimeoutMillis: 60000,
    idleTimeoutMillis: 30000,
    ssl: { rejectUnauthorized: false }
  });
}
export const supabasePrimaryPool = global._supabasePrimaryPool;
export const supabasePrimaryDb = drizzlePg(supabasePrimaryPool, { schema });

if (!global._supabaseBackupPool) {
  global._supabaseBackupPool = new Pool({
    connectionString: SUPABASE_BACKUP_URL,
    max: 10,
    connectionTimeoutMillis: 60000,
    idleTimeoutMillis: 30000,
    ssl: { rejectUnauthorized: false }
  });
}
export const supabaseBackupPool = global._supabaseBackupPool;
export const backupDb = drizzlePg(supabaseBackupPool, { schema });

export const tablesToSync = [
  { name: 'content', table: schema.content },
  { name: 'users', table: schema.users },
  { name: 'userRatings', table: schema.userRatings },
  { name: 'userLists', table: schema.userLists },
  { name: 'leaderboardCache', table: schema.leaderboardCache },
  { name: 'franchiseCache', table: schema.franchiseCache },
  { name: 'homepageCache', table: schema.homepageCache },
  { name: 'ads', table: schema.ads },
  { name: 'adSlots', table: schema.adSlots },
  { name: 'adminSettings', table: schema.adminSettings },
  { name: 'analyticsDownloads', table: schema.analyticsDownloads },
  { name: 'analyticsViews', table: schema.analyticsViews },
  { name: 'requests', table: schema.requests },
  { name: 'syncOperations', table: schema.syncOperations }
];

export async function ensureLocalSchema(): Promise<boolean> {
  const client = getPgliteClient();
  try {
    const tablesRes = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'content'
      );
    `);
    const tableExists = (tablesRes.rows[0] as any)?.exists;
    if (tableExists) {
      return true;
    }
  } catch (checkErr: any) {
    console.warn('[DB Recovery] Failed table existence check:', checkErr.message);
  }

  console.log('[DB Recovery] Local tables missing. Applying Drizzle schema...');
  const schemaDir = path.join(process.cwd(), 'drizzle');
  if (fs.existsSync(schemaDir)) {
    const files = fs.readdirSync(schemaDir).filter(f => f.endsWith('.sql')).sort();
    
    for (const file of files) {
      console.log(`[DB Recovery] Applying migration: ${file}`);
      const sqlContent = fs.readFileSync(path.join(schemaDir, file), 'utf8');
      const statements = sqlContent.split('--> statement-breakpoint');
      
      for (const stmt of statements) {
        const cleanStmt = stmt.trim();
        if (cleanStmt) {
          await client.exec(cleanStmt);
        }
      }
    }
    console.log('[DB Recovery] Schema successfully created in Local PGLite database.');
    return true;
  } else {
    console.warn('[DB Recovery] Migration directory not found at', schemaDir);
    return false;
  }
}

/**
 * Copies all data from Primary Supabase to the local database table-by-table.
 */
export async function copyAllDataFromPrimarySupabase(): Promise<{ success: boolean; totalRows: number }> {
  console.log('[DB Recovery] Beginning full data replication from Primary Supabase...');
  const progress = getRecoveryStatus();
  let grandTotal = 0;

  for (let idx = 0; idx < tablesToSync.length; idx++) {
    const { name, table } = tablesToSync[idx];
    progress.currentTable = name;
    progress.completedTables = idx;
    
    try {
      const allRows = await supabasePrimaryDb.select().from(table).execute();
      console.log(`[DB Recovery] [${idx + 1}/${tablesToSync.length}] Fetched ${allRows.length} rows for ${name} from Primary Supabase.`);
      
      if (allRows.length > 0) {
        const chunkSize = 250;
        for (let i = 0; i < allRows.length; i += chunkSize) {
          const chunk = allRows.slice(i, i + chunkSize);
          await primaryDb.insert(table).values(chunk).onConflictDoNothing().execute();
          // Yield to event loop to keep server responsive to live requests
          await new Promise((r) => setTimeout(r, 20));
        }
      }
      grandTotal += allRows.length;
    } catch (tableErr: any) {
      console.error(`[DB Recovery] Error copying table ${name}:`, tableErr.message);
    }
  }

  progress.completedTables = tablesToSync.length;
  progress.currentTable = null;
  console.log(`[DB Recovery] Data replication complete. Total records copied: ${grandTotal}.`);
  return { success: true, totalRows: grandTotal };
}

/**
 * Check if the local database is currently active, accessible, and populated.
 */
export async function isLocalDbHealthy(): Promise<boolean> {
  try {
    const res = await primaryDb.select({ count: sql`count(*)` }).from(schema.content).execute();
    const count = Number(res[0]?.count || 0);
    return count > 0;
  } catch {
    return false;
  }
}

/**
 * Automatically recovers the local database by copying all data from Supabase Primary.
 * ONLY runs if the local database has failed (crashed, corrupted, thrown errors, or deleted/empty).
 * If the local database is healthy and has content records, this function exits immediately.
 */
export async function recoverLocalDbFromPrimary(reason: string, force = false): Promise<{ triggered: boolean; message: string }> {
  const progress = getRecoveryStatus();

  // If already recovering, let ongoing task finish
  if (global._isRecoveringFromPrimary) {
    console.log(`[DB Recovery] Recovery already in progress (started for: ${progress.reason}). Skipping duplicate trigger.`);
    return { triggered: false, message: 'Recovery already in progress' };
  }

  // Cooldown check: avoid hammering within 8 seconds unless forced
  const now = Date.now();
  if (!force && global._lastRecoveryAttempt && (now - global._lastRecoveryAttempt < 8000)) {
    return { triggered: false, message: 'Cooldown active (recent recovery attempt)' };
  }

  // CHECK: Is the database ACTUALLY failed (crashed or deleted)?
  // Unless forced, do NOT copy if database is healthy and populated!
  if (!force) {
    const healthy = await isLocalDbHealthy();
    if (healthy) {
      markPrimaryHealthy();
      return { triggered: false, message: 'Local database is healthy and populated. Copy skipped.' };
    }
  }

  // Mark recovering state
  global._isRecoveringFromPrimary = true;
  global._lastRecoveryAttempt = now;
  markPrimaryFailed();

  progress.inProgress = true;
  progress.reason = reason;
  progress.lastError = null;
  progress.completedTables = 0;

  console.warn(`[DB Recovery] ⚠️ Local Database FAILURE DETECTED: "${reason}". Starting automatic copy from Supabase Primary...`);

  // Run asynchronously in background so queries fall back to Supabase Primary immediately without blocking
  (async () => {
    try {
      // Step 1: Check if PGlite is unresponsive or crashed, rebuild if needed
      let needsReset = false;
      try {
        await getPgliteClient().query('SELECT 1');
      } catch {
        needsReset = true;
      }

      if (needsReset) {
        console.log('[DB Recovery] Local PGlite was unresponsive/crashed. Rebuilding fresh client...');
        await resetPgliteClient();
      }

      // Step 2: Ensure schema tables exist (if tables were dropped/deleted)
      await ensureLocalSchema();

      // Step 3: Copy all data from Supabase Primary
      await copyAllDataFromPrimarySupabase();

      // Step 4: Verify recovery
      const verifyRes = await primaryDb.select({ count: sql`count(*)` }).from(schema.content).execute();
      const newCount = Number(verifyRes[0]?.count || 0);

      if (newCount > 0) {
        markPrimaryHealthy();
        progress.lastRecoveredAt = new Date().toISOString();
        console.log(`[DB Recovery] ✅ SUCCESS: Local database successfully restored from Supabase Primary with ${newCount} content records. Engine marked healthy.`);
      } else {
        throw new Error('Verification failed: local content count is 0 after copy.');
      }
    } catch (err: any) {
      console.error('[DB Recovery] ❌ Failed to recover local database from Supabase Primary:', err.message);
      progress.lastError = err.message;
      markPrimaryFailed();
    } finally {
      global._isRecoveringFromPrimary = false;
      progress.inProgress = false;
    }
  })();

  return { triggered: true, message: `Auto-recovery initiated from Supabase Primary (${reason})` };
}

// Initialization logic on startup
export async function initializeLocalDb() {
  console.log('[DB Init] Checking Local Database health and content count...');
  try {
    await ensureLocalSchema();
    const res = await primaryDb.select({ count: sql`count(*)` }).from(schema.content).execute();
    const count = Number(res[0]?.count || 0);

    if (count === 0) {
      console.log('[DB Init] Local database is empty (0 content rows). Automatically copying all data from Supabase Primary...');
      await recoverLocalDbFromPrimary('Startup check: local database empty / deleted');
    } else {
      console.log(`[DB Init] Local database is active and healthy with ${count} content records. Copy skipped.`);
      markPrimaryHealthy();
    }
  } catch (error: any) {
    console.error('[DB Init] Local database failed startup check:', error.message);
    await recoverLocalDbFromPrimary(`Startup failure: ${error.message}`);
  }
}

// Fallback logic
export function getActiveDbInstance() {
  if (global._primaryDbFailed) {
    return supabasePrimaryDb;
  }
  return primaryDb;
}

export function markPrimaryFailed() {
  global._primaryDbFailed = true;
}

export function markPrimaryHealthy() {
  global._primaryDbFailed = false;
}

export const db = new Proxy(primaryDb as any, {
  get(target, prop, receiver) {
    const activeTarget = getActiveDbInstance();
    const value = Reflect.get(activeTarget, prop, receiver);
    if (typeof value === 'function') {
      return function (...args: any[]) {
        try {
          return value.apply(activeTarget, args);
        } catch (e: any) {
          if (activeTarget !== supabasePrimaryDb) {
            markPrimaryFailed();
            const backupValue = Reflect.get(supabasePrimaryDb, prop, receiver);
            if (typeof backupValue === 'function') {
              return backupValue.apply(supabasePrimaryDb, args);
            }
          }
          throw e;
        }
      };
    }
    return value;
  }
});
