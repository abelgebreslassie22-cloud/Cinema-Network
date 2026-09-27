import { clearRecommendationsCache } from './recommendations';

export interface Ad {
  id: string;
  name: string;
  type: 'image' | 'image-text' | 'html' | 'javascript' | 'iframe' | 'network' | 'popunder' | 'floating';
  position: string; // Predefined key or custom slot ID
  priority: 'high' | 'medium' | 'low';
  weight: number; // 1 to 100
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  status: 'active' | 'inactive' | 'paused';
  imageUrlDesktop: string;
  imageUrlTablet?: string;
  imageUrlMobile?: string;
  headline?: string;
  description?: string;
  buttonText?: string;
  destinationUrl?: string;
  customCode?: string; // For HTML/JS/Iframe/Network code
  impressions: number;
  clicks: number;
  firstSeen?: string;
  lastSeen?: string;
  dailyStats?: { [date: string]: { impressions: number; clicks: number } };
}

export interface CustomSlot {
  id: string;
  name: string;
  width: number;
  height: number;
  location: string;
  description: string;
  rotationStrategy: 'random' | 'round-robin' | 'weighted';
}

export const PREDEFINED_POSITIONS = [
  { id: 'homepage_search_banner', label: 'Homepage Search Banner', type: 'banner' },
  { id: 'homepage_latest_series_banner', label: 'Homepage Latest Series Banner', type: 'banner' },
  { id: 'movies_page_banner', label: 'Movies Page Banner', type: 'banner' },
  { id: 'series_page_banner', label: 'Series Page Banner', type: 'banner' },
  { id: 'animation_page_banner', label: 'Animation Page Banner', type: 'banner' },
  { id: 'anime_page_banner', label: 'Anime Page Banner', type: 'banner' },
  { id: 'popunder_click_redirect', label: 'Global Pop-up Redirect (Any Click)', type: 'popunder' },
  { id: 'floating_overlay_ad', label: 'Floating Overlay (Close Button)', type: 'floating' }
];

const INITIAL_MOCK_ADS: Ad[] = [
  {
    id: 'ad_1',
    name: 'Mega Streaming Pass Promo',
    type: 'image-text',
    position: 'homepage_search_banner',
    priority: 'high',
    weight: 70,
    status: 'active',
    imageUrlDesktop: 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?auto=format&fit=crop&q=80&w=1200&h=200',
    headline: 'Unlock Cinema Network Premium!',
    description: 'Get ad-free high-speed streams, localized downloads, and priority support today.',
    buttonText: 'Try 7 Days Free',
    destinationUrl: 'https://telegram.me/YourCinemaNetworkBot',
    impressions: 1240,
    clicks: 145,
    firstSeen: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    lastSeen: new Date().toISOString(),
    dailyStats: {
      '2026-06-19': { impressions: 200, clicks: 25 },
      '2026-06-20': { impressions: 230, clicks: 30 },
      '2026-06-21': { impressions: 250, clicks: 28 },
      '2026-06-22': { impressions: 260, clicks: 32 },
      '2026-06-23': { impressions: 300, clicks: 30 }
    }
  },
  {
    id: 'ad_2',
    name: 'Cyberpunk Game Sponsor Ad',
    type: 'image',
    position: 'homepage_search_banner',
    priority: 'medium',
    weight: 30,
    status: 'active',
    imageUrlDesktop: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80&w=1200&h=200',
    destinationUrl: 'https://store.steampowered.com',
    impressions: 820,
    clicks: 42,
    firstSeen: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    lastSeen: new Date().toISOString(),
    dailyStats: {
      '2026-06-21': { impressions: 240, clicks: 12 },
      '2026-06-22': { impressions: 280, clicks: 15 },
      '2026-06-23': { impressions: 300, clicks: 15 }
    }
  }
];

export const getAds = (): Ad[] => {
  const stored = localStorage.getItem('cinema_network_ads_v2');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
  }
  localStorage.setItem('cinema_network_ads_v2', JSON.stringify(INITIAL_MOCK_ADS));
  return INITIAL_MOCK_ADS;
};

