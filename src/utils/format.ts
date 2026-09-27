import { ContentItem } from '../types';

export const getDisplayCategory = (item: ContentItem) => {
  const lang = item.language?.toLowerCase();
  const isSeries = isContentSeries(item);
  
  // Indian Content
  const indianLangs = ['hi', 'te', 'ta', 'kn', 'ml', 'pa', 'gu', 'mr', 'bn', 'ur', 'or', 'as'];
  if (item.category === 'Indian' || (lang && indianLangs.includes(lang))) {
    return isSeries ? 'Indian Drama' : 'Indian Movie';
  }

  if (lang === 'ko') return isSeries ? 'K-Drama' : 'K-Movie';
  if (lang === 'zh' || lang === 'cn' || lang === 'tw') return isSeries ? 'C-Drama' : 'C-Movie';
  if (lang === 'ja' && item.category !== 'Anime') return isSeries ? 'J-Drama' : 'J-Movie';
  if (lang === 'th') return isSeries ? 'Thai Drama' : 'Thai Movie';
  if (lang === 'vi') return isSeries ? 'Viet Drama' : 'Viet Movie';
  if (item.category === 'Series') return 'TV Show';
  return item.category;
};

export const isContentSeries = (item: ContentItem): boolean => {
  if (item.format === 'series') return true;
  if (item.format === 'movie') return false;
  return item.category === 'Series' || item.category === 'Asian Drama' || item.category === 'Anime';
};

export const formatDuration = (duration: string | undefined): string => {
  if (!duration) return '-';
  const match = duration.match(/(\d+)/);
  if (!match) return duration;
  
  const totalMins = parseInt(match[1], 10);
  if (isNaN(totalMins)) return duration;

  if (totalMins < 60) {
    return `${totalMins}m`;
  }

  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
};

