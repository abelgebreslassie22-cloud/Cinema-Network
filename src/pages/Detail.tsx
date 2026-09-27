import OfflineScreen from '../components/OfflineScreen';
import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Play, ArrowLeft, WifiOff, Star, Clock, Calendar, Film, X, Download, Target, BookmarkPlus, CheckCircle, Heart, BookmarkCheck, FileText, ChevronDown, ChevronRight, Youtube } from 'lucide-react';
import { QualityConfig, QualityVersion, ContentItem } from '../types';
import { getSimilarContent } from '../utils/recommendations';
import { getStartOfTodayUTC3 } from '../utils/dateUtils';
import { isContentSeries, getDisplayCategory, formatDuration } from '../utils/format';
import SimilarContentCarousel from '../components/SimilarContentCarousel';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';


const QUALITY_ORDER = ['360P', '480P', '720P', '1080P', '2K', '4K'];

const sortQualities = (keys: string[]): string[] => {
  return [...keys].sort((a, b) => {
    const aNorm = a.toUpperCase();
    const bNorm = b.toUpperCase();
    const indexA = QUALITY_ORDER.indexOf(aNorm);
    const indexB = QUALITY_ORDER.indexOf(bNorm);
    
    if (indexA !== -1 && indexB !== -1) {
      return indexA - indexB;
    }
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return a.localeCompare(b);
  });
};

const ensureAbsoluteUrl = (url: string): string => {
  let trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
};

const getTelegramOrDownloadLink = (itemItem: any, specificLink?: string): string => {
  if (!itemItem && (!specificLink || !specificLink.trim())) return 'https://t.me/Series_Network';

  const isYoutube = (url?: string) => {
    if (!url || typeof url !== 'string') return false;
    const lower = url.toLowerCase();
    return lower.includes('youtube.com') || lower.includes('youtu.be') || (itemItem?.trailerUrl && url === itemItem.trailerUrl);
  };

  if (specificLink && typeof specificLink === 'string' && specificLink.trim() !== '' && !isYoutube(specificLink)) {
    return ensureAbsoluteUrl(specificLink);
  }

  if (!itemItem) return 'https://t.me/Series_Network';

  // Check item fields for telegram / download link
  const possibleLinks = [
    itemItem.telegramUrl,
    itemItem.telegramLink,
    itemItem.telegram,
    itemItem.downloadUrl,
    itemItem.downloadLink,
    itemItem.link,
    itemItem.tmeUrl,
    itemItem.links?.telegram,
    itemItem.links?.download,
    itemItem.links?.['1080P'],
    itemItem.links?.['720P'],
    itemItem.links?.['480P'],
    itemItem.links?.['4K'],
  ];

  for (const p of possibleLinks) {
    if (p && typeof p === 'string' && p.trim() !== '' && !isYoutube(p)) {
      return ensureAbsoluteUrl(p);
    }
  }

  // If item is series with seasonData, check season qualities/links
  if (itemItem.seasonData && Array.isArray(itemItem.seasonData)) {
    for (const season of itemItem.seasonData) {
      if (season?.qualities) {
        for (const qKey of Object.keys(season.qualities)) {
          const qObj = season.qualities[qKey];
          if (qObj?.versions && Array.isArray(qObj.versions)) {
            for (const v of qObj.versions) {
              if (v?.link && typeof v.link === 'string' && v.link.trim() !== '' && !isYoutube(v.link)) {
                return ensureAbsoluteUrl(v.link);
              }
            }
          }
        }
      }
      if (season?.links) {
        for (const lKey of Object.keys(season.links)) {
          const lVal = season.links[lKey];
          if (lVal && typeof lVal === 'string' && lVal.trim() !== '' && !isYoutube(lVal)) {
            return ensureAbsoluteUrl(lVal);
          }
        }
      }
    }
  }

  // Check movie qualities
  if (itemItem.qualities && typeof itemItem.qualities === 'object') {
    for (const qKey of Object.keys(itemItem.qualities)) {
      const qObj = itemItem.qualities[qKey];
      if (qObj?.versions && Array.isArray(qObj.versions)) {
        for (const v of qObj.versions) {
          if (v?.link && typeof v.link === 'string' && v.link.trim() !== '' && !isYoutube(v.link)) {
            return ensureAbsoluteUrl(v.link);
          }
        }
      }
    }
  }

  const titleSlug = (itemItem.title || itemItem.name || 'movie').replace(/[^a-zA-Z0-9_]/g, '_');
  return `https://t.me/Series_Network?start=${encodeURIComponent(titleSlug)}`;
};

const getEffectiveQualities = (itemItem: any, seasonId?: string): Record<string, QualityConfig> => {
  if (!itemItem) return {};

  let rawQualities: Record<string, any> = {};
  let legacyLinks: Record<string, string> | undefined = undefined;

  if (seasonId && itemItem.seasonData && Array.isArray(itemItem.seasonData)) {
    const season = itemItem.seasonData.find((s: any) => s.id === seasonId);
    if (season) {
      rawQualities = season.qualities || {};
      legacyLinks = season.links;
    }
  }

  if (Object.keys(rawQualities).length === 0 && !seasonId) {
    rawQualities = itemItem.qualities || {};
    legacyLinks = legacyLinks || itemItem.links;
  }

  const result: Record<string, QualityConfig> = {};

  // 1. Process rawQualities
  Object.keys(rawQualities).forEach(key => {
    const qObj = rawQualities[key];
    if (!qObj) return;
    
    // Accept if enabled is not explicitly false and has versions array with items
    if (qObj.enabled !== false && Array.isArray(qObj.versions) && qObj.versions.length > 0) {
      const validVersions = qObj.versions.map((v: any, idx: number) => ({
        id: v.id || `v_${key}_${idx}`,
        name: v.name || `${itemItem.title || itemItem.name || 'Download'} ${key} Version ${idx + 1}`,
        link: getTelegramOrDownloadLink(itemItem, v.link || v.url || ''),
        size: v.size || '',
        sub: Boolean(v.sub)
      }));

      if (validVersions.length > 0) {
        result[key] = {
          enabled: true,
          versions: validVersions
        };
      }
    }
  });

  // 2. Process legacyLinks if no quality versions were found for those keys
  if (legacyLinks && typeof legacyLinks === 'object') {
    Object.keys(legacyLinks).forEach(key => {
      const linkVal = legacyLinks![key];
      if (linkVal && typeof linkVal === 'string' && linkVal.trim()) {
        const normKey = key.toUpperCase();
        if (!result[normKey]) {
          result[normKey] = {
            enabled: true,
            versions: [
              {
                id: `legacy_${normKey}`,
                name: `${itemItem.title || itemItem.name || 'Movie'} ${normKey} Download`,
                link: getTelegramOrDownloadLink(itemItem, linkVal),
                size: '',
                sub: false
              }
            ]
          };
        }
      }
    });
  }

  // 3. Fallback if result is still empty (e.g. no download links attached to content record)
  if (Object.keys(result).length === 0 && !seasonId) {
    const titleStr = itemItem.title || itemItem.name || 'Movie';
    const yearStr = itemItem.year ? `(${itemItem.year})` : '';
    const cleanTitle = `${titleStr} ${yearStr}`.trim();
    const fallbackLink = getTelegramOrDownloadLink(itemItem);

    result['1080P'] = {
      enabled: true,
      versions: [
        {
          id: 'fb_1080_1',
          name: `${cleanTitle} 1080p Download`,
          link: fallbackLink,
          size: '',
          sub: false
        }
      ]
    };

    result['720P'] = {
      enabled: true,
      versions: [
        {
          id: 'fb_720_1',
          name: `${cleanTitle} 720p Download`,
          link: fallbackLink,
          size: '',
          sub: false
        }
      ]
    };

    result['480P'] = {
      enabled: true,
      versions: [
        {
          id: 'fb_480_1',
          name: `${cleanTitle} 480p Download`,
          link: fallbackLink,
          size: '',
          sub: false
        }
      ]
    };
  }

  return result;
};

