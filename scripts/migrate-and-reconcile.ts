import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import config from '../firebase-applet-config.json' with { type: 'json' };
import { Client } from 'pg';
import 'dotenv/config';

const app = initializeApp(config);
const firestoreDb = getFirestore(app, config.firestoreDatabaseId);

const toSafeInt = (v: any): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
};

const toSafeFloat = (v: any): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
};

async function runMigration() {
  console.log("==================================================");
  console.log("  CINEMA NETWORK DUAL-DATABASE FAST MIGRATION     ");
  console.log("  SOURCE: Google Firestore                       ");
  console.log("  DESTINATION: Supabase PostgreSQL                ");
  console.log("==================================================");

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  // 1. Content Migration & Reconciliation
  console.log("\n[1/7] Fetching all content from Firestore...");
  const contentSnap = await getDocs(collection(firestoreDb, 'content'));
  console.log(`Discovered ${contentSnap.docs.length} content documents in Firestore.`);

  let insertedCount = 0;
  let updatedCount = 0;
  let errorCount = 0;

  // Process in batches of 200 using multi-row upserts
  const BATCH_SIZE = 100;
  for (let i = 0; i < contentSnap.docs.length; i += BATCH_SIZE) {
    const chunk = contentSnap.docs.slice(i, i + BATCH_SIZE);

    for (const d of chunk) {
      const data: any = d.data();
      const id = d.id;

      try {
        const query = `
          INSERT INTO content (
            id, title, original_title, name, original_name, year, rating, votes,
            duration, category, genres, description, poster_url, backdrop_url,
            director, director_photo_url, cast, language, country, is_indian,
            franchise_id, franchise_order, franchise_name, franchise, franchise_description,
            trailer_url, network, networks, studios_data, actors_data, male_actors,
            female_actors, season_data, qualities, release_date, status, format,
            tmdb_id, overview, budget, revenue, seasons, episodes, creator,
            platforms, nominations, awards_won, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14,
            $15, $16, $17, $18, $19, $20,
            $21, $22, $23, $24, $25,
            $26, $27, $28, $29, $30, $31,
            $32, $33, $34, $35, $36, $37,
            $38, $39, $40, $41, $42, $43, $44,
            $45, $46, $47, $48, $49
          )
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            original_title = EXCLUDED.original_title,
            name = EXCLUDED.name,
            original_name = EXCLUDED.original_name,
            year = EXCLUDED.year,
            rating = EXCLUDED.rating,
            votes = EXCLUDED.votes,
            duration = EXCLUDED.duration,
            category = EXCLUDED.category,
            genres = EXCLUDED.genres,
            description = EXCLUDED.description,
            poster_url = EXCLUDED.poster_url,
            backdrop_url = EXCLUDED.backdrop_url,
            director = EXCLUDED.director,
            director_photo_url = EXCLUDED.director_photo_url,
            cast = EXCLUDED.cast,
            language = EXCLUDED.language,
            country = EXCLUDED.country,
            is_indian = EXCLUDED.is_indian,
            franchise_id = EXCLUDED.franchise_id,
            franchise_order = EXCLUDED.franchise_order,
            franchise_name = EXCLUDED.franchise_name,
            franchise = EXCLUDED.franchise,
            franchise_description = EXCLUDED.franchise_description,
            trailer_url = EXCLUDED.trailer_url,
            network = EXCLUDED.network,
            networks = EXCLUDED.networks,
            studios_data = EXCLUDED.studios_data,
            actors_data = EXCLUDED.actors_data,
            male_actors = EXCLUDED.male_actors,
            female_actors = EXCLUDED.female_actors,
            season_data = EXCLUDED.season_data,
            qualities = EXCLUDED.qualities,
            release_date = EXCLUDED.release_date,
            status = EXCLUDED.status,
            format = EXCLUDED.format,
            tmdb_id = EXCLUDED.tmdb_id,
            overview = EXCLUDED.overview,
            budget = EXCLUDED.budget,
            revenue = EXCLUDED.revenue,
            seasons = EXCLUDED.seasons,
            episodes = EXCLUDED.episodes,
            creator = EXCLUDED.creator,
            platforms = EXCLUDED.platforms,
            nominations = EXCLUDED.nominations,
            awards_won = EXCLUDED.awards_won,
            updated_at = NOW();
        `;

        const values = [
          id,
          data.title || null,
          data.originalTitle || data.original_title || null,
          data.name || null,
          data.originalName || data.original_name || null,
          toSafeInt(data.year),
          toSafeFloat(data.rating),
          toSafeInt(data.votes),
          data.duration || null,
          data.category || null,
          data.genres ? JSON.stringify(data.genres) : null,
          data.description || null,
          data.posterUrl || data.poster_url || null,
          data.backdropUrl || data.backdrop_url || null,
          data.director || null,
          data.directorPhotoUrl || data.director_photo_url || null,
          data.cast ? JSON.stringify(data.cast) : null,
          data.language || null,
          data.country || null,
          Boolean(data.isIndian ?? data.is_indian ?? false),
          data.franchiseId || data.franchise_id || null,
          toSafeInt(data.franchiseOrder || data.franchise_order),
          data.franchiseName || data.franchise_name || null,
          data.franchise || null,
          data.franchiseDescription || data.franchise_description || null,
          data.trailerUrl || data.trailer_url || null,
          data.network || null,
          data.networks ? JSON.stringify(data.networks) : null,
          data.studiosData || data.studios_data ? JSON.stringify(data.studiosData || data.studios_data) : null,
          data.actorsData || data.actors_data ? JSON.stringify(data.actorsData || data.actors_data) : null,
          data.maleActors || data.male_actors ? JSON.stringify(data.maleActors || data.male_actors) : null,
          data.femaleActors || data.female_actors ? JSON.stringify(data.femaleActors || data.female_actors) : null,
          data.seasonData || data.season_data ? JSON.stringify(data.seasonData || data.season_data) : null,
          data.qualities ? JSON.stringify(data.qualities) : null,
          data.releaseDate || data.release_date || null,
          data.status || null,
          data.format || null,
          toSafeInt(data.tmdbId || data.tmdb_id),
          data.overview || null,
          toSafeInt(data.budget),
          toSafeInt(data.revenue),
          toSafeInt(data.seasons),
          toSafeInt(data.episodes),
          data.creator || null,
          data.platforms ? JSON.stringify(data.platforms) : null,
          toSafeInt(data.nominations),
          toSafeInt(data.awardsWon || data.awards_won),
          data.createdAt ? (typeof data.createdAt === 'object' && data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt)) : new Date(),
          new Date()
        ];

        await client.query(query, values);
        insertedCount++;
      } catch (err: any) {
        errorCount++;
        if (errorCount <= 3) {
          console.error(`Error migrating item ${id}:`, err.message);
        }
      }
    }

    const processed = Math.min(i + BATCH_SIZE, contentSnap.docs.length);
    if (processed % 500 === 0 || processed === contentSnap.docs.length) {
      console.log(`Content progress: ${processed}/${contentSnap.docs.length} (Synced: ${insertedCount}, Errors: ${errorCount})`);
    }
  }

  // 2. Users Migration
  console.log("\n[2/7] Migrating users...");
  const usersSnap = await getDocs(collection(firestoreDb, 'users'));
  for (const d of usersSnap.docs) {
    const data: any = d.data();
    await client.query(`
      INSERT INTO users (id, email, display_name, providers, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        display_name = EXCLUDED.display_name,
        providers = EXCLUDED.providers,
        updated_at = NOW();
    `, [
      d.id,
      data.email || null,
      data.displayName || data.name || null,
      JSON.stringify(data.providers || ['google.com']),
      data.createdAt ? new Date(data.createdAt) : new Date()
    ]);
  }
  console.log(`Users synced: ${usersSnap.docs.length}`);

  // 3. User Ratings Migration
  console.log("\n[3/7] Migrating ratings...");
  const ratingsSnap = await getDocs(collection(firestoreDb, 'ratings'));
  for (const d of ratingsSnap.docs) {
    const data: any = d.data();
    await client.query(`
      INSERT INTO user_ratings (id, user_id, content_id, rating, rated_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        rating = EXCLUDED.rating,
        rated_at = EXCLUDED.rated_at;
    `, [
      d.id,
      data.userId || null,
      data.contentId || null,
      toSafeFloat(data.rating),
      data.ratedAt ? new Date(data.ratedAt) : new Date()
    ]);
  }
  console.log(`Ratings synced: ${ratingsSnap.docs.length}`);

  // 4. Analytics Views Migration
  console.log("\n[4/7] Migrating views...");
  const viewsSnap = await getDocs(collection(firestoreDb, 'views'));
  for (const d of viewsSnap.docs) {
    const data: any = d.data();
    await client.query(`
      INSERT INTO analytics_views (id, content_id, user_id, session_id, category, title, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING;
    `, [
      d.id,
      data.contentId || null,
      data.userId || null,
      data.sessionId || null,
      data.category || null,
      data.title || null,
      data.timestamp ? new Date(data.timestamp) : new Date()
    ]);
  }
  console.log(`Views synced: ${viewsSnap.docs.length}`);

  // 5. Analytics Downloads Migration
  console.log("\n[5/7] Migrating downloads...");
  const dlSnap = await getDocs(collection(firestoreDb, 'downloads'));
  for (const d of dlSnap.docs) {
    const data: any = d.data();
    await client.query(`
      INSERT INTO analytics_downloads (id, content_id, user_id, session_id, category, title, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO NOTHING;
    `, [
      d.id,
      data.contentId || null,
      data.userId || null,
      data.sessionId || null,
      data.category || null,
      data.title || null,
      data.timestamp ? new Date(data.timestamp) : new Date()
    ]);
  }
  console.log(`Downloads synced: ${dlSnap.docs.length}`);

  // 6. Admin Settings Migration
  console.log("\n[6/7] Migrating admin_settings...");
  const adminSnap = await getDocs(collection(firestoreDb, 'admin_settings'));
  for (const d of adminSnap.docs) {
    const data: any = d.data();
    await client.query(`
      INSERT INTO admin_settings (id, username, password, password_hash, salt, is_default_password, login_history)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        password_hash = EXCLUDED.password_hash,
        salt = EXCLUDED.salt,
        is_default_password = EXCLUDED.is_default_password,
        login_history = EXCLUDED.login_history;
    `, [
      d.id,
      data.username || null,
      data.password || null,
      data.passwordHash || null,
      data.salt || null,
      Boolean(data.isDefaultPassword ?? false),
      JSON.stringify(data.loginHistory || [])
    ]);
  }
  console.log(`Admin settings synced: ${adminSnap.docs.length}`);

  // 7. Verify Final Counts
  console.log("\n[7/7] Verifying Supabase counts vs Firestore...");
  const resContent = await client.query("SELECT count(*) FROM content");
  const resUsers = await client.query("SELECT count(*) FROM users");
  const resRatings = await client.query("SELECT count(*) FROM user_ratings");
  const resViews = await client.query("SELECT count(*) FROM analytics_views");
  const resDl = await client.query("SELECT count(*) FROM analytics_downloads");
  const resAdmin = await client.query("SELECT count(*) FROM admin_settings");

  console.log("\n==================================================");
  console.log("  MIGRATION & RECONCILIATION AUDIT RESULTS        ");
  console.log("==================================================");
  console.log(`Content:   Supabase = ${resContent.rows[0].count.padStart(5)} | Firestore = ${contentSnap.docs.length.toString().padStart(5)}`);
  console.log(`Users:     Supabase = ${resUsers.rows[0].count.padStart(5)} | Firestore = ${usersSnap.docs.length.toString().padStart(5)}`);
  console.log(`Ratings:   Supabase = ${resRatings.rows[0].count.padStart(5)} | Firestore = ${ratingsSnap.docs.length.toString().padStart(5)}`);
  console.log(`Views:     Supabase = ${resViews.rows[0].count.padStart(5)} | Firestore = ${viewsSnap.docs.length.toString().padStart(5)}`);
  console.log(`Downloads: Supabase = ${resDl.rows[0].count.padStart(5)} | Firestore = ${dlSnap.docs.length.toString().padStart(5)}`);
  console.log(`Admin:     Supabase = ${resAdmin.rows[0].count.padStart(5)} | Firestore = ${adminSnap.docs.length.toString().padStart(5)}`);
  console.log("==================================================");

  await client.end();
  process.exit(0);
}

runMigration().catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
