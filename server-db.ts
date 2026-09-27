import { db, primaryDb, backupDb, markPrimaryFailed, markPrimaryHealthy, recoverLocalDbFromPrimary, getRecoveryStatus } from './src/db/index.js';
import { initializeApp } from 'firebase/app';
import { getFirestore, initializeFirestore, setLogLevel, doc, setDoc as originalSetDoc, deleteDoc as originalDeleteDoc, getDoc, collection, getDocs, query as firestoreQuery, where as firestoreWhere, limit as firestoreLimit } from 'firebase/firestore';
import config from './firebase-applet-config.json' with { type: 'json' };
import { db as supabaseDb } from './src/db/index.js';
import * as schema from './src/db/schema.js';
import { eq, ilike, or, desc, asc, inArray, and, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { LRUCache } from 'lru-cache';
import crypto from 'crypto';


export const dbHealth = {
  local: 'active' as 'active' | 'failed',
  primary: 'active' as 'active' | 'failed',
  backup: 'active' as 'active' | 'failed',
  firestore: 'active' as 'active' | 'failed',
  currentRead: 'local' as 'local' | 'primary' | 'firestore' | 'none'
};

/**
 * Executes a read query against Local SQLite (Primary) -> falls back to Supabase Primary -> fails over to Firestore.
 * Backup Supabase is strictly EXCLUDED from reads.
 */
export async function executeSqlQuery<T>(queryFn: (database: typeof db) => Promise<T>): Promise<T> {
  const { getActiveDbInstance } = await import('./src/db/index.js');
  const activeDb = getActiveDbInstance();

  if (activeDb === primaryDb) {
    // 1. Try Local PGLite (Primary)
    try {
      const res = await queryFn(primaryDb);
      dbHealth.local = 'active';
      dbHealth.currentRead = 'local';
      return res;
    } catch (err: any) {
      console.warn('[DB Router] Local database query failed. Engaging Supabase Primary failover:', err.message);
      dbHealth.local = 'failed';
      markPrimaryFailed();
      // Auto-copy data from Primary Supabase if local database crashed or failed
      recoverLocalDbFromPrimary(`Query execution crash: ${err.message}`).catch(() => {});
    }
  }

  // 2. Failover to Primary Supabase (Secondary Read)
  try {
    // Note: getActiveDbInstance in index.ts handles fallback, but we enforce it here explicitly
    const { supabasePrimaryDb } = await import('./src/db/index.js');
    const res = await queryFn(supabasePrimaryDb);
    dbHealth.primary = 'active';
    dbHealth.currentRead = 'primary';
    return res;
  } catch (err: any) {
    console.warn('[DB Router] Supabase Primary query failed. Triggering Firestore failover:', err.message);
    dbHealth.primary = 'failed';
    throw err; // Fail completely so the caller falls back to Firestore
  }
}

/**
 * Executes a write operation across all SQL instances (Local SQLite + Primary Supabase + Backup Supabase write-only).
 */
export async function executeSqlWrite<T>(writeFn: (database: typeof db) => Promise<T>): Promise<T> {
  let primarySuccess = false;
  let result: any = null;
  const { supabasePrimaryDb, supabaseBackupPool, backupDb } = await import('./src/db/index.js');

  // 1. Write to Primary Supabase (Main truth)
  try {
    result = await writeFn(supabasePrimaryDb);
    primarySuccess = true;
    dbHealth.primary = 'active';
  } catch (err: any) {
    console.warn('[DB Router] Primary Supabase write failed:', err.message);
    dbHealth.primary = 'failed';
  }

  // 2. Write to Local PGLite (Primary Cache)
  try {
    await writeFn(primaryDb);
    dbHealth.local = 'active';
  } catch (err: any) {
    console.warn('[DB Router] Local database write failed:', err.message);
    dbHealth.local = 'failed';
    markPrimaryFailed();

    // Auto-copy data from Primary Supabase if local database crashed or failed
    recoverLocalDbFromPrimary(`Write execution crash: ${err.message}`).catch(() => {});
  }

  // 3. Write to Backup Supabase (Write-Only! No reads from this database!)
  if (backupDb) {
    try {
      await writeFn(backupDb);
      dbHealth.backup = 'active';
    } catch (bErr: any) {
      console.error('[DB Router] Backup Supabase write failed:', bErr.message);
      dbHealth.backup = 'failed';
    }
  }

  if (!primarySuccess) {
    throw new Error('Primary Supabase write failed. Relying on Firestore replication.');
  }

  return result;
}

// In-Memory Global Cache
export const contentMemoryCache = new LRUCache<string, any>({
  max: 500,
  ttl: 1000 * 60 * 60 * 24, // 24 hours
});

export function invalidateContentCache() {
  contentMemoryCache.clear();
  console.log('[Cache] Content memory cache cleared due to updates');
}

// Initialize secondary Firestore instance with silent logging & robust polling
try {
  setLogLevel('silent');
} catch {}

const app = initializeApp(config);
export const firestoreDb = (() => {
  try {
    return initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      experimentalAutoDetectLongPolling: true,
    }, config.firestoreDatabaseId);
  } catch {
    return getFirestore(app, config.firestoreDatabaseId);
  }
})();

// ------------------------------------------------------------------
// FIRESTORE QUOTA CIRCUIT BREAKER
// ------------------------------------------------------------------
let firestoreQuotaExceededUntil = 0;

export function markFirestoreQuotaExceeded() {
  if (Date.now() < firestoreQuotaExceededUntil) return;
  // Disable Firestore replication for 24 hours to prevent resource/log spam during daily quota exhaustion
  firestoreQuotaExceededUntil = Date.now() + 24 * 60 * 60 * 1000;
  console.warn(`[SyncQueue] Firestore quota exceeded (RESOURCE_EXHAUSTED). Circuit breaker active. Direct replication and sync queue processing paused for 24 hours.`);
}

export function isFirestoreQuotaActive(): boolean {
  return Date.now() < firestoreQuotaExceededUntil;
}

async function setDoc(docRef: any, payload: any, options?: any) {
  if (isFirestoreQuotaActive()) {
    throw new Error('RESOURCE_EXHAUSTED: Firestore circuit breaker is active (quota exceeded).');
  }
  try {
    return await originalSetDoc(docRef, payload, options);
  } catch (err: any) {
    if (err?.code === 'resource-exhausted' || err?.code === 8 || (err?.message && (err.message.includes('RESOURCE_EXHAUSTED') || err.message.toLowerCase().includes('quota')))) {
      markFirestoreQuotaExceeded();
    }
    throw err;
  }
}

async function deleteDoc(docRef: any) {
  if (isFirestoreQuotaActive()) {
    throw new Error('RESOURCE_EXHAUSTED: Firestore circuit breaker is active (quota exceeded).');
  }
  try {
    return await originalDeleteDoc(docRef);
  } catch (err: any) {
    if (err?.code === 'resource-exhausted' || err?.code === 8 || (err?.message && (err.message.includes('RESOURCE_EXHAUSTED') || err.message.toLowerCase().includes('quota')))) {
      markFirestoreQuotaExceeded();
    }
    throw err;
  }
}

// Replicate write operation to Backup Supabase and Firestore in order
export function replicateWrite(
  operationType: 'CREATE' | 'UPDATE' | 'DELETE',
  entityType: string,
  entityId: string,
  payload: any,
  firestoreDocRef?: any
) {
  // 1. Direct write to Supabase Backup (Async / Non-blocking)
  (async () => {
    try {
      const { backupDb } = await import('./src/db/index.js');
      if (backupDb) {
        const table = (schema as any)[entityType] || (schema as any)[entityType.replace(/_([a-z])/g, (_: any, l: string) => l.toUpperCase())];
        if (table) {
          const keyColumn = table.id || table.key;
          if (operationType === 'UPDATE' && keyColumn) {
            // For updates, use sql UPDATE to safely apply partial fields without requiring non-nullable columns
            await backupDb.update(table).set(payload).where(eq(keyColumn, entityId));
          } else if (operationType === 'CREATE') {
            const dataToInsert = { ...payload };
            if (keyColumn && !dataToInsert[keyColumn.name || 'id']) {
              dataToInsert[keyColumn.name || 'id'] = entityId;
            }
            if (keyColumn) {
              await backupDb.insert(table).values(dataToInsert).onConflictDoUpdate({
                target: keyColumn,
                set: dataToInsert
              });
            } else {
              await backupDb.insert(table).values(dataToInsert).onConflictDoNothing();
            }
          } else if (operationType === 'DELETE') {
            if (keyColumn) {
              await backupDb.delete(table).where(eq(keyColumn, entityId));
            }
          }
        }
      }
    } catch (bErr: any) {
      console.warn(`[Replication:BackupSupabase] Error replicating ${entityType}/${entityId}:`, bErr.message);
      // Queue for retry
      queueSyncOperation(operationType, entityType, entityId, payload, 'supabase_backup').catch(() => {});
    }
  })();

  // 2. Direct write to Firestore (Excluded: analytics_views, analytics_downloads, caches)
  const excludedFromFirestore = ['analytics_views', 'analytics_downloads', 'homepage_cache', 'leaderboard_cache', 'franchise_cache'];
  if (excludedFromFirestore.includes(entityType)) {
    // Skip Firestore for high-frequency/quota-heavy analytics and cache entities
    return;
  }

  if (isFirestoreQuotaActive()) {
    queueSyncOperation(operationType, entityType, entityId, payload, 'firestore').catch(() => {});
    return;
  }

  if (firestoreDocRef) {
    (async () => {
      try {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 3000));
        if (operationType === 'DELETE') {
          await Promise.race([deleteDoc(firestoreDocRef), timeoutPromise]);
        } else {
          await Promise.race([setDoc(firestoreDocRef, payload, { merge: true }), timeoutPromise]);
        }
      } catch (err: any) {
        if (err?.code === 'resource-exhausted' || err?.code === 8 || (err?.message && (err.message.includes('RESOURCE_EXHAUSTED') || err.message.toLowerCase().includes('quota')))) {
          markFirestoreQuotaExceeded();
        }
        queueSyncOperation(operationType, entityType, entityId, payload, 'firestore').catch(() => {});
      }
    })();
  }
}

// Backward-compatible alias
export const replicateToFirestore = replicateWrite;

/** =========================================================================
 *  DURABLE REPLICATION & SYNCHRONIZATION QUEUE (SUPABASE <-> FIRESTORE)
 *  ========================================================================= */

