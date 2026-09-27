import React, { createContext, useContext, useState, useEffect } from 'react';
import { ContentItem } from '../types';
import { Ad, CustomSlot } from '../utils/ads';
import { clearRecommendationsCache } from '../utils/recommendations';
import { useAuth } from './AuthContext';


interface ViewEvent {
  id: string;
  category: string;
  title: string;
  timestamp: number;
}

interface DownloadEvent {
  id: string;
  contentId: string;
  category?: string;
  title?: string;
  timestamp: number;
}

interface DataContextType {
  content?: ContentItem[];
  ads: Ad[];
  customSlots: CustomSlot[];
  views: ViewEvent[];
  downloads: DownloadEvent[];
  isLoading: boolean;
  refreshAll: () => Promise<void>;
  loadFullContent: () => Promise<ContentItem[]>;
  
  // Content Actions
  addContentItem: (item: any) => Promise<boolean>;
  updateContentItem: (item: any) => Promise<boolean>;
  deleteContentItem: (id: string) => Promise<boolean>;
  
  // Request Actions
  triggerRequestRefresh: () => void;
  
  // Ad Actions
  addAdItem: (ad: any) => Promise<boolean>;
  updateAdItem: (ad: any) => Promise<boolean>;
  deleteAdItem: (id: string) => Promise<boolean>;
  trackAdImpression: (id: string) => Promise<void>;
  trackAdClick: (id: string) => Promise<void>;
  
  // Slot Actions
  addSlotItem: (slot: any) => Promise<boolean>;
  updateSlotItem: (slot: any) => Promise<boolean>;
  deleteSlotItem: (id: string) => Promise<boolean>;
  
  // Analytics
  trackViewEvent: (item: ContentItem) => Promise<void>;
  trackDownloadEvent: (item: ContentItem) => Promise<void>;

  // Watchlist
  watchlistIds: string[];
  toggleWatchlist: (contentId: string) => Promise<boolean>;

  // Watched
  watchedIds: string[];
  toggleWatched: (contentId: string) => Promise<boolean>;

  // Liked
  likedIds: string[];
  toggleLiked: (contentId: string) => Promise<boolean>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  
  const [content, setContent] = useState<ContentItem[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [customSlots, setCustomSlots] = useState<CustomSlot[]>([]);
  const [views, setViews] = useState<ViewEvent[]>(() => {
    try {
      const cached = localStorage.getItem('cached_analytics_views');
      return cached ? JSON.parse(cached) : [];
    } catch (e) {
      return [];
    }
  });
  const [downloads, setDownloads] = useState<DownloadEvent[]>(() => {
    try {
      const cached = localStorage.getItem('cached_analytics_downloads');
      return cached ? JSON.parse(cached) : [];
    } catch (e) {
      return [];
    }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [requestTrigger, setRequestTrigger] = useState(0);
  const [watchlistIds, setWatchlistIds] = useState<string[]>([]);
  const [watchedIds, setWatchedIds] = useState<string[]>([]);
  const [likedIds, setLikedIds] = useState<string[]>([]);

  const fetchAll = async () => {
    try {
      const [adsRes, slotsRes, downloadsRes] = await Promise.all([
        fetch('/api/ads'),
        fetch('/api/ad-slots'),
        fetch('/api/analytics/downloads').catch(() => ({ json: async () => [] }))
      ]);

      const [adsData, slotsData, downloadsData] = await Promise.all([
        adsRes.json(),
        slotsRes.json(),
        downloadsRes.json().catch(() => [])
      ]);

      if (Array.isArray(adsData)) setAds(adsData);
      if (Array.isArray(slotsData)) setCustomSlots(slotsData);
      setViews([]);
      if (Array.isArray(downloadsData)) {
        setDownloads(downloadsData);
        try { localStorage.setItem('cached_analytics_downloads', JSON.stringify(downloadsData)); } catch (e) {}
      }
    } catch (error) {
      console.error("Failed to fetch data from server:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadFullContent = async (): Promise<ContentItem[]> => {
    if (content && content.length > 0) return content;
    try {
      const res = await fetch('/api/content');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setContent(data);
          return data;
        }
      }
    } catch (e) {
      console.error("Failed to lazy-load full content:", e);
    }
    return [];
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const refreshAll = async () => {
    setIsLoading(true);
    await fetchAll();
  };

  const getAuthHeader = () => {
    const token = localStorage.getItem('adminToken');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  };

  // CONTENT
  const addContentItem = async (item: any) => {
    try {
      const res = await fetch('/api/content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader()
        },
        body: JSON.stringify(item)
      });
      if (res.ok) {
        clearRecommendationsCache();
        await fetchAll();
        return true;
      }
    } catch (e) {
      console.error(e);
    }
    return false;
  };

  const updateContentItem = async (item: any) => {
    return addContentItem(item); // Uses same POST save endpoint
  };

  const deleteContentItem = async (id: string) => {
    try {
      setContent(prev => prev.filter(c => c.id !== id));
      
      const res = await fetch(`/api/content/${id}`, {
        method: 'DELETE',
        headers: getAuthHeader()
      });
      if (res.ok) {
        clearRecommendationsCache();
        return true;
      } else {
        await fetchAll();
      }
    } catch (e) {
      console.error(e);
      await fetchAll();
    }
    return false;
  };

  const triggerRequestRefresh = () => {
    setRequestTrigger(prev => prev + 1);
  };

  // ADS
  const addAdItem = async (ad: any) => {
    try {
      const res = await fetch('/api/ads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader()
        },
        body: JSON.stringify(ad)
      });
      if (res.ok) {
        await fetchAll();
        return true;
      }
    } catch (e) {
      console.error(e);
    }
    return false;
  };

