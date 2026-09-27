import { ContentItem } from '../types';
import { getMockContent } from '../data';

export interface RecommendationFactors {
  categoryScore: number;
  genreScore: number;
  keywordScore: number;
  ratingScore: number;
  yearScore: number;
  statusScore: number;
  franchiseScore: number;
  finalScore: number;
}

export interface SimilarContentResult {
  item: ContentItem;
  similarityScore: number; // 0 to max possible
  similarityPercentage: string; // e.g. "90%"
  matchLabel: string; // perfect, excellent, etc
  factors: RecommendationFactors; // for admin debug panel
}

const getKeywords = (k: any): string[] => {
  if (!k) return [];
  if (Array.isArray(k)) return k.map(s => typeof s === 'string' ? s.toLowerCase() : '');
  if (typeof k === 'string') return k.split(',').map(s => s.trim().toLowerCase());
  return [];
};

const getGenres = (g: any): string[] => {
  if (!g) return [];
  if (Array.isArray(g)) return g.map(s => typeof s === 'string' ? s.toLowerCase() : '');
  if (typeof g === 'string') return g.split(',').map(s => s.trim().toLowerCase());
  return [];
};

// Caching recommendations to optimize database performance
const recommendationsCache: Record<string, {
  timestamp: number;
  results: SimilarContentResult[];
}> = {};

export const clearRecommendationsCache = () => {
    Object.keys(recommendationsCache).forEach(key => delete recommendationsCache[key]);
};

export const getSimilarContent = (currentItem: ContentItem, allContent: ContentItem[], maxResults = 8, invalidateCache = false): SimilarContentResult[] => {
  if (!currentItem) return [];

  // Return from cache if valid and not explicitly invalidated
  if (!invalidateCache && recommendationsCache[currentItem.id]) {
      return recommendationsCache[currentItem.id].results;
  }

  const results: SimilarContentResult[] = [];

  const currentGenres = getGenres(currentItem.genres);
  const currentKeywords = getKeywords(currentItem.keywords);

  allContent.forEach(item => {
    // 🚫 Exclusions: Never recommend current title, duplicates handled by map keys, etc.
    if (item.id === currentItem.id) return;
    
    // Also skip if it's the exact same title (e.g. duplicate seasons already displayed)
    if (item.title.toLowerCase() === currentItem.title.toLowerCase()) return;

    let categoryScore = 0;
    let genreScore = 0;
    let keywordScore = 0;
    let ratingScore = 0;
    let yearScore = 0;
    let statusScore = 0;
    let franchiseScore = 0;

    // 🎯 Category Match (+30)
    if (item.category === currentItem.category) {
       categoryScore = 30;
    }

    // 🎯 Genre Match (+10 per shared)
    const itemGenres = getGenres(item.genres);
    let sharedGenres = 0;
    currentGenres.forEach(genre => {
      if (itemGenres.includes(genre)) sharedGenres++;
    });
    genreScore = sharedGenres * 10;

    // 🎯 Keyword Match (+5 per shared, max +25)
    const itemKeywords = getKeywords(item.keywords);
    let sharedKeywords = 0;
    currentKeywords.forEach(keyword => {
       if (itemKeywords.includes(keyword)) sharedKeywords++;
    });
    keywordScore = Math.min(sharedKeywords * 5, 25);

    // 🎯 Rating Similarity
    if (item.rating && currentItem.rating) {
        const ratingDiff = Math.abs(item.rating - currentItem.rating);
        if (ratingDiff <= 0.5) {
            ratingScore = 10;
        } else if (ratingDiff <= 1.0) {
            ratingScore = 5;
        }
    }

    // 🎯 Release Year Similarity
    if (item.year && currentItem.year) {
        const yearDiff = Math.abs(item.year - currentItem.year);
        if (yearDiff <= 3) {
            yearScore = 10;
        } else if (yearDiff <= 7) {
            yearScore = 5;
        }
    }

    // 🎯 Status Match
    if (item.status && currentItem.status) {
        const itemStatus = item.status.toLowerCase();
        const currentItemStatus = currentItem.status.toLowerCase();
        if (itemStatus === 'ongoing' && currentItemStatus === 'ongoing') {
            statusScore = 5;
        } else if (itemStatus === 'completed' && currentItemStatus === 'completed') {
            statusScore = 5;
        }
    }

    // 🎯 Franchise Detection (+50)
    if (item.franchise && currentItem.franchise && 
        item.franchise.trim().toLowerCase() === currentItem.franchise.trim().toLowerCase()) {
        franchiseScore = 50;
    }

    const finalScore = categoryScore + genreScore + keywordScore + ratingScore + yearScore + statusScore + franchiseScore;

    // Display if there is any similarity
    if (finalScore > 0) {
        const similarityPercentageVal = Math.min(finalScore, 100);
        let matchLabel = '';
        if (similarityPercentageVal >= 95) matchLabel = 'Perfect Match';
        else if (similarityPercentageVal >= 85) matchLabel = 'Excellent Match';
        else if (similarityPercentageVal >= 70) matchLabel = 'Strong Match';
        else if (similarityPercentageVal >= 60) matchLabel = 'Good Match';
        else matchLabel = 'Related';

        results.push({
            item,
            similarityScore: finalScore,
            similarityPercentage: `${similarityPercentageVal}%`,
            matchLabel,
            factors: {
                categoryScore,
                genreScore,
                keywordScore,
                ratingScore,
                yearScore,
                statusScore,
                franchiseScore,
                finalScore
            }
        });
    }
  });

  // Sort by highest score first
  results.sort((a, b) => b.similarityScore - a.similarityScore);

  const finalResults = results.slice(0, maxResults);
  
  // Cache the results
  recommendationsCache[currentItem.id] = {
      timestamp: Date.now(),
      results: finalResults
  };

  return finalResults;
};