export async function queueSyncOperation(
  operationType: 'CREATE' | 'UPDATE' | 'DELETE',
  entityType: string,
  entityId: string,
  payload: any,
  targetDatabase: string = 'firestore'
) {
  try {
    const opId = uuidv4();
    await supabaseDb.insert(schema.syncOperations).values({
      id: opId,
      operationType,
      entityType,
      entityId,
      targetDatabase,
      payload,
      status: 'pending',
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    console.log(`[SyncQueue] Queued ${operationType} on ${entityType}/${entityId} for ${targetDatabase}`);
  } catch (err: any) {
    console.error('[SyncQueue] Failed to persist sync operation in Supabase (Primary down?):', err.message);
    dbHealth.primary = 'failed';
    // Fallback: execute synchronously
    console.log(`[SyncQueue] Primary DB down. Executing ${targetDatabase} sync synchronously.`);
    executeReplicationTask({
      id: 'sync_fallback',
      operationType,
      entityType,
      entityId,
      targetDatabase,
      payload,
      retryCount: 0
    }).catch(e => console.error("Fallback replication failed", e));
  }
}

/**
 * Executes a sync task against target database
 */
async function executeReplicationTask(op: any): Promise<boolean> {
  const { operationType, entityType, entityId, targetDatabase, payload } = op;
  
  if (targetDatabase === 'firestore') {
    try {
      if (entityType === 'content') {
        const docRef = doc(firestoreDb, 'content', entityId);
        if (operationType === 'CREATE' || operationType === 'UPDATE') {
          await setDoc(docRef, payload, { merge: true });
        } else if (operationType === 'DELETE') {
          await deleteDoc(docRef);
        }
      } else if (entityType === 'users') {
        const docRef = doc(firestoreDb, 'users', entityId);
        if (operationType === 'CREATE' || operationType === 'UPDATE') {
          await setDoc(docRef, payload, { merge: true });
        } else if (operationType === 'DELETE') {
          await deleteDoc(docRef);
        }
      } else if (entityType === 'user_lists') {
        const userId = payload?.userId || 'unknown';
        const docRef = doc(firestoreDb, `users/${userId}/lists/${entityId}`);
        if (operationType === 'CREATE' || operationType === 'UPDATE') {
          await setDoc(docRef, payload, { merge: true });
        } else if (operationType === 'DELETE') {
          await deleteDoc(docRef);
        }
      } else if (entityType === 'user_ratings') {
        const docRef = doc(firestoreDb, 'ratings', entityId);
        if (operationType === 'CREATE' || operationType === 'UPDATE') {
          await setDoc(docRef, payload, { merge: true });
        } else if (operationType === 'DELETE') {
          await deleteDoc(docRef);
        }
      } else if (entityType === 'analytics_views' || entityType === 'analytics_downloads') {
        // Views and downloads tracking is Supabase-only - strictly do not write or replicate to Firestore
        return true;
      } else if (entityType === 'ads') {
        const docRef = doc(firestoreDb, 'ads', entityId);
        if (operationType === 'CREATE' || operationType === 'UPDATE') {
          await setDoc(docRef, payload, { merge: true });
        } else if (operationType === 'DELETE') {
          await deleteDoc(docRef);
        }
      } else if (entityType === 'ad_slots') {
        const docRef = doc(firestoreDb, 'ad_slots', entityId);
        if (operationType === 'CREATE' || operationType === 'UPDATE') {
          await setDoc(docRef, payload, { merge: true });
        } else if (operationType === 'DELETE') {
          await deleteDoc(docRef);
        }
      } else if (entityType === 'requests') {
        const docRef = doc(firestoreDb, 'requests', entityId);
        if (operationType === 'CREATE' || operationType === 'UPDATE') {
          await setDoc(docRef, payload, { merge: true });
        } else if (operationType === 'DELETE') {
          await deleteDoc(docRef);
        }
      } else if (entityType === 'admin_settings') {
        const docRef = doc(firestoreDb, 'admin_settings', entityId);
        if (operationType === 'CREATE' || operationType === 'UPDATE') {
          await setDoc(docRef, payload, { merge: true });
        }
      } else if (entityType === 'homepage_cache') {
        // Homepage cache is strictly Supabase-only - explicitly exclude from Firestore synchronization
        return true;
      }
      return true;
    } catch (err: any) {
      console.warn(`[Replication] Firestore error for ${entityType}/${entityId}:`, err.message);
      return false;
    }
  } else if (targetDatabase === 'supabase_backup') {
    // Secondary Supabase Backup target
    const { backupDb } = await import('./src/db/index.js');
    if (!backupDb) return true; // Gracefully pass if no backup configured

    try {
      const table = (schema as any)[entityType] || (schema as any)[entityType.replace(/_([a-z])/g, (_: any, l: string) => l.toUpperCase())];
      if (!table) return false;
      
      const keyColumn = table.id || table.key;
      if (operationType === 'UPDATE' && keyColumn) {
        await backupDb.update(table).set(payload).where(eq(keyColumn, entityId));
      } else if (operationType === 'CREATE') {
        const dataToInsert = { ...payload };
        if (keyColumn && !dataToInsert[keyColumn.name || 'id']) {
          dataToInsert[keyColumn.name || 'id'] = entityId;
        }
        if (keyColumn) {
          await backupDb.insert(table).values(dataToInsert).onConflictDoUpdate({
            target: keyColumn,
            set: dataToInsert
          });
        } else {
          await backupDb.insert(table).values(dataToInsert).onConflictDoNothing();
        }
      } else if (operationType === 'DELETE') {
        if (keyColumn) {
          await backupDb.delete(table).where(eq(keyColumn, entityId));
        }
      }
      return true;
    } catch (err: any) {
      console.warn(`[Replication] Supabase Backup error for ${entityType}/${entityId}:`, err.message);
      return false;
    }
  }
  return false;
}

export async function processSyncQueue(): Promise<{ processed: number; succeeded: number; failed: number }> {
  if (isFirestoreQuotaActive()) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }
  try {
    const pendingOps = await db.select()
      .from(schema.syncOperations)
      .where(eq(schema.syncOperations.status, 'pending'))
      .orderBy(asc(schema.syncOperations.createdAt))
      .limit(50);

    let succeeded = 0;
    let failed = 0;

    for (const op of pendingOps) {
      const ok = await executeReplicationTask(op);
      if (ok) {
        await supabaseDb.update(schema.syncOperations)
          .set({ status: 'completed', updatedAt: new Date() })
          .where(eq(schema.syncOperations.id, op.id));
        succeeded++;
      } else {
        const newRetryCount = (op.retryCount || 0) + 1;
        await supabaseDb.update(schema.syncOperations)
          .set({ 
            retryCount: newRetryCount,
            lastError: 'Firestore write failed or quota exceeded',
            status: newRetryCount > 100 ? 'abandoned' : 'pending',
            updatedAt: new Date()
          })
          .where(eq(schema.syncOperations.id, op.id));
        failed++;
      }
    }
    return { processed: pendingOps.length, succeeded, failed };
  } catch (err: any) {
    const errMsg = err instanceof Error && (err as any).cause ? (err as any).cause.message || err.message : err.message;
    if (errMsg && !errMsg.includes('ECONNREFUSED') && !errMsg.includes('timeout')) {
      console.error('[SyncQueue] Processing error:', errMsg);
    }
    return { processed: 0, succeeded: 0, failed: 0 };
  }
}

// Start recurring synchronization runner (every 1 hour = 3600000 ms)
setInterval(() => {
  processSyncQueue().catch(() => {});
}, 3600000);

/** =========================================================================
 *  DATABASE RECONCILIATION & STATUS
 *  ========================================================================= */

export async function getDatabaseStatus(): Promise<any> {
  let localOk = false;
  let supabasePrimaryOk = false;
  let supabaseBackupOk = false;
  let localCounts: any = {};
  let supabaseCounts: any = {};
  let localError: string | null = null;
  let supabasePrimaryError: string | null = null;
  let supabaseBackupError: string | null = null;
  let pendingSync = 0;

  // 1. Check Local PGLite Database
  const localStart = Date.now();
  let localLatency = 0;
  try {
    const [contentRes, usersRes, ratingsRes, viewsRes, dlRes, cacheRes, franchiseRes, reqRes] = await Promise.all([
      primaryDb.select({ count: sql<number>`count(*)` }).from(schema.content),
      primaryDb.select({ count: sql<number>`count(*)` }).from(schema.users),
      primaryDb.select({ count: sql<number>`count(*)` }).from(schema.userRatings),
      primaryDb.select({ count: sql<number>`count(*)` }).from(schema.analyticsViews),
      primaryDb.select({ count: sql<number>`count(*)` }).from(schema.analyticsDownloads),
      primaryDb.select({ count: sql<number>`count(*)` }).from(schema.homepageCache),
      primaryDb.select({ count: sql<number>`count(*)` }).from(schema.franchiseCache),
      primaryDb.select({ count: sql<number>`count(*)` }).from(schema.requests)
    ]);
    localLatency = Date.now() - localStart;
    localOk = true;
    localCounts = {
      content: Number(contentRes[0]?.count || 0),
      users: Number(usersRes[0]?.count || 0),
      ratings: Number(ratingsRes[0]?.count || 0),
      views: Number(viewsRes[0]?.count || 0),
      downloads: Number(dlRes[0]?.count || 0),
      homepageCache: Number(cacheRes[0]?.count || 0),
      franchiseCache: Number(franchiseRes[0]?.count || 0),
      requests: Number(reqRes[0]?.count || 0)
    };
  } catch (e: any) {
    localError = e?.message || 'Local database query error';
    console.warn('[DB Status] Local PGLite error:', localError);
  }

  // Automatic copy from Primary Supabase if local database failed (crashed or deleted/empty)
  if (!localOk || !localCounts.content || localCounts.content === 0) {
    recoverLocalDbFromPrimary(
      !localOk ? `Crash detected in health monitor: ${localError}` : 'Database deleted or empty (0 content rows)'
    ).catch(() => {});
  }

  // 2. Check Supabase Primary Database
  const supStart = Date.now();
  let supabasePrimaryLatency = 0;
  try {
    const { supabasePrimaryDb } = await import('./src/db/index.js');
    const [contentRes, usersRes, ratingsRes, viewsRes, dlRes, syncCount] = await Promise.all([
      supabasePrimaryDb.select({ count: sql<number>`count(*)` }).from(schema.content),
      supabasePrimaryDb.select({ count: sql<number>`count(*)` }).from(schema.users),
      supabasePrimaryDb.select({ count: sql<number>`count(*)` }).from(schema.userRatings),
      supabasePrimaryDb.select({ count: sql<number>`count(*)` }).from(schema.analyticsViews),
      supabasePrimaryDb.select({ count: sql<number>`count(*)` }).from(schema.analyticsDownloads),
      supabasePrimaryDb.select({ count: sql<number>`count(*)` }).from(schema.syncOperations).where(eq(schema.syncOperations.status, 'pending'))
    ]);
    supabasePrimaryLatency = Date.now() - supStart;
    supabasePrimaryOk = true;
    supabaseCounts = {
      content: Number(contentRes[0]?.count || 0),
      users: Number(usersRes[0]?.count || 0),
      ratings: Number(ratingsRes[0]?.count || 0),
      views: Number(viewsRes[0]?.count || 0),
      downloads: Number(dlRes[0]?.count || 0),
    };
    pendingSync = Number(syncCount[0]?.count || 0);
  } catch (e: any) {
    supabasePrimaryError = e?.message || 'Supabase primary connection failed';
    console.warn('[DB Status] Supabase Primary error:', supabasePrimaryError);
  }

  // 3. Check Supabase Backup Database
  const backupStart = Date.now();
  let supabaseBackupLatency = 0;
  try {
    if (backupDb) {
      await backupDb.select({ count: sql<number>`count(*)` }).from(schema.content).limit(1);
      supabaseBackupLatency = Date.now() - backupStart;
      supabaseBackupOk = true;
    } else {
      supabaseBackupError = 'Backup database client not initialized';
    }
  } catch (e: any) {
    supabaseBackupError = e?.message || 'Supabase backup connection failed';
    console.warn('[DB Status] Supabase Backup error:', supabaseBackupError);
  }

  // 4. Check Google Cloud Firestore
  const firestoreOk = !isFirestoreQuotaActive();
  let firestoreError: string | null = null;
  if (!firestoreOk) {
    firestoreError = 'Firestore circuit breaker open (quota limit exceeded or throttled)';
  }

  // Determine current live traffic read gateway
  let currentRead: 'local' | 'supabase_primary' | 'firestore' | 'none' = 'none';
  if (localOk && localCounts.content > 0) {
    currentRead = 'local';
  } else if (supabasePrimaryOk) {
    currentRead = 'supabase_primary';
  } else if (firestoreOk) {
    currentRead = 'firestore';
  }

  dbHealth.primary = localOk ? 'active' : (supabasePrimaryOk ? 'active' : 'failed');
  dbHealth.backup = supabaseBackupOk ? 'active' : 'failed';
  dbHealth.firestore = firestoreOk ? 'active' : 'failed';
  dbHealth.currentRead = currentRead === 'local' || currentRead === 'supabase_primary' ? 'primary' : (firestoreOk ? 'firestore' : 'none');

  return {
    summary: {
      totalDatabases: 4,
      healthyCount: (localOk ? 1 : 0) + (supabasePrimaryOk ? 1 : 0) + (supabaseBackupOk ? 1 : 0) + (firestoreOk ? 1 : 0),
      currentRead,
      timestamp: new Date().toISOString()
    },
    // Database 1: Local Database
    local: {
      name: 'Local In-Memory Database (PGLite)',
      provider: 'Embedded WebAssembly PostgreSQL (Local)',
      role: 'Primary Read & Query Engine (Zero Quota, 0ms Latency)',
      status: (localOk && localCounts.content > 0) ? 'active' : 'failed',
      isRecovering: getRecoveryStatus().inProgress,
      recoveryProgress: getRecoveryStatus(),
      latencyMs: localLatency,
      counts: localOk ? localCounts : {},
      error: localError,
      region: 'In-Memory Local Container',
      writeStatus: 'Synchronous In-Memory Write'
    },
    // Database 2: Supabase Primary PostgreSQL
    supabasePrimary: {
      name: 'Primary Supabase PostgreSQL',
      provider: 'Supabase AWS Frankfurt (eu-central-1)',
      role: 'Main Cloud Authority & Startup Hydration Source',
      status: supabasePrimaryOk ? 'active' : 'failed',
      latencyMs: supabasePrimaryLatency,
      counts: supabasePrimaryOk ? supabaseCounts : {},
      error: supabasePrimaryError,
      region: 'eu-central-1 (Frankfurt)',
      writeStatus: 'Synchronous Multi-Write'
    },
    // Database 3: Supabase Backup PostgreSQL
    supabaseBackup: {
      name: 'Backup Supabase PostgreSQL',
      provider: 'Supabase AWS London (eu-west-2)',
      role: 'Disaster Recovery & Hot Cloud Replica',
      status: supabaseBackupOk ? 'active' : 'failed',
      latencyMs: supabaseBackupLatency,
      counts: {},
      error: supabaseBackupError,
      region: 'eu-west-2 (London)',
      writeStatus: 'Asynchronous Replicated Multi-Write'
    },
    // Database 4: Google Cloud Firestore
    firestore: {
      name: 'Google Cloud Firestore',
      provider: 'Google Cloud Platform (europe-west2)',
      role: 'Tertiary Document Fallback & Resilience Tier',
      status: firestoreOk ? 'active' : 'failed',
      error: firestoreError,
      region: 'europe-west2',
      collectionNames: ['content', 'users', 'ratings', 'views', 'downloads', 'admin_settings', 'ads', 'ad_slots', 'requests'],
      writeStatus: firestoreOk ? 'Continuous Cloud Event Replication' : 'Circuit Breaker Suspended'
    },
    // Sync Queue Details
    syncQueue: {
      pendingOperations: pendingSync,
      mode: 'Durable Outbox Eventual Consistency Queue'
    },
    // Backwards compatibility keys
    primary: localOk ? 'active' : (supabasePrimaryOk ? 'active' : 'failed'),
    backup: supabaseBackupOk ? 'active' : 'failed',
    currentReadGateway: currentRead
  };
}

/** =========================================================================
 *  CONTENT REPOSITORY (PRIMARY: CLOUD SQL / SUPABASE, SECONDARY: FIRESTORE)
 *  ========================================================================= */

export async function getContentCardsForCache(): Promise<any[]> {
  try {
    const items = await executeSqlQuery(async (sqlDb) => {
      return await sqlDb.select({
        id: schema.content.id,
        title: schema.content.title,
        originalTitle: schema.content.originalTitle,
        name: schema.content.name,
        originalName: schema.content.originalName,
        year: schema.content.year,
        rating: schema.content.rating,
        votes: schema.content.votes,
        duration: schema.content.duration,
        category: schema.content.category,
        genres: schema.content.genres,
        posterUrl: schema.content.posterUrl,
        backdropUrl: schema.content.backdropUrl,
        director: schema.content.director,
        directorPhotoUrl: schema.content.directorPhotoUrl,
        language: schema.content.language,
        country: schema.content.country,
        isIndian: schema.content.isIndian,
        franchise: schema.content.franchise,
        franchiseName: schema.content.franchiseName,
        franchiseOrder: schema.content.franchiseOrder,
        franchiseDescription: schema.content.franchiseDescription,
        description: schema.content.description,
        network: schema.content.network,
        releaseDate: schema.content.releaseDate,
        format: schema.content.format,
        maleActors: schema.content.maleActors,
        femaleActors: schema.content.femaleActors,
        actorsData: schema.content.actorsData,
        cast: schema.content.cast,
        studiosData: schema.content.studiosData,
        createdAt: schema.content.createdAt,
      }).from(schema.content).orderBy(desc(schema.content.createdAt));
    });
    if (items && items.length > 0) return items;
  } catch (e: any) {
    console.error("[ContentRepo] Fast content card query error:", e.message);
  }
  return getAllContent();
}

export async function getAllContent(): Promise<any[]> {
  const cacheKey = "all_content_slim";
  if (contentMemoryCache.has(cacheKey)) {
    return contentMemoryCache.get(cacheKey) as any[];
  }
  try {
    const items = await executeSqlQuery(async (sqlDb) => {
      return await sqlDb.select({
        id: schema.content.id,
        title: schema.content.title,
        posterUrl: schema.content.posterUrl,
        rating: schema.content.rating,
        year: schema.content.year,
        category: schema.content.category,
        genres: schema.content.genres,
        status: schema.content.status,
        quality: schema.content.qualities,
        createdAt: schema.content.createdAt
      }).from(schema.content).orderBy(desc(schema.content.createdAt));
    });
    if (items && items.length > 0) {
      contentMemoryCache.set(cacheKey, items);
      return items;
    }
  } catch (e: any) {
    console.error("[ContentRepo] SQL query failed across all providers:", e.message);
  }
  return [];
}

export async function getAdminContentStats(): Promise<Record<string, number>> {
  try {
    const stats = await executeSqlQuery(async (sqlDb) => {
      return await sqlDb
        .select({
          category: schema.content.category,
          count: sql<number>`count(*)::int`
        })
        .from(schema.content)
        .groupBy(schema.content.category);
    });
    
    const result: Record<string, number> = {};
    for (const row of stats) {
      if (row.category) {
        result[row.category] = Number(row.count);
      }
    }
    return result;
  } catch (e: any) {
    console.error("[ContentRepo] Admin stats failed:", e.message);
    return {};
  }
}

export async function getAdminPaginatedContent(page: number = 1, limitCount: number = 50, search?: string, sortBy: string = 'createdAt', sortDir: 'asc'|'desc' = 'desc', categoryFilter?: string, advanced?: { year?: string, alphabet?: string, genre?: string, rating?: string }): Promise<{ data: any[]; total: number }> {
  try {
    const offset = Math.max(0, (page - 1) * limitCount);
    
    let baseWhere: any = undefined;
    const conditions = [];

    if (categoryFilter && categoryFilter !== 'all') {
      conditions.push(eq(schema.content.category, categoryFilter));
    }

    if (search && search.trim().length > 0) {
      const s = search.trim().toLowerCase();
      conditions.push(or(
        ilike(schema.content.title, `%${s}%`),
        ilike(schema.content.id, `%${s}%`)
      ));
    }

    if (advanced) {
      if (advanced.year && advanced.year !== 'All') {
        const y = parseInt(advanced.year);
        if (!isNaN(y)) conditions.push(eq(schema.content.year, y));
      }
      if (advanced.alphabet && advanced.alphabet !== 'All') {
        const ab = advanced.alphabet;
        if (ab === 'A-D') {
          conditions.push(sql`SUBSTRING(LOWER(${schema.content.title}) FROM 1 FOR 1) IN ('a','b','c','d')`);
        } else if (ab === 'E-H') {
          conditions.push(sql`SUBSTRING(LOWER(${schema.content.title}) FROM 1 FOR 1) IN ('e','f','g','h')`);
        } else if (ab === 'I-L') {
          conditions.push(sql`SUBSTRING(LOWER(${schema.content.title}) FROM 1 FOR 1) IN ('i','j','k','l')`);
        } else if (ab === 'M-P') {
          conditions.push(sql`SUBSTRING(LOWER(${schema.content.title}) FROM 1 FOR 1) IN ('m','n','o','p')`);
        } else if (ab === 'Q-T') {
          conditions.push(sql`SUBSTRING(LOWER(${schema.content.title}) FROM 1 FOR 1) IN ('q','r','s','t')`);
        } else if (ab === 'U-Z') {
          conditions.push(sql`SUBSTRING(LOWER(${schema.content.title}) FROM 1 FOR 1) IN ('u','v','w','x','y','z')`);
        } else if (ab === '#') {
          conditions.push(sql`SUBSTRING(${schema.content.title} FROM 1 FOR 1) ~ '^[0-9]'`);
        }
      }
      if (advanced.genre && advanced.genre !== 'All') {
        conditions.push(sql`${schema.content.genres} @> ${JSON.stringify([advanced.genre])}::jsonb`);
      }
      if (advanced.rating && advanced.rating !== 'All') {
        const r = parseFloat(advanced.rating.replace('+', ''));
        if (!isNaN(r)) conditions.push(sql`${schema.content.rating} >= ${r}`);
      }
    }

    if (conditions.length > 1) {
      baseWhere = and(...conditions);
    } else if (conditions.length === 1) {
      baseWhere = conditions[0];
    }

    return await executeSqlQuery(async (sqlDb) => {
      const countQuery = baseWhere
        ? sqlDb.select({ count: sql<number>`count(*)::int` }).from(schema.content).where(baseWhere)
        : sqlDb.select({ count: sql<number>`count(*)::int` }).from(schema.content);
      
      const countRes = await countQuery;
      const total = Number(countRes[0]?.count || 0);

      let dataQuery = sqlDb.select({
        id: schema.content.id,
        title: schema.content.title,
        category: schema.content.category,
        year: schema.content.year,
        rating: schema.content.rating,
        posterUrl: schema.content.posterUrl,
        createdAt: schema.content.createdAt
      }).from(schema.content);

      if (baseWhere) {
        dataQuery = dataQuery.where(baseWhere) as any;
      }

      let orderClause = desc(schema.content.createdAt);
      if (sortBy === 'title') {
        orderClause = sortDir === 'asc' ? asc(schema.content.title) : desc(schema.content.title);
      } else if (sortBy === 'year') {
        orderClause = sortDir === 'asc' ? asc(schema.content.year) : desc(schema.content.year);
      } else if (sortBy === 'rating') {
        orderClause = sortDir === 'asc' ? asc(schema.content.rating) : desc(schema.content.rating);
      } else if (sortBy === 'category') {
        orderClause = sortDir === 'asc' ? asc(schema.content.category) : desc(schema.content.category);
      } else {
        orderClause = sortDir === 'asc' ? asc(schema.content.createdAt) : desc(schema.content.createdAt);
      }

      const items = await dataQuery.limit(limitCount).offset(offset).orderBy(orderClause);
      return { data: items, total };
    });
  } catch (e: any) {
    console.error("[ContentRepo] Admin paginated content failed:", e.message);
    return { data: [], total: 0 };
  }
}

export async function getPaginatedContent(page: number = 1, limitCount: number = 20, category?: string): Promise<{ data: any[]; total: number }> {
  const cacheKey = `paginated_${page}_${limitCount}_${category || 'all'}`;
  if (contentMemoryCache.has(cacheKey)) {
    return contentMemoryCache.get(cacheKey) as { data: any[]; total: number };
  }

  try {
    const offset = Math.max(0, (page - 1) * limitCount);
    
    let baseWhere: any = undefined;
    if (category && category !== 'all') {
      baseWhere = eq(schema.content.category, category);
    }

    const result = await executeSqlQuery(async (sqlDb) => {
      const countQuery = baseWhere
        ? sqlDb.select({ count: sql<number>`count(*)` }).from(schema.content).where(baseWhere)
        : sqlDb.select({ count: sql<number>`count(*)` }).from(schema.content);
      
      const countRes = await countQuery;
      const total = Number(countRes[0]?.count || 0);

      let dataQuery = sqlDb.select().from(schema.content);
      if (baseWhere) {
        dataQuery = dataQuery.where(baseWhere) as any;
      }
      const items = await dataQuery.limit(limitCount).offset(offset).orderBy(desc(schema.content.createdAt));

      return { data: items, total };
    });

    return result;
  } catch (e) {
    console.warn("[ContentRepo] SQL getPaginatedContent fallback to Firestore", e);
    const all = await getAllContent();
    const filtered = category && category !== 'all' ? all.filter(a => a.category === category) : all;
    return {
      data: filtered.slice((page - 1) * limitCount, page * limitCount),
      total: filtered.length
    };
  }
}

export async function getContentById(id: string): Promise<any | null> {
  try {
    const res = await executeSqlQuery(async (sqlDb) => {
      return await sqlDb.select().from(schema.content).where(eq(schema.content.id, id)).limit(1);
    });
    if (res.length > 0) return res[0];
  } catch (e) {
    console.warn(`[ContentRepo] SQL read failed for ${id}, fallback to Firestore`);
  }
  
  try {
    const d = await getDoc(doc(firestoreDb, 'content', id));
    return d.exists() ? { id: d.id, ...d.data() } : null;
  } catch (fErr) {
    return null;
  }
}

export async function getContentByIds(ids: string[]): Promise<any[]> {
  if (!ids || ids.length === 0) return [];
  try {
    return await executeSqlQuery(async (sqlDb) => {
      return await sqlDb.select().from(schema.content).where(inArray(schema.content.id, ids));
    });
  } catch (e) {
    console.warn("[ContentRepo] Batch read fallback to Firestore", e);
    const all = await getAllContent();
    const set = new Set(ids);
    return all.filter(item => set.has(item.id));
  }
}

function normalizeSearchQuery(input: string): string {
  return input.replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeIlikePattern(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

export type SuggestionResult = {
  id: string;
  title: string | null;
  name: string | null;
  posterUrl: string | null;
  category: string | null;
  year: number | null;
  rating: number | null;
};

function buildSearchCondition(query: string) {
  const trimmed = query.trim();
  const normalized = normalizeSearchQuery(trimmed);
  
  if (!normalized && !trimmed) return null;

  const tokens = normalized.split(/\s+/).filter(token => token.length > 0);
  if (tokens.length === 0) return null;

  // Each token can match against text fields (searchText / title / name),
  // and if it resembles a 4-digit year, it can ALSO match release year (OR, not strict AND).
  const tokenConditions = tokens.slice(0, 8).map(token => {
    const isYear = /^(18|19|20)\d{2}$/.test(token);
    const pattern = `%${escapeIlikePattern(token)}%`;
    const textMatch = ilike(
      sql`COALESCE(${schema.content.searchText}, ${schema.content.title}, ${schema.content.name}, '')`, 
      pattern
    );

    if (isYear) {
      const yearNum = parseInt(token, 10);
      return or(textMatch, eq(schema.content.year, yearNum));
    }
    return textMatch;
  });

  const baseTokenCondition = tokenConditions.length === 1 ? tokenConditions[0] : and(...tokenConditions);

  // If query contains special characters (like 3+3 or 3-3), also check for direct match against title / name / searchText
  const cleanedNoPunctuation = trimmed.replace(/[^a-zA-Z0-9]/g, '');
  if (trimmed.length > 0 && trimmed !== normalized && cleanedNoPunctuation.length > 0) {
    const rawPattern = `%${escapeIlikePattern(trimmed)}%`;
    const noPunctPattern = `%${escapeIlikePattern(cleanedNoPunctuation)}%`;
    const exactSymbolCondition = or(
      ilike(schema.content.title, rawPattern),
      ilike(schema.content.name, rawPattern),
      ilike(schema.content.title, noPunctPattern),
      ilike(schema.content.searchText, rawPattern),
      ilike(schema.content.searchText, noPunctPattern)
    );
    return or(baseTokenCondition, exactSymbolCondition);
  }

  return baseTokenCondition;
}

function buildRelevanceScore(query: string) {
  const trimmed = query.trim().toLowerCase();
  const normalizedSpaces = normalizeSearchQuery(query).toLowerCase();
  const normalizedNoSpaces = query.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

  return sql`
    CASE
      -- Exact title match
      WHEN LOWER(${schema.content.title}) = ${trimmed} THEN 100
      WHEN LOWER(${schema.content.name}) = ${trimmed} THEN 100
      WHEN LOWER(REGEXP_REPLACE(COALESCE(${schema.content.title}, ''), '[^a-zA-Z0-9]', '', 'g')) = ${normalizedNoSpaces} THEN 100
      WHEN LOWER(REGEXP_REPLACE(COALESCE(${schema.content.name}, ''), '[^a-zA-Z0-9]', '', 'g')) = ${normalizedNoSpaces} THEN 100

      -- Title starts with search term
      WHEN LOWER(${schema.content.title}) LIKE ${trimmed + '%'} THEN 90
      WHEN LOWER(${schema.content.name}) LIKE ${trimmed + '%'} THEN 90
      WHEN LOWER(REGEXP_REPLACE(COALESCE(${schema.content.title}, ''), '[^a-zA-Z0-9]', '', 'g')) LIKE ${normalizedNoSpaces + '%'} THEN 85

      -- Search text begins with query
      WHEN ${schema.content.searchText} LIKE ${normalizedSpaces + '%'} THEN 80
      WHEN ${schema.content.searchText} LIKE ${normalizedNoSpaces + '%'} THEN 80

      -- Title contains search term
      WHEN LOWER(${schema.content.title}) LIKE ${'%' + trimmed + '%'} THEN 70
      WHEN LOWER(${schema.content.name}) LIKE ${'%' + trimmed + '%'} THEN 70
      WHEN LOWER(REGEXP_REPLACE(COALESCE(${schema.content.title}, ''), '[^a-zA-Z0-9]', '', 'g')) LIKE ${'%' + normalizedNoSpaces + '%'} THEN 65

      -- Director match
      WHEN LOWER(${schema.content.director}) LIKE ${'%' + trimmed + '%'} THEN 50

      -- Search text contains term anywhere
      WHEN ${schema.content.searchText} LIKE ${'%' + normalizedSpaces + '%'} THEN 30
      WHEN ${schema.content.searchText} LIKE ${'%' + normalizedNoSpaces + '%'} THEN 30
      ELSE 10
    END
  `;
}

export async function searchContentSuggestions(q: string, category?: string): Promise<SuggestionResult[]> {
  try {
    const searchCondition = buildSearchCondition(q);
    if (!searchCondition) {
      return [];
    }
    
    return await executeSqlQuery(async (sqlDb) => {
      let queryBuilder: any = sqlDb.select({
        id: schema.content.id,
        title: schema.content.title,
        name: schema.content.name,
        posterUrl: schema.content.posterUrl,
        category: schema.content.category,
        year: schema.content.year,
        rating: schema.content.rating
      }).from(schema.content);
      
      if (category && category !== 'all') {
        queryBuilder = queryBuilder.where(
          and(eq(schema.content.category, category), searchCondition)
        );
      } else {
        queryBuilder = queryBuilder.where(searchCondition);
      }
      
      const relevanceScore = buildRelevanceScore(q);
      const popularityBoost = sql`COALESCE(${schema.content.rating}, 0)`;
      
      return await queryBuilder.limit(10).orderBy(
        desc(relevanceScore),
        desc(popularityBoost),
        desc(schema.content.createdAt)
      );
    });
  } catch (e) {
    console.warn("[ContentRepo] SQL search suggestions fallback", e);
    const all = await getAllContent();
    const lq = normalizeSearchQuery(q.trim()).toLowerCase();
    
    if (!lq) return [];
    
    return all.filter(c => {
      const matchCat = !category || category === 'all' || c.category === category;
      const cTitle = c.title ? normalizeSearchQuery(c.title).toLowerCase() : '';
      const cName = c.name ? normalizeSearchQuery(c.name).toLowerCase() : '';
      const cYear = String(c.year || '');
      const rawQ = q.trim().toLowerCase();
      const rawTitle = (c.title || '').toLowerCase();
      const matchText = (cTitle.includes(lq) || cName.includes(lq) || cYear === lq || rawTitle.includes(rawQ));
      return matchCat && matchText;
    }).slice(0, 10).map(c => ({
      id: c.id,
      title: c.title,
      name: c.name,
      posterUrl: c.posterUrl,
      category: c.category,
      year: c.year,
      rating: c.rating
    }));
  }
}

export async function searchContentServer(q: string, category?: string): Promise<any[]> {
  try {
    const trimmed = (q || '').trim();
    if (!trimmed) {
      return await getPaginatedContent(1, 40, category).then(r => r.data);
    }
    
    const searchCondition = buildSearchCondition(q);
    if (!searchCondition) {
       return await getPaginatedContent(1, 40, category).then(r => r.data);
    }

    return await executeSqlQuery(async (sqlDb) => {
      let query: any;
      if (category && category !== 'all') {
        query = sqlDb.select().from(schema.content).where(
          and(eq(schema.content.category, category), searchCondition)
        );
      } else {
        query = sqlDb.select().from(schema.content).where(searchCondition);
      }
      
      const relevanceScore = buildRelevanceScore(q);
      const popularityBoost = sql`COALESCE(${schema.content.rating}, 0)`;

      const results = await query.limit(60).orderBy(
        desc(relevanceScore),
        desc(popularityBoost),
        desc(schema.content.createdAt)
      );
      return results;
    });
  } catch (e) {
    console.warn("[ContentRepo] SQL search fallback", e);
    const all = await getAllContent();
    const lq = normalizeSearchQuery(q.trim()).toLowerCase();
    
    if (!lq) return await getPaginatedContent(1, 40, category).then(r => r.data);
    
    const rawQ = q.trim().toLowerCase();
    return all.filter(c => {
      const matchCat = !category || category === 'all' || c.category === category;
      const cTitle = (c.title || '').toLowerCase();
      const cName = (c.name || '').toLowerCase();
      const cDirector = (c.director || '').toLowerCase();
      const cFranchise = (c.franchise || '').toLowerCase();
      const cYear = String(c.year || '');
      const matchText = (cTitle.includes(lq) || 
                          cName.includes(lq) || 
                          cDirector.includes(lq) || 
                          cFranchise.includes(lq) ||
                          cYear === lq ||
                          cTitle.includes(rawQ) ||
                          cName.includes(rawQ));
      return matchCat && matchText;
    }).slice(0, 50);
  }
}

/** =========================================================================
 *  HOMEPAGE PREPARED DATASETS & PROGRESSIVE PAGINATION (LIMIT 50)
 *  ========================================================================= */

const CURATED_DIRECTORS: Record<string, string[]> = {
  All: ['Christopher Nolan', 'Martin Scorsese', 'Denis Villeneuve', 'Quentin Tarantino', 'David Fincher', 'Steven Spielberg', 'Francis Ford Coppola', 'James Cameron', 'Ridley Scott', 'Paul Thomas Anderson', 'Hayao Miyazaki', 'Stanley Kubrick', 'Alfred Hitchcock', 'Peter Jackson', 'Bong Joon Ho', 'Guillermo del Toro', 'Greta Gerwig', 'Wes Anderson', 'Clint Eastwood', 'Alfonso Cuarón'],
  Movies: ['Christopher Nolan', 'Martin Scorsese', 'Denis Villeneuve', 'Quentin Tarantino', 'David Fincher', 'Steven Spielberg', 'Francis Ford Coppola', 'James Cameron', 'Ridley Scott', 'Paul Thomas Anderson', 'Hayao Miyazaki', 'Stanley Kubrick', 'Alfred Hitchcock', 'Peter Jackson', 'Bong Joon Ho', 'Guillermo del Toro', 'Greta Gerwig', 'Wes Anderson', 'Clint Eastwood', 'Alfonso Cuarón'],
  Series: ['Vince Gilligan', 'David Chase', 'Craig Mazin', 'Damon Lindelof', 'Jesse Armstrong', 'Mike White', 'Sam Esmail', 'Ryan Murphy', 'Shonda Rhimes', 'Noah Hawley', 'Mark Mylod', 'Michelle MacLaren', 'Hiro Murai', 'Cary Joji Fukunaga', 'Johan Renck', 'Miguel Sapochnik', 'David Nutter', 'Lesli Linka Glatter', 'Greg Yaitanes', 'Tim Van Patten'],
  Animation: ['Hayao Miyazaki', 'John Lasseter', 'Brad Bird', 'Pete Docter', 'Isao Takahata', 'Lee Unkrich', 'Andrew Stanton', 'Chris Sanders', 'Dean DeBlois', 'Rich Moore', 'Byron Howard', 'Mamoru Hosoda', 'Makoto Shinkai', 'Satoshi Kon', 'Hideaki Anno', 'Nick Park', 'Tomm Moore', 'Henry Selick', 'Don Bluth', 'Genndy Tartakovsky'],
  Anime: ['Hayao Miyazaki', 'Makoto Shinkai', 'Satoshi Kon', 'Hideaki Anno', 'Isao Takahata', 'Mamoru Hosoda', 'Shinichiro Watanabe', 'Tetsurō Araki', 'Masashi Ando', 'Katsuhiro Otomo', 'Kenji Kamiyama', 'Hiroyuki Imaishi', 'Masaaki Yuasa', 'Naoko Yamada', 'Yoshiyuki Tomino', 'Mamoru Oshii', 'Goro Taniguchi', 'Akiyuki Shinbo', 'Rie Matsumoto', 'Tatsuki'],
  Asian: ['Bong Joon-ho', 'Park Chan-wook', 'Wong Kar-wai', 'Akira Kurosawa', 'Zhang Yimou', 'Ang Lee', 'Kore-eda Hirokazu', 'Hou Hsiao-hsien', 'Edward Yang', 'Lee Chang-dong', 'Kim Jee-woon', 'Jia Zhangke', 'Yasujiro Ozu', 'Kenji Mizoguchi', 'Takeshi Kitano', 'Ryusuke Hamaguchi', 'John Woo', 'Chen Kaige', 'Apichatpong Weerasethakul', 'Tsai Ming-liang'],
  Indian: ['S. S. Rajamouli', 'Satyajit Ray', 'Sanjay Leela Bhansali', 'Rajkumar Hirani', 'Mani Ratnam', 'Anurag Kashyap', 'Karan Johar', 'Yash Chopra', 'Rohit Shetty', 'Zoya Akhtar', 'Lokesh Kanagaraj', 'Sukumar', 'Prashanth Neel', 'Sandeep Reddy Vanga', 'Shankar', 'Atlee', 'Vetrimaaran', 'Imtiaz Ali', 'Shoojit Sircar', 'Vishal Bhardwaj']
};

const CURATED_MALE_ACTORS: Record<string, string[]> = {
  All: ['Leonardo DiCaprio', 'Timothée Chalamet', 'Robert Pattinson', 'Al Pacino', 'Robert De Niro', 'Brad Pitt', 'Tom Cruise', 'Marlon Brando', 'Tom Hanks', 'Daniel Day-Lewis', 'Morgan Freeman', 'Jack Nicholson', 'Denzel Washington', 'Anthony Hopkins', 'Christian Bale', 'Gary Oldman', 'Joaquin Phoenix', 'Harrison Ford', 'Samuel L. Jackson', 'Clint Eastwood', 'Johnny Depp', 'Heath Ledger'],
  Movies: ['Leonardo DiCaprio', 'Timothée Chalamet', 'Robert Pattinson', 'Al Pacino', 'Robert De Niro', 'Brad Pitt', 'Tom Cruise', 'Marlon Brando', 'Tom Hanks', 'Daniel Day-Lewis', 'Morgan Freeman', 'Jack Nicholson', 'Denzel Washington', 'Anthony Hopkins', 'Christian Bale', 'Gary Oldman', 'Joaquin Phoenix', 'Harrison Ford', 'Samuel L. Jackson', 'Clint Eastwood', 'Johnny Depp', 'Heath Ledger'],
  Series: ['Bryan Cranston', 'James Gandolfini', 'Peter Dinklage', 'Jon Hamm', 'Bob Odenkirk', 'Matthew McConaughey', 'Jeremy Strong', 'Kieran Culkin', 'Aaron Paul', 'Steve Carell', 'Jason Bateman', 'Bill Hader', 'Sterling K. Brown', 'Pedro Pascal', 'Woody Harrelson', 'Idris Elba', 'Cillian Murphy', 'Michael C. Hall', 'Kiefer Sutherland', 'Ted Danson'],
  Animation: ['Mark Hamill', 'Kevin Conroy', 'Mel Blanc', 'Frank Welker', 'Robin Williams', 'Eddie Murphy', 'Tom Hanks', 'Tim Allen', 'Mike Myers', 'John Goodman', 'Billy Crystal', 'Jack Black', 'Steve Carell', 'James Earl Jones', 'Jeremy Irons', 'Patrick Stewart', 'Seth MacFarlane', 'H. Jon Benjamin', 'Justin Roiland', 'Dan Castellaneta'],
  Anime: ['Hiroshi Kamiya', 'Mamoru Miyano', 'Yuki Kaji', 'Tomokazu Sugita', 'Natsuki Hanae', 'Jun Fukuyama', 'Daisuke Ono', 'Yoshitsugu Matsuoka', 'Akira Ishida', 'Takahiro Sakurai', 'Kenjiro Tsuda', 'Hiro Shimono', 'Kensho Ono', 'Nobuhiko Okamoto', 'Junichi Suwabe', 'Yuichi Nakamura', 'Koki Uchiyama', 'Yuma Uchida', 'Takehito Koyasu', 'Miyu Irino'],
  Asian: ['Song Kang-ho', 'Tony Leung Chiu-wai', 'Jackie Chan', 'Toshiro Mifune', 'Choi Min-sik', 'Lee Byung-hun', 'Gong Yoo', 'Andy Lau', 'Chow Yun-fat', 'Donnie Yen', 'Ken Watanabe', 'Takeshi Kaneshiro', 'Leslie Cheung', 'Stephen Chow', 'Ma Dong-seok', 'Hyun Bin', 'Park Seo-joon', 'Lee Jung-jae', 'Ji Chang-wook', 'Kim Soo-hyun'],
  Indian: ['Amitabh Bachchan', 'Shah Rukh Khan', 'Kamal Haasan', 'Rajinikanth', 'Aamir Khan', 'Salman Khan', 'Mohanlal', 'Mammootty', 'Dilip Kumar', 'Hrithik Roshan', 'Ranbir Kapoor', 'Ranveer Singh', 'Allu Arjun', 'Mahesh Babu', 'Prabhas', 'Jr NTR', 'Ram Charan', 'Dhanush', 'Suriya', 'Vijay']
};

const CURATED_FEMALE_ACTORS: Record<string, string[]> = {
  All: ['Emma Stone', 'Kate Winslet', 'Margot Robbie', 'Scarlett Johansson', 'Amy Adams', 'Jennifer Lawrence', 'Angelina Jolie', 'Anne Hathaway', 'Meryl Streep', 'Katharine Hepburn', 'Cate Blanchett', 'Frances McDormand', 'Jodie Foster', 'Natalie Portman', 'Charlize Theron', 'Nicole Kidman', 'Viola Davis', 'Julianne Moore', 'Saoirse Ronan', 'Florence Pugh'],
  Movies: ['Emma Stone', 'Kate Winslet', 'Margot Robbie', 'Scarlett Johansson', 'Amy Adams', 'Jennifer Lawrence', 'Angelina Jolie', 'Anne Hathaway', 'Meryl Streep', 'Katharine Hepburn', 'Cate Blanchett', 'Frances McDormand', 'Jodie Foster', 'Natalie Portman', 'Charlize Theron', 'Nicole Kidman', 'Viola Davis', 'Julianne Moore', 'Saoirse Ronan', 'Florence Pugh'],
  Series: ['Julia Louis-Dreyfus', 'Edie Falco', 'Elisabeth Moss', 'Claire Foy', 'Olivia Colman', 'Sarah Snook', 'Zendaya', 'Jean Smart', 'Phoebe Waller-Bridge', 'Anya Taylor-Joy', 'Claire Danes', 'Laura Dern', 'Reese Witherspoon', 'Thandie Newton', 'Gillian Anderson', 'Christina Applegate', 'Rachel Brosnahan', 'Uzo Aduba', 'Regina King', 'Emilia Clarke'],
  Animation: ['Tara Strong', 'Grey DeLisle', 'Cree Summer', 'Mae Whitman', 'Nancy Cartwright', 'Idina Menzel', 'Kristen Bell', 'Ellen DeGeneres', 'Holly Hunter', 'Ming-Na Wen', 'Paige O\'Hara', 'Jodi Benson', 'Auli\'i Cravalho', 'Kelly Macdonald', 'Mandy Moore', 'Sarah Silverman', 'Kristen Schaal', 'Pamela Adlon', 'E.G. Daily', 'Kath Soucie'],
  Anime: ['Megumi Hayashibara', 'Kana Hanazawa', 'Romi Park', 'Miyuki Sawashiro', 'Rie Kugimiya', 'Saori Hayami', 'Maaya Sakamoto', 'Aoi Yuki', 'Ayane Sakura', 'Sora Amamiya', 'Inori Minase', 'Yui Ishikawa', 'Rie Takahashi', 'Yoko Hikasa', 'Nao Toyama', 'Ai Kayano', 'Ayana Taketatsu', 'Risa Taneda', 'Haruka Tomatsu', 'Nana Mizuki'],
  Asian: ['Michelle Yeoh', 'Maggie Cheung', 'Gong Li', 'Bae Doona', 'Jeon Do-yeon', 'Kim Min-hee', 'Song Hye-kyo', 'Son Ye-jin', 'Jun Ji-hyun', 'Park Eun-bin', 'Kim Ji-won', 'IU (Lee Ji-eun)', 'Han Hyo-joo', 'Park Bo-young', 'Shin Min-a', 'Zhang Ziyi', 'Shu Qi', 'Fan Bingbing', 'Tang Wei', 'Chieko Baisho'],
  Indian: ['Sridevi', 'Madhuri Dixit', 'Rekha', 'Kajol', 'Deepika Padukone', 'Alia Bhatt', 'Priyanka Chopra', 'Kareena Kapoor', 'Aishwarya Rai', 'Kangana Ranaut', 'Rani Mukerji', 'Anushka Sharma', 'Katrina Kaif', 'Tabu', 'Vidya Balan', 'Nayanthara', 'Samantha Ruth Prabhu', 'Trisha Krishnan', 'Keerthy Suresh', 'Anushka Shetty']
};

const CURATED_NETWORKS: Record<string, string[]> = {
  All: ['Warner Bros. Pictures', 'Universal Pictures', 'Paramount Pictures', '20th Century Studios', 'Walt Disney Pictures', 'Columbia Pictures', 'Marvel Studios', 'Pixar', 'Netflix', 'HBO Max', 'A24', 'Sony Pictures', 'Studio Ghibli', 'DreamWorks Animation', 'Lucasfilm', 'Prime Video', 'Apple TV+', 'Hulu', 'Illumination', 'Lionsgate'],
  Movies: ['Warner Bros. Pictures', 'Universal Pictures', 'Paramount Pictures', '20th Century Studios', 'Walt Disney Pictures', 'Columbia Pictures', 'Marvel Studios', 'Pixar', 'A24', 'Sony Pictures', 'Lucasfilm', 'Lionsgate', 'New Line Cinema', 'Miramax', 'Legendary Pictures', 'Focus Features', 'Searchlight Pictures', 'Annapurna Pictures', 'Orion Pictures', 'Amblin Entertainment'],
  Series: ['HBO', 'Netflix', 'AMC', 'FX', 'Showtime', 'NBC', 'CBS', 'ABC', 'Prime Video', 'Apple TV+', 'Hulu', 'BBC', 'Channel 4', 'The CW', 'USA Network', 'Starz', 'Syfy', 'TNT', 'Comedy Central', 'ITV'],
  Animation: ['Pixar', 'Studio Ghibli', 'Walt Disney Animation Studios', 'DreamWorks Animation', 'Illumination', 'Sony Pictures Animation', 'Cartoon Network', 'Nickelodeon', 'Blue Sky Studios', 'Laika', 'Aardman Animations', 'Warner Bros. Animation', 'Toei Animation', 'MAPPA', 'CoMix Wave Films', 'Kyoto Animation', 'Madhouse', 'Bones', 'Wit Studio', 'Ufotable'],
  Anime: ['Toei Animation', 'MAPPA', 'Madhouse', 'Bones', 'Wit Studio', 'Ufotable', 'Kyoto Animation', 'A-1 Pictures', 'CloverWorks', 'CoMix Wave Films', 'Studio Ghibli', 'Production I.G', 'Sunrise', 'Trigger', 'J.C.Staff', 'David Production', 'Pierrot', 'Studio Deen', 'White Fox', 'TMS Entertainment'],
  Asian: ['tvN', 'JTBC', 'SBS', 'KBS2', 'MBC', 'CJ ENM', 'Studio Dragon', 'Tencent Video', 'iQIYI', 'Youku', 'Fuji TV', 'TBS', 'NTV', 'TV Asahi', 'NHK', 'GMMTV', 'One31', 'Astro', 'Mediacorp', 'Viu'],
  Indian: ['Yash Raj Films', 'Dharma Productions', 'Red Chillies Entertainment', 'T-Series', 'Eros International', 'UTV Motion Pictures', 'Balaji Motion Pictures', 'Excel Entertainment', 'Hombale Films', 'Geetha Arts', 'Mythri Movie Makers', 'Lyca Productions', 'Sun Pictures', 'Sri Venkateswara Creations', 'DVV Entertainment', 'Zee Studios', 'Suresh Productions', 'Nadiadwala Grandson', 'Aashirvad Cinemas', 'Sithara Entertainments']
};

export function toCardItem(c: any) {
  if (!c) return null;
  return {
    id: String(c.id || ''),
    title: c.title || c.name || '',
    originalTitle: c.originalTitle || c.originalName || '',
    year: c.year ? Number(c.year) : null,
    rating: c.rating !== null && c.rating !== undefined ? Number(c.rating) : 0,
    votes: c.votes ? Number(c.votes) : null,
    duration: c.duration || '',
    category: c.category || 'Movies',
    genres: Array.isArray(c.genres) ? c.genres : (typeof c.genres === 'string' ? c.genres.split(',').map((s: string) => s.trim()) : []),
    posterUrl: c.posterUrl || '',
    backdropUrl: c.backdropUrl || '',
    director: c.director || '',
    directorPhotoUrl: c.directorPhotoUrl || '',
    language: c.language || '',
    country: c.country || '',
    isIndian: !!c.isIndian,
    franchise: c.franchise || c.franchiseName || '',
    franchiseName: c.franchiseName || c.franchise || '',
    franchiseId: c.franchiseId || null,
    franchiseOrder: c.franchiseOrder ? Number(c.franchiseOrder) : null,
    network: c.network || '',
    releaseDate: c.releaseDate || '',
    format: c.format || '',
    // Store only lightweight string arrays to avoid huge nested actor/studio metadata blowing past limits
    maleActors: Array.isArray(c.maleActors) ? c.maleActors.map((a: any) => typeof a === 'string' ? a : a?.name || '').filter(Boolean) : [],
    femaleActors: Array.isArray(c.femaleActors) ? c.femaleActors.map((a: any) => typeof a === 'string' ? a : a?.name || '').filter(Boolean) : [],
    actorsData: Array.isArray(c.actorsData) ? c.actorsData : [],
    cast: Array.isArray(c.cast) ? c.cast : (typeof c.cast === 'string' ? c.cast.split(',').map((s: string) => s.trim()) : []),
    studiosData: Array.isArray(c.studiosData) ? c.studiosData.map((s: any) => typeof s === 'string' ? s : s?.name || '').filter(Boolean) : [],
  };
}

function toCleanCard(item: any) {
  if (!item) return null;
  return {
    id: String(item.id || ''),
    title: item.title || item.name || '',
    originalTitle: item.originalTitle || item.originalName || '',
    year: item.year ? Number(item.year) : null,
    rating: item.rating !== null && item.rating !== undefined ? Number(item.rating) : 0,
    votes: item.votes ? Number(item.votes) : null,
    duration: item.duration || '',
    category: item.category || 'Movies',
    genres: Array.isArray(item.genres) ? item.genres : (typeof item.genres === 'string' ? item.genres.split(',').map((s: string) => s.trim()) : []),
    posterUrl: item.posterUrl || '',
    backdropUrl: item.backdropUrl || '',
    director: item.director || '',
    language: item.language || '',
    country: item.country || '',
    isIndian: !!item.isIndian,
    franchise: item.franchise || item.franchiseName || '',
    franchiseName: item.franchiseName || item.franchise || '',
    franchiseId: item.franchiseId || null,
    network: item.network || '',
    releaseDate: item.releaseDate || '',
    format: item.format || '',
  };
}

export function getEffectiveReleaseTime(item: any): number {
  if (item.releaseDate && typeof item.releaseDate === 'string' && item.releaseDate.trim()) {
    const t = new Date(item.releaseDate.trim()).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (item.year) {
    const y = Number(item.year);
    if (!isNaN(y) && y > 1850 && y < 2100) {
      // Default to mid-year (June 30) for items that only have a year
      return new Date(`${y}-06-30T00:00:00Z`).getTime();
    }
  }
  return 0;
}

export const HOMEPAGE_CATEGORIES: Array<'All' | 'Movies' | 'Series' | 'Animation' | 'Asian' | 'Anime' | 'Indian'> = [
  'All', 'Movies', 'Series', 'Animation', 'Asian', 'Anime', 'Indian'
];

export function normalizeCategory(cat?: string | null): 'All' | 'Movies' | 'Series' | 'Animation' | 'Asian' | 'Anime' | 'Indian' {
  if (!cat || cat.trim() === '' || cat.toLowerCase() === 'all') return 'All';
  const l = cat.toLowerCase().trim();
  if (l === 'movies' || l === 'movie') return 'Movies';
  if (l === 'series' || l === 'tv show' || l === 'tv shows' || l === 'tv') return 'Series';
  if (l === 'animation') return 'Animation';
  if (l === 'anime') return 'Anime';
  if (l === 'asian' || l === 'asian drama') return 'Asian';
  if (l === 'indian') return 'Indian';
  return 'All';
}

export function matchesCategory(item: any, cat: string): boolean {
  const normCat = normalizeCategory(cat);
  if (normCat === 'All') return true;
  
  const itemCat = (item.category || '').toLowerCase().trim();
  const format = (item.format || '').toLowerCase().trim();
  const genres = Array.isArray(item.genres) 
    ? item.genres.map((g: any) => String(g).toLowerCase().trim()) 
    : (typeof item.genres === 'string' ? item.genres.toLowerCase().split(',').map((s: string) => s.trim()) : []);
  const lang = (item.language || '').toLowerCase().trim();

  const isAnime = itemCat === 'anime' || genres.some(g => g === 'anime' || g.includes('anime'));
  const indianLangs = ['hi', 'te', 'ta', 'kn', 'ml', 'pa', 'gu', 'mr', 'bn', 'ur', 'or', 'as', 'hindi'];
  const isIndian = !!item.isIndian || itemCat === 'indian' || itemCat === 'bollywood' || (lang && indianLangs.includes(lang));
  const asianLangs = ['ko', 'zh', 'cn', 'tw', 'ja', 'th', 'vi', 'id', 'ms', 'tl', 'korean', 'japanese', 'chinese', 'cantonese', 'mandarin', 'thai', 'vietnamese', 'indonesian', 'filipino', 'tagalog'];
  const isAsian = !isAnime && !isIndian && (itemCat === 'asian' || itemCat === 'asian drama' || itemCat === 'k-drama' || itemCat === 'c-drama' || (lang && asianLangs.includes(lang)));
  const isAnimation = itemCat === 'animation' || genres.some(g => g === 'animation' || g.includes('animation'));

  if (normCat === 'Movies') {
    // Show only movies (including animation movies) - strictly exclude anime, asian, and indian
    if (isAnime || isAsian || isIndian) return false;
    if (itemCat === 'series' || itemCat === 'tv show' || itemCat === 'tv shows' || itemCat === 'tv' || format === 'series' || format === 'tv') return false;
    return itemCat === 'movies' || itemCat === 'movie' || itemCat === 'animation' || format === 'movie' || isAnimation;
  }

  if (normCat === 'Series') {
    // Show series/TV shows - strictly exclude anime, asian, and indian
    if (isAnime || isAsian || isIndian) return false;
    if (format === 'movie' || itemCat === 'movies' || itemCat === 'movie') return false;
    return itemCat === 'series' || itemCat === 'tv shows' || itemCat === 'tv show' || itemCat === 'tv' || format === 'series' || format === 'tv';
  }

  if (normCat === 'Animation') {
    return isAnimation;
  }

  if (normCat === 'Anime') {
    return isAnime;
  }

  if (normCat === 'Asian') {
    return isAsian;
  }

  if (normCat === 'Indian') {
    return isIndian;
  }

  return false;
}

export function getMatchingCategories(item: any): Array<'All' | 'Movies' | 'Series' | 'Animation' | 'Asian' | 'Anime' | 'Indian'> {
  return HOMEPAGE_CATEGORIES.filter(c => matchesCategory(item, c));
}

// In-Memory Prepared Datasets Cache
let homepageMemoryCache: Record<string, any> = {};
let isBuildingDatasets = false;
let datasetsLastUpdated = 0;

export async function initHomepageCacheTable() {
  try {
    const execPromise = supabaseDb.execute(sql`
      CREATE TABLE IF NOT EXISTS homepage_cache (
        key TEXT PRIMARY KEY,
        data JSONB,
        version INTEGER DEFAULT 1,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 400));
    await Promise.race([execPromise, timeoutPromise]);
  } catch (err: any) {
    // Non-blocking initialization
  }
}

export async function saveHomepageCacheKey(key: string, data: any): Promise<void> {
  // 1. In-Memory RAM (homepageMemoryCache) is updated first
  homepageMemoryCache[key] = data;

  const parts = key.split('_');
  if (parts.length >= 2) {
    const suffix = parts[parts.length - 1];
    const prefix = parts.slice(0, -1).join('_');
    if (HOMEPAGE_CATEGORIES.includes(suffix as any)) {
      if (!homepageMemoryCache[prefix]) homepageMemoryCache[prefix] = {};
      homepageMemoryCache[prefix][suffix] = data;
    }
  }

  const payload = {
    key,
    data,
    version: 1,
    updatedAt: new Date()
  };

  // 2. Persist across SQL databases (Primary Supabase, Local Database, Backup Supabase)
  try {
    await executeSqlWrite(async (sqlDb) => {
      await sqlDb.insert(schema.homepageCache).values(payload).onConflictDoUpdate({
        target: schema.homepageCache.key,
        set: payload
      });
    });
  } catch (err: any) {
    console.warn(`[HomepageCache] Failed to persist key ${key} across databases:`, err.message);
  }
}

export async function loadHomepageCacheFromDb(): Promise<boolean> {
  const hydrateMemory = (records: any[]) => {
    for (const r of records) {
      if (r.key && r.data) {
        homepageMemoryCache[r.key] = r.data;

        const parts = r.key.split('_');
        if (parts.length >= 2) {
          const suffix = parts[parts.length - 1];
          const prefix = parts.slice(0, -1).join('_');
          if (HOMEPAGE_CATEGORIES.includes(suffix as any)) {
            if (!homepageMemoryCache[prefix]) homepageMemoryCache[prefix] = {};
            homepageMemoryCache[prefix][suffix] = r.data;
          }
        }
      }
    }
    datasetsLastUpdated = Date.now();
  };

  // 1. On server restart: Copy/hydrate from the Local Database first (0 egress)
  try {
    const localRecords = await primaryDb.select().from(schema.homepageCache);
    if (localRecords && localRecords.length > 0) {
      hydrateMemory(localRecords);
      console.log(`[HomepageCache] Loaded ${localRecords.length} homepage cache keys from Local Database (0 egress).`);
      return true;
    }
  } catch (localErr: any) {
    console.warn('[HomepageCache] Local database cache not present yet:', localErr.message);
  }

  // 2. If Local Database is not there (e.g. fresh container cold start), read from Primary Supabase
  try {
    const { supabasePrimaryDb } = await import('./src/db/index.js');
    const supabaseRecords = await supabasePrimaryDb.select().from(schema.homepageCache);
    if (supabaseRecords && supabaseRecords.length > 0) {
      // Hydrate In-Memory RAM immediately so app responses are instant
      hydrateMemory(supabaseRecords);
      console.log(`[HomepageCache] Loaded ${supabaseRecords.length} keys from Primary Supabase into RAM. Copying to Local Database...`);

      // Copy into Local Database table asynchronously so subsequent operations stay local
      (async () => {
        try {
          for (const rec of supabaseRecords) {
            await primaryDb.insert(schema.homepageCache).values(rec).onConflictDoUpdate({
              target: schema.homepageCache.key,
              set: rec
            });
          }
          console.log('[HomepageCache] Successfully copied homepage cache into Local Database.');
        } catch (copyErr: any) {
          console.warn('[HomepageCache] Failed copying homepage cache to local DB:', copyErr.message);
        }
      })();

      return true;
    }
  } catch (supaErr: any) {
    console.warn('[HomepageCache] Could not load from Supabase Primary:', supaErr.message);
  }

  return false;
}

export function orderGenres(genres: string[]): string[] {
  if (!genres || !Array.isArray(genres) || genres.length === 0) return [];
  const list = [...genres];
  const actionIdx = list.findIndex(g => g.toLowerCase() === 'action');
  const dramaIdx = list.findIndex(g => g.toLowerCase() === 'drama');

  if (actionIdx !== -1 && dramaIdx !== -1) {
    const actionItem = list[actionIdx];
    const dramaItem = list[dramaIdx];
    const remaining = list.filter(g => g.toLowerCase() !== 'action' && g.toLowerCase() !== 'drama');
    return [actionItem, ...remaining.slice(0, 3), dramaItem, ...remaining.slice(3)];
  } else if (actionIdx !== -1) {
    const actionItem = list[actionIdx];
    const remaining = list.filter(g => g.toLowerCase() !== 'action');
    return [actionItem, ...remaining];
  }
  return list;
}

export async function buildAllHomepageDatasets(force = false): Promise<void> {
  if (isBuildingDatasets) return;
  isBuildingDatasets = true;

  try {
    console.log('[HomepageCache] Generating category-isolated prepared homepage datasets...');
    const allRaw = await getContentCardsForCache();
    const allCards = allRaw.map(toCardItem).filter(Boolean);
    const [views, downloads] = await Promise.all([getViews(), getDownloads()]);

    const categories = HOMEPAGE_CATEGORIES;

    // 1. ANALYTICS SCORING MAP
    const now = Date.now();
    const startOfToday = now - 24 * 60 * 60 * 1000;
    const downloadCounts: Record<string, number> = {};
    const totalDownloadCounts: Record<string, number> = {};
    const viewCounts: Record<string, number> = {};

    for (const d of downloads) {
      const vid = String(d.contentId || d.id || '');
      if (!vid) continue;
      const ts = d.timestamp ? new Date(d.timestamp).getTime() : 0;
      totalDownloadCounts[vid] = (totalDownloadCounts[vid] || 0) + 1;
      if (ts >= startOfToday) {
        downloadCounts[vid] = (downloadCounts[vid] || 0) + 1;
      }
    }

    for (const v of views) {
      const vid = String(v.contentId || v.id || '');
      if (!vid) continue;
      const ts = v.timestamp ? new Date(v.timestamp).getTime() : 0;
      if (ts >= startOfToday) {
        viewCounts[vid] = (viewCounts[vid] || 0) + 1;
      }
    }

    const computeTrendingList = (itemsList: any[]) => {
      return [...itemsList].sort((a, b) => {
        const scoreA = (downloadCounts[a.id] || 0) * 100 + (viewCounts[a.id] || 0) * 1 + (totalDownloadCounts[a.id] || 0) * 0.1;
        const scoreB = (downloadCounts[b.id] || 0) * 100 + (viewCounts[b.id] || 0) * 1 + (totalDownloadCounts[b.id] || 0) * 0.1;
        if (scoreB !== scoreA) return scoreB - scoreA;
        const ratingDiff = (Number(b.rating) || 0) - (Number(a.rating) || 0);
        if (Math.abs(ratingDiff) > 0.01) return ratingDiff;
        return (b.year || 0) - (a.year || 0);
      }).slice(0, 20); // STRICTLY TOP 20
    };

    // 1. TRENDING (Top 20 per category)
    const trendingDataset: Record<string, any[]> = {};
    for (const cat of categories) {
      const filtered = allCards.filter(item => matchesCategory(item, cat));
      trendingDataset[cat] = computeTrendingList(filtered).map(toCleanCard);
    }
    await saveHomepageCacheKey('trending', trendingDataset);

    // 2. LATEST (Top 50 per category)
    const latestDataset: Record<string, any[]> = {};
    for (const cat of categories) {
      const filtered = allCards.filter(item => matchesCategory(item, cat));
      latestDataset[cat] = [...filtered].sort((a, b) => {
        const timeA = getEffectiveReleaseTime(a);
        const timeB = getEffectiveReleaseTime(b);
        if (timeA !== timeB) return timeB - timeA;
        if ((b.year || 0) !== (a.year || 0)) return (b.year || 0) - (a.year || 0);
        return (Number(b.rating) || 0) - (Number(a.rating) || 0);
      }).slice(0, 50).map(toCleanCard);
    }
    await saveHomepageCacheKey('latest', latestDataset);

    // 3. TOP RATED (Top 50 per category)
    const topRatedDataset: Record<string, any[]> = {};
    for (const cat of categories) {
      const filtered = allCards.filter(item => matchesCategory(item, cat));
      topRatedDataset[cat] = [...filtered].sort((a, b) => {
        const ratingDiff = (Number(b.rating) || 0) - (Number(a.rating) || 0);
        if (Math.abs(ratingDiff) > 0.01) return ratingDiff;
        const votesDiff = (Number(b.votes) || 0) - (Number(a.votes) || 0);
        if (votesDiff !== 0) return votesDiff;
        return (b.year || 0) - (a.year || 0);
      }).slice(0, 50).map(toCleanCard);
    }
    await saveHomepageCacheKey('top_rated', topRatedDataset);

    // 4. FRANCHISES (Category-specific Top 50 franchise collections)
    const franchisesDataset: Record<string, any[]> = {};
    for (const cat of categories) {
      let filtered = allCards.filter(item => matchesCategory(item, cat));
      
      // RULE: For the "All" category, show all franchises (movies, tv shows, anime, animation), excluding Indian and Asian.
      if (cat === 'All') {
        filtered = filtered.filter(item => {
          const itemCat = (item.category || '').toLowerCase().trim();
          const genres = Array.isArray(item.genres) 
            ? item.genres.map((g: any) => String(g).toLowerCase().trim()) 
            : (typeof item.genres === 'string' ? item.genres.toLowerCase().split(',').map((s: string) => s.trim()) : []);
          const lang = (item.language || '').toLowerCase().trim();

          const isAnime = itemCat === 'anime' || genres.some(g => g === 'anime' || g.includes('anime'));
          const indianLangs = ['hi', 'te', 'ta', 'kn', 'ml', 'pa', 'gu', 'mr', 'bn', 'ur', 'or', 'as', 'hindi'];
          const isIndian = !!item.isIndian || itemCat === 'indian' || itemCat === 'bollywood' || (lang && indianLangs.includes(lang));
          const asianLangs = ['ko', 'zh', 'cn', 'tw', 'ja', 'th', 'vi', 'id', 'ms', 'tl', 'korean', 'japanese', 'chinese', 'cantonese', 'mandarin', 'thai', 'vietnamese', 'indonesian', 'filipino', 'tagalog'];
          const isAsian = !isAnime && !isIndian && (itemCat === 'asian' || itemCat === 'asian drama' || itemCat === 'k-drama' || itemCat === 'c-drama' || (lang && asianLangs.includes(lang)));
          
          return !isAsian && !isIndian;
        });
      }

      const franchiseMap = new Map<string, any[]>();
      const originalNames = new Map<string, string>(); // key -> original preferred name
      const idsMap = new Map<string, string>(); // key -> franchiseId

      filtered.forEach(item => {
        let name = (item.franchiseName || item.franchise || '').trim();
        let franchiseId = item.franchiseId || null;

        if (name || franchiseId) {
          // Normalize identity
          const normalizedName = name ? name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim() : 'unknown';
          const key = franchiseId ? `id_${franchiseId}` : `name_${normalizedName}`;
          
          if (!franchiseMap.has(key)) {
            franchiseMap.set(key, []);
            if (name) originalNames.set(key, name);
            if (franchiseId) idsMap.set(key, franchiseId);
          } else if (name) {
            // Keep the most prominent case for display
            const currentOrig = originalNames.get(key) || '';
            if (name.length > currentOrig.length || (name !== name.toLowerCase() && currentOrig === currentOrig.toLowerCase())) {
              originalNames.set(key, name);
            }
          }

          const existing = franchiseMap.get(key)!;
          if (!existing.some(e => e.id === item.id || (e.title && item.title && e.title.toLowerCase() === item.title.toLowerCase()))) {
            existing.push(item);
          }
        }
      });

      const franchiseList = Array.from(franchiseMap.entries()).map(([key, groupItems]) => {
        const displayName = originalNames.get(key) || 'Unknown Franchise';
        const franchiseId = idsMap.get(key) || null;
        groupItems.sort((a, b) => (a.year || 0) - (b.year || 0));
        
        const firstYear = groupItems[0]?.year || '';
        const lastYear = groupItems[groupItems.length - 1]?.year || '';
        const yearRange = firstYear === lastYear ? `${firstYear}` : `${firstYear}-${lastYear}`;
        
        const validRatings = groupItems.filter(i => typeof i.rating === 'number' && i.rating > 0);
        const avgRating = validRatings.length > 0 
          ? (validRatings.reduce((acc, curr) => acc + curr.rating, 0) / validRatings.length).toFixed(1)
          : '0.0';
        
        const posters = groupItems.map(item => item.posterUrl ? item.posterUrl.replace('/w500/', '/w342/') : '').filter(Boolean).slice(0, 5);
        
        // Find the first explicitly defined franchise description
        const manualDescItem = groupItems.find(item => (item.franchiseDescription || '').trim().length > 0);
        const autoDesc = `${displayName} is a cinematic universe comprising ${groupItems.length} titles released between ${firstYear} and ${lastYear}. Explore the complete collection of movies and series in reading and chronological order.`;
        
        return {
          id: franchiseId || displayName,
          name: displayName,
          category: cat,
          count: groupItems.length,
          yearRange,
          avgRating,
          numAvgRating: parseFloat(avgRating) || 0,
          posters,
          description: manualDescItem ? manualDescItem.franchiseDescription : autoDesc,
          items: groupItems.slice(0, 10).map(toCleanCard)
        };
      })
      .filter(f => f.count >= 2) // RULE: Franchise requires at least 2 qualifying titles
      .sort((a, b) => {
        // RULE: Sort by average rating DESC, then count DESC, then alphabetically
        if (b.numAvgRating !== a.numAvgRating) return b.numAvgRating - a.numAvgRating;
        if (b.count !== a.count) return b.count - a.count;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 50); // RULE: Keep only top 50

      franchisesDataset[cat] = franchiseList;
    }
    await saveHomepageCacheKey('franchises', franchisesDataset);

    // 5. GENRES (Top 50 per genre for each category)
    const genresDataset: Record<string, { availableGenres: string[]; itemsByGenre: Record<string, any[]> }> = {};
    for (const cat of categories) {
      const filtered = allCards.filter(item => matchesCategory(item, cat));
      const genreCountMap: Record<string, number> = {};

      filtered.forEach(item => {
        (item.genres || []).forEach((g: string) => {
          const trimmed = g.trim();
          if (trimmed && trimmed !== 'Movies' && trimmed !== 'Series') {
            genreCountMap[trimmed] = (genreCountMap[trimmed] || 0) + 1;
          }
        });
      });

      // Sort available genres with Action on top (1st) and Drama on 5th place
      const sortedByCount = Object.keys(genreCountMap).sort((a, b) => genreCountMap[b] - genreCountMap[a]);
      const availableGenres = orderGenres(sortedByCount);
      const itemsByGenre: Record<string, any[]> = {};

      for (const g of availableGenres) {
        itemsByGenre[g] = filtered.filter(item => (item.genres || []).includes(g))
          .sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0))
          .slice(0, 50)
          .map(toCleanCard);
      }
      genresDataset[cat] = { availableGenres, itemsByGenre };
    }
    await saveHomepageCacheKey('genres', genresDataset);

    // 6. BEST OF (Top 50 per studio/network for each category)
    const bestOfDataset: Record<string, { availableNetworks: string[]; itemsByNetwork: Record<string, any[]> }> = {};
    for (const cat of categories) {
      const filtered = allCards.filter(item => matchesCategory(item, cat));
      const curated = CURATED_NETWORKS[cat] || CURATED_NETWORKS.All;
      
      const itemsByNetworkLower: Record<string, any[]> = {};
      const dynamicStudiosCount: Record<string, number> = {};

      filtered.forEach(item => {
        const itemStudios: string[] = [];
        if (item.network && typeof item.network === 'string' && item.network.trim()) {
          itemStudios.push(item.network.trim());
        }
        if (Array.isArray(item.studiosData)) {
          item.studiosData.forEach((s: any) => {
            const sName = typeof s === 'string' ? s : s?.name || '';
            if (sName.trim()) itemStudios.push(sName.trim());
          });
        }
        
        const seenInItem = new Set<string>();
        itemStudios.forEach(net => {
          const netLower = net.toLowerCase();
          if (seenInItem.has(netLower)) return;
          seenInItem.add(netLower);
          dynamicStudiosCount[net] = (dynamicStudiosCount[net] || 0) + 1;
          if (!itemsByNetworkLower[netLower]) itemsByNetworkLower[netLower] = [];
          itemsByNetworkLower[netLower].push(item);
        });
      });

      // Link curated networks if aliases or slight name variations exist
      curated.forEach(curatedNet => {
        const cLower = curatedNet.toLowerCase();
        if (!itemsByNetworkLower[cLower]) itemsByNetworkLower[cLower] = [];
        if (itemsByNetworkLower[cLower].length === 0) {
          const cClean = cLower.replace(/^(the\s+|a\s+|an\s+)/i, '').replace(/(\s+company|\s+studios|\s+pictures|\s+inc\.?|\s+ltd\.?|\s+corp\.?|\s+entertainment)$/i, '').trim();
          for (const [key, items] of Object.entries(itemsByNetworkLower)) {
            if (key === cLower) continue;
            if (key.includes(cClean) || cClean.includes(key)) {
              items.forEach(it => {
                if (!itemsByNetworkLower[cLower].find(x => x.id === it.id)) {
                  itemsByNetworkLower[cLower].push(it);
                }
              });
            }
          }
        }
      });

      const sortedDynamic = Object.entries(dynamicStudiosCount)
        .sort((a, b) => b[1] - a[1])
        .map(e => e[0])
        .filter(n => !curated.some(c => c.toLowerCase() === n.toLowerCase()))
        .slice(0, 50);

      const combinedNetworks = Array.from(new Set([...curated, ...sortedDynamic])).filter(Boolean);
      const itemsByNetwork: Record<string, any[]> = {};

      for (const net of combinedNetworks) {
        const matched = itemsByNetworkLower[net.toLowerCase()] || [];
        itemsByNetwork[net] = matched
          .sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0))
          .slice(0, 50)
          .map(toCleanCard);
      }

      const activeCurated = curated.filter(net => (itemsByNetwork[net] || []).length > 0);
      const activeDynamic = sortedDynamic
        .filter(net => (itemsByNetwork[net] || []).length > 0)
        .sort((a, b) => a.localeCompare(b));
      
      const activeNetworks = Array.from(new Set([...activeCurated, ...activeDynamic])).slice(0, 50);

      bestOfDataset[cat] = { 
        availableNetworks: activeNetworks.length > 0 ? activeNetworks : curated, 
        itemsByNetwork 
      };
    }
    await saveHomepageCacheKey('best_of', bestOfDataset);

    // 7. PEOPLE (DIRECTORS, MALE ACTORS, FEMALE ACTRESSES)
    const normalizePersonName = (s: string) =>
      s.toLowerCase()
       .normalize('NFD')
       .replace(/[\u0300-\u036f]/g, '')
       .replace(/[^a-z0-9]/g, ' ')
       .replace(/\s+/g, ' ')
       .trim();

    const buildPeopleDataset = (type: 'director' | 'maleActors' | 'femaleActors', curatedMap: Record<string, string[]>) => {
      const dataset: Record<string, { availablePeople: string[]; itemsByPerson: Record<string, any[]> }> = {};
      for (const cat of categories) {
        const filtered = allCards.filter(item => matchesCategory(item, cat));
        const topCurated = curatedMap[cat] || curatedMap.All;
        
        const itemsByPersonLower: Record<string, any[]> = {};
        const originalNameMap: Record<string, string> = {};
        const dynamicPeopleCount: Record<string, number> = {};

        // Single pass over items
        filtered.forEach(item => {
          const itemPeopleNames: string[] = [];
          if (type === 'director') {
            if (item.director) {
              item.director.split(',').forEach((d: string) => {
                const trimmed = d.trim();
                if (trimmed) itemPeopleNames.push(trimmed);
              });
            }
          } else if (type === 'maleActors') {
            if (Array.isArray(item.maleActors)) {
              item.maleActors.forEach((a: any) => {
                const nameStr = typeof a === 'string' ? a : a?.name || '';
                if (nameStr.trim()) itemPeopleNames.push(nameStr.trim());
              });
            }
            if (Array.isArray(item.actorsData)) {
              item.actorsData.forEach((a: any) => {
                if ((a?.gender === 2 || a?.gender === '2' || !a?.gender) && a?.name?.trim()) {
                  itemPeopleNames.push(a.name.trim());
                }
              });
            }
          } else if (type === 'femaleActors') {
            if (Array.isArray(item.femaleActors)) {
              item.femaleActors.forEach((a: any) => {
                const nameStr = typeof a === 'string' ? a : a?.name || '';
                if (nameStr.trim()) itemPeopleNames.push(nameStr.trim());
              });
            }
            if (Array.isArray(item.actorsData)) {
              item.actorsData.forEach((a: any) => {
                if ((a?.gender === 1 || a?.gender === '1') && a?.name?.trim()) {
                  itemPeopleNames.push(a.name.trim());
                }
              });
            }
          }

          const seenInItem = new Set<string>();
          itemPeopleNames.forEach(p => {
            const pLower = p.toLowerCase();
            if (seenInItem.has(pLower)) return;
            seenInItem.add(pLower);
            if (!originalNameMap[pLower]) originalNameMap[pLower] = p;
            dynamicPeopleCount[pLower] = (dynamicPeopleCount[pLower] || 0) + 1;
            if (!itemsByPersonLower[pLower]) itemsByPersonLower[pLower] = [];
            itemsByPersonLower[pLower].push(item);
          });
        });

        // Ensure curated people keys exist and link fuzzy name variants if needed
        topCurated.forEach(curatedPerson => {
          const cLower = curatedPerson.toLowerCase();
          if (!originalNameMap[cLower]) originalNameMap[cLower] = curatedPerson;
          if (!itemsByPersonLower[cLower]) itemsByPersonLower[cLower] = [];
          if (itemsByPersonLower[cLower].length === 0) {
            const cNorm = normalizePersonName(curatedPerson);
            for (const [key, items] of Object.entries(itemsByPersonLower)) {
              if (key === cLower) continue;
              if (normalizePersonName(key) === cNorm || key.includes(cLower) || cLower.includes(key)) {
                items.forEach(it => {
                  if (!itemsByPersonLower[cLower].find(x => x.id === it.id)) {
                    itemsByPersonLower[cLower].push(it);
                  }
                });
              }
            }
          }
        });

        // Add all dynamic people sorted by frequency (descending)
        const sortedDynamic = Object.entries(dynamicPeopleCount)
          .sort((a, b) => b[1] - a[1])
          .map(([pLower]) => originalNameMap[pLower] || pLower)
          .filter(p => !topCurated.some(c => c.toLowerCase() === p.toLowerCase() || normalizePersonName(c) === normalizePersonName(p)));

        const activeCurated = topCurated.filter(p => (itemsByPersonLower[p.toLowerCase()] || []).length > 0);
        const activeDynamic = sortedDynamic.filter(p => (itemsByPersonLower[p.toLowerCase()] || []).length > 0);
        
        // ALL active people in the category (curated first, then all dynamic sorted by popularity)
        const allAvailablePeople = Array.from(new Set([...activeCurated, ...activeDynamic])).filter(Boolean);
        const cappedAvailablePeople = allAvailablePeople.slice(0, 200);

        // Precompute top 50 in itemsByPerson for fast initial load and to keep Firestore doc size within limits
        const itemsByPerson: Record<string, any[]> = {};
        const precomputePeople = cappedAvailablePeople.slice(0, 50);

        for (const person of precomputePeople) {
          const matched = itemsByPersonLower[person.toLowerCase()] || [];
          itemsByPerson[person] = matched
            .sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0))
            .slice(0, 50)
            .map(toCleanCard);
        }

        dataset[cat] = { 
          availablePeople: cappedAvailablePeople.length > 0 ? cappedAvailablePeople : topCurated, 
          itemsByPerson 
        };
      }
      return dataset;
    };

    const directorsDataset = buildPeopleDataset('director', CURATED_DIRECTORS);
    const maleActorsDataset = buildPeopleDataset('maleActors', CURATED_MALE_ACTORS);
    const femaleActorsDataset = buildPeopleDataset('femaleActors', CURATED_FEMALE_ACTORS);

    await saveHomepageCacheKey('directors', directorsDataset);
    await saveHomepageCacheKey('male_actors', maleActorsDataset);
    await saveHomepageCacheKey('female_actors', femaleActorsDataset);

    // 8. PREPARE & PERSIST FULL CATEGORY SNAPSHOTS (category_All, category_Movies, etc.)
    for (const cat of categories) {
      const genresObj = genresDataset[cat] || { availableGenres: [], itemsByGenre: {} };
      const firstGenre = genresObj.availableGenres?.[0] || 'Action';
      const bestOfObj = bestOfDataset[cat] || { availableNetworks: [], itemsByNetwork: {} };
      const firstNetwork = bestOfObj.availableNetworks?.[0] || 'Warner Bros. Pictures';
      const directorsObj = directorsDataset[cat] || { availablePeople: [], itemsByPerson: {} };
      const firstDirector = directorsObj.availablePeople?.[0] || 'Christopher Nolan';
      const maleActorsObj = maleActorsDataset[cat] || { availablePeople: [], itemsByPerson: {} };
      const firstMale = maleActorsObj.availablePeople?.[0] || 'Leonardo DiCaprio';
      const femaleActorsObj = femaleActorsDataset[cat] || { availablePeople: [], itemsByPerson: {} };
      const firstFemale = femaleActorsObj.availablePeople?.[0] || 'Emma Stone';

      const effectiveSubCat = cat === 'All' ? 'Movies' : cat;
      const categorySnapshot = {
        category: cat,
        totalDbContentCount: allCards.length,
        trending: trendingDataset[cat] || [],
        latest: {
          items: (latestDataset[effectiveSubCat] || latestDataset[cat] || []).slice(0, 20),
          total: (latestDataset[effectiveSubCat] || latestDataset[cat] || []).length,
          hasMore: (latestDataset[effectiveSubCat] || latestDataset[cat] || []).length > 20,
        },
        topRated: {
          items: (topRatedDataset[effectiveSubCat] || topRatedDataset[cat] || []).slice(0, 20),
          total: (topRatedDataset[effectiveSubCat] || topRatedDataset[cat] || []).length,
          hasMore: (topRatedDataset[effectiveSubCat] || topRatedDataset[cat] || []).length > 20,
        },
        franchises: {
          items: (franchisesDataset[cat] || franchisesDataset.All || []).slice(0, 20),
          total: (franchisesDataset[cat] || franchisesDataset.All || []).length,
          hasMore: (franchisesDataset[cat] || franchisesDataset.All || []).length > 20,
        },
        genres: {
          defaultGenre: firstGenre,
          availableGenres: genresObj.availableGenres || [],
          items: (genresObj.itemsByGenre?.[firstGenre] || []).slice(0, 20),
          total: (genresObj.itemsByGenre?.[firstGenre] || []).length,
          hasMore: (genresObj.itemsByGenre?.[firstGenre] || []).length > 20,
        },
        bestOf: {
          defaultNetwork: firstNetwork,
          availableNetworks: bestOfObj.availableNetworks || [],
          items: (bestOfObj.itemsByNetwork?.[firstNetwork] || []).slice(0, 20),
          total: (bestOfObj.itemsByNetwork?.[firstNetwork] || []).length,
          hasMore: (bestOfObj.itemsByNetwork?.[firstNetwork] || []).length > 20,
        },
        directors: {
          defaultPerson: firstDirector,
          availablePeople: directorsObj.availablePeople || [],
          items: (directorsObj.itemsByPerson?.[firstDirector] || []).slice(0, 20),
          total: (directorsObj.itemsByPerson?.[firstDirector] || []).length,
          hasMore: (directorsObj.itemsByPerson?.[firstDirector] || []).length > 20,
        },
        maleActors: {
          defaultPerson: firstMale,
          availablePeople: maleActorsObj.availablePeople || [],
          items: (maleActorsObj.itemsByPerson?.[firstMale] || []).slice(0, 20),
          total: (maleActorsObj.itemsByPerson?.[firstMale] || []).length,
          hasMore: (maleActorsObj.itemsByPerson?.[firstMale] || []).length > 20,
        },
        femaleActors: {
          defaultPerson: firstFemale,
          availablePeople: femaleActorsObj.availablePeople || [],
          items: (femaleActorsObj.itemsByPerson?.[firstFemale] || []).slice(0, 20),
          total: (femaleActorsObj.itemsByPerson?.[firstFemale] || []).length,
          hasMore: (femaleActorsObj.itemsByPerson?.[firstFemale] || []).length > 20,
        },
        updatedAt: Date.now()
      };

      await saveHomepageCacheKey(`category_${cat}`, categorySnapshot);
    }

    datasetsLastUpdated = Date.now();
    console.log('[HomepageCache] Successfully compiled and cached all category-isolated datasets.');
  } catch (err: any) {
    console.error('[HomepageCache] Error building datasets:', err.message);
  } finally {
    isBuildingDatasets = false;
  }
}

let trendingDebounceTimer: any = null;

export function recalculateTrendingOnDownload(contentId?: string) {
  if (trendingDebounceTimer) clearTimeout(trendingDebounceTimer);
  trendingDebounceTimer = setTimeout(async () => {
    try {
      console.log(`[TRENDING] Recalculating category-specific trending for contentId: ${contentId || 'unknown'}`);
      const allRaw = await getAllContent();
      const allCards = allRaw.map(toCardItem).filter(Boolean);
      const [views, downloads] = await Promise.all([getViews(), getDownloads()]);

      const now = Date.now();
      const startOfToday = now - 24 * 60 * 60 * 1000;
      const downloadCounts: Record<string, number> = {};
      const totalDownloadCounts: Record<string, number> = {};
      const viewCounts: Record<string, number> = {};

      for (const d of downloads) {
        const vid = String(d.contentId || d.id || '');
        if (!vid) continue;
        const ts = d.timestamp ? new Date(d.timestamp).getTime() : 0;
        totalDownloadCounts[vid] = (totalDownloadCounts[vid] || 0) + 1;
        if (ts >= startOfToday) {
          downloadCounts[vid] = (downloadCounts[vid] || 0) + 1;
        }
      }

      for (const v of views) {
        const vid = String(v.contentId || v.id || '');
        if (!vid) continue;
        const ts = v.timestamp ? new Date(v.timestamp).getTime() : 0;
        if (ts >= startOfToday) {
          viewCounts[vid] = (viewCounts[vid] || 0) + 1;
        }
      }

      const item = contentId ? allCards.find(c => c.id === contentId) : null;
      const affectedCategories = item ? getMatchingCategories(item) : HOMEPAGE_CATEGORIES;
      const trendingDataset = homepageMemoryCache.trending || {};

      for (const cat of affectedCategories) {
        const filtered = allCards.filter(c => matchesCategory(c, cat));
        trendingDataset[cat] = [...filtered].sort((a, b) => {
          const scoreA = (downloadCounts[a.id] || 0) * 100 + (viewCounts[a.id] || 0) * 1 + (totalDownloadCounts[a.id] || 0) * 0.1;
          const scoreB = (downloadCounts[b.id] || 0) * 100 + (viewCounts[b.id] || 0) * 1 + (totalDownloadCounts[b.id] || 0) * 0.1;
          if (scoreB !== scoreA) return scoreB - scoreA;
          const ratingDiff = (Number(b.rating) || 0) - (Number(a.rating) || 0);
          if (Math.abs(ratingDiff) > 0.01) return ratingDiff;
          return (b.year || 0) - (a.year || 0);
        }).slice(0, 20).map(toCleanCard); // STRICTLY TOP 20

        // Update category snapshot in memory
        if (homepageMemoryCache[`category_${cat}`]) {
          homepageMemoryCache[`category_${cat}`].trending = trendingDataset[cat];
        }
      }

      await saveHomepageCacheKey('trending', trendingDataset);
      for (const cat of affectedCategories) {
        if (homepageMemoryCache[`category_${cat}`]) {
          await saveHomepageCacheKey(`category_${cat}`, homepageMemoryCache[`category_${cat}`]);
        }
      }
      console.log(`[TRENDING] Updated trending for categories: ${affectedCategories.join(', ')}`);
    } catch (e: any) {
      console.error('[TRENDING] Error recalculating trending dataset:', e.message);
    }
  }, 250);
}

let mutationDebounceTimer: any = null;

export function updateHomepageOnContentMutation(action: 'CREATE' | 'UPDATE' | 'DELETE', item: any) {
  if (item?.id) {
    clearSimilarContentCache(item.id);
  }
  if (mutationDebounceTimer) clearTimeout(mutationDebounceTimer);
  mutationDebounceTimer = setTimeout(async () => {
    console.log(`[HOMEPAGE CACHE] Refreshing affected category datasets for ${action}: ${item?.id || item?.title || ''}`);
    clearSimilarContentCache();
    await buildAllHomepageDatasets(true);
  }, 500);
}

export function isValidCategorySnapshot(s: any): boolean {
  if (!s) return false;
  const trendingCount = Array.isArray(s.trending) ? s.trending.length : (Array.isArray(s.trending?.items) ? s.trending.items.length : 0);
  const latestCount = Array.isArray(s.latest?.items) 
    ? s.latest.items.length 
    : (Array.isArray(s.latest) ? s.latest.length : 0);
  const topRatedCount = Array.isArray(s.topRated?.items)
    ? s.topRated.items.length
    : (Array.isArray(s.topRated) ? s.topRated.length : 0);
  return trendingCount > 0 || latestCount > 0 || topRatedCount > 0;
}

export async function synthesizeHomeContentFallback(cat: string): Promise<any> {
  try {
    const allRaw = await getContentCardsForCache();
    const allCards = allRaw.map(toCardItem).filter(Boolean);
    const filtered = allCards.filter(item => matchesCategory(item, cat));
    
    const trendingList = [...filtered]
      .sort((a, b) => {
        const ratingDiff = (Number(b.rating) || 0) - (Number(a.rating) || 0);
        if (Math.abs(ratingDiff) > 0.01) return ratingDiff;
        const votesDiff = (Number(b.votes) || 0) - (Number(a.votes) || 0);
        if (votesDiff !== 0) return votesDiff;
        return (b.year || 0) - (a.year || 0);
      })
      .slice(0, 20)
      .map(toCleanCard);
      
    const latestList = [...filtered]
      .sort((a, b) => {
        const timeA = getEffectiveReleaseTime(a);
        const timeB = getEffectiveReleaseTime(b);
        if (timeA !== timeB) return timeB - timeA;
        if ((b.year || 0) !== (a.year || 0)) return (b.year || 0) - (a.year || 0);
        return (Number(b.rating) || 0) - (Number(a.rating) || 0);
      })
      .slice(0, 50)
      .map(toCleanCard);
      
    const topRatedList = [...filtered]
      .sort((a, b) => {
        const ratingDiff = (Number(b.rating) || 0) - (Number(a.rating) || 0);
        if (Math.abs(ratingDiff) > 0.01) return ratingDiff;
        const votesDiff = (Number(b.votes) || 0) - (Number(a.votes) || 0);
        if (votesDiff !== 0) return votesDiff;
        return (b.year || 0) - (a.year || 0);
      })
      .slice(0, 50)
      .map(toCleanCard);

    // Group genres
    const genreCountMap: Record<string, number> = {};
    filtered.forEach(item => {
      (item.genres || []).forEach((g: string) => {
        const trimmed = typeof g === 'string' ? g.trim() : '';
        if (trimmed && trimmed !== 'Movies' && trimmed !== 'Series') {
          genreCountMap[trimmed] = (genreCountMap[trimmed] || 0) + 1;
        }
      });
    });
    const sortedGenres = Object.keys(genreCountMap).sort((a, b) => genreCountMap[b] - genreCountMap[a]);
    const availableGenres = orderGenres(sortedGenres);
    const firstGenre = availableGenres[0] || 'Action';
    const genreItems = filtered.filter(item => (item.genres || []).includes(firstGenre)).slice(0, 20).map(toCleanCard);

    // Group franchises for fallback
    let franchiseFiltered = [...filtered];
    if (cat === 'All') {
      franchiseFiltered = franchiseFiltered.filter(item => {
        const itemCat = (item.category || '').toLowerCase().trim();
        const genres = Array.isArray(item.genres) 
          ? item.genres.map((g: any) => String(g).toLowerCase().trim()) 
          : (typeof item.genres === 'string' ? item.genres.toLowerCase().split(',').map((s: string) => s.trim()) : []);
        const lang = (item.language || '').toLowerCase().trim();

        const isAnime = itemCat === 'anime' || genres.some(g => g === 'anime' || g.includes('anime'));
        const indianLangs = ['hi', 'te', 'ta', 'kn', 'ml', 'pa', 'gu', 'mr', 'bn', 'ur', 'or', 'as', 'hindi'];
        const isIndian = !!item.isIndian || itemCat === 'indian' || itemCat === 'bollywood' || (lang && indianLangs.includes(lang));
        const asianLangs = ['ko', 'zh', 'cn', 'tw', 'ja', 'th', 'vi', 'id', 'ms', 'tl', 'korean', 'japanese', 'chinese', 'cantonese', 'mandarin', 'thai', 'vietnamese', 'indonesian', 'filipino', 'tagalog'];
        const isAsian = !isAnime && !isIndian && (itemCat === 'asian' || itemCat === 'asian drama' || itemCat === 'k-drama' || itemCat === 'c-drama' || (lang && asianLangs.includes(lang)));
        
        return !isAsian && !isIndian;
      });
    }

    const franchiseMap = new Map<string, any[]>();
    const originalNames = new Map<string, string>();
    const idsMap = new Map<string, string>();

    franchiseFiltered.forEach(item => {
      let name = (item.franchiseName || item.franchise || '').trim();
      let franchiseId = item.franchiseId || null;
      if (name || franchiseId) {
        const normalizedName = name ? name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim() : 'unknown';
        const key = franchiseId ? `id_${franchiseId}` : `name_${normalizedName}`;
        if (!franchiseMap.has(key)) {
          franchiseMap.set(key, []);
          if (name) originalNames.set(key, name);
          if (franchiseId) idsMap.set(key, franchiseId);
        }
        const existing = franchiseMap.get(key)!;
        if (!existing.some(e => e.id === item.id || (e.title && item.title && e.title.toLowerCase() === item.title.toLowerCase()))) {
          existing.push(item);
        }
      }
    });

    const franchiseFallbackList = Array.from(franchiseMap.entries()).map(([key, groupItems]) => {
      const displayName = originalNames.get(key) || 'Unknown Franchise';
      const franchiseId = idsMap.get(key) || null;
      groupItems.sort((a, b) => (a.year || 0) - (b.year || 0));
      const firstYear = groupItems[0]?.year || '';
      const lastYear = groupItems[groupItems.length - 1]?.year || '';
      const yearRange = firstYear === lastYear ? `${firstYear}` : `${firstYear}-${lastYear}`;
      const validRatings = groupItems.filter(i => typeof i.rating === 'number' && i.rating > 0);
      const avgRating = validRatings.length > 0 ? (validRatings.reduce((acc, curr) => acc + curr.rating, 0) / validRatings.length).toFixed(1) : '0.0';
      const posters = groupItems.map(item => item.posterUrl ? item.posterUrl.replace('/w500/', '/w342/') : '').filter(Boolean).slice(0, 5);
      return {
        id: franchiseId || displayName,
        name: displayName,
        category: cat,
        count: groupItems.length,
        yearRange,
        avgRating,
        numAvgRating: parseFloat(avgRating) || 0,
        posters,
        description: groupItems[0]?.franchiseDescription || '',
        items: groupItems.slice(0, 10).map(toCleanCard)
      };
    }).filter(f => f.count >= 2).sort((a, b) => b.numAvgRating - a.numAvgRating || b.count - a.count).slice(0, 50);

    // Collect people dynamically for fallback
    const fallbackDirectorsCount: Record<string, number> = {};
    const fallbackMaleCount: Record<string, number> = {};
    const fallbackFemaleCount: Record<string, number> = {};
    
    filtered.forEach(item => {
      if (item.director) {
        item.director.split(',').forEach((d: string) => {
          const name = d.trim();
          if (name) fallbackDirectorsCount[name] = (fallbackDirectorsCount[name] || 0) + 1;
        });
      }
      if (Array.isArray(item.maleActors)) {
        item.maleActors.forEach((a: any) => {
          const name = typeof a === 'string' ? a : a?.name || '';
          if (name.trim()) fallbackMaleCount[name.trim()] = (fallbackMaleCount[name.trim()] || 0) + 1;
        });
      }
      if (Array.isArray(item.actorsData)) {
        item.actorsData.forEach((a: any) => {
          if ((a?.gender === 2 || a?.gender === '2' || !a?.gender) && a?.name?.trim()) {
            fallbackMaleCount[a.name.trim()] = (fallbackMaleCount[a.name.trim()] || 0) + 1;
          }
          if ((a?.gender === 1 || a?.gender === '1') && a?.name?.trim()) {
            fallbackFemaleCount[a.name.trim()] = (fallbackFemaleCount[a.name.trim()] || 0) + 1;
          }
        });
      }
      if (Array.isArray(item.femaleActors)) {
        item.femaleActors.forEach((a: any) => {
          const name = typeof a === 'string' ? a : a?.name || '';
          if (name.trim()) fallbackFemaleCount[name.trim()] = (fallbackFemaleCount[name.trim()] || 0) + 1;
        });
      }
    });

    const fallbackDirectors = Object.entries(fallbackDirectorsCount).sort((a,b) => b[1] - a[1]).map(e => e[0]);
    const fallbackMale = Object.entries(fallbackMaleCount).sort((a,b) => b[1] - a[1]).map(e => e[0]);
    const fallbackFemale = Object.entries(fallbackFemaleCount).sort((a,b) => b[1] - a[1]).map(e => e[0]);

    const firstDir = fallbackDirectors[0] || 'Christopher Nolan';
    const firstMale = fallbackMale[0] || 'Leonardo DiCaprio';
    const firstFemale = fallbackFemale[0] || 'Emma Stone';

    const dirItems = filtered.filter(item => (item.director || '').toLowerCase().includes(firstDir.toLowerCase())).slice(0, 20).map(toCleanCard);
    const maleItems = filtered.filter(item => (item.maleActors || []).some((a: string) => a.toLowerCase().includes(firstMale.toLowerCase()))).slice(0, 20).map(toCleanCard);
    const femaleItems = filtered.filter(item => (item.femaleActors || []).some((a: string) => a.toLowerCase().includes(firstFemale.toLowerCase()))).slice(0, 20).map(toCleanCard);

    return {
      category: cat,
      trending: trendingList,
      latest: {
        items: latestList,
        total: latestList.length,
        hasMore: filtered.length > 20,
      },
      topRated: {
        items: topRatedList,
        total: topRatedList.length,
        hasMore: filtered.length > 20,
      },
      franchises: {
        items: franchiseFallbackList.slice(0, 20),
        total: franchiseFallbackList.length,
        hasMore: franchiseFallbackList.length > 20,
      },
      genres: {
        defaultGenre: firstGenre,
        availableGenres,
        items: genreItems,
        total: genreItems.length,
        hasMore: false,
      },
      bestOf: {
        defaultNetwork: 'Warner Bros. Pictures',
        availableNetworks: ['Warner Bros. Pictures', 'Marvel Studios', 'Universal Pictures', 'Paramount', 'A24'],
        items: filtered.slice(0, 20).map(toCleanCard),
        total: Math.min(filtered.length, 20),
        hasMore: false,
      },
      directors: {
        defaultPerson: firstDir,
        availablePeople: fallbackDirectors.length > 0 ? fallbackDirectors : ['Christopher Nolan', 'Quentin Tarantino', 'Martin Scorsese', 'Steven Spielberg'],
        items: dirItems.length > 0 ? dirItems : filtered.slice(0, 20).map(toCleanCard),
        total: dirItems.length > 0 ? dirItems.length : Math.min(filtered.length, 20),
        hasMore: false,
      },
      maleActors: {
        defaultPerson: firstMale,
        availablePeople: fallbackMale.length > 0 ? fallbackMale : ['Leonardo DiCaprio', 'Robert De Niro', 'Brad Pitt', 'Tom Cruise'],
        items: maleItems.length > 0 ? maleItems : filtered.slice(0, 20).map(toCleanCard),
        total: maleItems.length > 0 ? maleItems.length : Math.min(filtered.length, 20),
        hasMore: false,
      },
      femaleActors: {
        defaultPerson: firstFemale,
        availablePeople: fallbackFemale.length > 0 ? fallbackFemale : ['Emma Stone', 'Scarlett Johansson', 'Margot Robbie', 'Meryl Streep'],
        items: femaleItems.length > 0 ? femaleItems : filtered.slice(0, 20).map(toCleanCard),
        total: femaleItems.length > 0 ? femaleItems.length : Math.min(filtered.length, 20),
        hasMore: false,
      },
      updatedAt: Date.now(),
    };
  } catch (err: any) {
    console.error("[HomepageFallback] Synthesis error:", err.message);
    return null;
  }
}

// Removed top level auto-init to prevent conflicts with initializeLocalDb
export async function runBackgroundStartupTasks() {
  try {
    await initHomepageCacheTable();
    await loadHomepageCacheFromDb();
    
    // Check if category_All is already primed and valid
    const hasValidCache = isValidCategorySnapshot(homepageMemoryCache['category_All']);
    if (!hasValidCache) {
      console.log('[HomepageCache] Cache missing or unpopulated on startup. Compiling now...');
      await buildAllHomepageDatasets(true);
    } else {
      console.log('[HomepageCache] Successfully loaded primed homepage cache from database.');
      // Refresh asynchronously in background so client requests stay instantaneous
      buildAllHomepageDatasets(false).catch(() => {});
    }
    
    await processSyncQueue();
  } catch (err) {
    console.error("Background startup tasks failed:", err);
  }
}

// Periodic refresh safety net every 30 minutes
setInterval(() => {
  buildAllHomepageDatasets().catch(() => {});
}, 30 * 60 * 1000);

export async function getHomeContent(categoryFilter?: string): Promise<any> {
  const cat = normalizeCategory(categoryFilter);
  const cacheKey = `category_${cat}`;

  // 1. Return pre-built memory snapshot if it is valid and contains movies
  if (isValidCategorySnapshot(homepageMemoryCache[cacheKey])) {
    return homepageMemoryCache[cacheKey];
  }

  // 2. Try loading persisted cache from database
  if (!isValidCategorySnapshot(homepageMemoryCache[cacheKey])) {
    await loadHomepageCacheFromDb();
    if (isValidCategorySnapshot(homepageMemoryCache[cacheKey])) {
      return homepageMemoryCache[cacheKey];
    }
  }

  // 3. If memory cache has partial datasets, attempt assembly
  const effectiveSubCat = cat === 'All' ? 'Movies' : cat;
  const trendingList = (homepageMemoryCache.trending?.[cat] || homepageMemoryCache.trending?.All || []).slice(0, 20);
  const latestList = (homepageMemoryCache.latest?.[effectiveSubCat] || homepageMemoryCache.latest?.[cat] || homepageMemoryCache.latest?.All || []).slice(0, 20);
  const topRatedList = (homepageMemoryCache.top_rated?.[effectiveSubCat] || homepageMemoryCache.top_rated?.[cat] || homepageMemoryCache.top_rated?.All || []).slice(0, 20);

  if (trendingList.length > 0 || latestList.length > 0 || topRatedList.length > 0) {
    const franchisesList = (homepageMemoryCache.franchises?.[cat] || homepageMemoryCache.franchises?.All || []).slice(0, 20);
    const genresObj = homepageMemoryCache.genres?.[cat] || homepageMemoryCache.genres?.All || { availableGenres: [], itemsByGenre: {} };
    const firstGenre = genresObj.availableGenres?.[0] || 'Action';
    const genresItems = (genresObj.itemsByGenre?.[firstGenre] || []).slice(0, 20);

    const bestOfObj = homepageMemoryCache.best_of?.[cat] || homepageMemoryCache.best_of?.All || { availableNetworks: [], itemsByNetwork: {} };
    const firstNetwork = bestOfObj.availableNetworks?.[0] || 'Warner Bros. Pictures';
    const bestOfItems = (bestOfObj.itemsByNetwork?.[firstNetwork] || []).slice(0, 20);

    const directorsObj = homepageMemoryCache.directors?.[cat] || homepageMemoryCache.directors?.All || { availablePeople: [], itemsByPerson: {} };
    const firstDirector = directorsObj.availablePeople?.[0] || 'Christopher Nolan';
    const directorItems = (directorsObj.itemsByPerson?.[firstDirector] || []).slice(0, 20);

    const maleActorsObj = homepageMemoryCache.male_actors?.[cat] || homepageMemoryCache.male_actors?.All || { availablePeople: [], itemsByPerson: {} };
    const firstMaleActor = maleActorsObj.availablePeople?.[0] || 'Leonardo DiCaprio';
    const maleActorItems = (maleActorsObj.itemsByPerson?.[firstMaleActor] || []).slice(0, 20);

    const femaleActorsObj = homepageMemoryCache.female_actors?.[cat] || homepageMemoryCache.female_actors?.All || { availablePeople: [], itemsByPerson: {} };
    const firstFemaleActor = femaleActorsObj.availablePeople?.[0] || 'Emma Stone';
    const femaleActorItems = (femaleActorsObj.itemsByPerson?.[firstFemaleActor] || []).slice(0, 20);

    const assembled = {
      category: cat,
      trending: trendingList,
      latest: {
        items: latestList,
        total: (homepageMemoryCache.latest?.[effectiveSubCat] || homepageMemoryCache.latest?.[cat] || []).length,
        hasMore: (homepageMemoryCache.latest?.[effectiveSubCat] || homepageMemoryCache.latest?.[cat] || []).length > 20,
      },
      topRated: {
        items: topRatedList,
        total: (homepageMemoryCache.top_rated?.[effectiveSubCat] || homepageMemoryCache.top_rated?.[cat] || []).length,
        hasMore: (homepageMemoryCache.top_rated?.[effectiveSubCat] || homepageMemoryCache.top_rated?.[cat] || []).length > 20,
      },
      franchises: {
        items: franchisesList,
        total: (homepageMemoryCache.franchises?.[cat] || homepageMemoryCache.franchises?.All || []).length,
        hasMore: (homepageMemoryCache.franchises?.[cat] || homepageMemoryCache.franchises?.All || []).length > 20,
      },
      genres: {
        defaultGenre: firstGenre,
        availableGenres: genresObj.availableGenres || [],
        items: genresItems,
        total: (genresObj.itemsByGenre?.[firstGenre] || []).length,
        hasMore: (genresObj.itemsByGenre?.[firstGenre] || []).length > 20,
      },
      bestOf: {
        defaultNetwork: firstNetwork,
        availableNetworks: bestOfObj.availableNetworks || [],
        items: bestOfItems,
        total: (bestOfObj.itemsByNetwork?.[firstNetwork] || []).length,
        hasMore: (bestOfObj.itemsByNetwork?.[firstNetwork] || []).length > 20,
      },
      directors: {
        defaultPerson: firstDirector,
        availablePeople: directorsObj.availablePeople || [],
        items: directorItems,
        total: (directorsObj.itemsByPerson?.[firstDirector] || []).length,
        hasMore: false,
      },
      maleActors: {
        defaultPerson: firstMaleActor,
        availablePeople: maleActorsObj.availablePeople || [],
        items: maleActorItems,
        total: (maleActorsObj.itemsByPerson?.[firstMaleActor] || []).length,
        hasMore: false,
      },
      femaleActors: {
        defaultPerson: firstFemaleActor,
        availablePeople: femaleActorsObj.availablePeople || [],
        items: femaleActorItems,
        total: (femaleActorsObj.itemsByPerson?.[firstFemaleActor] || []).length,
        hasMore: false,
      },
      updatedAt: datasetsLastUpdated || Date.now(),
    };

    // Cache the assembled snapshot
    homepageMemoryCache[cacheKey] = assembled;
    saveHomepageCacheKey(cacheKey, assembled).catch(() => {});
    return assembled;
  }

  // 4. Trigger dataset compilation in background if not already active
  buildAllHomepageDatasets(true).catch((e) => console.error('[HomepageCache] Background build error:', e.message));

  // 5. GUARANTEED IMMEDIATE LIVE FALLBACK: Synthesize directly from local content repository
  console.log(`[HomepageCache] Cache missing for ${cat}, synthesizing immediate live fallback...`);
  const liveFallback = await synthesizeHomeContentFallback(cat);
  if (liveFallback && isValidCategorySnapshot(liveFallback)) {
    homepageMemoryCache[cacheKey] = liveFallback;
    return liveFallback;
  }

  // If live fallback fails (e.g. empty database), return empty scaffold
  return {
    category: cat,
    trending: [],
    latest: { items: [], total: 0, hasMore: false },
    topRated: { items: [], total: 0, hasMore: false },
    franchises: { items: [], total: 0, hasMore: false },
    genres: { defaultGenre: 'Action', availableGenres: [], items: [], total: 0, hasMore: false },
    bestOf: { defaultNetwork: '', availableNetworks: [], items: [], total: 0, hasMore: false },
    directors: { defaultPerson: '', availablePeople: [], items: [], total: 0, hasMore: false },
    maleActors: { defaultPerson: '', availablePeople: [], items: [], total: 0, hasMore: false },
    femaleActors: { defaultPerson: '', availablePeople: [], items: [], total: 0, hasMore: false },
    updatedAt: Date.now(),
  };
}

export async function getHomepageCarouselItems(
  type: string,
  category: string = 'All',
  subFilter?: string,
  offset: number = 0,
  limitCount: number = 10
): Promise<{ 
  items: any[]; 
  total: number; 
  offset: number; 
  limit: number; 
  hasMore: boolean;
  availableGenres?: string[];
  availableNetworks?: string[];
  availablePeople?: string[];
}> {
  if (!homepageMemoryCache.latest || !homepageMemoryCache.trending) {
    await loadHomepageCacheFromDb();
  }

  const cat = normalizeCategory(category);
  let fullList: any[] = [];
  const normalizedType = type.toLowerCase().replace(/_/g, '');

  // For category-filterable carousels (latest, toprated, trending, franchises)
  const effectiveCat = (cat !== 'All') 
    ? cat 
    : (subFilter && subFilter !== 'All' ? normalizeCategory(subFilter) : 'All');

  if (normalizedType === 'latest') {
    fullList = homepageMemoryCache.latest?.[effectiveCat] || homepageMemoryCache.latest?.All || [];
  } else if (normalizedType === 'toprated') {
    fullList = homepageMemoryCache.top_rated?.[effectiveCat] || homepageMemoryCache.top_rated?.All || [];
  } else if (normalizedType === 'trending') {
    fullList = homepageMemoryCache.trending?.[effectiveCat] || homepageMemoryCache.trending?.All || [];
  } else if (normalizedType === 'franchises') {
    fullList = homepageMemoryCache.franchises?.[effectiveCat] || homepageMemoryCache.franchises?.All || [];
  } else if (normalizedType === 'genres') {
    const genresObj = homepageMemoryCache.genres?.[cat] || homepageMemoryCache.genres?.All || { itemsByGenre: {}, availableGenres: [] };
    const targetGenre = subFilter || genresObj.availableGenres?.[0] || 'Action';
    fullList = genresObj.itemsByGenre?.[targetGenre] || [];
  } else if (normalizedType === 'bestof') {
    const bestOfObj = homepageMemoryCache.best_of?.[cat] || homepageMemoryCache.best_of?.All || { itemsByNetwork: {}, availableNetworks: [] };
    const targetNetwork = subFilter || bestOfObj.availableNetworks?.[0] || '';
    fullList = bestOfObj.itemsByNetwork?.[targetNetwork] || [];
  } else if (normalizedType === 'directors') {
    const obj = homepageMemoryCache.directors?.[cat] || homepageMemoryCache.directors?.All || { itemsByPerson: {}, availablePeople: [] };
    const person = subFilter || obj.availablePeople?.[0] || '';
    fullList = obj.itemsByPerson?.[person] || Object.entries(obj.itemsByPerson || {}).find(([k]) => k.toLowerCase() === person.toLowerCase())?.[1] || [];
  } else if (normalizedType === 'maleactors') {
    const obj = homepageMemoryCache.male_actors?.[cat] || homepageMemoryCache.male_actors?.All || { itemsByPerson: {}, availablePeople: [] };
    const person = subFilter || obj.availablePeople?.[0] || '';
    fullList = obj.itemsByPerson?.[person] || Object.entries(obj.itemsByPerson || {}).find(([k]) => k.toLowerCase() === person.toLowerCase())?.[1] || [];
  } else if (normalizedType === 'femaleactors') {
    const obj = homepageMemoryCache.female_actors?.[cat] || homepageMemoryCache.female_actors?.All || { itemsByPerson: {}, availablePeople: [] };
    const person = subFilter || obj.availablePeople?.[0] || '';
    fullList = obj.itemsByPerson?.[person] || Object.entries(obj.itemsByPerson || {}).find(([k]) => k.toLowerCase() === person.toLowerCase())?.[1] || [];
  }

  // GUARANTEED LIVE FALLBACK IF LIST IS EMPTY
  if (fullList.length === 0) {
    try {
      const allRaw = await getContentCardsForCache();
      const allCards = allRaw.map(toCardItem).filter(Boolean);
      const filtered = allCards.filter(item => matchesCategory(item, effectiveCat));

      if (normalizedType === 'latest') {
        fullList = [...filtered].sort((a, b) => {
          const timeA = getEffectiveReleaseTime(a);
          const timeB = getEffectiveReleaseTime(b);
          if (timeA !== timeB) return timeB - timeA;
          if ((b.year || 0) !== (a.year || 0)) return (b.year || 0) - (a.year || 0);
          return (Number(b.rating) || 0) - (Number(a.rating) || 0);
        }).map(toCleanCard);
      } else if (normalizedType === 'toprated') {
        fullList = [...filtered].sort((a, b) => {
          const ratingDiff = (Number(b.rating) || 0) - (Number(a.rating) || 0);
          if (Math.abs(ratingDiff) > 0.01) return ratingDiff;
          const votesDiff = (Number(b.votes) || 0) - (Number(a.votes) || 0);
          if (votesDiff !== 0) return votesDiff;
          return (b.year || 0) - (a.year || 0);
        }).map(toCleanCard);
      } else if (normalizedType === 'trending') {
        fullList = [...filtered].sort((a, b) => {
          const ratingDiff = (Number(b.rating) || 0) - (Number(a.rating) || 0);
          if (Math.abs(ratingDiff) > 0.01) return ratingDiff;
          const votesDiff = (Number(b.votes) || 0) - (Number(a.votes) || 0);
          if (votesDiff !== 0) return votesDiff;
          return (b.year || 0) - (a.year || 0);
        }).map(toCleanCard);
      } else if (normalizedType === 'genres') {
        const targetGenre = subFilter || 'Action';
        fullList = filtered.filter(item => (item.genres || []).includes(targetGenre)).map(toCleanCard);
      } else if (normalizedType === 'directors') {
        const targetPerson = (subFilter || '').toLowerCase().trim();
        fullList = filtered.filter(item => {
          if (!targetPerson) return true;
          if (item.director) {
            const dirs = item.director.split(',').map((d: string) => d.toLowerCase().trim());
            return dirs.some((d: string) => d === targetPerson || d.includes(targetPerson) || targetPerson.includes(d));
          }
          return false;
        }).sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0)).map(toCleanCard);
      } else if (normalizedType === 'maleactors') {
        const targetPerson = (subFilter || '').toLowerCase().trim();
        fullList = filtered.filter(item => {
          if (!targetPerson) return true;
          if (Array.isArray(item.maleActors)) {
            const names = item.maleActors.map((a: any) => (typeof a === 'string' ? a : a?.name || '').toLowerCase().trim());
            if (names.some((n: string) => n === targetPerson || n.includes(targetPerson) || targetPerson.includes(n))) return true;
          }
          if (Array.isArray(item.actorsData)) {
            const names = item.actorsData.filter((a: any) => a?.gender === 2 || a?.gender === '2' || !a?.gender).map((a: any) => (a?.name || '').toLowerCase().trim());
            if (names.some((n: string) => n === targetPerson || n.includes(targetPerson) || targetPerson.includes(n))) return true;
          }
          return false;
        }).sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0)).map(toCleanCard);
      } else if (normalizedType === 'femaleactors') {
        const targetPerson = (subFilter || '').toLowerCase().trim();
        fullList = filtered.filter(item => {
          if (!targetPerson) return true;
          if (Array.isArray(item.femaleActors)) {
            const names = item.femaleActors.map((a: any) => (typeof a === 'string' ? a : a?.name || '').toLowerCase().trim());
            if (names.some((n: string) => n === targetPerson || n.includes(targetPerson) || targetPerson.includes(n))) return true;
          }
          if (Array.isArray(item.actorsData)) {
            const names = item.actorsData.filter((a: any) => a?.gender === 1 || a?.gender === '1').map((a: any) => (a?.name || '').toLowerCase().trim());
            if (names.some((n: string) => n === targetPerson || n.includes(targetPerson) || targetPerson.includes(n))) return true;
          }
          return false;
        }).sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0)).map(toCleanCard);
      } else {
        fullList = filtered.slice(0, 50).map(toCleanCard);
      }
    } catch (e: any) {
      console.warn('[HomepageCarousel] Live fallback error:', e.message);
    }
  }

  // Limit capped at 50 max (or 20 max for trending)
  const maxCap = normalizedType === 'trending' ? 20 : 50;
  const cappedTotal = Math.min(fullList.length, maxCap);
  const safeOffset = Math.max(0, offset);
  const safeLimit = Math.min(limitCount, 20);
  const sliced = fullList.slice(safeOffset, Math.min(safeOffset + safeLimit, maxCap));
  const hasMore = safeOffset + sliced.length < cappedTotal;

  return {
    items: sliced,
    total: cappedTotal,
    offset: safeOffset,
    limit: safeLimit,
    hasMore,
    availableGenres: normalizedType === 'genres' ? (homepageMemoryCache.genres?.[cat]?.availableGenres || []) : undefined,
    availableNetworks: normalizedType === 'bestof' ? (homepageMemoryCache.best_of?.[cat]?.availableNetworks || []) : undefined,
    availablePeople: (normalizedType === 'directors' || normalizedType === 'maleactors' || normalizedType === 'femaleactors') ? (homepageMemoryCache[normalizedType === 'directors' ? 'directors' : normalizedType === 'maleactors' ? 'male_actors' : 'female_actors']?.[cat]?.availablePeople || []) : undefined,
  };
}

export async function getContentByCategory(category: string, page: number = 1, limitCount: number = 20): Promise<any> {
  return getPaginatedContent(page, limitCount, category);
}

function extractMetadataList(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.map((s: any) => {
      if (typeof s === 'string') return s.trim().toLowerCase();
      if (s && typeof s === 'object') {
        if (s.name) return String(s.name).trim().toLowerCase();
        if (s.title) return String(s.title).trim().toLowerCase();
      }
      return '';
    }).filter(Boolean);
  }
  if (typeof val === 'string') {
    return val.split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean);
  }
  return [];
}

export function calculateSimilarContentServer(currentItem: any, allContent: any[], limitCount = 16): any[] {
  if (!currentItem || !allContent || allContent.length === 0) return [];

  const currentId = String(currentItem.id || '');
  const currentTitle = String(currentItem.title || currentItem.name || '').trim().toLowerCase();
  const currentCategory = String(currentItem.category || '').trim().toLowerCase();
  const currentFranchise = String(currentItem.franchise || currentItem.franchiseName || '').trim().toLowerCase();
  const currentDirector = String(currentItem.director || '').trim().toLowerCase();
  const currentGenres = extractMetadataList(currentItem.genres);
  const currentKeywords = extractMetadataList(currentItem.keywords);
  const currentActors = Array.from(new Set([
    ...extractMetadataList(currentItem.actorsData),
    ...extractMetadataList(currentItem.maleActors),
    ...extractMetadataList(currentItem.femaleActors),
    ...extractMetadataList(currentItem.cast)
  ]));
  const currentStudios = Array.from(new Set([
    ...extractMetadataList(currentItem.studiosData),
    ...extractMetadataList(currentItem.networks),
    String(currentItem.network || '').trim().toLowerCase(),
    String(currentItem.studio || '').trim().toLowerCase()
  ].filter(Boolean)));
  const currentRating = currentItem.rating ? Number(currentItem.rating) : null;
  const currentYear = currentItem.year ? Number(currentItem.year) : null;
  const currentStatus = String(currentItem.status || '').trim().toLowerCase();

  const scored: Array<{ item: any; score: number }> = [];
  const seenIds = new Set<string>();

  for (const item of allContent) {
    const itemId = String(item.id || '');
    if (!itemId || itemId === currentId) continue;
    if (seenIds.has(itemId)) continue;

    const itemTitle = String(item.title || item.name || '').trim().toLowerCase();
    if (currentTitle && itemTitle && currentTitle === itemTitle) continue;

    let score = 0;

    // 1. 🎯 Franchise Match (+50 points)
    const itemFranchise = String(item.franchise || item.franchiseName || '').trim().toLowerCase();
    if (currentFranchise && itemFranchise && currentFranchise === itemFranchise) {
      score += 50;
    }

    // 2. 🎯 Category Match (+30 points)
    const itemCategory = String(item.category || '').trim().toLowerCase();
    if (currentCategory && itemCategory && currentCategory === itemCategory) {
      score += 30;
    } else if (matchesCategory(item, currentItem.category)) {
      score += 15;
    }

    // 3. 🎯 Genre Match (+12 per shared genre, max +48)
    const itemGenres = extractMetadataList(item.genres);
    let sharedGenres = 0;
    for (const g of currentGenres) {
      if (itemGenres.includes(g)) sharedGenres++;
    }
    score += Math.min(sharedGenres * 12, 48);

    // 4. 🎯 Keyword Match (+5 per shared keyword, max +25)
    const itemKeywords = extractMetadataList(item.keywords);
    let sharedKeywords = 0;
    for (const k of currentKeywords) {
      if (itemKeywords.includes(k)) sharedKeywords++;
    }
    score += Math.min(sharedKeywords * 5, 25);

    // 5. 🎯 Director Match (+25 points)
    const itemDirector = String(item.director || '').trim().toLowerCase();
    if (currentDirector && itemDirector && currentDirector === itemDirector) {
      score += 25;
    }

    // 6. 🎯 Actors / Cast Match (+10 per shared actor, max +30)
    const itemActors = Array.from(new Set([
      ...extractMetadataList(item.actorsData),
      ...extractMetadataList(item.maleActors),
      ...extractMetadataList(item.femaleActors),
      ...extractMetadataList(item.cast)
    ]));
    let sharedActors = 0;
    for (const a of currentActors) {
      if (itemActors.includes(a)) sharedActors++;
    }
    score += Math.min(sharedActors * 10, 30);

    // 7. 🎯 Studio / Network Match (+15 points)
    const itemStudios = Array.from(new Set([
      ...extractMetadataList(item.studiosData),
      ...extractMetadataList(item.networks),
      String(item.network || '').trim().toLowerCase(),
      String(item.studio || '').trim().toLowerCase()
    ].filter(Boolean)));
    const hasSharedStudio = currentStudios.some(s => itemStudios.includes(s));
    if (hasSharedStudio) {
      score += 15;
    }

    // 8. 🎯 Rating Similarity (+5 to +10 points)
    if (currentRating !== null && item.rating) {
      const itemRating = Number(item.rating);
      if (!isNaN(itemRating)) {
        const ratingDiff = Math.abs(currentRating - itemRating);
        if (ratingDiff <= 0.5) score += 10;
        else if (ratingDiff <= 1.0) score += 5;
      }
    }

    // 9. 🎯 Release Year Similarity (+5 to +10 points)
    if (currentYear !== null && item.year) {
      const itemYear = Number(item.year);
      if (!isNaN(itemYear)) {
        const yearDiff = Math.abs(currentYear - itemYear);
        if (yearDiff <= 3) score += 10;
        else if (yearDiff <= 7) score += 5;
      }
    }

    // 10. 🎯 Status Match (+5 points)
    if (currentStatus && item.status) {
      const itemStatus = String(item.status).trim().toLowerCase();
      if ((currentStatus === 'ongoing' && itemStatus === 'ongoing') ||
          (currentStatus === 'completed' && itemStatus === 'completed')) {
        score += 5;
      }
    }

    if (score > 0) {
      seenIds.add(itemId);
      scored.push({ item, score });
    }
  }

  // Sort by highest score first, then rating, then recency
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ratingB = Number(b.item.rating) || 0;
    const ratingA = Number(a.item.rating) || 0;
    if (ratingB !== ratingA) return ratingB - ratingA;
    return (b.item.year || 0) - (a.item.year || 0);
  });

  const finalItems = scored.map(s => s.item);

  // If fewer than limitCount results, backfill with top items from same category/catalog (excluding self)
  if (finalItems.length < limitCount) {
    const fallbackCandidates = allContent.filter(item => {
      const itemId = String(item.id || '');
      if (!itemId || itemId === currentId || seenIds.has(itemId)) return false;
      const itemTitle = String(item.title || item.name || '').trim().toLowerCase();
      if (currentTitle && itemTitle && currentTitle === itemTitle) return false;
      return true;
    });

    const sameCatFallback = fallbackCandidates.filter(item => {
      const itemCat = String(item.category || '').trim().toLowerCase();
      return currentCategory && itemCat && currentCategory === itemCat;
    }).sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));

    for (const f of sameCatFallback) {
      if (finalItems.length >= limitCount) break;
      const fId = String(f.id);
      if (!seenIds.has(fId)) {
        seenIds.add(fId);
        finalItems.push(f);
      }
    }

    if (finalItems.length < limitCount) {
      const generalFallback = fallbackCandidates
        .filter(item => !seenIds.has(String(item.id)))
        .sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
      for (const f of generalFallback) {
        if (finalItems.length >= limitCount) break;
        const fId = String(f.id);
        if (!seenIds.has(fId)) {
          seenIds.add(fId);
          finalItems.push(f);
        }
      }
    }
  }

  return finalItems.slice(0, limitCount).map(toCleanCard);
}

// In-Memory Similar Content Cache (Key: source content ID)
const similarMemoryCache = new Map<string, { timestamp: number; results: any[] }>();

export function clearSimilarContentCache(contentId?: string) {
  if (contentId) {
    similarMemoryCache.delete(contentId);
    supabaseDb.delete(schema.homepageCache).where(eq(schema.homepageCache.key, `similar:${contentId}`)).catch(() => {});
  } else {
    similarMemoryCache.clear();
    supabaseDb.delete(schema.homepageCache).where(ilike(schema.homepageCache.key, 'similar:%')).catch(() => {});
  }
}

export async function getSimilarContentServer(id: string, limitCount = 16): Promise<any[]> {
  if (!id) return [];

  // 1. In-Memory Cache check (strictly per source content ID)
  const cached = similarMemoryCache.get(id);
  if (cached && Date.now() - cached.timestamp < 3600000 && Array.isArray(cached.results) && cached.results.length > 0) {
    return cached.results.slice(0, limitCount);
  }

  // 2. Persistent Supabase Cache check (`similar:${id}`)
  try {
    const dbCache = await db.select()
      .from(schema.homepageCache)
      .where(eq(schema.homepageCache.key, `similar:${id}`))
      .limit(1);

    if (dbCache.length > 0 && Array.isArray(dbCache[0].data) && dbCache[0].data.length > 0) {
      similarMemoryCache.set(id, { timestamp: Date.now(), results: dbCache[0].data });
      return dbCache[0].data.slice(0, limitCount);
    }
  } catch (err: any) {
    // Non-fatal, compute recommendations on the fly
  }

  // 3. Compute recommendations specifically for THIS source content item
  try {
    const currentItem = await getContentById(id);
    if (!currentItem) return [];

    const allItems = await getContentCardsForCache();
    const results = calculateSimilarContentServer(currentItem, allItems, limitCount);

    if (results.length > 0) {
      // 4. Save to in-memory cache under this source content ID
      similarMemoryCache.set(id, { timestamp: Date.now(), results });

      // 5. Persist to Supabase under key `similar:${id}`
      saveHomepageCacheKey(`similar:${id}`, results).catch(console.error);
    }

    return results;
  } catch (e: any) {
    console.error(`[Recommendations] Failed to calculate similar content for ${id}:`, e.message);
    return [];
  }
}

export async function getFranchiseContentServer(identifier: string): Promise<any[]> {
  try {
    const rawClean = identifier.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!rawClean) return [];

    const isId = identifier.match(/^[0-9]+$/);
    const conditions = [];

    if (isId) {
      conditions.push(sql`${schema.content.franchiseId} = ${identifier}`);
    }

    conditions.push(
      sql`lower(regexp_replace(${schema.content.franchise}, '[^a-zA-Z0-9]', '', 'g')) = ${rawClean}`,
      sql`lower(regexp_replace(${schema.content.franchiseName}, '[^a-zA-Z0-9]', '', 'g')) = ${rawClean}`
    );

    const results = await executeSqlQuery(async (sqlDb) => {
      return await sqlDb.select().from(schema.content).where(or(...conditions));
    });

    // Deduplicate items by ID
    const uniqueMap = new Map<string, any>();
    for (const item of results) {
      if (!uniqueMap.has(item.id)) {
        uniqueMap.set(item.id, item);
      }
    }
    const uniqueResults = Array.from(uniqueMap.values());

    uniqueResults.sort((a, b) => {
      if (a.franchiseOrder !== null && b.franchiseOrder !== null && a.franchiseOrder !== b.franchiseOrder) {
        return a.franchiseOrder - b.franchiseOrder;
      }
      return (a.year || 0) - (b.year || 0);
    });

    return uniqueResults;
  } catch (e: any) {
    console.error(`[Franchise] Error querying franchise content for "${identifier}":`, e?.message);
    return [];
  }
}

/**
 * DUAL-WRITE: Content Mutations
 */

export async function findExistingMatchingContent(item: any): Promise<any | null> {
  const targetId = item.id;
  const rawTitle = (item.title || item.name || '').trim().toLowerCase();
  const rawYear = item.year ? Number(item.year) : null;
  const rawCategory = (item.category || '').trim().toLowerCase();
  const rawTmdbId = item.tmdbId ? Number(item.tmdbId) : null;

  try {
    return await executeSqlQuery(async (sqlDb) => {
      // 1. Direct match by exact ID if provided
      if (targetId) {
        const byId = await sqlDb.select().from(schema.content).where(eq(schema.content.id, targetId)).limit(1);
        if (byId.length > 0) return byId[0];
      }

      // 2. Direct match by TMDB ID if provided
      if (rawTmdbId && !isNaN(rawTmdbId)) {
        const byTmdb = await sqlDb.select().from(schema.content).where(eq(schema.content.tmdbId, rawTmdbId)).limit(1);
        if (byTmdb.length > 0) return byTmdb[0];
      }

      // 3. Match by Movie Identity: Same Title, Same Year, Same Category
      if (rawTitle) {
        const allItems = await sqlDb.select().from(schema.content);
        const match = allItems.find(row => {
          const rowTitle = (row.title || row.name || row.originalTitle || '').trim().toLowerCase();
          if (rowTitle !== rawTitle) return false;

          if (rawYear && row.year) {
            if (Number(row.year) !== rawYear) return false;
          }

          if (rawCategory && row.category) {
            const rowCategory = row.category.trim().toLowerCase();
            if (rowCategory !== rawCategory) return false;
          }

          return true;
        });

        if (match) return match;
      }
      return null;
    });
  } catch (err) {
    console.error('[ContentRepo] Error finding existing matching content:', err);
  }
  return null;
}

export function generateSearchText(item: any): string {
  const parts = [
    item.title,
    item.originalTitle,
    item.name,
    item.originalName,
    item.director,
    item.franchise,
    item.franchiseName,
    item.overview,
    item.description,
    typeof item.cast === 'string' ? item.cast : (Array.isArray(item.cast) ? item.cast.join(' ') : JSON.stringify(item.cast || '')),
    typeof item.genres === 'string' ? item.genres : (Array.isArray(item.genres) ? item.genres.join(' ') : JSON.stringify(item.genres || '')),
    typeof item.actorsData === 'string' ? item.actorsData : (Array.isArray(item.actorsData) ? item.actorsData.map((a: any) => a.name).join(' ') : JSON.stringify(item.actorsData || ''))
  ].filter(Boolean);

  const rawJoined = parts.join(' ').toLowerCase();
  const withSpaces = rawJoined.replace(/[^a-zA-Z0-9\s]/g, ' ');
  const withoutPunctuation = rawJoined.replace(/[^a-zA-Z0-9\s]/g, '');

  return `${withSpaces} ${withoutPunctuation} ${rawJoined}`
    .replace(/\s+/g, ' ')
    .trim();
}

export async function saveContent(item: any): Promise<void> {
  invalidateContentCache();
  // Check if an existing movie/show with the same identity already exists
  const existingMatch = await findExistingMatchingContent(item);
  
  // Use existing ID if found, otherwise use item.id or generate a new ID
  const id = existingMatch ? existingMatch.id : (item.id || `item_${Date.now()}`);
  const isUpdate = Boolean(existingMatch || item.id);

  // Merge existing data with new payload so we preserve existing details & detail link ID
  const mergedPayload = existingMatch ? { ...existingMatch, ...item, id } : { ...item, id };

  const pgPayload = {
    ...mergedPayload,
    searchText: generateSearchText(mergedPayload),
    year: mergedPayload.year ? Number(mergedPayload.year) : null,
    rating: mergedPayload.rating ? Number(mergedPayload.rating) : null,
    votes: mergedPayload.votes ? Number(mergedPayload.votes) : null,
    franchiseOrder: mergedPayload.franchiseOrder ? Number(mergedPayload.franchiseOrder) : null,
    tmdbId: mergedPayload.tmdbId ? Number(mergedPayload.tmdbId) : null,
    budget: mergedPayload.budget ? Number(mergedPayload.budget) : null,
    revenue: mergedPayload.revenue ? Number(mergedPayload.revenue) : null,
    seasons: mergedPayload.seasons ? Number(mergedPayload.seasons) : null,
    episodes: mergedPayload.episodes ? Number(mergedPayload.episodes) : null,
    nominations: mergedPayload.nominations ? Number(mergedPayload.nominations) : null,
    awardsWon: mergedPayload.awardsWon ? Number(mergedPayload.awardsWon) : null,
    createdAt: existingMatch?.createdAt ? new Date(existingMatch.createdAt) : (mergedPayload.createdAt ? new Date(mergedPayload.createdAt) : new Date()),
    updatedAt: new Date(),
  };

  // 1. Write to SQL Database (Primary Supabase, Local PGLite, Backup Supabase)
  try {
    await executeSqlWrite(async (sqlDb) => {
      await sqlDb.insert(schema.content).values(pgPayload).onConflictDoUpdate({
        target: schema.content.id,
        set: pgPayload,
      });
    });
    console.log(`[ContentRepo] Saved (upserted) content entry for "${pgPayload.title}" (ID: ${id}) across all databases`);
  } catch (err: any) {
    console.error(`[ContentRepo] Failed to save content ${id} in SQL database:`, err?.message || err);
  }

  // 2. Secondary Replication: Supabase Backup and Firestore
  replicateWrite(isUpdate ? 'UPDATE' : 'CREATE', 'content', id, pgPayload, doc(firestoreDb, 'content', id));

  // 3. Update homepage cache (Non-blocking)
  try {
    updateHomepageOnContentMutation(isUpdate ? 'UPDATE' : 'CREATE', mergedPayload);
  } catch (e) {
    console.error('[ContentRepo] Error triggering homepage cache update:', e);
  }

  // 4. Update Franchise cache (Non-blocking)
  if (mergedPayload.franchiseId || mergedPayload.franchise || mergedPayload.franchiseName || (existingMatch && (existingMatch.franchiseId || existingMatch.franchise || existingMatch.franchiseName))) {
    try {
      import('./server-franchise.js').then(m => {
        if (mergedPayload.franchiseId || mergedPayload.franchise || mergedPayload.franchiseName) {
          m.checkAndUpdateFranchiseCache(mergedPayload.franchiseId || null, mergedPayload.franchiseName || mergedPayload.franchise || null);
        }
        // If franchise changed, update the old one too
        const oldFranchiseId = existingMatch?.franchiseId;
        const oldFranchise = existingMatch?.franchiseName || existingMatch?.franchise;
        const newFranchiseId = mergedPayload.franchiseId;
        const newFranchise = mergedPayload.franchiseName || mergedPayload.franchise;
        if ((oldFranchiseId && oldFranchiseId !== newFranchiseId) || (oldFranchise && oldFranchise !== newFranchise)) {
          m.checkAndUpdateFranchiseCache(oldFranchiseId || null, oldFranchise || null);
        }
      });
    } catch (e) {
      console.error('[ContentRepo] Error triggering franchise cache update:', e);
    }
  }
}

export async function deduplicateContentDatabase(): Promise<{ total: number; merged: number; deleted: number }> {
  try {
    const allItems = await db.select().from(schema.content);
    const groups = new Map<string, any[]>();

    for (const item of allItems) {
      const title = (item.title || item.name || item.originalTitle || '').trim().toLowerCase();
      const year = item.year ? Number(item.year) : 'noyear';
      const category = (item.category || '').trim().toLowerCase();
      const key = item.tmdbId ? `tmdb_${item.tmdbId}` : `${title}_${year}_${category}`;

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(item);
    }

    let mergedCount = 0;
    let deletedCount = 0;

    for (const [key, items] of groups.entries()) {
      if (items.length > 1) {
        // Sort items: preserve the oldest item ID as master
        items.sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return aTime - bTime;
        });

        const master = items[0];
        const duplicates = items.slice(1);

        // Merge latest/non-empty fields into master
        let mergedPayload = { ...master };
        for (const dup of duplicates) {
          mergedPayload = {
            ...mergedPayload,
            ...dup,
            id: master.id,
            createdAt: master.createdAt,
            updatedAt: new Date()
          };
        }

        // Update master item with merged data
        const finalMergedPayload = {
          ...mergedPayload,
          year: mergedPayload.year ? Number(mergedPayload.year) : null,
          rating: mergedPayload.rating ? Number(mergedPayload.rating) : null,
          updatedAt: new Date()
        };
        await executeSqlWrite(async (sqlDb) => {
          await sqlDb.update(schema.content).set(finalMergedPayload).where(eq(schema.content.id, master.id));
        });
        replicateToFirestore('UPDATE', 'content', master.id, finalMergedPayload, doc(firestoreDb, 'content', master.id));

        // Delete all secondary duplicate rows
        for (const dup of duplicates) {
          await executeSqlWrite(async (sqlDb) => {
            await sqlDb.delete(schema.content).where(eq(schema.content.id, dup.id));
          });
          replicateToFirestore('DELETE', 'content', dup.id, {}, doc(firestoreDb, 'content', dup.id));
          deletedCount++;
        }

        mergedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`[Deduplicate] Cleaned up database: merged ${mergedCount} duplicate groups and removed ${deletedCount} redundant rows.`);
      try {
        buildAllHomepageDatasets(true).catch(() => {});
      } catch (e) {}
    }

    return { total: allItems.length, merged: mergedCount, deleted: deletedCount };
  } catch (err: any) {
    console.error('[Deduplicate] Error running content deduplication:', err?.message || err);
    return { total: 0, merged: 0, deleted: 0 };
  }
}

export async function deleteContent(id: string): Promise<void> {
  // We need to know the franchise before deleting to update the cache afterwards
  let existingFranchise: string | null = null;
  let existingFranchiseId: string | null = null;
  try {
    const existingRow = await executeSqlQuery(async (sqlDb) => {
      return await sqlDb.select({ franchiseId: schema.content.franchiseId, franchise: schema.content.franchise, franchiseName: schema.content.franchiseName }).from(schema.content).where(eq(schema.content.id, id)).limit(1);
    });
    if (existingRow.length > 0) {
      existingFranchiseId = existingRow[0].franchiseId || null;
      existingFranchise = existingRow[0].franchise || existingRow[0].franchiseName || null;
    }
  } catch (e) {}

  // 1. Delete from SQL Database
  await executeSqlWrite(async (sqlDb) => {
    await sqlDb.delete(schema.content).where(eq(schema.content.id, id));
  });

  // 2. Replicate Delete to Firestore (Non-blocking / Circuit-breaker protected)
  replicateToFirestore('DELETE', 'content', id, {}, doc(firestoreDb, 'content', id));

  // 3. Update homepage cache
  updateHomepageOnContentMutation('DELETE', { id });

  // 4. Update Franchise cache
  if (existingFranchiseId || existingFranchise) {
    import('./server-franchise.js')
      .then(m => m.checkAndUpdateFranchiseCache(existingFranchiseId, existingFranchise))
      .catch(e => console.error('[ContentRepo] Error updating franchise cache after delete:', e));
  }
}

export async function updateContentRatings(id: string, rating: number, votes?: number): Promise<boolean> {
  try {
    const updatePayload: any = {
      rating: Number(rating),
      updatedAt: new Date(),
    };
    if (votes !== undefined && !isNaN(Number(votes))) {
      updatePayload.votes = Number(votes);
    }

    await executeSqlWrite(async (sqlDb) => {
      await sqlDb.update(schema.content)
        .set(updatePayload)
        .where(eq(schema.content.id, id));
    });

    // Replicate to Firestore
    replicateToFirestore('UPDATE', 'content', id, updatePayload, doc(firestoreDb, 'content', id));

    // Trigger homepage update
    updateHomepageOnContentMutation('UPDATE', { id, rating, votes });
    return true;
  } catch (err) {
    console.error("Error updating content rating in db:", err);
    return false;
  }
}

/** =========================================================================
 *  USER LISTS REPOSITORY (WATCHLIST, WATCHED, LIKES)
 *  ========================================================================= */

export async function getUserListServer(userId: string, type?: string): Promise<any[]> {
  try {
    let query: any = db.select().from(schema.userLists);
    if (type) {
      query = query.where(and(eq(schema.userLists.userId, userId), eq(schema.userLists.listType, type)));
    } else {
      query = query.where(eq(schema.userLists.userId, userId));
    }
    const res = await query.orderBy(desc(schema.userLists.addedAt));
    return res.map(r => ({ internalUserId: r.userId, contentId: r.contentId, listType: r.listType, createdAt: r.addedAt }));
  } catch (e) {
    return [];
  }
}

export async function saveUserListServer(userId: string, contentId: string, listType: string, action: string): Promise<boolean> {
  const id = `${listType.substring(0, 2)}_${userId}_${contentId}`;
  try {
    if (action === 'remove') {
      await executeSqlWrite(async (sqlDb) => {
        await sqlDb.delete(schema.userLists).where(eq(schema.userLists.id, id));
      });
      
      // Secondary replication
      replicateToFirestore('DELETE', 'user_lists', id, { userId, contentId }, doc(firestoreDb, `users/${userId}/lists/${id}`));
    } else {
      const payload = { id, userId, contentId, listType, addedAt: new Date() };
      const existing = await db.select().from(schema.userLists).where(eq(schema.userLists.id, id));
      
      if (existing.length > 0) {
        await executeSqlWrite(async (sqlDb) => {
          await sqlDb.update(schema.userLists).set(payload).where(eq(schema.userLists.id, id));
        });
      } else {
        await executeSqlWrite(async (sqlDb) => {
          await sqlDb.insert(schema.userLists).values(payload);
        });
      }

      // Secondary replication
      replicateToFirestore(existing.length > 0 ? 'UPDATE' : 'CREATE', 'user_lists', id, payload, doc(firestoreDb, `users/${userId}/lists/${id}`));
    }
    return true;
  } catch (e) {
    console.error("Error in saveUserListServer:", e);
    return false;
  }
}

/** =========================================================================
 *  USER RATINGS REPOSITORY
 *  ========================================================================= */

export async function getUserRatingServer(userId: string, contentId: string): Promise<number | null> {
  if (!userId || !contentId) return null;
  try {
    const res = await db.select().from(schema.userRatings)
      .where(and(eq(schema.userRatings.userId, userId), eq(schema.userRatings.contentId, contentId)))
      .orderBy(desc(schema.userRatings.ratedAt))
      .limit(1);
    if (res.length > 0 && res[0].rating !== null && res[0].rating !== undefined) {
      return Number(res[0].rating);
    }

    // Also check for alternate email-based or user ID aliases
    const u = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (u.length > 0 && u[0].email) {
      const emailKey = `email_${u[0].email.toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      if (emailKey !== userId) {
        const altRes = await db.select().from(schema.userRatings)
          .where(and(eq(schema.userRatings.userId, emailKey), eq(schema.userRatings.contentId, contentId)))
          .orderBy(desc(schema.userRatings.ratedAt))
          .limit(1);
        if (altRes.length > 0 && altRes[0].rating !== null && altRes[0].rating !== undefined) {
          return Number(altRes[0].rating);
        }
      }
    }
  } catch (e) {
    console.error("Error in getUserRatingServer:", e);
  }
  return null;
}

export async function saveUserRatingServer(userId: string, contentId: string, rating: number): Promise<{ success: boolean; totalRatings: number; averageRating: number | null }> {
  if (!userId || !contentId || rating == null) {
    return { success: false, totalRatings: 0, averageRating: null };
  }
  const numRating = Number(rating);
  if (isNaN(numRating) || numRating < 1 || numRating > 10) {
    return { success: false, totalRatings: 0, averageRating: null };
  }

  const id = `ur_${userId}_${contentId}`;
  const payload = { id, userId, contentId, rating: numRating, ratedAt: new Date() };

  try {
    const existing = await db.select().from(schema.userRatings)
      .where(or(
        eq(schema.userRatings.id, id),
        and(eq(schema.userRatings.userId, userId), eq(schema.userRatings.contentId, contentId))
      ));

    if (existing.length > 0) {
      await executeSqlWrite(async (sqlDb) => {
        await sqlDb.update(schema.userRatings)
          .set({ rating: numRating, ratedAt: new Date(), userId })
          .where(eq(schema.userRatings.id, existing[0].id));
      });
      
      // Safely delete any excess duplicates if more than 1 existed
      if (existing.length > 1) {
        for (let i = 1; i < existing.length; i++) {
          await executeSqlWrite(async (sqlDb) => {
            await sqlDb.delete(schema.userRatings).where(eq(schema.userRatings.id, existing[i].id)).catch(() => {});
          });
        }
      }
    } else {
      await executeSqlWrite(async (sqlDb) => {
        await sqlDb.insert(schema.userRatings).values(payload);
      });
    }

    // Non-blocking secondary replication
    replicateToFirestore('CREATE', 'user_ratings', id, payload, doc(firestoreDb, 'ratings', id));

    const stats = await getContentRatingStatsServer(contentId);
    return { success: true, totalRatings: stats.totalRatings, averageRating: stats.averageRating };
  } catch (e) {
    console.error("Error in saveUserRatingServer:", e);
    return { success: false, totalRatings: 0, averageRating: null };
  }
}

export async function getContentRatingStatsServer(contentId: string): Promise<{ totalRatings: number; averageRating: number | null }> {
  if (!contentId) return { totalRatings: 0, averageRating: null };
  try {
    const res = await db.select().from(schema.userRatings).where(eq(schema.userRatings.contentId, contentId));
    if (res.length === 0) return { totalRatings: 0, averageRating: null };

    // Group by userId so 1 user = 1 vote in aggregate
    const userRatingMap = new Map<string, number>();
    for (const row of res) {
      if (row.userId && row.rating !== null && row.rating !== undefined) {
        userRatingMap.set(row.userId, Number(row.rating));
      }
    }

    const count = userRatingMap.size;
    if (count === 0) return { totalRatings: 0, averageRating: null };

    let sum = 0;
    for (const r of userRatingMap.values()) {
      sum += r;
    }
    const avg = Math.round((sum / count) * 10) / 10;
    return { totalRatings: count, averageRating: avg };
  } catch (e) {
    console.error("Error in getContentRatingStatsServer:", e);
    return { totalRatings: 0, averageRating: null };
  }
}

/** =========================================================================
 *  REQUESTS REPOSITORY
 *  ========================================================================= */

export async function getRequests(): Promise<any[]> {
  try {
    return await db.select().from(schema.requests).orderBy(desc(schema.requests.requestedAt));
  } catch (e) {
    try {
      const snap = await getDocs(collection(firestoreDb, 'requests'));
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (fErr) {
      return [];
    }
  }
}

export async function saveRequest(reqData: any): Promise<void> {
  const id = reqData.id || `req_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  const payload = { ...reqData, id };
  const pgPayload = { ...payload, requestedAt: payload.requestedAt ? new Date(payload.requestedAt) : new Date() };

  const existing = await db.select().from(schema.requests).where(eq(schema.requests.id, id));
  if (existing.length > 0) {
    await executeSqlWrite(async (sqlDb) => {
      await sqlDb.update(schema.requests).set(pgPayload).where(eq(schema.requests.id, id));
    });
  } else {
    await executeSqlWrite(async (sqlDb) => {
      await sqlDb.insert(schema.requests).values(pgPayload);
    });
  }

  // Secondary replication
  replicateToFirestore(existing.length > 0 ? 'UPDATE' : 'CREATE', 'requests', id, payload, doc(firestoreDb, 'requests', id));
}

export async function deleteRequest(id: string): Promise<void> {
  await executeSqlWrite(async (sqlDb) => {
    await sqlDb.delete(schema.requests).where(eq(schema.requests.id, id));
  });
  replicateToFirestore('DELETE', 'requests', id, {}, doc(firestoreDb, 'requests', id));
}

/** =========================================================================
 *  ADS & AD SLOTS REPOSITORY
 *  ========================================================================= */

export async function getAds(): Promise<any[]> {
  try {
    return await db.select().from(schema.ads);
  } catch (e) {
    return [];
  }
}

export async function saveAd(adData: any): Promise<void> {
  const id = adData.id || `ad_${Date.now()}`;
  const pgPayload = { ...adData, id, createdAt: adData.createdAt ? new Date(adData.createdAt) : new Date() };
  
  const existing = await db.select().from(schema.ads).where(eq(schema.ads.id, id));
  if (existing.length > 0) {
    await executeSqlWrite(async (sqlDb) => {
      await sqlDb.update(schema.ads).set(pgPayload).where(eq(schema.ads.id, id));
    });
  } else {
    await executeSqlWrite(async (sqlDb) => {
      await sqlDb.insert(schema.ads).values(pgPayload);
    });
  }

  replicateToFirestore(existing.length > 0 ? 'UPDATE' : 'CREATE', 'ads', id, adData, doc(firestoreDb, 'ads', id));
}

export async function deleteAd(id: string): Promise<void> {
  await executeSqlWrite(async (sqlDb) => {
    await sqlDb.delete(schema.ads).where(eq(schema.ads.id, id));
  });
  replicateToFirestore('DELETE', 'ads', id, {}, doc(firestoreDb, 'ads', id));
}

export async function trackAdImpression(adId: string): Promise<void> {}
export async function trackAdClick(adId: string): Promise<void> {}

export async function getCustomSlots(): Promise<any[]> {
  try {
    return await db.select().from(schema.adSlots);
  } catch (e) {
    return [];
  }
}

export async function saveCustomSlot(slotData: any): Promise<void> {
  const id = slotData.id || `slot_${Date.now()}`;
  const pgPayload = { ...slotData, id, createdAt: slotData.createdAt ? new Date(slotData.createdAt) : new Date() };

  const existing = await db.select().from(schema.adSlots).where(eq(schema.adSlots.id, id));
  if (existing.length > 0) {
    await executeSqlWrite(async (sqlDb) => {
      await sqlDb.update(schema.adSlots).set(pgPayload).where(eq(schema.adSlots.id, id));
    });
  } else {
    await executeSqlWrite(async (sqlDb) => {
      await sqlDb.insert(schema.adSlots).values(pgPayload);
    });
  }

  replicateToFirestore(existing.length > 0 ? 'UPDATE' : 'CREATE', 'ad_slots', id, slotData, doc(firestoreDb, 'ad_slots', id));
}

export async function deleteCustomSlot(id: string): Promise<void> {
  await executeSqlWrite(async (sqlDb) => {
    await sqlDb.delete(schema.adSlots).where(eq(schema.adSlots.id, id));
  });
  replicateToFirestore('DELETE', 'ad_slots', id, {}, doc(firestoreDb, 'ad_slots', id));
}

/** =========================================================================
 *  ADMIN SETTINGS REPOSITORY
 *  ========================================================================= */

export async function getAdminSettings(): Promise<any | null> {
  try {
    const res = await db.select().from(schema.adminSettings).where(eq(schema.adminSettings.id, 'admin')).limit(1);
    if (res.length > 0) return res[0];
    const anyRes = await db.select().from(schema.adminSettings).limit(1);
    if (anyRes.length > 0) return anyRes[0];
  } catch (e) {
    console.error("Postgres getAdminSettings error:", e);
  }
  return null;
}

export async function saveAdminSettings(data: any): Promise<void> {
  const id = 'admin';
  const payload = { ...data, id };

  try {
    const existing = await db.select().from(schema.adminSettings).where(eq(schema.adminSettings.id, id));
    if (existing.length > 0) {
      await executeSqlWrite(async (sqlDb) => {
        await sqlDb.update(schema.adminSettings).set(payload).where(eq(schema.adminSettings.id, id));
      });
    } else {
      await executeSqlWrite(async (sqlDb) => {
        await sqlDb.insert(schema.adminSettings).values(payload);
      });
    }
  } catch (dbErr) {
    console.error('Failed to save admin settings to Postgres:', dbErr);
  }

  // Secondary replication: Backup Supabase then Firestore
  replicateWrite('CREATE', 'admin_settings', id, payload, doc(firestoreDb, 'admin_settings', id));
}

/** =========================================================================
 *  ANALYTICS (VIEWS / DOWNLOADS)
 *  ========================================================================= */

export async function getViews(): Promise<any[]> {
  return [];
}

export async function trackView(viewEvent: any): Promise<void> {
  // View tracking disabled as per architecture requirements
  return;
}

export async function getDownloads(): Promise<any[]> {
  try {
    return await db.select().from(schema.analyticsDownloads).orderBy(desc(schema.analyticsDownloads.timestamp));
  } catch (e) {
    return [];
  }
}

export async function getDownloadStats(contentId: string) {
  try {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const [stats] = await db.select({
      total: sql<number>`count(*)`,
      thisWeek: sql<number>`count(case when ${schema.analyticsDownloads.timestamp} >= ${oneWeekAgo.toISOString()} then 1 end)`,
      today: sql<number>`count(case when ${schema.analyticsDownloads.timestamp} >= ${startOfToday.toISOString()} then 1 end)`
    })
    .from(schema.analyticsDownloads)
    .where(eq(schema.analyticsDownloads.contentId, contentId));

    return {
      total: Number(stats?.total || 0),
      thisWeek: Number(stats?.thisWeek || 0),
      today: Number(stats?.today || 0)
    };
  } catch (e) {
    console.error("Failed to get download stats:", e);
    return { total: 0, thisWeek: 0, today: 0 };
  }
}

export async function trackDownload(dlEvent: any): Promise<void> {
  const id = dlEvent.id || uuidv4();
  const pgPayload = {
    id,
    contentId: dlEvent.contentId || dlEvent.id || '',
    category: dlEvent.category || '',
    title: dlEvent.title || '',
    timestamp: dlEvent.timestamp ? new Date(dlEvent.timestamp) : new Date()
  };

  // Write across SQL DBs (Local PGLite, Supabase Primary, Supabase Backup)
  try {
    await executeSqlWrite(async (targetDb) => {
      await targetDb.insert(schema.analyticsDownloads).values(pgPayload).execute();
    });
  } catch (e: any) {
    console.error('[Analytics] Failed to insert download event:', e?.message || e);
  }

  // Update persistent leaderboard cache based purely on the newly recorded download
  import('./server-leaderboard.js')
    .then(m => m.checkAndUpdateLeaderboardCache(pgPayload.contentId, pgPayload.category))
    .catch(err => console.error('Failed to update leaderboard cache:', err));
}

export async function clearAllDownloads(): Promise<void> {
  try {
    await executeSqlWrite(async (targetDb) => {
      await targetDb.delete(schema.analyticsDownloads).execute();
    });
    console.log('[Analytics] All download records successfully cleared across all databases.');
  } catch (e: any) {
    console.error('[Analytics] Failed to clear downloads:', e?.message || e);
  }
}

/** =========================================================================
 *  USERS & AUTHENTICATION IDENTITY MAPPING
 *  ========================================================================= */

export async function getCustomUser(identifier: string): Promise<any | null> {
  const clean = identifier.trim().toLowerCase();
  try {
    const res = await db.select().from(schema.users).where(
      or(
        eq(schema.users.email, clean),
        eq(sql`lower(${schema.users.username})`, clean)
      )
    ).limit(1);
    if (res.length > 0) return res[0];
  } catch (e) {
    console.error("Replica getCustomUser warning:", e);
  }
  
  // Direct fallback to Supabase master
  try {
    const res = await supabaseDb.select().from(schema.users).where(
      or(
        eq(schema.users.email, clean),
        eq(sql`lower(${schema.users.username})`, clean)
      )
    ).limit(1);
    if (res.length > 0) return res[0];
  } catch (err2) {
    console.error("Supabase getCustomUser error:", err2);
  }
  return null;
}

export async function getUserByUsername(username: string): Promise<any | null> {
  const clean = username.trim().toLowerCase();
  try {
    const res = await db.select().from(schema.users).where(eq(sql`lower(${schema.users.username})`, clean)).limit(1);
    if (res.length > 0) return res[0];
  } catch (e) {
    console.error("Replica getUserByUsername warning:", e);
  }
  try {
    const res = await supabaseDb.select().from(schema.users).where(eq(sql`lower(${schema.users.username})`, clean)).limit(1);
    if (res.length > 0) return res[0];
  } catch (err2) {
    console.error("Supabase getUserByUsername error:", err2);
  }
  return null;
}

export async function isUsernameAvailable(username: string): Promise<{ available: boolean; reason?: string; username: string }> {
  const clean = (username || '').trim().toLowerCase().replace(/^@/, '');
  if (!clean) {
    return { available: false, reason: 'Username cannot be empty', username: clean };
  }
  if (clean.length < 3) {
    return { available: false, reason: 'Username must be at least 3 characters', username: clean };
  }
  if (clean.length > 30) {
    return { available: false, reason: 'Username cannot exceed 30 characters', username: clean };
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(clean)) {
    return { available: false, reason: 'Username can only contain letters, numbers, underscores, and periods', username: clean };
  }

  // Reserved admin / system usernames
  const reserved = ['admin', 'administrator', 'abel2222', 'cinemanetwork', 'system', 'root', 'support'];
  if (reserved.includes(clean)) {
    return { available: false, reason: `@${clean} is a reserved username and cannot be used.`, username: clean };
  }

  try {
    const existing = await getUserByUsername(clean);
    if (existing) {
      return { available: false, reason: `Username '@${clean}' is already taken. Please choose another username.`, username: clean };
    }
  } catch (e) {
    console.error('Error checking username availability:', e);
  }

  return { available: true, username: clean };
}

export async function createCustomUser(userData: any): Promise<any> {
  const id = userData.id || uuidv4();
  const lowerEmail = (userData.email || '').trim().toLowerCase();
  const cleanUsername = userData.username ? userData.username.trim().replace(/^@/, '') : null;
  const name = userData.name ? userData.name.trim() : (userData.displayName || null);
  const plainPassword = userData.plainPassword || userData.password || null;

  const createdAtDate = userData.createdAt ? new Date(userData.createdAt) : new Date();

  const payload = { 
    ...userData, 
    id, 
    email: lowerEmail,
    name,
    username: cleanUsername,
    plainPassword,
    displayName: userData.displayName || name || cleanUsername || lowerEmail.split('@')[0],
    createdAt: createdAtDate.toISOString()
  };

  const pgPayload: any = { 
    id,
    email: lowerEmail,
    displayName: payload.displayName,
    name,
    username: cleanUsername,
    plainPassword,
    passwordHash: userData.passwordHash || null,
    providers: userData.providers || ['password'],
    createdAt: createdAtDate, 
    updatedAt: new Date() 
  };

  let finalId = id;
  let operation: 'CREATE' | 'UPDATE' = 'CREATE';

  try {
    await executeSqlWrite(async (sqlDb) => {
      const existing = await sqlDb.select().from(schema.users).where(eq(schema.users.email, lowerEmail));
      if (existing.length === 0) {
        await sqlDb.insert(schema.users).values(pgPayload);
      } else {
        finalId = existing[0].id;
        operation = 'UPDATE';
        if (existing[0].createdAt) {
          payload.createdAt = new Date(existing[0].createdAt).toISOString();
        }
        await sqlDb.update(schema.users).set({
          passwordHash: pgPayload.passwordHash || existing[0].passwordHash,
          displayName: pgPayload.displayName || existing[0].displayName,
          name: pgPayload.name || existing[0].name,
          username: pgPayload.username || existing[0].username,
          plainPassword: pgPayload.plainPassword || existing[0].plainPassword,
          updatedAt: new Date()
        }).where(eq(schema.users.id, existing[0].id));
      }
    });
  } catch (err) {
    console.error('Failed to create/update user in Postgres:', err);
  }

  // Non-blocking secondary replication
  payload.id = finalId;
  replicateToFirestore(operation, 'users', finalId, payload, doc(firestoreDb, 'users', finalId));

  return payload;
}

export async function resolveInternalUser(email: string, displayName: string | null, provider: string) {
  const lowerEmail = email.trim().toLowerCase();
  
  // Check Supabase first
  let existing = await getCustomUser(lowerEmail);

  if (existing) {
    const providers = Array.isArray(existing.providers) 
      ? existing.providers 
      : (typeof existing.providers === 'string' ? JSON.parse(existing.providers) : []);
    
    if (!providers.includes(provider)) {
      providers.push(provider);
      await executeSqlWrite(async (sqlDb) => {
        await sqlDb.update(schema.users).set({ providers, updatedAt: new Date() }).where(eq(schema.users.id, existing.id));
      });
      replicateWrite('UPDATE', 'users', existing.id, { ...existing, providers }, doc(firestoreDb, 'users', existing.id));
    }
    return { ...existing, internalUserId: existing.id, providers: JSON.stringify(providers) };
  }
  
  // Create new user in Supabase + Firestore
  const internalUserId = 'user_' + Math.random().toString(16).substring(2, 10);
  const providers = [provider];
  const defaultUsername = lowerEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_');
  
  const newUser = {
    id: internalUserId,
    email: lowerEmail,
    name: displayName || lowerEmail.split('@')[0],
    username: defaultUsername,
    displayName: displayName || defaultUsername,
    providers,
  };
  
  await createCustomUser(newUser);
  return { 
    ...newUser, 
    internalUserId, 
    providers: JSON.stringify(providers), 
    createdAt: new Date().getTime(), 
    updatedAt: new Date().getTime() 
  };
}

export async function getAdminUsers(options: {
  page?: number;
  limit?: number;
  search?: string;
  dateFilter?: string;
  sortField?: string;
  sortDirection?: 'asc' | 'desc';
  provider?: string;
}) {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
  const offset = (page - 1) * limit;
  const search = options.search?.trim();
  const dateFilter = options.dateFilter || 'all';
  const sortField = options.sortField || 'createdAt';
  const sortDirection = options.sortDirection === 'asc' ? 'asc' : 'desc';
  const providerFilter = options.provider || 'all';

  return await executeSqlQuery(async (sqlDb) => {
    const conditions = [];

    // Search condition
    if (search) {
      const searchPattern = `%${search}%`;
      conditions.push(
        or(
          ilike(schema.users.email, searchPattern),
          ilike(schema.users.name, searchPattern),
          ilike(schema.users.username, searchPattern),
          ilike(schema.users.displayName, searchPattern),
          ilike(schema.users.id, searchPattern)
        )
      );
    }

    // Date Filter condition
    const now = new Date();
    if (dateFilter === 'today') {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      conditions.push(sql`${schema.users.createdAt} >= ${startOfDay}`);
    } else if (dateFilter === '7days') {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      conditions.push(sql`${schema.users.createdAt} >= ${sevenDaysAgo}`);
    } else if (dateFilter === '30days') {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      conditions.push(sql`${schema.users.createdAt} >= ${thirtyDaysAgo}`);
    } else if (dateFilter === 'this_year') {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      conditions.push(sql`${schema.users.createdAt} >= ${startOfYear}`);
    }

    // Provider Filter
    if (providerFilter && providerFilter !== 'all') {
      if (providerFilter === 'password') {
        conditions.push(
          or(
            sql`${schema.users.providers}::text ILIKE '%password%'`,
            sql`${schema.users.plainPassword} IS NOT NULL`,
            sql`${schema.users.passwordHash} IS NOT NULL`
          )
        );
      } else if (providerFilter === 'firebase' || providerFilter === 'google') {
        conditions.push(
          or(
            sql`${schema.users.providers}::text ILIKE '%google%'`,
            sql`${schema.users.providers}::text ILIKE '%firebase%'`
          )
        );
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Sorting
    let orderByClause;
    const directionFn = sortDirection === 'asc' ? asc : desc;
    if (sortField === 'name') {
      orderByClause = directionFn(schema.users.name);
    } else if (sortField === 'username') {
      orderByClause = directionFn(schema.users.username);
    } else if (sortField === 'email') {
      orderByClause = directionFn(schema.users.email);
    } else {
      orderByClause = directionFn(schema.users.createdAt);
    }

    // Parallel fetch users, count, and overall stats
    const [userRows, countRes, allUsersStats] = await Promise.all([
      sqlDb.select()
        .from(schema.users)
        .where(whereClause)
        .orderBy(orderByClause)
        .limit(limit)
        .offset(offset),
      sqlDb.select({ count: sql<number>`count(*)` })
        .from(schema.users)
        .where(whereClause),
      sqlDb.select({
        total: sql<number>`count(*)`,
        newToday: sql<number>`count(case when ${schema.users.createdAt} >= CURRENT_DATE then 1 end)`,
        newThisWeek: sql<number>`count(case when ${schema.users.createdAt} >= NOW() - INTERVAL '7 days' then 1 end)`,
        withPassword: sql<number>`count(case when ${schema.users.plainPassword} is not null or ${schema.users.passwordHash} is not null then 1 end)`
      }).from(schema.users)
    ]);

    const total = Number(countRes[0]?.count || 0);
    const stats = {
      total: Number(allUsersStats[0]?.total || 0),
      newToday: Number(allUsersStats[0]?.newToday || 0),
      newThisWeek: Number(allUsersStats[0]?.newThisWeek || 0),
      withPassword: Number(allUsersStats[0]?.withPassword || 0),
    };

    return {
      users: userRows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      stats
    };
  });
}

export async function deleteAdminUser(userId: string) {
  await executeSqlWrite(async (sqlDb) => {
    // 1. Delete user lists
    try {
      await sqlDb.delete(schema.userLists).where(eq(schema.userLists.userId, userId));
    } catch (e) {
      console.warn('Error deleting user_lists for user:', userId, e);
    }

    // 2. Delete user from users table
    await sqlDb.delete(schema.users).where(eq(schema.users.id, userId));
  });

  // Replicate deletion to Firestore
  try {
    await originalDeleteDoc(doc(firestoreDb, 'users', userId));
  } catch (e) {
    console.error('Failed to delete user doc from Firestore:', e);
  }

  return { success: true };
}

export async function updateAdminUser(userId: string, data: any) {
  const updates: any = { updatedAt: new Date() };
  if (data.name !== undefined) updates.name = data.name;
  if (data.username !== undefined) updates.username = data.username.replace(/^@/, '');
  if (data.displayName !== undefined) updates.displayName = data.displayName;
  if (data.email !== undefined) updates.email = data.email.trim().toLowerCase();
  if (data.plainPassword !== undefined) updates.plainPassword = data.plainPassword;
  if (data.passwordHash !== undefined) updates.passwordHash = data.passwordHash;

  await executeSqlWrite(async (sqlDb) => {
    await sqlDb.update(schema.users).set(updates).where(eq(schema.users.id, userId));
  });

  try {
    await originalSetDoc(doc(firestoreDb, 'users', userId), updates, { merge: true });
  } catch (e) {
    console.error('Failed to update user in Firestore:', e);
  }

  return { success: true, updates };
}

export async function wipeAllUsersExceptAdmin(params?: { name?: string; username?: string; email?: string }) {
  const adminEmail = (params?.email || 'abelgebreslassie22@gmail.com').trim().toLowerCase();
  const adminName = params?.name || 'Abel Gebreslassie';
  const rawUsername = params?.username || 'abel2222';
  const adminUsername = rawUsername.replace(/^@/, '');

  return await executeSqlWrite(async (sqlDb) => {
    // 1. Fetch all existing users from Postgres
    const allUsers = await sqlDb.select().from(schema.users);
    
    // Determine the true admin user row
    let adminUser = allUsers.find(u => u.email?.toLowerCase() === adminEmail);
    if (!adminUser) {
      adminUser = allUsers.find(u => u.email?.toLowerCase() === 'abelgebreslassie@gmail.com');
    }

    const adminId = adminUser ? adminUser.id : 'user_f60cdfcb';

    // 2. Identify all non-admin users to wipe
    const usersToDelete = allUsers.filter(u => 
      u.email?.toLowerCase() !== adminEmail && u.id !== adminId
    );

    const deletedIds: string[] = [];

    for (const u of usersToDelete) {
      // Delete user lists
      try {
        await sqlDb.delete(schema.userLists).where(eq(schema.userLists.userId, u.id));
      } catch (e) {
        console.warn('Error deleting user_lists for:', u.id, e);
      }

      // Delete user ratings
      try {
        await sqlDb.delete(schema.userRatings).where(eq(schema.userRatings.userId, u.id));
      } catch (e) {
        console.warn('Error deleting user_ratings for:', u.id, e);
      }

      // Delete user row
      try {
        await sqlDb.delete(schema.users).where(eq(schema.users.id, u.id));
        deletedIds.push(u.id);
      } catch (e) {
        console.error('Error deleting user record:', u.id, e);
      }

      // Replicate deletion to Firestore
      try {
        await originalDeleteDoc(doc(firestoreDb, 'users', u.id));
      } catch (e) {
        // ignore
      }
      try {
        await originalDeleteDoc(doc(firestoreDb, 'user_lists', u.id));
      } catch (e) {
        // ignore
      }
    }

    // 3. Ensure Admin account is updated with exact requested information
    const adminRecord = {
      id: adminId,
      name: adminName,
      displayName: adminName,
      username: adminUsername,
      email: adminEmail,
      plainPassword: 'abel2222',
      passwordHash: crypto.createHash('sha256').update('abel2222').digest('hex'),
      providers: ['password', 'google'],
      updatedAt: new Date()
    };

    if (adminUser) {
      await sqlDb.update(schema.users).set({
        name: adminName,
        displayName: adminName,
        username: adminUsername,
        email: adminEmail,
        plainPassword: 'abel2222',
        passwordHash: crypto.createHash('sha256').update('abel2222').digest('hex'),
        providers: ['password', 'google'],
        updatedAt: new Date()
      }).where(eq(schema.users.id, adminId));
    } else {
      await sqlDb.insert(schema.users).values(adminRecord);
    }

    // Sync admin to Firestore
    try {
      await originalSetDoc(doc(firestoreDb, 'users', adminId), {
        id: adminId,
        name: adminName,
        displayName: adminName,
        username: adminUsername,
        email: adminEmail,
        plainPassword: 'abel2222',
        providers: ['password', 'google'],
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      console.error('Failed to sync admin user in Firestore:', e);
    }

    return {
      success: true,
      deletedCount: deletedIds.length,
      deletedIds,
      admin: {
        id: adminId,
        name: adminName,
        username: adminUsername,
        email: adminEmail
      }
    };
  });
}

/** Legacy & Backup Compatibility Functions (no-ops for SQLite transition) */
export function rankAndFilterContent(items: any[], query: string, category?: string | null): any[] { return items; }
export async function restoreFromBackup(): Promise<{ restored: number; totalInBackup: number }> { return { restored: 0, totalInBackup: 0 }; }
export async function syncToDataJson(): Promise<void> {}
export async function syncPendingData() { await processSyncQueue(); }

// ------------------------------------------------------------------
// BACKGROUND RATING VERIFICATION (IMDB)
// ------------------------------------------------------------------

const verificationLocks = new Set<string>();
import axios from 'axios';

export async function incrementallyUpdateTopRated(item: any, newRating: number) {
  if (!homepageMemoryCache.top_rated) return;
  
  const categories = ['All', 'Movies', 'Series', 'Animation', 'Anime', 'Indian'];
  let modified = false;
  let triggerFallback = false;

  const itemClean = toCleanCard(item);
  itemClean.rating = newRating;
  const oldRating = Number(item.rating) || 0;

  for (const cat of categories) {
    if (matchesCategory(item, cat)) {
       let list = homepageMemoryCache.top_rated[cat] || [];
       const existingIndex = list.findIndex(c => c.id === item.id);
       
       if (existingIndex !== -1) {
         // Existing item
         list[existingIndex] = itemClean;
         list.sort((a, b) => {
           const ratingDiff = (Number(b.rating) || 0) - (Number(a.rating) || 0);
           if (Math.abs(ratingDiff) > 0.01) return ratingDiff;
           return (b.year || 0) - (a.year || 0);
         });
         modified = true;
         
         // If rating dropped, it's possible a movie that was #51 should now be #50
         // Because we only keep 50 in memory, we must trigger the fallback rebuild
         // if it dropped.
         if (newRating < oldRating) {
            triggerFallback = true;
         }
       } else {
         // New item to Top 50
         if (list.length < 50) {
           list.push(itemClean);
           list.sort((a, b) => {
             const ratingDiff = (Number(b.rating) || 0) - (Number(a.rating) || 0);
             if (Math.abs(ratingDiff) > 0.01) return ratingDiff;
             return (b.year || 0) - (a.year || 0);
           });
           modified = true;
         } else {
           const cutoffItem = list[list.length - 1];
           const cutoffRating = Number(cutoffItem.rating) || 0;
           // Qualifies if rating is strictly better, or equal and newer
           if (newRating > cutoffRating || (Math.abs(newRating - cutoffRating) < 0.01 && (itemClean.year || 0) > (cutoffItem.year || 0))) {
             list.push(itemClean);
             list.sort((a, b) => {
               const ratingDiff = (Number(b.rating) || 0) - (Number(a.rating) || 0);
               if (Math.abs(ratingDiff) > 0.01) return ratingDiff;
               return (b.year || 0) - (a.year || 0);
             });
             list.pop(); // keep top 50
             modified = true;
           }
         }
       }
    }
  }
  
  if (modified) {
     await saveHomepageCacheKey('top_rated', homepageMemoryCache.top_rated);
  }
  
  if (triggerFallback) {
    // A Top 50 item dropped, meaning a non-cached item might need to enter the Top 50.
    // Since categories are evaluated in JS, we must fall back to the existing cache rebuild.
    updateHomepageOnContentMutation('UPDATE', { id: 'top_rated_fallback' });
  }
}


export async function enrichContentMetadata(id: string) {
  if (verificationLocks.has(id + "_enrich")) {
    return { updated: false, reason: 'in-flight' };
  }
  verificationLocks.add(id + "_enrich");
  
  try {
    const item = await getContentById(id);
    if (!item) return { updated: false, reason: 'not_found' };
    
    // Check which fields need enrichment
    const needsActors = !item.actorsData || (Array.isArray(item.actorsData) && item.actorsData.length === 0);
    const needsStudios = !item.studiosData || (Array.isArray(item.studiosData) && item.studiosData.length === 0);
    const needsTrailer = !item.trailerUrl;
    const needsDirector = !item.director || item.director.trim() === '' || item.director.toLowerCase() === 'unknown';

    if (!needsActors && !needsStudios && !needsTrailer && !needsDirector) {
      return { updated: false, reason: 'already_complete' };
    }

    const type = (item.format === 'series' || item.category === 'Series' || item.category === 'Asian Drama') ? 'tv' : 'movie';
    let tmdbData: any = null;
    
    const tmdbKey = process.env.TMDB_API_KEY;
    const authHeader = tmdbKey && tmdbKey.length > 50 ? { Authorization: `Bearer ${tmdbKey}` } : {};
    const apiKeyParam = tmdbKey && tmdbKey.length <= 50 ? `?api_key=${tmdbKey}` : '';

    if (item.tmdbId) {
       const extUrl = `https://api.themoviedb.org/3/${type}/${item.tmdbId}${apiKeyParam ? apiKeyParam + '&' : '?'}append_to_response=credits,aggregate_credits,videos`;
       const extRes = await axios.get(extUrl, { headers: authHeader, timeout: 5000 }).catch(() => null);
       if (extRes && extRes.data) {
         tmdbData = extRes.data;
       }
    } else if (item.title) {
       const searchUrl = `https://api.themoviedb.org/3/search/${type}?query=${encodeURIComponent(item.title)}${apiKeyParam ? '&' + apiKeyParam.substring(1) : ''}`;
       const searchRes = await axios.get(searchUrl, { headers: authHeader, timeout: 5000 }).catch(() => null);
       if (searchRes && searchRes.data && searchRes.data.results && searchRes.data.results.length > 0) {
         const first = searchRes.data.results[0];
         const resType = first.media_type === 'tv' ? 'tv' : type;
         const extUrl = `https://api.themoviedb.org/3/${resType}/${first.id}${apiKeyParam ? apiKeyParam + '&' : '?'}append_to_response=credits,aggregate_credits,videos`;
         const extRes = await axios.get(extUrl, { headers: authHeader, timeout: 5000 }).catch(() => null);
         if (extRes && extRes.data) {
           tmdbData = extRes.data;
         }
       }
    }

    const now = new Date();
    
    if (tmdbData) {
      const updatePayload: any = { metadataCheckedAt: now };
      let didUpdate = false;

      // Extract actors
      if (!item.actorsData || (Array.isArray(item.actorsData) && item.actorsData.length === 0)) {
        if (tmdbData.credits && tmdbData.credits.cast) {
          updatePayload.actorsData = tmdbData.credits.cast.slice(0, 12).map((c: any) => ({
            name: c.name,
            photoUrl: c.profile_path ? `https://image.tmdb.org/t/p/w500${c.profile_path}` : null
          }));
          didUpdate = true;
        } else {
          updatePayload.actorsData = [];
        }
      }

      // Extract studios
      if (!item.studiosData || (Array.isArray(item.studiosData) && item.studiosData.length === 0)) {
        if (tmdbData.production_companies && tmdbData.production_companies.length > 0) {
          updatePayload.studiosData = tmdbData.production_companies.map((c: any) => ({
            name: c.name,
            logoUrl: c.logo_path ? `https://image.tmdb.org/t/p/w500${c.logo_path}` : null
          }));
          didUpdate = true;
        } else if (tmdbData.networks && tmdbData.networks.length > 0) {
          updatePayload.studiosData = tmdbData.networks.map((n: any) => ({
            name: n.name,
            logoUrl: n.logo_path ? `https://image.tmdb.org/t/p/w500${n.logo_path}` : null
          }));
          didUpdate = true;
        } else {
          updatePayload.studiosData = [];
        }
      }

      // Extract trailer
      if (!item.trailerUrl) {
        if (tmdbData.videos && tmdbData.videos.results) {
          const trailer = tmdbData.videos.results.find((v: any) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
          if (trailer) {
            updatePayload.trailerUrl = `https://www.youtube.com/watch?v=${trailer.key}`;
            didUpdate = true;
          } else {
            updatePayload.trailerUrl = "";
          }
        } else {
          updatePayload.trailerUrl = "";
        }
      }

      // Extract franchise
      if (tmdbData.belongs_to_collection) {
        const colId = String(tmdbData.belongs_to_collection.id);
        const colName = tmdbData.belongs_to_collection.name;
        if (item.franchiseId !== colId || item.franchiseName !== colName || item.franchise !== colName) {
          updatePayload.franchiseId = colId;
          updatePayload.franchiseName = colName;
          updatePayload.franchise = colName;
          didUpdate = true;
          
          import('./server-franchise.js').then(m => {
             m.checkAndUpdateFranchiseCache(colId, colName);
             if (item.franchiseId && item.franchiseId !== colId) {
               m.checkAndUpdateFranchiseCache(item.franchiseId, item.franchiseName);
             }
          });
        }
      }

      // Extract director
      if (needsDirector) {
        // 1. Direct Director in credits.crew
        let dirObj = tmdbData.credits?.crew?.find((c: any) => c.job === 'Director');
        
        // 2. aggregate_credits for TV series (directors across episodes)
        if (!dirObj && tmdbData.aggregate_credits?.crew) {
          const dirCandidates = tmdbData.aggregate_credits.crew
            .filter((c: any) => c.jobs && c.jobs.some((j: any) => j.job === 'Director'))
            .map((c: any) => {
              const dJob = c.jobs.find((j: any) => j.job === 'Director');
              return {
                name: c.name,
                profile_path: c.profile_path,
                episodes: dJob ? dJob.episode_count : 0
              };
            })
            .sort((a: any, b: any) => b.episodes - a.episodes);
          if (dirCandidates.length > 0) {
            dirObj = dirCandidates[0];
          }
        }

        // 3. created_by (standard for many TV shows like Breaking Bad, Chernobyl)
        if (!dirObj && tmdbData.created_by && tmdbData.created_by.length > 0) {
          dirObj = tmdbData.created_by[0];
        }

        // 4. Fallback for TV: Creator / Showrunner / Executive Producer / Writer
        if (!dirObj && tmdbData.credits?.crew) {
          dirObj = tmdbData.credits.crew.find((c: any) => c.job === 'Creator' || c.job === 'Showrunner' || c.job === 'Executive Producer' || c.job === 'Writer');
        }

        if (dirObj && dirObj.name) {
          updatePayload.director = dirObj.name;
          if (dirObj.profile_path) {
            updatePayload.directorPhotoUrl = `https://image.tmdb.org/t/p/w500${dirObj.profile_path}`;
          }
          didUpdate = true;
        }
      }

      await executeSqlWrite(async (sqlDb) => {
        await sqlDb.update(schema.content).set(updatePayload).where(eq(schema.content.id, id));
      });
      replicateToFirestore('UPDATE', 'content', id, updatePayload, doc(firestoreDb, 'content', id));
      
      return { updated: true, data: updatePayload };
    }

    // If we failed to get TMDB data, we still mark it as checked so we don't spam
    await executeSqlWrite(async (sqlDb) => {
      await sqlDb.update(schema.content).set({ metadataCheckedAt: now }).where(eq(schema.content.id, id));
    });
    replicateToFirestore('UPDATE', 'content', id, { metadataCheckedAt: now }, doc(firestoreDb, 'content', id));
    return { updated: false, reason: 'tmdb_no_data' };

  } catch (err: any) {
    console.error('TMDB enrichment error:', err.message);
    return { updated: false, reason: 'error', message: err.message };
  } finally {
    verificationLocks.delete(id + "_enrich");
  }
}

export async function verifyContentRating(id: string) {
  if (verificationLocks.has(id)) {
    return { updated: false, reason: 'in-flight' };
  }
  verificationLocks.add(id);
  
  try {
    // 1. Fetch content
    const item = await getContentById(id);
    if (!item) return { updated: false, reason: 'not_found' };

    // 2. Check 7-day rule
    const now = new Date();
    if (item.ratingCheckedAt) {
      const checkedAt = new Date(item.ratingCheckedAt);
      if (!isNaN(checkedAt.getTime())) {
        const daysSince = (now.getTime() - checkedAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < 7) {
          return { updated: false, reason: 'recently_checked' };
        }
      }
    }

    // 3. Fetch OMDb Rating
    let omdbData: any = { Response: 'False' };
    const apiKey = process.env.OMDB_API_KEY || '677810e';
    const title = item.title || item.name;
    const year = item.year;
    
    // Attempt to get IMDb ID from TMDB if tmdbId is present
    let imdbId = null;
    if (item.tmdbId) {
       const tmdbType = (item.format === 'series' || item.category === 'Series' || item.category === 'Asian Drama') ? 'tv' : 'movie';
       try {
         const tmdbKey = process.env.TMDB_API_KEY;
         const authHeader = tmdbKey && tmdbKey.length > 50 ? { Authorization: `Bearer ${tmdbKey}` } : {};
         const apiKeyParam = tmdbKey && tmdbKey.length <= 50 ? `?api_key=${tmdbKey}` : '';
         const joiner = apiKeyParam ? '&' : '?';
         const extUrl = `https://api.themoviedb.org/3/${tmdbType}/${item.tmdbId}/external_ids${apiKeyParam}`;
         const extRes = await axios.get(extUrl, { headers: authHeader, timeout: 4000 });
         if (extRes.data && extRes.data.imdb_id) {
            imdbId = extRes.data.imdb_id;
         }
       } catch (err) {}
    }

    if (imdbId) {
      try {
        const omdbUrlById = `https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&apikey=${apiKey}`;
        const omdbResById = await axios.get(omdbUrlById, { timeout: 4000 });
        if (omdbResById.data.Response === 'True') {
          omdbData = omdbResById.data;
        }
      } catch (err) {}
    }
    
    // Fallback to title search
    if (omdbData.Response !== 'True' && title) {
       let omdbUrl = `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${apiKey}`;
       if (year) {
         omdbUrl += `&y=${encodeURIComponent(year)}`;
       }
       try {
         const omdbRes = await axios.get(omdbUrl, { timeout: 4000 });
         omdbData = omdbRes.data;
       } catch (err) {}
       
       if (omdbData.Response !== 'True' && year) {
         const fallbackUrl = `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${apiKey}`;
         try {
           const fallbackRes = await axios.get(fallbackUrl, { timeout: 4000 });
           omdbData = fallbackRes.data;
         } catch (err) {}
       }
    }

    if (omdbData.Response === 'True' && omdbData.imdbRating && omdbData.imdbRating !== 'N/A') {
      const parsedRating = parseFloat(omdbData.imdbRating);
      if (!isNaN(parsedRating) && parsedRating > 0) {
        
        const oldRating = Number(item.rating) || 0;
        if (parsedRating !== oldRating) {
          // Update DB
          const updatePayload: any = {
            rating: parsedRating,
            ratingCheckedAt: now,
            updatedAt: now
          };
          if (omdbData.imdbVotes && omdbData.imdbVotes !== 'N/A') {
            updatePayload.votes = parseInt(omdbData.imdbVotes.replace(/,/g, ''), 10);
          }
          await executeSqlWrite(async (sqlDb) => {
            await sqlDb.update(schema.content).set(updatePayload).where(eq(schema.content.id, id));
          });
          
          replicateToFirestore('UPDATE', 'content', id, updatePayload, doc(firestoreDb, 'content', id));
          
          // Update Top Rated cache incrementally
          await incrementallyUpdateTopRated(item, parsedRating);
          return { updated: true, newRating: parsedRating };
        }
      }
    }

    // If same rating or N/A or missing or error, just update timestamp so we don't spam OMDb
    await executeSqlWrite(async (sqlDb) => {
      await sqlDb.update(schema.content).set({ ratingCheckedAt: now }).where(eq(schema.content.id, id));
    });
    replicateToFirestore('UPDATE', 'content', id, { ratingCheckedAt: now }, doc(firestoreDb, 'content', id));
    return { updated: false, reason: 'same_or_missing' };

  } catch (err: any) {
    console.error('IMDb verification error:', err.message);
    return { updated: false, reason: 'error', message: err.message };
  } finally {
    verificationLocks.delete(id);
  }
}