  const updateAdItem = async (ad: any) => {
    return addAdItem(ad);
  };

  const deleteAdItem = async (id: string) => {
    try {
      const res = await fetch(`/api/ads/${id}`, {
        method: 'DELETE',
        headers: getAuthHeader()
      });
      if (res.ok) {
        await fetchAll();
        return true;
      }
    } catch (e) {
      console.error(e);
    }
    return false;
  };

  const trackAdImpression = async (id: string) => {
    try {
      await fetch(`/api/ads/${id}/impression`, { method: 'POST' });
      // Opt-in lazy update of local ads array to show updated stats in admin real-time
      setAds(prev => prev.map(a => {
        if (a.id === id) {
          const today = new Date().toISOString().split('T')[0];
          const daily = a.dailyStats || {};
          if (!daily[today]) daily[today] = { impressions: 0, clicks: 0 };
          daily[today].impressions += 1;
          return {
            ...a,
            impressions: a.impressions + 1,
            dailyStats: daily
          };
        }
        return a;
      }));
    } catch (e) {
      console.error(e);
    }
  };

  const trackAdClick = async (id: string) => {
    try {
      await fetch(`/api/ads/${id}/click`, { method: 'POST' });
      setAds(prev => prev.map(a => {
        if (a.id === id) {
          const today = new Date().toISOString().split('T')[0];
          const daily = a.dailyStats || {};
          if (!daily[today]) daily[today] = { impressions: 0, clicks: 0 };
          daily[today].clicks += 1;
          return {
            ...a,
            clicks: a.clicks + 1,
            dailyStats: daily
          };
        }
        return a;
      }));
    } catch (e) {
      console.error(e);
    }
  };