export default function Detail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { trackViewEvent, trackDownloadEvent, watchlistIds, toggleWatchlist, watchedIds, toggleWatched, likedIds, toggleLiked } = useData();
  const { user, loading: authLoading } = useAuth();
  const [item, setItem] = useState<any>(null);
  const [omdbData, setOmdbData] = useState<any>(null);
  const [similarContent, setSimilarContent] = useState<any[]>([]);
  const [franchiseItems, setFranchiseItems] = useState<any[]>([]);
  
  

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  
  // List states derived from DataContext
  const inWatchlist = Boolean(item && watchlistIds.includes(item.id));
  const inWatched = Boolean(item && watchedIds.includes(item.id));
  const inLiked = Boolean(item && likedIds.includes(item.id));
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [selectedDownloadQuality, setSelectedDownloadQuality] = useState<string>('');
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  const [actorsViewMode, setActorsViewMode] = useState<'grid' | 'list'>('grid');

  const [userRatingAvg, setUserRatingAvg] = useState<number | null>(null);
  const [userRatingCount, setUserRatingCount] = useState<number>(0);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);

  const [downloads, setDownloads] = useState({
    total: 0,
    thisWeek: 0,
    today: 0,
    isLoading: true
  });
  const [justDownloaded, setJustDownloaded] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  // Filter seasons to only include those where the admin enabled at least one quality toggle
  const availableSeasons = useMemo(() => {
    if (!item || !isContentSeries(item) || !Array.isArray(item.seasonData)) {
      return [];
    }
    return item.seasonData.filter((s: any) => {
      if (!s || !s.qualities || typeof s.qualities !== 'object') return false;
      return Object.values(s.qualities).some((q: any) => q && q.enabled === true);
    });
  }, [item]);

  const effectiveTrailerUrl = useMemo(() => {
    if (!item) return null;
    if (item.trailerUrl && typeof item.trailerUrl === 'string' && item.trailerUrl.trim()) {
      return item.trailerUrl.trim();
    }
    if (item.trailer && typeof item.trailer === 'string' && item.trailer.trim()) {
      return item.trailer.trim();
    }
    if (item.youtubeUrl && typeof item.youtubeUrl === 'string' && item.youtubeUrl.trim()) {
      return item.youtubeUrl.trim();
    }
    if (item.title) {
      return `https://www.youtube.com/results?search_query=${encodeURIComponent(item.title + ' official trailer')}`;
    }
    return null;
  }, [item]);

  const effectiveActors = useMemo(() => {
    if (!item) return [];
    if (Array.isArray(item.actorsData) && item.actorsData.length > 0) {
      return item.actorsData;
    }
    const result: { name: string; photoUrl?: string }[] = [];
    const seen = new Set<string>();

    const addActor = (name: string, photoUrl?: string) => {
      if (!name || typeof name !== 'string') return;
      const clean = name.trim();
      if (clean && !seen.has(clean.toLowerCase())) {
        seen.add(clean.toLowerCase());
        result.push({ name: clean, photoUrl });
      }
    };

    if (Array.isArray(item.cast)) {
      item.cast.forEach((c: any) => {
        if (typeof c === 'string') addActor(c);
        else if (c && typeof c === 'object' && c.name) addActor(c.name, c.photoUrl);
      });
    } else if (typeof item.cast === 'string' && item.cast.trim()) {
      item.cast.split(',').forEach((s: string) => addActor(s));
    }

    if (Array.isArray(item.maleActors)) {
      item.maleActors.forEach((a: any) => addActor(typeof a === 'string' ? a : a?.name));
    }
    if (Array.isArray(item.femaleActors)) {
      item.femaleActors.forEach((a: any) => addActor(typeof a === 'string' ? a : a?.name));
    }

    return result;
  }, [item]);

  const effectiveStudios = useMemo(() => {
    if (!item) return [];
    if (Array.isArray(item.studiosData) && item.studiosData.length > 0) {
      return item.studiosData;
    }
    const result: { name: string; logoUrl?: string }[] = [];
    const seen = new Set<string>();

    const addStudio = (name: string, logoUrl?: string) => {
      if (!name || typeof name !== 'string') return;
      const clean = name.trim();
      if (clean && !seen.has(clean.toLowerCase())) {
        seen.add(clean.toLowerCase());
        result.push({ name: clean, logoUrl });
      }
    };

    if (item.network) addStudio(item.network);
    if (Array.isArray(item.networks)) {
      item.networks.forEach((n: any) => {
        if (typeof n === 'string') addStudio(n);
        else if (n && typeof n === 'object' && n.name) addStudio(n.name, n.logoUrl);
      });
    }
    if (item.studio) addStudio(item.studio);
    if (Array.isArray(item.productionCompanies)) {
      item.productionCompanies.forEach((p: any) => {
        if (typeof p === 'string') addStudio(p);
        else if (p && typeof p === 'object' && p.name) addStudio(p.name, p.logoUrl);
      });
    }

    return result;
  }, [item]);

  const effectiveFranchise = item?.franchise || item?.franchiseName || null;

  const triggerDownloadAnimation = () => {
    setJustDownloaded(true);
    if (item) {
      trackDownloadEvent(item);
    }
    setDownloads(prev => ({
      ...prev,
      total: prev.total + 1,
      today: prev.today + 1,
      thisWeek: prev.thisWeek + 1
    }));
    setTimeout(() => {
      setJustDownloaded(false);
    }, 2000);
  };

  const handleRating = async (rating: number) => {
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    if (!item) return;

    const effectiveUserId = user.accountKey || user.uid;
    if (!effectiveUserId) return;

    const isNewRating = userRating === null;
    const previousRating = userRating;
    
    // Immediate optimistic state update
    setUserRating(rating);
    
    const nextCount = isNewRating ? userRatingCount + 1 : (userRatingCount > 0 ? userRatingCount : 1);
    setUserRatingCount(nextCount);

    if (isNewRating) {
      setUserRatingAvg(prev => prev !== null ? Math.round((((prev * userRatingCount) + rating) / nextCount) * 10) / 10 : rating);
    } else {
      setUserRatingAvg(prev => {
        if (prev === null) return rating;
        const baseSum = (prev * (userRatingCount > 0 ? userRatingCount : 1)) - (previousRating || 0) + rating;
        return Math.round((baseSum / nextCount) * 10) / 10;
      });
    }

    try {
      localStorage.setItem(`user_rating_${effectiveUserId}_${item.id}`, String(rating));
    } catch(e) {}

    try {
      const postRes = await fetch('/api/user-ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: effectiveUserId, contentId: item.id, rating })
      });

      if (postRes.ok) {
        const stats = await postRes.json();
        if (stats.success) {
          if (typeof stats.userRating === 'number') {
            setUserRating(stats.userRating);
          }
          if (typeof stats.totalRatings === 'number') {
            setUserRatingCount(stats.totalRatings);
          }
          if (typeof stats.averageRating === 'number' || stats.averageRating === null) {
            setUserRatingAvg(stats.averageRating);
          }
        }
      }
    } catch (error) {
      console.error('Error saving rating:', error);
    }
  };
  useEffect(() => {
    // Reset old content and recommendation state immediately when id changes
    setItem(null);
    setOmdbData(null);
    setSimilarContent([]);
    setFranchiseItems([]);
    setIsLoading(true);
    setError(false);
    setIsDescriptionExpanded(false);

    const fetchPrimaryData = async () => {
      try {
        const itemRes = await fetch(`/api/content/${id}`);
        if (!itemRes.ok) {
          setError(true);
          setIsLoading(false);
          return;
        }
        
        const itemData = await itemRes.json();
        setItem(itemData);
        setIsLoading(false); // Make page usable immediately

        // 0. Fetch OMDB real ratings (IMDb, Rotten Tomatoes, Votes)
        const titleParam = encodeURIComponent(itemData.title || itemData.name || '');
        const yearParam = itemData.year ? `&year=${encodeURIComponent(itemData.year)}` : '';
        const idParam = itemData.id ? `&id=${encodeURIComponent(itemData.id)}` : '';
        const imdbIdParam = (itemData as any)?.imdbId ? `&imdbId=${encodeURIComponent((itemData as any).imdbId)}` : '';
        fetch(`/api/ratings/omdb?title=${titleParam}${yearParam}${idParam}${imdbIdParam}`)
          .then(r => r.ok ? r.json() : null)
          .then(oData => {
            if (oData && oData.Response === 'True') {
              setOmdbData(oData);
            }
          })
          .catch(() => {});

        // 1. Concurrent Independent Requests (Secondary)
        fetch(`/api/content/${id}/similar`)
          .then(r => r.ok ? r.json() : [])
          .then(data => setSimilarContent(data))
          .catch(console.error);

        const fName = itemData.franchise || itemData.franchiseName || itemData.title;
        if (fName) {
          fetch(`/api/content/franchise?name=${encodeURIComponent(fName)}`)
            .then(r => r.ok ? r.json() : [])
            .then(fData => {
              if (Array.isArray(fData) && fData.length > 0) {
                setFranchiseItems(fData);
              }
            })
            .catch(console.error);
        }

        // 2. Background Operations (Non-blocking)
        // Background IMDb Verification
        fetch(`/api/content/${id}/verify-rating`, { method: 'POST' })
          .then(res => res.json())
          .then(data => {
            if (data.updated && data.newRating !== undefined) {
              setItem((prev: any) => prev ? { ...prev, rating: data.newRating } : prev);
            }
          })
          .catch(() => {}); // Ignore verification errors

        // On-the-fly TMDB enrichment if missing actors, studios, or trailer
        // Background TMDB enrichment if missing actors, studios, trailer, or director
        const needsActors = !itemData.actorsData || (Array.isArray(itemData.actorsData) && itemData.actorsData.length === 0);
        const needsStudios = !itemData.studiosData || (Array.isArray(itemData.studiosData) && itemData.studiosData.length === 0);
        const needsTrailer = !itemData.trailerUrl;
        const needsDirector = !itemData.director || itemData.director.trim() === '' || itemData.director.toLowerCase() === 'unknown';

        if ((needsActors || needsStudios || needsTrailer || needsDirector) && itemData.title) {
           fetch(`/api/content/${itemData.id}/enrich`, { method: 'POST' })
             .then(r => r.json())
             .then(updatedItem => {
                if (updatedItem && updatedItem.updated && updatedItem.data) {
                   setItem((prev: any) => prev ? { ...prev, ...updatedItem.data } : prev);
                }
             })
             .catch(console.error);
        }

      } catch (err) {
        console.error(err);
        setError(true);
        setIsLoading(false);
      }
    };
    
    fetchPrimaryData();
  }, [id]);


  useEffect(() => {
    if (!item?.id) return;

    const fetchRatings = async () => {
      // 1. Fetch community aggregate rating from authoritative database
      try {
        const aggRes = await fetch(`/api/user-ratings/aggregate?contentId=${encodeURIComponent(item.id)}`);
        if (aggRes.ok) {
          const aggData = await aggRes.json();
          if (typeof aggData.totalRatings === 'number' && aggData.totalRatings > 0) {
            setUserRatingCount(aggData.totalRatings);
            if (typeof aggData.averageRating === 'number') {
              setUserRatingAvg(aggData.averageRating);
            }
          } else {
            setUserRatingCount(0);
            setUserRatingAvg(item.rating ? Number(item.rating) : null);
          }
        }
      } catch (aggErr) {
        console.warn("Failed to fetch aggregate rating:", aggErr);
        setUserRatingCount(0);
        setUserRatingAvg(item.rating ? Number(item.rating) : null);
      }

      // 2. If auth is still resolving, don't prematurely clear or fetch
      if (authLoading) return;

      // 3. If unauthenticated, clear personal rating
      if (!user) {
        setUserRating(null);
        return;
      }

      // 4. Fetch personal rating for the currently logged in user
      const effectiveUserId = user.accountKey || user.uid;
      if (!effectiveUserId) {
        setUserRating(null);
        return;
      }

      try {
        const apiRes = await fetch(`/api/user-ratings?userId=${encodeURIComponent(effectiveUserId)}&contentId=${encodeURIComponent(item.id)}`);
        if (apiRes.ok) {
          const apiData = await apiRes.json();
          if (typeof apiData?.rating === 'number') {
            setUserRating(apiData.rating);
          } else {
            setUserRating(null);
          }
        } else {
          setUserRating(null);
        }
      } catch (e) {
        console.error("Failed to fetch personal user rating:", e);
        setUserRating(null);
      }
    };
    
    fetchRatings();
  }, [user, authLoading, item?.id, item?.rating]);

  useEffect(() => {
    if (!item?.id) return;
    
    // Fetch real downloads strictly from website interactions (Supabase)
    const fetchDownloads = async () => {
      try {
        const res = await fetch(`/api/analytics/downloads/${item.id}`);
        if (res.ok) {
          const data = await res.json();
          setDownloads({
            total: Number(data.total) || 0,
            thisWeek: Number(data.thisWeek) || 0,
            today: Number(data.today) || 0,
            isLoading: false
          });
          return;
        }
      } catch (err) {
        console.warn("Server downloads count fetch error:", err);
      }

      setDownloads({
        total: 0,
        thisWeek: 0,
        today: 0,
        isLoading: false
      });
    };

    fetchDownloads();
  }, [item?.id]);

  // Ratings calculation conforming to user requirements:
  // 1. IMDb Score: If found from OMDB, use it. If not found, use TMDB rating (item.rating). If neither available, say 'NA'.
  const imdbScore = useMemo(() => {
    if (omdbData?.imdbRating && omdbData.imdbRating !== 'N/A' && omdbData.imdbRating !== 'NA') {
      const parsed = parseFloat(omdbData.imdbRating);
      if (!isNaN(parsed) && parsed > 0) {
        return omdbData.imdbRating;
      }
    }
    const explicitImdb = (item as any)?.imdbRating;
    if (explicitImdb && explicitImdb !== 'N/A' && explicitImdb !== 'NA') {
      const parsed = parseFloat(explicitImdb);
      if (!isNaN(parsed) && parsed > 0) {
        return String(explicitImdb);
      }
    }
    // "but for IMDB put just TMDB rating but only if not found."
    if (item?.rating !== undefined && item?.rating !== null) {
      const parsed = Number(item.rating);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed.toFixed(1);
      }
    }
    return 'NA';
  }, [omdbData?.imdbRating, (item as any)?.imdbRating, item?.rating]);

  // 2. Tomatometer: If found from database or OMDB, display percentage. If not found, say 'NA' (no fake fallback).
  const tomatometerScore = useMemo(() => {
    const explicitRt = (item as any)?.rottenTomatoes || (item as any)?.tomatometer || (item as any)?.rotten_tomatoes;
    if (explicitRt !== undefined && explicitRt !== null && explicitRt !== '' && explicitRt !== 'N/A' && explicitRt !== 'NA') {
      const str = String(explicitRt).trim();
      return str.endsWith('%') ? str : `${str}%`;
    }
    if (omdbData?.Ratings && Array.isArray(omdbData.Ratings)) {
      const rtEntry = omdbData.Ratings.find((r: any) => r.Source === 'Rotten Tomatoes');
      if (rtEntry?.Value && rtEntry.Value !== 'N/A' && rtEntry.Value !== 'NA') {
        const val = String(rtEntry.Value).trim();
        return val.endsWith('%') ? val : `${val}%`;
      }
    }
    return 'NA';
  }, [(item as any)?.rottenTomatoes, (item as any)?.tomatometer, (item as any)?.rotten_tomatoes, omdbData?.Ratings]);

  // Title hash for subtle deterministic variation per item
  const titleHash = useMemo(() => {
    if (!item?.title && !item?.name) return 0;
    const str = item?.title || item?.name || '';
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) % 1000;
    }
    return hash;
  }, [item?.title, item?.name]);

  // 3. Letterboxd: If found from database, display it. Otherwise, use calculation derived from IMDb/TMDB rating.
  const letterboxdScore = useMemo(() => {
    const explicitLb = (item as any)?.letterboxd || (item as any)?.letterboxdRating;
    if (explicitLb !== undefined && explicitLb !== null && explicitLb !== '' && explicitLb !== 'N/A' && explicitLb !== 'NA') {
      const parsed = parseFloat(explicitLb);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed.toFixed(1);
      }
      return String(explicitLb);
    }
    const imdbNum = parseFloat(imdbScore);
    if (!isNaN(imdbNum) && imdbNum > 0) {
      const variance = ((titleHash % 5) - 2) * 0.05; // -0.1 to +0.1
      const val = (imdbNum / 2) + variance;
      return Math.min(5.0, Math.max(1.0, val)).toFixed(1);
    }
    return 'NA';
  }, [(item as any)?.letterboxd, (item as any)?.letterboxdRating, imdbScore, titleHash]);

  // 4. Votes: Show formatted vote count if available, otherwise do not show fallback
  const votesDisplay = useMemo(() => {
    const rawVotes = omdbData?.imdbVotes || item?.votes;
    if (!rawVotes || rawVotes === 'N/A' || rawVotes === 'NA') {
      return null;
    }
    const strVotes = String(rawVotes).trim();
    if (strVotes === '' || strVotes === '0') {
      return null;
    }
    const num = parseInt(strVotes.replace(/,/g, ''), 10);
    if (!isNaN(num) && num > 0) {
      return num.toLocaleString();
    }
    return strVotes;
  }, [omdbData?.imdbVotes, item?.votes]);

  const isMovie = item ? !isContentSeries(item) : true;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  useEffect(() => {
    if (isDownloadModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isDownloadModalOpen]);

  const toggleList = async (listType: 'watchlist' | 'watched' | 'liked') => {
        if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    if (!item) return;

    try {
      if (listType === 'watchlist') {
        await toggleWatchlist(item.id);
      } else if (listType === 'watched') {
        await toggleWatched(item.id);
      } else if (listType === 'liked') {
        await toggleLiked(item.id);
      }
    } catch (error) {
      console.error(`Error toggling ${listType}:`, error);
    }
  };

  if (isLoading || (!item && !error)) {
    return (
      <div className="pt-[174px] md:pt-[149px] min-h-screen">
        {/* Backdrop Skeleton */}
        <div className="relative w-full h-[50vh] min-h-[350px] md:h-[58vh] md:min-h-[440px] bg-white/5 animate-pulse" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-[-15vh] relative z-10">
          <div className="flex flex-col md:flex-row gap-8 lg:gap-12">
            
            {/* Poster Skeleton */}
            <div className="w-full md:w-80 shrink-0 space-y-6">
              <div className="w-48 sm:w-64 md:w-full mx-auto aspect-[2/3] rounded-2xl bg-white/10 animate-pulse border border-white/5" />
              <div className="h-12 bg-white/10 rounded-xl animate-pulse" />
              <div className="space-y-3 pt-2">
                <div className="h-5 bg-white/10 rounded w-1/2 animate-pulse" />
                <div className="h-4 bg-white/10 rounded w-full animate-pulse" />
                <div className="h-4 bg-white/10 rounded w-3/4 animate-pulse" />
              </div>
            </div>

            {/* Content Details Skeleton */}
            <div className="flex-1 space-y-6 mt-4 md:mt-0">
              <div className="h-10 bg-white/10 rounded-xl w-3/4 animate-pulse" />
              
              <div className="flex flex-wrap gap-3">
                <div className="h-8 w-24 bg-white/10 rounded-lg animate-pulse" />
                <div className="h-8 w-20 bg-white/10 rounded-lg animate-pulse" />
                <div className="h-8 w-28 bg-white/10 rounded-lg animate-pulse" />
                <div className="h-8 w-16 bg-white/10 rounded-lg animate-pulse" />
              </div>

              <div className="space-y-3 pt-4">
                <div className="h-4 bg-white/10 rounded w-full animate-pulse" />
                <div className="h-4 bg-white/10 rounded w-full animate-pulse" />
                <div className="h-4 bg-white/10 rounded w-5/6 animate-pulse" />
                <div className="h-4 bg-white/10 rounded w-2/3 animate-pulse" />
              </div>

              <div className="pt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="h-20 bg-white/10 rounded-2xl animate-pulse" />
                <div className="h-20 bg-white/10 rounded-2xl animate-pulse" />
                <div className="h-20 bg-white/10 rounded-2xl animate-pulse" />
                <div className="h-20 bg-white/10 rounded-2xl animate-pulse" />
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="pt-40 min-h-[70vh] flex items-center justify-center">
        <div className="text-center glass p-8 rounded-2xl border border-white/10 max-w-md mx-auto">
          {error ? (
             <div className="flex flex-col items-center gap-4 mb-4">
                <WifiOff className="w-12 h-12 text-red-500 opacity-80" />
                <h2 className="text-2xl font-poppins font-bold text-white">Connection Error</h2>
             </div>
          ) : (
             <h2 className="text-2xl font-poppins font-bold text-white mb-4">Content not found.</h2>
          )}
          
          <p className="text-gray-400 mb-6">
            {error ? "Please check your internet connection and try again." : "The item you are looking for does not exist or has been removed."}
          </p>
          <button onClick={() => error ? window.location.reload() : navigate("/")} className="bg-brand-primary hover:bg-brand-primary/90 text-white px-6 py-3 rounded-xl transition-colors font-medium">
            {error ? "Retry" : "Return Home"}
          </button>
        </div>
      </div>
    );
  }

  const handleDownloadOpen = () => {
    // If series with available seasons that have enabled quality toggles
    if (isContentSeries(item) && availableSeasons.length > 0) {
      const firstSeason = availableSeasons[0];
      setSelectedSeasonId(firstSeason.id);
      const effective = getEffectiveQualities(item, firstSeason.id);
      const available = sortQualities(Object.keys(effective));
      setSelectedDownloadQuality(available[0] || '');
    } else {
      // Normal movie qualities
      const effective = getEffectiveQualities(item);
      const available = sortQualities(Object.keys(effective));
      setSelectedDownloadQuality(available[0] || '');
    }
    setIsDownloadModalOpen(true);
  };

  const handleSeasonChange = (seasonId: string) => {
    setSelectedSeasonId(seasonId);
    const effective = getEffectiveQualities(item, seasonId);
    const available = sortQualities(Object.keys(effective));
    if (available.length > 0) {
      if (!available.includes(selectedDownloadQuality)) {
        setSelectedDownloadQuality(available[0]);
      }
    } else {
      setSelectedDownloadQuality('');
    }
  };

  const handleDownloadLink = (link: string, qName: string, vName: string) => {
    if (item) {
      triggerDownloadAnimation();
    }
    const downloadUrl = getTelegramOrDownloadLink(item, link);
    window.open(downloadUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="relative min-h-screen pb-8 pt-[174px] md:pt-[149px]">
      {/* Backdrop Header */}
      <div className="relative w-full h-[50vh] min-h-[350px] md:h-[58vh] md:min-h-[440px] overflow-hidden bg-brand-bg">
        {item.backdropUrl ? (
          <img 
            src={item.backdropUrl} 
            alt={item.title} 
            className="w-full h-full object-cover object-top"
            fetchPriority="high"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full bg-white/5" />
        )}

        {/* Cinematic gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-brand-bg via-brand-bg/70 md:via-brand-bg/40 to-brand-bg/20 z-[1] pointer-events-none" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-[-15vh] relative z-10">
        <div className="flex flex-col md:flex-row gap-8 lg:gap-12">
          
          {/* Left Column (Poster + Metadata underneath on desktop) */}
          <div className="w-full md:w-80 shrink-0 space-y-8">
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="w-48 sm:w-64 md:w-full mx-auto rounded-2xl overflow-hidden glass-card shadow-[0_0_30px_rgba(0,0,0,0.5)] border-white/10 aspect-[2/3] relative flex items-center justify-center bg-white/5"
            >
              {item.posterUrl ? (
                <img 
                  src={item.posterUrl} 
                  alt={item.title} 
                  className="w-full h-full object-cover absolute inset-0" 
                  fetchPriority="high"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-6 text-center text-white/50">
                  <Film className="w-16 h-16 mb-4 opacity-50" />
                  <span className="text-sm font-semibold">No Poster Available</span>
                </div>
              )}
            </motion.div>

            {/* Desktop-only Metadata (Balanced below the image) */}
            <div className="hidden md:block space-y-8 pt-2">
              {/* Director Section */}
              <div>
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <div className="w-1 h-5 bg-white rounded-full"></div>
                  Director
                </h3>
                <div 
                  className="flex items-center gap-4 bg-white/5 rounded-full p-2 pr-6 border border-white/10 hover:bg-white/10 transition-colors w-fit max-w-full cursor-pointer"
                  onClick={() => item.director && navigate(`/person/${encodeURIComponent(item.director)}`)}
                >
                  {item.directorPhotoUrl ? (
                    <img 
                      src={item.directorPhotoUrl} 
                      alt={item.director} 
                      className="w-12 h-12 rounded-full object-cover shrink-0" 
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-white/10 flex-shrink-0 flex items-center justify-center text-xl font-bold text-white">
                      {item.director ? item.director.charAt(0).toUpperCase() : '?'}
                    </div>
                  )}
                  <span className="font-semibold text-white truncate text-sm">{item.director || 'Unknown'}</span>
                </div>
              </div>

              {/* Studios Section */}
              <div>
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <div className="w-1 h-5 bg-white rounded-full"></div>
                  Studios
                </h3>
                {effectiveStudios.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    {effectiveStudios.map((studio, idx) => (
                      <div 
                        key={idx} 
                        className="flex items-center gap-4 bg-white/5 rounded-full p-2 pr-6 border border-white/10 hover:bg-white/10 transition-colors w-fit max-w-full cursor-pointer"
                        onClick={() => navigate(`/studio/${encodeURIComponent(studio.name)}`)}
                      >
                        {studio.logoUrl ? (
                          <img 
                            src={studio.logoUrl} 
                            alt={studio.name} 
                            className="w-12 h-12 rounded-full object-cover bg-white shrink-0" 
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-white flex-shrink-0 flex items-center justify-center text-xl font-bold text-black">
                            {studio.name ? studio.name.charAt(0).toUpperCase() : '?'}
                          </div>
                        )}
                        <span className="font-semibold text-white truncate text-sm">{studio.name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-4 bg-white/5 rounded-full p-2 pr-6 border border-white/10 hover:bg-white/10 transition-colors w-fit max-w-full">
                    <div className="w-12 h-12 rounded-full bg-white/10 flex-shrink-0 flex items-center justify-center text-xl font-bold text-white">
                      ?
                    </div>
                    <span className="font-semibold text-white truncate text-sm">Unknown</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Details Section */}
          <motion.div 
             initial={{ opacity: 0, x: 20 }}
             animate={{ opacity: 1, x: 0 }}
             transition={{ duration: 0.6, delay: 0.2 }}
             className="flex-grow pt-4 md:pt-16 min-w-0"
          >
            <h1 className="text-4xl sm:text-5xl font-poppins font-bold text-white mb-3 tracking-tight">
              {item.title}
            </h1>

            {/* Simplified Meta Info */}
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400 mb-6 font-medium">
              <span className="bg-white/5 border border-white/10 px-2.5 py-1 rounded-md text-white font-semibold">
                {item.year}
              </span>
              <span className="text-gray-600">•</span>
              <span>
                {isContentSeries(item) ? `${item.episodes || 0} Episodes` : formatDuration(item.duration)}
              </span>
              <span className="text-gray-600">•</span>
              <span className="text-brand-muted uppercase tracking-wider text-xs font-bold">
                {getDisplayCategory(item.category)}
              </span>
            </div>

            {/* Sleek Stats & Ratings Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 lg:gap-3 mb-8">
              {/* Card 1: IMDb */}
              <div className="bg-[#1C1C1E]/40 backdrop-blur-md border border-white/5 rounded-2xl p-3 flex flex-col justify-between group hover:border-brand-primary/20 transition-all duration-300 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 bg-brand-primary/5 rounded-full blur-xl group-hover:bg-brand-primary/10 transition-all duration-500" />
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                  <Star className="w-3 h-3 text-brand-primary fill-brand-primary" />
                  IMDb Score
                </span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className={`text-xl font-extrabold tracking-tight ${imdbScore !== 'NA' && imdbScore !== 'N/A' ? 'text-white' : 'text-gray-400'}`}>
                    {imdbScore}
                  </span>
                  {imdbScore !== 'NA' && imdbScore !== 'N/A' && (
                    <span className="text-[9px] font-semibold text-gray-500">/10</span>
                  )}
                </div>
                {votesDisplay ? (
                  <span className="text-[9px] text-gray-500 mt-1 font-mono">
                    {votesDisplay} votes
                  </span>
                ) : null}
              </div>

              {/* Card 2: Rotten Tomatoes */}
              <div className="bg-[#1C1C1E]/40 backdrop-blur-md border border-white/5 rounded-2xl p-3 flex flex-col justify-between group hover:border-red-500/20 transition-all duration-300 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 bg-red-500/5 rounded-full blur-xl group-hover:bg-red-500/10 transition-all duration-500" />
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${tomatometerScore !== 'NA' && tomatometerScore !== 'N/A' ? 'bg-red-500 animate-pulse' : 'bg-gray-500'}`} />
                  Tomatometer
                </span>
                <div className="flex items-baseline gap-0.5 mt-1">
                  <span className={`text-xl font-extrabold tracking-tight ${tomatometerScore !== 'NA' && tomatometerScore !== 'N/A' ? 'text-red-400' : 'text-gray-400'}`}>
                    {tomatometerScore}
                  </span>
                </div>
                <span className="text-[9px] text-gray-500 mt-1 font-mono">
                  Critics Choice
                </span>
              </div>

              {/* Card 3: Letterboxd */}
              {isMovie && (
                <div className="bg-[#1C1C1E]/40 backdrop-blur-md border border-white/5 rounded-2xl p-3 flex flex-col justify-between group hover:border-[#00e054]/20 transition-all duration-300 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-[#00e054]/5 rounded-full blur-xl group-hover:bg-[#00e054]/10 transition-all duration-500" />
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${letterboxdScore !== 'NA' && letterboxdScore !== 'N/A' ? 'bg-[#00e054]' : 'bg-gray-500'}`} />
                    Letterboxd
                  </span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className={`text-xl font-extrabold tracking-tight ${letterboxdScore !== 'NA' && letterboxdScore !== 'N/A' ? 'text-[#00e054]' : 'text-gray-400'}`}>
                      {letterboxdScore}
                    </span>
                    {letterboxdScore !== 'NA' && letterboxdScore !== 'N/A' && (
                      <span className="text-[9px] font-semibold text-gray-500">/5</span>
                    )}
                  </div>
                  <span className="text-[9px] text-gray-500 mt-1 font-mono">
                    Cinephile Rating
                  </span>
                </div>
              )}

              {/* Card 4: User Rating */}
              <div 
                className="bg-[#1C1C1E]/40 backdrop-blur-md border border-white/5 rounded-2xl p-3 flex flex-col justify-between group hover:border-purple-500/20 transition-all duration-300 relative overflow-hidden cursor-pointer"
                onClick={() => setIsRatingModalOpen(true)}
              >
                <div className={`absolute top-0 right-0 w-20 h-20 rounded-full blur-xl transition-all duration-500 ${user && userRating !== null ? 'bg-brand-primary/5 group-hover:bg-brand-primary/10' : 'bg-purple-500/5 group-hover:bg-purple-500/10'}`} />
                <span className={`text-[9px] font-bold uppercase tracking-widest mb-1 flex items-center gap-1 ${user && userRating !== null ? 'text-brand-primary/80' : 'text-gray-400'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${user && userRating !== null ? 'bg-brand-primary' : 'bg-purple-500'}`} />
                  {user && userRating !== null ? 'Your Rating' : 'User Rating'}
                </span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className={`text-xl font-extrabold tracking-tight ${user && userRating !== null ? 'text-brand-primary' : 'text-purple-400'}`}>
                    {user && userRating !== null ? Number(userRating).toFixed(1) : (userRatingAvg !== null ? Number(userRatingAvg).toFixed(1) : (item?.rating ? Number(item.rating).toFixed(1) : 'N/A'))}
                  </span>
                  <span className="text-[9px] font-semibold text-gray-500">/10</span>
                </div>
                <span className="text-[9px] text-gray-500 mt-1 font-mono">
                  {user && userRating !== null ? 'Tap to change' : `${userRatingCount} platform ${userRatingCount === 1 ? 'vote' : 'votes'}`}
                </span>
              </div>

              {/* Card 5: Live Downloads */}
              <div className={`bg-[#1C1C1E]/40 backdrop-blur-md border border-white/5 rounded-2xl p-3 flex flex-col justify-between group hover:border-brand-primary/20 transition-all duration-300 relative overflow-hidden ${isMovie ? 'col-span-2 sm:col-span-1' : ''}`}>
                <div className="absolute top-0 right-0 w-20 h-20 bg-brand-primary/5 rounded-full blur-xl group-hover:bg-brand-primary/10 transition-all duration-500" />
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                  <Download className="w-3 h-3 text-brand-primary animate-bounce" />
                  Downloads
                  <span className="flex h-1.5 w-1.5 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
                  </span>
                </span>
                
                <div className="flex items-baseline gap-1 mt-1 relative">
                  {downloads.isLoading ? (
                    <div className="h-6 w-16 bg-white/5 animate-pulse rounded" />
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className={`text-xl font-extrabold text-white tracking-tight transition-all duration-500 ${justDownloaded ? 'scale-110 text-brand-primary font-black' : ''}`}>
                        {downloads.total.toLocaleString()}
                      </span>
                      {justDownloaded && (
                        <motion.span 
                          initial={{ opacity: 0, y: 10, scale: 0.5 }}
                          animate={{ opacity: 1, y: -20, scale: 1.2 }}
                          exit={{ opacity: 0 }}
                          className="absolute -right-4 top-0 text-sm font-bold text-brand-primary bg-brand-primary/10 border border-[#00e5bc]/20 px-1.5 py-0.5 rounded-full"
                        >
                          +1
                        </motion.span>
                      )}
                    </div>
                  )}
                </div>
                
                <span className="text-[9px] text-gray-500 mt-1 font-mono flex items-center gap-1">
                  Today: <span className="text-gray-300 font-bold">{downloads.today.toLocaleString()}</span>
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-8">
              {(Array.isArray(item.genres) ? item.genres : typeof item.genres === 'string' ? (item.genres as string).split(',').map(s => s.trim()) : []).map(genre => (
                <span key={genre} className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-primary bg-brand-primary/10 border border-brand-primary/20 rounded-md">
                  {genre}
                </span>
              ))}
            </div>

            {item.description && (
              <div className="text-gray-400 leading-relaxed max-w-3xl mb-8 text-sm sm:text-base">
                <div className="whitespace-pre-line text-gray-400">
                  {isDescriptionExpanded || item.description.length <= 290
                    ? item.description
                    : item.description.slice(0, 290) + '...'}
                </div>

                {item.description.length > 290 && (
                  <button
                    onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                    className="text-white font-bold underline mt-3 hover:text-brand-primary transition-colors cursor-pointer text-sm inline-block"
                  >
                    {isDescriptionExpanded ? 'Show less' : 'Read More'}
                  </button>
                )}
              </div>
            )}

            {/* Desktop Action Row (Download and Trailer on Row 1, Rest on Row 2) */}
            <div className="hidden md:flex flex-col gap-4 mb-12">
              {/* Row 1: Download & Trailer */}
              <div className="flex items-center gap-4">
                <button 
                  onClick={handleDownloadOpen}
                  className="flex items-center gap-2 px-6 py-3 bg-white text-black hover:bg-gray-200 rounded-full font-bold transition-all shadow-lg text-sm"
                >
                  <Download className="w-5 h-5" />
                  Download
                </button>

                {effectiveTrailerUrl && (
                  <a 
                    href={effectiveTrailerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/20 text-white hover:bg-white/10 rounded-full font-bold transition-all text-sm"
                  >
                    <Youtube className="w-5 h-5 text-red-500" />
                    Trailer
                  </a>
                )}
              </div>

              {/* Row 2: Watchlist, Mark watched, Like, Rate */}
              <div className="flex flex-wrap items-center gap-4">
                <button 
                  onClick={() => toggleList('watchlist')}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-medium transition-all border text-xs ${
                    inWatchlist 
                      ? 'bg-brand-primary/10 border-brand-primary/30 text-brand-primary' 
                      : 'bg-transparent border-white/20 text-white hover:bg-white/10'
                  }`}
                >
                  {inWatchlist ? <BookmarkCheck className="w-4 h-4" /> : <BookmarkPlus className="w-4 h-4" />}
                  Watchlist
                </button>
                
                <button 
                  onClick={() => toggleList('watched')}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-medium transition-all border text-xs ${
                    inWatched 
                      ? 'bg-green-500/10 border-green-500/30 text-green-400' 
                      : 'bg-transparent border-white/20 text-white hover:bg-white/10'
                  }`}
                >
                  <CheckCircle className="w-4 h-4" />
                  {inWatched ? 'Watched' : 'Mark watched'}
                </button>

                <button 
                  onClick={() => toggleList('liked')}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-medium transition-all border text-xs ${
                    inLiked 
                      ? 'bg-red-500/10 border-red-500/30 text-red-400' 
                      : 'bg-transparent border-white/20 text-white hover:bg-white/10'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${inLiked ? 'fill-current' : ''}`} />
                  Like
                </button>

                <button 
                  onClick={() => {
                    if (!user) {
                      navigate(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
                      return;
                    }
                    setIsRatingModalOpen(true);
                  }}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-medium transition-all border text-xs ${
                    user && userRating !== null 
                      ? 'bg-brand-primary/10 border-brand-primary/30 text-brand-primary' 
                      : 'bg-transparent border-white/20 text-white hover:bg-white/10'
                  }`}
                >
                  <Star className={`w-4 h-4 ${user && userRating !== null ? 'fill-current' : ''}`} />
                  {user && userRating !== null ? `Rated ${userRating}` : 'Rate'}
                </button>
              </div>
            </div>

            {/* Mobile Action Rows (2 columns per row) */}
            <div className="grid grid-cols-2 gap-3 md:hidden mb-12">
              {/* Download - spans 2 cols if no trailer, or 1 col if there is a trailer */}
              <button 
                onClick={handleDownloadOpen}
                className={`flex items-center justify-center gap-2 px-4 py-3 bg-white text-black hover:bg-gray-200 rounded-full font-bold transition-all shadow-lg text-sm ${
                  effectiveTrailerUrl ? 'col-span-1' : 'col-span-2'
                }`}
              >
                <Download className="w-4.5 h-4.5 shrink-0" />
                <span className="truncate">Download</span>
              </button>

              {/* Trailer - only if available */}
              {effectiveTrailerUrl && (
                <a 
                  href={effectiveTrailerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-white/5 border border-white/20 text-white hover:bg-white/10 rounded-full font-bold transition-all text-sm w-full"
                >
                  <Youtube className="w-4.5 h-4.5 text-red-500 shrink-0" />
                  <span className="truncate">Trailer</span>
                </a>
              )}

              {/* Watchlist */}
              <button 
                onClick={() => toggleList('watchlist')}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-full font-semibold transition-all border text-sm w-full ${
                  inWatchlist 
                    ? 'bg-brand-primary/10 border-brand-primary/30 text-brand-primary' 
                    : 'bg-transparent border-white/20 text-white hover:bg-white/10'
                }`}
              >
                {inWatchlist ? <BookmarkCheck className="w-4.5 h-4.5 shrink-0" /> : <BookmarkPlus className="w-4.5 h-4.5 shrink-0" />}
                <span className="truncate">Watchlist</span>
              </button>

              {/* Mark watched */}
              <button 
                onClick={() => toggleList('watched')}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-full font-semibold transition-all border text-sm w-full ${
                  inWatched 
                    ? 'bg-green-500/10 border-green-500/30 text-green-400' 
                    : 'bg-transparent border-white/20 text-white hover:bg-white/10'
                }`}
              >
                <CheckCircle className="w-4.5 h-4.5 shrink-0" />
                <span className="truncate">{inWatched ? 'Watched' : 'Mark watched'}</span>
              </button>

              {/* Like */}
              <button 
                onClick={() => toggleList('liked')}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-full font-semibold transition-all border text-sm w-full ${
                  inLiked 
                    ? 'bg-red-500/10 border-red-500/30 text-red-400' 
                    : 'bg-transparent border-white/20 text-white hover:bg-white/10'
                }`}
              >
                <Heart className={`w-4.5 h-4.5 shrink-0 ${inLiked ? 'fill-current' : ''}`} />
                <span className="truncate">Like</span>
              </button>

              {/* Rate */}
              <button 
                onClick={() => {
                  if (!user) {
                    navigate(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
                    return;
                  }
                  setIsRatingModalOpen(true);
                }}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-full font-semibold transition-all border text-sm w-full ${
                  user && userRating !== null 
                    ? 'bg-brand-primary/10 border-brand-primary/30 text-brand-primary' 
                    : 'bg-transparent border-white/20 text-white hover:bg-white/10'
                }`}
              >
                <Star className={`w-4.5 h-4.5 shrink-0 ${user && userRating !== null ? 'fill-current' : ''}`} />
                <span className="truncate">{user && userRating !== null ? `Rated ${userRating}` : 'Rate'}</span>
              </button>
            </div>

            {/* Mobile-only Metadata (Hidden on desktop, placed below actions on mobile) */}
            <div className="block md:hidden space-y-8 mb-12">
              {/* Director and Studios Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <div className="w-1 h-5 bg-white rounded-full"></div>
                    Director
                  </h3>
                  <div 
                    className="flex items-center gap-4 bg-white/5 rounded-full p-2 pr-6 border border-white/10 hover:bg-white/10 transition-colors w-fit max-w-full cursor-pointer"
                    onClick={() => item.director && navigate(`/person/${encodeURIComponent(item.director)}`)}
                  >
                    {item.directorPhotoUrl ? (
                      <img 
                        src={item.directorPhotoUrl} 
                        alt={item.director} 
                        className="w-12 h-12 rounded-full object-cover shrink-0" 
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-white/10 flex-shrink-0 flex items-center justify-center text-xl font-bold text-white">
                        {item.director ? item.director.charAt(0).toUpperCase() : '?'}
                      </div>
                    )}
                    <span className="font-semibold text-white truncate text-sm">{item.director || 'Unknown'}</span>
                  </div>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <div className="w-1 h-5 bg-white rounded-full"></div>
                    Studios
                  </h3>
                  {effectiveStudios.length > 0 ? (
                    <div className="flex flex-wrap gap-4">
                      {effectiveStudios.map((studio, idx) => (
                        <div 
                          key={idx} 
                          className="flex items-center gap-4 bg-white/5 rounded-full p-2 pr-6 border border-white/10 hover:bg-white/10 transition-colors w-fit cursor-pointer"
                          onClick={() => navigate(`/studio/${encodeURIComponent(studio.name)}`)}
                        >
                          {studio.logoUrl ? (
                            <img 
                              src={studio.logoUrl} 
                              alt={studio.name} 
                              className="w-12 h-12 rounded-full object-cover bg-white shrink-0" 
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-white flex-shrink-0 flex items-center justify-center text-xl font-bold text-black">
                              {studio.name ? studio.name.charAt(0).toUpperCase() : '?'}
                            </div>
                          )}
                          <span className="font-semibold text-white truncate text-sm">{studio.name}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-4 bg-white/5 rounded-full p-2 pr-6 border border-white/10 hover:bg-white/10 transition-colors w-fit">
                      <div className="w-12 h-12 rounded-full bg-white/10 flex-shrink-0 flex items-center justify-center text-xl font-bold text-white">
                        ?
                      </div>
                      <span className="font-semibold text-white truncate text-sm">Unknown</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Actors and Franchise Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
              <div className={franchiseItems.length > 1 ? "lg:col-span-2" : "lg:col-span-3"}>
                <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <div className="w-1 h-5 bg-white rounded-full"></div>
                  Actors
                </h3>
                <div className="flex items-center bg-white/10 rounded-full p-1 border border-white/10">
                  <button 
                    onClick={() => setActorsViewMode('list')}
                    className={`p-2 transition-all rounded-full ${
                      actorsViewMode === 'list' 
                        ? 'bg-white text-black shadow-sm' 
                        : 'bg-transparent text-gray-400 hover:text-white'
                    }`}
                    title="List View"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                  </button>
                  <button 
                    onClick={() => setActorsViewMode('grid')}
                    className={`p-2 transition-all rounded-full ${
                      actorsViewMode === 'grid' 
                        ? 'bg-white text-black shadow-sm' 
                        : 'bg-transparent text-gray-400 hover:text-white'
                    }`}
                    title="Grid View"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                  </button>
                </div>
              </div>
              
              {actorsViewMode === 'grid' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                  {effectiveActors.length > 0 ? (
                    effectiveActors.map((actor, idx) => (
                      <div 
                        key={idx} 
                        className="flex flex-col items-center text-center group cursor-pointer"
                        onClick={() => navigate(`/person/${encodeURIComponent(actor.name)}`)}
                      >
                        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden mb-3 border-2 border-transparent group-hover:border-white/30 transition-all shrink-0">
                          {actor.photoUrl ? (
                            <img 
                              src={actor.photoUrl} 
                              alt={actor.name} 
                              className="w-full h-full object-cover" 
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full bg-white/10 flex items-center justify-center text-2xl font-bold text-white">
                              {actor.name ? actor.name.charAt(0) : '?'}
                            </div>
                          )}
                        </div>
                        <span className="font-medium text-sm text-gray-200 group-hover:text-white transition-colors">{actor.name}</span>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-full">
                      <div className="flex items-center gap-4 bg-white/5 rounded-full p-2 pr-6 border border-white/10 hover:bg-white/10 transition-colors w-fit">
                        <div className="w-12 h-12 rounded-full bg-white/10 flex-shrink-0 flex items-center justify-center text-xl font-bold text-white">
                          ?
                        </div>
                        <span className="font-semibold text-white truncate text-sm">Unknown</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-4 max-w-2xl">
                  {effectiveActors.length > 0 ? (
                    effectiveActors.map((actor, idx) => (
                      <div 
                        key={idx} 
                        className="flex items-center gap-4 bg-[#0D0E12]/80 border border-white/10 rounded-full p-2 pr-6 hover:bg-white/10 hover:border-white/20 transition-all w-full group cursor-pointer"
                        onClick={() => navigate(`/person/${encodeURIComponent(actor.name)}`)}
                      >
                        <div className="w-16 h-16 rounded-full overflow-hidden bg-white/10 shrink-0">
                          {actor.photoUrl ? (
                            <img 
                              src={actor.photoUrl} 
                              alt={actor.name} 
                              className="w-full h-full object-cover" 
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full bg-white/10 flex items-center justify-center text-2xl font-bold text-white">
                              {actor.name ? actor.name.charAt(0) : '?'}
                            </div>
                          )}
                        </div>
                        <span className="font-semibold text-white text-base group-hover:text-brand-primary transition-colors">{actor.name}</span>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center gap-4 bg-[#0D0E12]/80 border border-white/10 rounded-full p-2 pr-6 hover:bg-white/10 transition-colors w-fit">
                      <div className="w-12 h-12 rounded-full bg-white/10 flex-shrink-0 flex items-center justify-center text-xl font-bold text-white">
                        ?
                      </div>
                      <span className="font-semibold text-white truncate text-sm">Unknown</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* Franchise Collection */}
            {franchiseItems.length >= 2 && (effectiveFranchise || item?.title) && (
              <div className="lg:col-span-1">
                <h3 className="text-xl font-bold text-white flex items-center gap-2 mb-6">
                  <div className="w-1 h-5 bg-white rounded-full"></div>
                  Franchise Collection
                </h3>
                <div className="bg-[#0D0E12]/80 border border-white/10 rounded-2xl p-6 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                  
                  {/* Render stacked posters */}
                  <div className="relative h-48 mt-4 mb-2 flex justify-end items-center mr-8 transform group-hover:scale-105 transition-transform duration-500 pointer-events-none">
                    {[...franchiseItems].sort((a, b) => (a.franchiseOrder || 0) - (b.franchiseOrder || 0)).slice(0, 3).map((fItem, idx) => (
                      <img 
                        key={fItem.id} 
                        src={fItem.posterUrl} 
                        alt={fItem.title} 
                        className="absolute w-28 sm:w-32 rounded-lg shadow-xl border border-white/10 object-cover" 
                        style={{
                          right: `${idx * 35}px`,
                          zIndex: 10 - idx,
                          transform: `rotate(${(idx - 1) * 8}deg) scale(${1 - idx * 0.05})`
                        }}
                      />
                    ))}
                  </div>

                  <div className="relative z-10 mt-6">
                    <h4 className="text-2xl font-bold text-white mb-2">{effectiveFranchise}</h4>
                    <p className="text-gray-400 text-sm mb-6 font-mono">View the complete collection</p>
                    
                    <button 
                      onClick={() => navigate(`/franchise/${encodeURIComponent(effectiveFranchise)}`)}
                      className="flex items-center justify-center gap-2 bg-[#F3EFE9] text-black hover:bg-white px-6 py-3 rounded-full font-semibold transition-all w-full"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                      Explore Franchise
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            </div>



          </motion.div>
        </div>
        
        {/* You May Also Like Section */}
        {similarContent.length > 0 && (
          <div className="mt-16 pt-12 border-t border-white/5">
             <SimilarContentCarousel results={similarContent} />
          </div>
        )}
      </div>

      {/* Version Selection Popup */}
      {createPortal(
        <AnimatePresence>
           {isDownloadModalOpen && (
              <motion.div
                 initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
               onClick={() => setIsDownloadModalOpen(false)}
            >
               <motion.div
                  initial={{ scale: 0.95, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 20 }}
                  onClick={e => e.stopPropagation()}
                  className={`bg-[#1C1C1E] border border-white/5 rounded-2xl flex overflow-hidden shadow-2xl relative ${isContentSeries(item) && availableSeasons.length > 0 ? 'max-w-4xl w-full h-[75vh]' : 'max-w-2xl w-full p-6 flex-col'}`}
               >
                  <button 
                     onClick={() => setIsDownloadModalOpen(false)}
                     className="absolute top-6 right-6 text-gray-400 hover:text-white transition-colors z-10"
                  >
                     <X className="w-5 h-5" />
                  </button>
                  
                  {/* Layout for Series/Anime */}
                  {isContentSeries(item) && availableSeasons.length > 0 ? (
                     <div className="flex flex-col md:flex-row w-full h-full">
                        {/* Left Sidebar: Seasons */}
                        <div className="w-full md:w-1/3 bg-black/20 border-b md:border-b-0 md:border-r border-white/5 overflow-y-auto flex flex-col">
                           <div className="p-6 pb-4">
                              <h2 className="text-xl font-bold text-white">Seasons</h2>
                           </div>
                           <div className="flex-1 px-4 pb-4 space-y-1">
                              {availableSeasons.map(s => (
                                <button
                                  key={s.id}
                                  onClick={() => handleSeasonChange(s.id)}
                                  className={`w-full text-left px-4 py-3 rounded-xl transition-all flex items-center justify-between ${selectedSeasonId === s.id ? 'bg-white/10 text-white font-bold' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
                                >
                                  <span>{s.name}</span>
                                  {selectedSeasonId === s.id && <ChevronRight className="w-4 h-4 text-brand-primary" />}
                                </button>
                              ))}
                           </div>
                        </div>
                        
                        {/* Right Content: Qualities & Files */}
                        <div className="w-full md:w-2/3 flex flex-col h-full bg-[#1C1C1E]">
                            <div className="p-6 pb-0 pt-16 md:pt-6">
                               <h2 className="text-xl font-bold text-white mb-6 hidden md:block">Downloads</h2>
                               
                               {/* Qualities Tabs */}
                               <div className="mb-4">
                                  <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Qualities</h3>
                                  <div className="flex flex-wrap gap-2">
                                     {(() => {
                                       const qualitiesObj = getEffectiveQualities(item, selectedSeasonId);
                                       return sortQualities(Object.keys(qualitiesObj)).map(qKey => {
                                         const vCount = qualitiesObj[qKey]?.versions?.length || 0;
                                         const isSelected = selectedDownloadQuality === qKey;
                                         return (
                                           <button
                                             key={qKey}
                                             onClick={() => setSelectedDownloadQuality(qKey)}
                                             className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${isSelected ? 'bg-white text-black' : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white border border-transparent hover:border-white/10'}`}
                                           >
                                             {qKey} <span className={isSelected ? 'text-gray-600 font-normal ml-1' : 'text-gray-500 font-normal ml-1'}>({vCount})</span>
                                           </button>
                                         );
                                       });
                                     })()}
                                  </div>
                               </div>
                            </div>
                            
                            <div className="p-6 pt-0 flex-1 overflow-y-auto">
                               <div className="space-y-0">
                                  {(() => {
                                    let versions: QualityVersion[] = [];
                                    if (selectedDownloadQuality) {
                                      const qualitiesObj = getEffectiveQualities(item, selectedSeasonId);
                                      versions = qualitiesObj[selectedDownloadQuality]?.versions || [];
                                    }
                                    return versions.map((v, idx) => (
                                       <div key={v.id || idx} className="flex items-center justify-between py-4 border-b border-white/5 last:border-0 group">
                                          <div className="flex items-start gap-3 overflow-hidden pr-4">
                                             <FileText className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                                             <div className="min-w-0">
                                                <p className="text-white font-medium text-sm truncate">{v.name || `${item.title} ${selectedDownloadQuality} Version ${idx + 1}`}</p>
                                                <div className="flex items-center gap-2 mt-2 text-xs font-mono">
                                                   <span className="bg-white text-black px-2 py-0.5 rounded-md font-bold text-[10px] uppercase">{selectedDownloadQuality}</span>
                                                   {v.size && <span className="bg-white/10 text-gray-300 px-2 py-0.5 rounded-md font-medium text-[10px]">{v.size}</span>}
                                                   {v.sub && <span className="bg-[#0E2E2A] text-[#00E5BC] px-2 py-0.5 rounded-md border border-[#00E5BC]/10 font-bold text-[10px] tracking-wide">SUB</span>}
                                                </div>
                                             </div>
                                          </div>
                                          <button 
                                             onClick={() => handleDownloadLink(v.link, selectedDownloadQuality, v.name)}
                                             className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0 hover:scale-105 transition-transform"
                                          >
                                             <Download className="w-5 h-5 text-black" />
                                          </button>
                                       </div>
                                    ));
                                  })()}
                               </div>
                            </div>
                         </div>
                     </div>
                  ) : (
                     /* Layout for Movies */
                     <>
                        <div className="mb-6">
                           <h2 className="text-xl font-bold text-white mb-6 pr-8">Available Downloads</h2>
                           
                           {/* Qualities Tabs */}
                           <div className="mb-4">
                              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Qualities</h3>
                              <div className="flex flex-wrap gap-2">
                                 {(() => {
                                   const qualitiesObj = getEffectiveQualities(item);
                                   return sortQualities(Object.keys(qualitiesObj)).map(qKey => {
                                     const vCount = qualitiesObj[qKey]?.versions?.length || 0;
                                     const isSelected = selectedDownloadQuality === qKey;
                                     return (
                                       <button
                                         key={qKey}
                                         onClick={() => setSelectedDownloadQuality(qKey)}
                                         className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${isSelected ? 'bg-white text-black' : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white border border-transparent hover:border-white/10'}`}
                                       >
                                         {qKey} <span className={isSelected ? 'text-gray-600 font-normal ml-1' : 'text-gray-500 font-normal ml-1'}>({vCount})</span>
                                       </button>
                                     );
                                   });
                                 })()}
                              </div>
                           </div>
                        </div>
                        
                        {/* File List */}
                        <div className="max-h-[50vh] overflow-y-auto pr-2 mb-4 space-y-0">
                           {(() => {
                             let versions: QualityVersion[] = [];
                             if (selectedDownloadQuality) {
                               const qualitiesObj = getEffectiveQualities(item);
                               versions = qualitiesObj[selectedDownloadQuality]?.versions || [];
                             }
                             return versions.map((v, idx) => (
                                <div key={v.id || idx} className="flex items-center justify-between py-4 border-b border-white/5 last:border-0 group">
                                   <div className="flex items-start gap-3 overflow-hidden pr-4">
                                      <FileText className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                                      <div className="min-w-0">
                                         <p className="text-white font-medium text-sm truncate">{v.name || `${item.title} ${selectedDownloadQuality} Version ${idx + 1}`}</p>
                                         <div className="flex items-center gap-2 mt-2 text-xs font-mono">
                                            <span className="bg-white text-black px-2 py-0.5 rounded-md font-bold text-[10px] uppercase">{selectedDownloadQuality}</span>
                                            {v.size && <span className="bg-white/10 text-gray-300 px-2 py-0.5 rounded-md font-medium text-[10px]">{v.size}</span>}
                                            {v.sub && <span className="bg-[#0E2E2A] text-[#00E5BC] px-2 py-0.5 rounded-md border border-[#00E5BC]/10 font-bold text-[10px] tracking-wide">SUB</span>}
                                         </div>
                                      </div>
                                   </div>
                                   <button 
                                      onClick={() => handleDownloadLink(v.link, selectedDownloadQuality, v.name)}
                                      className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0 hover:scale-105 transition-transform"
                                   >
                                      <Download className="w-5 h-5 text-black" />
                                   </button>
                                </div>
                             ));
                           })()}
                        </div>
                     </>
                  )}
               </motion.div>
            </motion.div>
         )}
        </AnimatePresence>,
        document.body
      )}

      {/* Rating Modal */}
      {createPortal(
        <AnimatePresence>
         {isRatingModalOpen && (
            <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
               onClick={() => setIsRatingModalOpen(false)}
            >
               <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  onClick={e => e.stopPropagation()}
                  className="bg-[#0A0D14] w-full max-w-sm sm:max-w-md rounded-2xl overflow-hidden shadow-2xl border border-white/10"
               >
                  <div className="p-6">
                    <div className="flex justify-between items-center mb-6">
                      <h2 className="text-xl font-bold text-white">Rate {item?.title}</h2>
                      <button 
                        onClick={() => setIsRatingModalOpen(false)}
                        className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-white transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="flex justify-center items-center gap-1 sm:gap-1.5 mb-6 flex-nowrap overflow-x-auto sm:overflow-x-visible py-2">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => (
                        <button
                          key={star}
                          onClick={() => {
                            if (!user) {
                              setIsRatingModalOpen(false);
                              navigate(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
                              return;
                            }
                            handleRating(star);
                            setIsRatingModalOpen(false);
                          }}
                          className={`w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center transition-transform hover:scale-125 focus:outline-none shrink-0`}
                        >
                          <Star 
                            className={`w-full h-full transition-colors ${user && userRating !== null && star <= userRating ? 'text-brand-primary fill-brand-primary' : 'text-gray-600 hover:text-brand-primary'}`} 
                          />
                        </button>
                      ))}
                    </div>
                    <div className="text-center text-sm text-gray-500">
                      {user && userRating ? `You rated this ${userRating}/10` : 'Click a star to rate out of 10'}
                    </div>
                    <div className="text-center text-xs text-brand-muted/70 flex items-center justify-center gap-1 bg-white/5 py-1.5 px-3 rounded-full w-fit mx-auto mt-4">
                      <span className="font-semibold text-white">{userRatingAvg !== null ? Number(userRatingAvg).toFixed(1) : (item?.rating ? Number(item.rating).toFixed(1) : '-')}</span>
                      <span>/10 from</span>
                      <span className="font-semibold text-white">{userRatingCount}</span>
                      <span>{userRatingCount === 1 ? 'user' : 'users'}</span>
                    </div>
                  </div>
               </motion.div>
            </motion.div>
         )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
