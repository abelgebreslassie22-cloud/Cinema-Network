import { checkAndUpdateLeaderboardCache } from './server-leaderboard.js';

async function run() {
  console.log('Seeding leaderboard caches...');
  const categories = ['All', 'Movies', 'Series', 'Anime', 'Animation'];
  
  for (const cat of categories) {
    // Just trigger it with a dummy content ID so it loops through periods and categories
    // Actually we need to make checkAndUpdateLeaderboardCache trigger rebuild.
    // wait, my checkAndUpdateLeaderboardCache in server-leaderboard.ts:
    // "if (items.length < 15) needsRebuild = true"
    // so it will naturally rebuild if empty. We can just call it!
    await checkAndUpdateLeaderboardCache('dummy_id_trigger', cat);
  }

  console.log('Done seeding leaderboard caches!');
  process.exit(0);
}

run().catch(console.error);
