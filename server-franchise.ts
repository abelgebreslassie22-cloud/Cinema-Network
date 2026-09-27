import { db as supabaseDb } from './src/db/index.js';
import * as schema from './src/db/schema.js';
import { sql, eq } from 'drizzle-orm';
import { toCardItem, executeSqlWrite } from './server-db.js';

export async function checkAndUpdateFranchiseCache(franchiseId: string | null, franchiseName: string | null) {
  if (!franchiseId && !franchiseName) return;

  try {
    // Determine the grouping condition
    let whereClause = sql`franchise = ${franchiseName} OR franchise_name = ${franchiseName}`;
    if (franchiseId) {
      whereClause = sql`franchise_id = ${franchiseId}`;
    }
    
    // Count movies for this franchise
    const countRes = await supabaseDb.execute(sql`
      SELECT count(*) as count 
      FROM content 
      WHERE ${whereClause}
    `);
    const count = Number(countRes.rows[0]?.count || 0);

    const cacheId = franchiseId || franchiseName; // Unique enough
    if (!cacheId) return;

    if (count < 2) {
      // Remove franchise cache if it exists across SQL databases
      await executeSqlWrite(async (sqlDb) => {
        await sqlDb.delete(schema.franchiseCache).where(eq(schema.franchiseCache.id, cacheId));
      });
      return;
    }

    // It has >= 2 movies, build cache
    const contentRes = await supabaseDb.execute(sql`
      SELECT * 
      FROM content 
      WHERE ${whereClause}
      ORDER BY release_date ASC, year ASC
    `);
    const movies: any[] = contentRes.rows;

    // Calculate metadata
    const ids = movies.map(m => m.id);
    const validRatings = movies.map(m => Number(m.rating)).filter(r => !isNaN(r) && r > 0);
    const averageRating = validRatings.length > 0 
      ? validRatings.reduce((a, b) => a + b, 0) / validRatings.length 
      : 0;

    const years = movies.map(m => Number(m.year)).filter(y => !isNaN(y) && y > 0);
    const minYear = years.length > 0 ? Math.min(...years) : null;
    const maxYear = years.length > 0 ? Math.max(...years) : null;
    const yearRange = minYear && maxYear && minYear !== maxYear ? `${minYear} - ${maxYear}` : (minYear ? `${minYear}` : '');

    const firstMovie = movies[0];
    const posterUrl = String(firstMovie?.poster_url || firstMovie?.posterUrl || '');
    const backdropUrl = String(firstMovie?.backdrop_url || firstMovie?.backdropUrl || '');
    
    // Category mapping
    let cat = 'Movies';
    if (movies.some(m => String(m.category || '').toLowerCase() === 'series')) cat = 'Series';
    if (movies.some(m => String(m.category || '').toLowerCase() === 'anime')) cat = 'Anime';
    if (movies.some(m => String(m.category || '').toLowerCase() === 'animation')) cat = 'Animation';

    const finalName = franchiseName || String(firstMovie?.franchise_name || firstMovie?.franchiseName || firstMovie?.franchise || 'Unknown Franchise');
    const existing: any[] = await supabaseDb.select().from(schema.franchiseCache).where(eq(schema.franchiseCache.id, cacheId));
    
    const payload: any = {
      id: cacheId,
      name: finalName,
      // Only generate description if it's a new franchise, otherwise keep existing
      description: existing.length > 0 && existing[0]?.description ? existing[0].description : `The complete ${finalName} collection featuring ${count} titles.`,
      movieCount: count,
      averageRating,
      yearRange,
      posterUrl,
      backdropUrl,
      category: cat,
      associatedIds: ids,
      updatedAt: new Date()
    };

    await executeSqlWrite(async (sqlDb) => {
      await sqlDb.insert(schema.franchiseCache).values(payload).onConflictDoUpdate({
        target: schema.franchiseCache.id,
        set: payload
      });
    });
  } catch (err) {
    console.error(`[FranchiseCache] Error checking/updating franchise cache for ${franchiseName}:`, err);
  }
}
