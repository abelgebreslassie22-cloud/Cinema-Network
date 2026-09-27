import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from "../src/db/schema.js";
import { eq } from "drizzle-orm";

const OMDB_API_KEY = process.env.OMDB_API_KEY || process.env.VITE_OMDB_API_KEY || '677810e';

// Create a direct connection bypassing the connection string format issue
const pool = new Pool({
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  host: process.env.SQL_HOST,
  database: process.env.SQL_DB_NAME,
  max: 5
});
const db = drizzle(pool, { schema });

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function updateRatings() {
  console.log("Fetching all content from the database...");
  
  const allContent = await db.select({
    id: schema.content.id,
    title: schema.content.title,
    year: schema.content.year,
    rating: schema.content.rating,
  }).from(schema.content);

  console.log(`Found ${allContent.length} total items. Process starting...`);

  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < allContent.length; i++) {
    const item = allContent[i];
    
    try {
      let omdbUrl = `https://www.omdbapi.com/?t=${encodeURIComponent(item.title || '')}&apikey=${OMDB_API_KEY}`;
      if (item.year) {
        omdbUrl += `&y=${item.year}`;
      }

      let res = await fetch(omdbUrl);
      let data = await res.json();

      if (data.Response !== 'True' && item.year) {
        const fallbackUrl = `https://www.omdbapi.com/?t=${encodeURIComponent(item.title || '')}&apikey=${OMDB_API_KEY}`;
        res = await fetch(fallbackUrl);
        data = await res.json();
      }

      if (data.Response === 'True' && data.imdbRating && data.imdbRating !== 'N/A') {
        const imdbRating = parseFloat(data.imdbRating);
        const imdbVotes = data.imdbVotes ? parseInt(data.imdbVotes.replace(/,/g, ''), 10) : null;
        
        if (!isNaN(imdbRating) && imdbRating > 0) {
          const updatePayload: any = { rating: imdbRating };
          if (imdbVotes && !isNaN(imdbVotes)) {
            updatePayload.votes = imdbVotes;
          }
          
          await db.update(schema.content)
            .set(updatePayload)
            .where(eq(schema.content.id, item.id));
            
          successCount++;
          if (successCount % 50 === 0) {
            console.log(`[${i+1}/${allContent.length}] Updated "${item.title}" -> Rating: ${imdbRating} (Votes: ${imdbVotes})`);
          }
        }
      } else {
        failCount++;
      }
    } catch (err) {
      failCount++;
    }

    await delay(100); 
  }

  console.log(`\nFinished updating ratings!`);
  console.log(`Successfully updated: ${successCount}`);
  console.log(`Failed or not found: ${failCount}`);
  process.exit(0);
}

updateRatings();
