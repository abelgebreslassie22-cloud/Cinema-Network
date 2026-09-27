import { ContentItem } from '../types';
import { getMockContent } from '../data';
import { getStartOfTodayUTC3 } from './dateUtils';

interface ViewEvent {
  id: string;
  category: string;
  title: string;
  timestamp: number;
}

const STORAGE_KEY = 'content_views_v2';

// Seed some initial views if empty to make the mockup look good
const seedInitialViews = () => {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) return;

  const content = getMockContent();
  const views: ViewEvent[] = [];
  const now = Date.now();
  
  // Create randomized views over the last 30 days
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  
  content.forEach(item => {
    // Generate between 10 to 500 views per item
    const numViews = Math.floor(Math.random() * 490) + 10;
    
    for (let i = 0; i < numViews; i++) {
        // Bias towards recent dates (power curve)
        const randomFactor = Math.pow(Math.random(), 2); 
        const timestamp = now - (thirtyDaysMs * randomFactor);
        
        views.push({
            id: item.id,
            category: item.category,
            title: item.title,
            timestamp
        });
    }
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
}

export const trackView = (item: ContentItem) => {
  try {
    seedInitialViews();
    const existing = localStorage.getItem(STORAGE_KEY);
    const views: ViewEvent[] = existing ? JSON.parse(existing) : [];
    
    views.push({
      id: item.id,
      category: item.category,
      title: item.title,
      timestamp: Date.now()
    });

    // Keep only last 60 days
    const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - sixtyDaysMs;
    const filtered = views.filter(v => v.timestamp > cutoff);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.error("Failed to track view", e);
  }
};

export const getViews = (): ViewEvent[] => {
  try {
    seedInitialViews();
    const existing = localStorage.getItem(STORAGE_KEY);
    return existing ? JSON.parse(existing) : [];
  } catch (e) {
    console.error("Failed to get views", e);
    return [];
  }
}

const calculateTrendingScore = (itemViews: ViewEvent[], now: number) => {
    const startOfToday = getStartOfTodayUTC3(now);
    const startOfWeek = startOfToday - 6 * 24 * 60 * 60 * 1000;
    const startOfMonth = startOfToday - 29 * 24 * 60 * 60 * 1000;

    let score = 0;
    itemViews.forEach(v => {
        if (v.timestamp >= startOfToday) {
            score += 10; // High weight for today
        } else if (v.timestamp >= startOfWeek) {
            score += 5;  // Medium for this week
        } else if (v.timestamp >= startOfMonth) {
            score += 1;  // Low for older
        }
    });
    return score;
}

export const getTrendingContent = (filterFn: (item: ContentItem) => boolean, limit = 10) => {
    const allContent = getMockContent();
    const views = getViews();
    const now = Date.now();

    const filteredContent = allContent.filter(filterFn);
    
    const contentWithScores = filteredContent.map(item => {
        const itemViews = views.filter(v => v.id === item.id);
        const score = calculateTrendingScore(itemViews, now);
        return { item, score };
    });

    contentWithScores.sort((a, b) => b.score - a.score);

    return contentWithScores.slice(0, limit).map(c => c.item);
}

export const getTrendingMovies = (limit = 10) => {
    return getTrendingContent(item => item.category === 'Movies', limit);
}

export const getTrendingSeries = (limit = 10) => {
    return getTrendingContent(item => {
        const cat = item.category as string;
        return cat === 'Series' || cat === 'Anime' || cat === 'Animation' || cat === 'Asian Drama';
    }, limit);
}

export interface AnalyticsStats {
    todayViews: number;
    weekViews: number;
    monthViews: number;
    movieViews: number;
    seriesViews: number;
    animeViews: number;
    animationViews: number;
    topItems: { item: ContentItem; views: number }[];
}

export const getAnalyticsStats = (): AnalyticsStats => {
    const views = getViews();
    const allContent = getMockContent();
    const now = Date.now();
    const startOfToday = getStartOfTodayUTC3(now);
    const startOfWeek = startOfToday - 6 * 24 * 60 * 60 * 1000;
    const startOfMonth = startOfToday - 29 * 24 * 60 * 60 * 1000;

    let todayViews = 0;
    let weekViews = 0;
    let monthViews = 0;
    let movieViews = 0;
    let seriesViews = 0;
    let animeViews = 0;
    let animationViews = 0;

    const itemViewCounts: Record<string, number> = {};

    views.forEach(v => {
        if (v.timestamp >= startOfToday) todayViews++;
        if (v.timestamp >= startOfWeek) weekViews++;
        if (v.timestamp >= startOfMonth) monthViews++;

        const item = allContent.find(c => c.id === v.id);
        if (item) {
            const itemGenres = item.genres as any;
            const genres = Array.isArray(itemGenres) ? itemGenres : (typeof itemGenres === 'string' ? itemGenres.split(',') : []);
            const isAnimation = item.category !== 'Anime' && genres.some((g: string) => g.toLowerCase().includes('animation'));
            
            if (isAnimation) {
                animationViews++;
            } else if (item.category === 'Movies') {
                movieViews++;
            } else if (item.category === 'Series') {
                seriesViews++;
            } else if (item.category === 'Anime') {
                animeViews++;
            }
        } else {
            if (v.category === 'Movies') movieViews++;
            else if (v.category === 'Series') seriesViews++;
            else if (v.category === 'Anime') animeViews++;
            else if (v.category === 'Animation') animationViews++;
        }

        itemViewCounts[v.id] = (itemViewCounts[v.id] || 0) + 1;
    });

    const topItems = Object.entries(itemViewCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([id, count]) => {
            const item = allContent.find(c => c.id === id);
            return item ? { item, views: count } : null;
        })
        .filter(Boolean) as { item: ContentItem; views: number }[];

    return {
        todayViews,
        weekViews,
        monthViews,
        movieViews,
        seriesViews,
        animeViews,
        animationViews,
        topItems
    };
}
