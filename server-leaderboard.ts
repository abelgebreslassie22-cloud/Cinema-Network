import { db as supabaseDb } from './src/db/index.js';
import * as schema from './src/db/schema.js';
import { sql, eq, inArray } from 'drizzle-orm';
import { toCardItem, executeSqlWrite } from './server-db.js';

function getPeriodStart(period: 'daily' | 'weekly' | 'monthly'): Date {
  const now = new Date();
  if (period === 'daily') {
    now.setHours(0, 0, 0, 0);
  } else if (period === 'weekly') {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    now.setDate(diff);
    now.setHours(0, 0, 0, 0);
  } else if (period === 'monthly') {
    now.setDate(1);
    now.setHours(0, 0, 0, 0);
  }
  return now;
}

export async function checkAndUpdateLeaderboardCache(contentId: string, itemCategory: string) {
  try {
    const periods: ('daily' | 'weekly' | 'monthly')[] = ['daily', 'weekly', 'monthly'];
    const categories = ['All', itemCategory].filter(Boolean); // Only check 'All' and the item's specific category

    for (const period of periods) {
      const start = getPeriodStart(period);
      
      // Get the candidate's download count for this period
      const candidateCountRes = await supabaseDb.execute(sql`
        SELECT count(*) as count 
        FROM analytics_downloads 
        WHERE content_id = ${contentId} 
          AND timestamp >= ${start.toISOString()}
      `);
      const candidateCount = Number(candidateCountRes.rows[0]?.count || 0);

      for (const cat of categories) {
        const cacheId = `${period}_${cat}`;
        
        // Fetch current cache
        const cacheEntry = await supabaseDb.select().from(schema.leaderboardCache).where(eq(schema.leaderboardCache.id, cacheId)).limit(1);
        let items = cacheEntry.length > 0 ? (cacheEntry[0].items as any[]) || [] : [];
        
        let needsRebuild = false;
        
        if (items.length < 15) {
          needsRebuild = true;
        } else {
          const inCache = items.some((i: any) => String(i.item.id) === String(contentId));
          if (inCache) {
            // Already in cache, its count increased, might change order
            needsRebuild = true;
          } else {
            const lowestCount = items[items.length - 1]?.downloads || 0;
            if (candidateCount > lowestCount) {
              needsRebuild = true; // Enters top 15
            }
          }
        }

        if (needsRebuild) {
          await rebuildLeaderboardCache(period, cat);
        }
      }
    }
  } catch (err) {
    console.error('[Leaderboard] Error checking/updating cache:', err);
  }
}

async function rebuildLeaderboardCache(period: 'daily' | 'weekly' | 'monthly', cat: string) {
  const start = getPeriodStart(period);
  const cacheId = `${period}_${cat}`;
  
  // Aggregate top 15
  let query;
  if (cat === 'All') {
    query = sql`
      SELECT content_id, count(*) as dl_count 
      FROM analytics_downloads 
      WHERE timestamp >= ${start.toISOString()}
      GROUP BY content_id 
      ORDER BY dl_count DESC 
      LIMIT 15
    `;
  } else {
    query = sql`
      SELECT content_id, count(*) as dl_count 
      FROM analytics_downloads 
      WHERE timestamp >= ${start.toISOString()}
        AND category = ${cat}
      GROUP BY content_id 
      ORDER BY dl_count DESC 
      LIMIT 15
    `;
  }

  const topRes = await supabaseDb.execute(query);
  const topRows = topRes.rows;

  if (topRows.length === 0) {
    // Empty cache
    await saveLeaderboardCache(cacheId, period, cat, []);
    return;
  }

  // Fetch content metadata
  const contentIds = topRows.map(r => r.content_id);
  const contentRows = await supabaseDb.select().from(schema.content).where(inArray(schema.content.id, contentIds as string[]));
  
  // Build items array
  const items = topRows.map((r, index) => {
    const cRow = contentRows.find(c => c.id === r.content_id);
    if (!cRow) return null;
    return {
      item: toCardItem(cRow),
      downloads: Number(r.dl_count),
      position: index + 1
    };
  }).filter(Boolean);

  await saveLeaderboardCache(cacheId, period, cat, items);
}

async function saveLeaderboardCache(id: string, period: string, category: string, items: any[]) {
  const payload = {
    id,
    period,
    category,
    items,
    updatedAt: new Date()
  };

  try {
    await executeSqlWrite(async (sqlDb) => {
      await sqlDb.insert(schema.leaderboardCache).values(payload).onConflictDoUpdate({
        target: schema.leaderboardCache.id,
        set: payload
      });
    });
  } catch (err: any) {
    console.error(`[Leaderboard] Error saving cache for ${id}:`, err?.message || err);
  }
}
