import { LRUCache } from 'lru-cache';

export const searchCache = new LRUCache<string, any[]>({
  max: 500,
  ttl: 10 * 60 * 1000,
});

export const suggestionsCache = new LRUCache<string, any[]>({
  max: 500,
  ttl: 10 * 60 * 1000,
});

export function buildSearchCacheKey(query: string, category?: string): string {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedCategory = (category || 'all').toLowerCase();
  return `${normalizedQuery}::${normalizedCategory}`;
}

export function invalidateSearchCaches(): void {
  searchCache.clear();
  suggestionsCache.clear();
}