export const saveAds = (ads: Ad[]) => {
  localStorage.setItem('cinema_network_ads_v2', JSON.stringify(ads));
};

export const getCustomSlots = (): CustomSlot[] => {
  const stored = localStorage.getItem('cinema_network_ad_slots_v2');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
  }
  return [];
};

export const saveCustomSlots = (slots: CustomSlot[]) => {
  localStorage.setItem('cinema_network_ad_slots_v2', JSON.stringify(slots));
};

// Impressions and Clicks Tracking
export const trackAdImpression = (adId: string) => {
  const ads = getAds();
  const index = ads.findIndex(a => a.id === adId);
  if (index !== -1) {
    const today = new Date().toISOString().split('T')[0];
    const ad = ads[index];
    ad.impressions += 1;
    if (!ad.firstSeen) ad.firstSeen = new Date().toISOString();
    ad.lastSeen = new Date().toISOString();
    
    if (!ad.dailyStats) ad.dailyStats = {};
    if (!ad.dailyStats[today]) ad.dailyStats[today] = { impressions: 0, clicks: 0 };
    ad.dailyStats[today].impressions += 1;

    ads[index] = ad;
    saveAds(ads);
  }
};

export const trackAdClick = (adId: string) => {
  const ads = getAds();
  const index = ads.findIndex(a => a.id === adId);
  if (index !== -1) {
    const today = new Date().toISOString().split('T')[0];
    const ad = ads[index];
    ad.clicks += 1;
    
    if (!ad.dailyStats) ad.dailyStats = {};
    if (!ad.dailyStats[today]) ad.dailyStats[today] = { impressions: 0, clicks: 0 };
    ad.dailyStats[today].clicks += 1;

    ads[index] = ad;
    saveAds(ads);
  }
};

// Check if an ad is within scheduled dates
const isScheduled = (ad: Ad): boolean => {
  const now = new Date();
  now.setHours(0,0,0,0);

  if (ad.startDate) {
    const start = new Date(ad.startDate);
    start.setHours(0,0,0,0);
    if (now < start) return false;
  }
  if (ad.endDate) {
    const end = new Date(ad.endDate);
    end.setHours(23,59,59,999);
    if (now > end) return false;
  }
  return true;
};

// Round Robin Tracker
const getRoundRobinIndex = (position: string, max: number): number => {
  const key = `ad_rr_idx_${position}`;
  const stored = localStorage.getItem(key);
  let index = stored ? parseInt(stored, 10) : 0;
  if (isNaN(index) || index >= max) index = 0;
  
  localStorage.setItem(key, ((index + 1) % max).toString());
  return index;
};

// Intelligent Rotation Selection Engine
export const getActiveAdForSlot = (position: string, device: 'desktop' | 'tablet' | 'mobile' = 'desktop'): Ad | null => {
  const allAds = getAds();
  const activeAds = allAds.filter(ad => 
    ad.position === position && 
    ad.status === 'active' && 
    isScheduled(ad)
  );

  if (activeAds.length === 0) return null;
  if (activeAds.length === 1) return activeAds[0];

  // Determine rotation strategy (check custom slot strategy, fallback to random/weighted)
  const slots = getCustomSlots();
  const slotConfig = slots.find(s => s.id === position);
  const strategy = slotConfig?.rotationStrategy || 'weighted'; // default: weighted

  if (strategy === 'round-robin') {
    const rrIndex = getRoundRobinIndex(position, activeAds.length);
    return activeAds[rrIndex];
  } else if (strategy === 'weighted') {
    // Weighted selection
    const totalWeight = activeAds.reduce((sum, ad) => sum + (ad.weight || 10), 0);
    let rand = Math.random() * totalWeight;
    for (const ad of activeAds) {
      const weight = ad.weight || 10;
      if (rand < weight) {
        return ad;
      }
      rand -= weight;
    }
    return activeAds[0];
  } else {
    // Random
    const randIndex = Math.floor(Math.random() * activeAds.length);
    return activeAds[randIndex];
  }
};