  // SLOTS
  const addSlotItem = async (slot: any) => {
    try {
      const res = await fetch('/api/ad-slots', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader()
        },
        body: JSON.stringify(slot)
      });
      if (res.ok) {
        await fetchAll();
        return true;
      }
    } catch (e) {
      console.error(e);
    }
    return false;
  };

  const updateSlotItem = async (slot: any) => {
    return addSlotItem(slot);
  };

  const deleteSlotItem = async (id: string) => {
    try {
      const res = await fetch(`/api/ad-slots/${id}`, {
        method: 'DELETE',
        headers: getAuthHeader()
      });
      if (res.ok) {
        await fetchAll();
        return true;
      }
    } catch (e) {
      console.error(e);
    }
    return false;
  };

  // ANALYTICS
  const trackViewEvent = async (item: ContentItem) => {
    // View tracking disabled as per architecture requirements
    return;
  };

  const trackDownloadEvent = async (item: ContentItem) => {
    try {
      const downloadEvent = {
        id: String(Date.now()) + '_' + Math.random().toString(36).substring(2, 7),
        contentId: item.id,
        category: item.category,
        title: item.title,
        timestamp: Date.now()
      };
      
      // 1. Post to backend API
      await fetch('/api/analytics/downloads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify(downloadEvent)
      }).catch(err => console.error('Failed to post analytics download:', err));

      setDownloads(prev => {
        const next = [...prev, downloadEvent];
        try { localStorage.setItem('cached_analytics_downloads', JSON.stringify(next)); } catch (e) {}
        return next;
      });


    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null;
    let isCancelled = false;
    
    if (user) {
      const accountKey = user.accountKey || (user.email ? `email_${user.email.trim().toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_')}` : user.uid);
      
      // Load initial state from localStorage as immediate fallback & merge legacy data
      const loadAndMergeList = (type: 'watchlist' | 'watched' | 'liked'): string[] => {
        let list: string[] = [];
        try {
          const primary = localStorage.getItem(`local_${type}_${accountKey}`);
          if (primary) {
            list = JSON.parse(primary);
          }
          if (user.uid && user.uid !== accountKey) {
            const legacy = localStorage.getItem(`local_${type}_${user.uid}`);
            if (legacy) {
              const legacyList: string[] = JSON.parse(legacy);
              list = Array.from(new Set([...list, ...legacyList]));
              localStorage.setItem(`local_${type}_${accountKey}`, JSON.stringify(list));
            }
          }
        } catch (e) {}
        return list;
      };

      const initialWL = loadAndMergeList('watchlist');
      const initialWD = loadAndMergeList('watched');
      const initialLK = loadAndMergeList('liked');

      setWatchlistIds(initialWL);
      setWatchedIds(initialWD);
      setLikedIds(initialLK);

      // 1. Sync from backend Server Database (/api/user-lists) on login
      fetch(`/api/user-lists?userId=${encodeURIComponent(accountKey)}`)
        .then(res => res.ok ? res.json() : [])
        .then(data => {
          if (isCancelled) return;
          if (Array.isArray(data)) {
            const dbWL: string[] = [];
            const dbWD: string[] = [];
            const dbLK: string[] = [];
            data.forEach((item: any) => {
              if (item.listType === 'watchlist') dbWL.push(item.contentId);
              else if (item.listType === 'watched') dbWD.push(item.contentId);
              else if (item.listType === 'liked') dbLK.push(item.contentId);
            });
            
            setWatchlistIds(dbWL);
            try { localStorage.setItem(`local_watchlist_${accountKey}`, JSON.stringify(dbWL)); } catch (e) {}
            setWatchedIds(dbWD);
            try { localStorage.setItem(`local_watched_${accountKey}`, JSON.stringify(dbWD)); } catch (e) {}
            setLikedIds(dbLK);
            try { localStorage.setItem(`local_liked_${accountKey}`, JSON.stringify(dbLK)); } catch (e) {}
          }
        })
        .catch(() => {});

      } else {
      setWatchlistIds([]);
      setWatchedIds([]);
      setLikedIds([]);
    }

    return () => {
      isCancelled = true;
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, [user, requestTrigger]);

  const toggleWatchlist = async (contentId: string): Promise<boolean> => {
    if (!user) return false;
    const accountKey = user.accountKey;
    const isCurrentlyIn = watchlistIds.includes(contentId);
    const newList = isCurrentlyIn ? watchlistIds.filter(id => id !== contentId) : [...watchlistIds, contentId];
    
    // Update local state instantly
    setWatchlistIds(newList);
    try {
      localStorage.setItem(`local_watchlist_${accountKey}`, JSON.stringify(newList));
    } catch(e) {}
    
    // Sync purely to backend API (which does SQLite + Firestore queue)
    try {
      const res = await fetch('/api/user-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: accountKey, contentId, listType: 'watchlist', action: isCurrentlyIn ? 'remove' : 'add' })
      });
      return res.ok;
    } catch(e) {
      console.error(e);
      // Revert on failure
      setWatchlistIds(watchlistIds);
      return false;
    }
  };

  const toggleWatched = async (contentId: string): Promise<boolean> => {
    if (!user) return false;
    const accountKey = user.accountKey;
    const isCurrentlyIn = watchedIds.includes(contentId);
    const newList = isCurrentlyIn ? watchedIds.filter(id => id !== contentId) : [...watchedIds, contentId];
    
    // Update local state instantly
    setWatchedIds(newList);
    try {
      localStorage.setItem(`local_watched_${accountKey}`, JSON.stringify(newList));
    } catch(e) {}
    
    // Sync purely to backend API (which does SQLite + Firestore queue)
    try {
      const res = await fetch('/api/user-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: accountKey, contentId, listType: 'watched', action: isCurrentlyIn ? 'remove' : 'add' })
      });
      return res.ok;
    } catch(e) {
      console.error(e);
      // Revert on failure
      setWatchedIds(watchedIds);
      return false;
    }
  };

  const toggleLiked = async (contentId: string): Promise<boolean> => {
    if (!user) return false;
    const accountKey = user.accountKey;
    const isCurrentlyIn = likedIds.includes(contentId);
    const newList = isCurrentlyIn ? likedIds.filter(id => id !== contentId) : [...likedIds, contentId];
    
    // Update local state instantly
    setLikedIds(newList);
    try {
      localStorage.setItem(`local_liked_${accountKey}`, JSON.stringify(newList));
    } catch(e) {}
    
    // Sync purely to backend API (which does SQLite + Firestore queue)
    try {
      const res = await fetch('/api/user-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: accountKey, contentId, listType: 'liked', action: isCurrentlyIn ? 'remove' : 'add' })
      });
      return res.ok;
    } catch(e) {
      console.error(e);
      // Revert on failure
      setLikedIds(likedIds);
      return false;
    }
  };

  return (
    <DataContext.Provider value={{
      content,
      ads,
      customSlots,
      views,
      downloads,
      isLoading,
      refreshAll,
      loadFullContent,
      addContentItem,
      updateContentItem,
      deleteContentItem,
      triggerRequestRefresh,
      addAdItem,
      updateAdItem,
      deleteAdItem,
      trackAdImpression,
      trackAdClick,
      addSlotItem,
      updateSlotItem,
      deleteSlotItem,
      trackViewEvent,
      trackDownloadEvent,
      watchlistIds,
      toggleWatchlist,
      watchedIds,
      toggleWatched,
      likedIds,
      toggleLiked
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
