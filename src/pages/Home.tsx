import React, { useMemo } from 'react';
import FilterableCarousel from '../components/FilterableCarousel';
import TrendingCarousel from '../components/TrendingCarousel';
import GenreCarousel from '../components/GenreCarousel';
import BestOfCarousel from '../components/BestOfCarousel';
import PersonCarousel from '../components/PersonCarousel';
import FranchisesCarousel from '../components/FranchisesCarousel';
import { useData } from '../context/DataContext';
import { getStartOfTodayUTC3 } from '../utils/dateUtils';
import { Loader2, Film, WifiOff } from 'lucide-react';

import AdPlaceholder from '../components/AdPlaceholder';
import OfflineScreen from '../components/OfflineScreen';
import HomeSkeleton from '../components/HomeSkeleton';
import { useSearchParams, useNavigate } from 'react-router-dom';

function parseTimestamp(ts: any): number {
  if (typeof ts === 'number') return ts;
  if (!ts) return 0;
  if (typeof ts === 'object') {
    if (typeof ts.seconds === 'number') return ts.seconds * 1000;
    if (typeof ts._seconds === 'number') return ts._seconds * 1000;
    if (ts.toDate && typeof ts.toDate === 'function') {
      try { return ts.toDate().getTime(); } catch (e) {}
    }
  }
  const parsed = new Date(ts).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

function hasContentData(d: any): boolean {
  if (!d) return false;
  const hasTrending = (Array.isArray(d.trending) && d.trending.length > 0) || (Array.isArray(d.trending?.items) && d.trending.items.length > 0);
  const hasLatest = (Array.isArray(d.latest?.items) && d.latest.items.length > 0) || (Array.isArray(d.latest) && d.latest.length > 0);
  const hasTopRated = (Array.isArray(d.topRated?.items) && d.topRated.items.length > 0) || (Array.isArray(d.topRated) && d.topRated.length > 0);
  return hasTrending || hasLatest || hasTopRated;
}

export default function Home() {
  const { views = [], downloads = [] } = useData();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const categoryFilter = searchParams.get('category') || '';
  const cacheKey = `home-content-${categoryFilter || 'All'}`;

  const [data, setData] = React.useState<any>(() => {
    try {
      const cached = localStorage.getItem(`home-content-${categoryFilter || 'All'}`) || localStorage.getItem("home-content");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (hasContentData(parsed)) {
          return parsed;
        }
        localStorage.removeItem(`home-content-${categoryFilter || 'All'}`);
        localStorage.removeItem("home-content");
      }
      return null;
    } catch (e) {
      return null;
    }
  });
  const [isLoading, setIsLoading] = React.useState(!hasContentData(data));
  const [error, setError] = React.useState(false);
  const [isOffline, setIsOffline] = React.useState(!navigator.onLine);

  React.useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  React.useEffect(() => {
    const fetchCategory = categoryFilter || 'All';
    try {
      const cached = localStorage.getItem(`home-content-${fetchCategory}`) || (fetchCategory === 'All' ? localStorage.getItem("home-content") : null);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (hasContentData(parsed) && (parsed.category === fetchCategory || !parsed.category)) {
          setData(parsed);
          setIsLoading(false);
        } else {
          localStorage.removeItem(`home-content-${fetchCategory}`);
          if (fetchCategory === 'All') localStorage.removeItem("home-content");
          if (!hasContentData(data)) setIsLoading(true);
        }
      } else {
        if (!hasContentData(data)) setIsLoading(true);
      }
    } catch(e) {}

    if (isOffline) {
      setIsLoading(false);
      return;
    }

    let isSubscribed = true;

    fetch(`/api/home-content?category=${encodeURIComponent(fetchCategory)}`)
      .then(res => {
        if (!res.ok) throw new Error("Network response was not ok");
        return res.json();
      })
      .then(d => {
        if (!isSubscribed) return;
        if (d && !d.error) {
          if (hasContentData(d)) {
            setData(d);
            setError(false);
            try {
              localStorage.setItem(`home-content-${fetchCategory}`, JSON.stringify(d));
              if (!categoryFilter || categoryFilter === 'All') {
                localStorage.setItem("home-content", JSON.stringify(d));
              }
            } catch(e) {
              console.warn("Could not cache home content:", e);
            }
          } else {
            console.warn("[Home] Empty content payload received, requesting recovery...");
            fetch('/api/home/rebuild-cache', { method: 'POST' }).catch(() => {});
            setTimeout(() => {
              if (!isSubscribed) return;
              fetch(`/api/home-content?category=${encodeURIComponent(fetchCategory)}`)
                .then(r => r.json())
                .then(retryD => {
                  if (!isSubscribed) return;
                  if (hasContentData(retryD)) {
                    setData(retryD);
                    setError(false);
                    try {
                      localStorage.setItem(`home-content-${fetchCategory}`, JSON.stringify(retryD));
                    } catch(e) {}
                  }
                })
                .catch(() => {});
            }, 1200);
          }
        } else {
          setError(true);
        }
        setIsLoading(false);
      })
      .catch(err => {
        if (!isSubscribed) return;
        console.error(err);
        if (!hasContentData(data)) setError(true);
        setIsLoading(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, [isOffline, categoryFilter]);
  
  const latestContent = useMemo(() => {
    if (data?.latest?.items && Array.isArray(data.latest.items)) return data.latest.items;
    if (data?.latest && Array.isArray(data.latest)) return data.latest;
    return [];
  }, [data]);

  const trendingContent = useMemo(() => {
    if (data?.trending?.items && Array.isArray(data.trending.items)) return data.trending.items;
    if (data?.trending && Array.isArray(data.trending) && data.trending.length > 0) {
      return data.trending;
    }
    return [];
  }, [data]);

  const topRatedContent = useMemo(() => {
    if (data?.topRated?.items && Array.isArray(data.topRated.items)) return data.topRated.items;
    if (data?.topRated && Array.isArray(data.topRated)) return data.topRated;
    return [];
  }, [data]);

  const franchisesContent = useMemo(() => {
    if (data?.franchises?.items && Array.isArray(data.franchises.items)) return data.franchises.items;
    if (data?.franchises && Array.isArray(data.franchises)) return data.franchises;
    return [];
  }, [data]);

  const genresData = useMemo(() => {
    return data?.genres || { availableGenres: [], itemsByGenre: {} };
  }, [data]);

  const bestOfData = useMemo(() => {
    return data?.bestOf || { availableNetworks: [], itemsByNetwork: {} };
  }, [data]);

  const directorsData = useMemo(() => {
    return data?.directors || { availablePeople: [], itemsByPerson: {} };
  }, [data]);

  const maleActorsData = useMemo(() => {
    return data?.maleActors || { availablePeople: [], itemsByPerson: {} };
  }, [data]);

  const femaleActorsData = useMemo(() => {
    return data?.femaleActors || { availablePeople: [], itemsByPerson: {} };
  }, [data]);

  const hasData = useMemo(() => {
    if (!data) return false;
    if (trendingContent.length > 0) return true;
    if (latestContent.length > 0) return true;
    if (topRatedContent.length > 0) return true;
    if (franchisesContent.length > 0) return true;
    if (genresData?.availableGenres?.length > 0) return true;
    if (bestOfData?.availableNetworks?.length > 0) return true;
    if (directorsData?.availablePeople?.length > 0) return true;
    if (maleActorsData?.availablePeople?.length > 0) return true;
    if (femaleActorsData?.availablePeople?.length > 0) return true;
    return false;
  }, [data, trendingContent, latestContent, topRatedContent, franchisesContent, genresData, bestOfData, directorsData, maleActorsData, femaleActorsData]);

  if (isLoading && !hasData) {
    return <HomeSkeleton isOffline={isOffline} category={categoryFilter} />;
  }

  return (
    <div className="pb-12 pt-[188px] sm:pt-40">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 relative z-20 space-y-12">
        {isOffline && (
          <div className="bg-amber-500/10 border border-amber-500/20 text-amber-200 px-4 py-3 rounded-2xl flex items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2">
              <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
              <span>You are offline. Showing cached catalog.</span>
            </div>
            <button 
              onClick={() => window.location.reload()} 
              className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 rounded-lg text-xs transition-colors"
            >
              Retry
            </button>
          </div>
        )}
        {/* Category Header */}
        {categoryFilter && (
          <div className="pt-4 border-b border-white/10 pb-4 flex items-center justify-between">
            <h2 className="text-3xl font-poppins font-bold text-white tracking-tight capitalize">
              {categoryFilter.toLowerCase() === 'series' || categoryFilter.toLowerCase() === 'tv' ? 'TV Shows' : categoryFilter}
            </h2>
          </div>
        )}
        {/* Empty Category State */}
        {!hasData && !error && !isOffline && (
          <div className="py-20 text-center space-y-4 bg-white/[0.02] border border-white/5 rounded-3xl p-8">
            <Film className="w-12 h-12 text-gray-500 mx-auto opacity-50" />
            <h3 className="text-xl font-bold text-white">No content found</h3>
            <p className="text-sm text-gray-400 max-w-md mx-auto">
              {categoryFilter 
                ? `There are currently no items added under "${categoryFilter}".`
                : "No content is available at the moment."}
            </p>
            <button
              onClick={() => {
                setIsLoading(true);
                fetch('/api/home/rebuild-cache', { method: 'POST' })
                  .finally(() => {
                    fetch(`/api/home-content?category=${encodeURIComponent(categoryFilter || 'All')}`)
                      .then(r => r.json())
                      .then(fresh => {
                        if (hasContentData(fresh)) setData(fresh);
                      })
                      .finally(() => setIsLoading(false));
                  });
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-colors cursor-pointer"
            >
              Refresh Content
            </button>
          </div>
        )}

        {/* 1. Trending */}
        {trendingContent.length > 0 && (
          <TrendingCarousel 
            title="Trending" 
            items={trendingContent} 
          />
        )}

        {/* 2. Latest Section */}
        {latestContent.length > 0 && (
          <div className="w-full">
            <FilterableCarousel 
              title="Latest" 
              items={latestContent}
              endpointType="latest"
            />

            {/* Homepage Banner */}
            <div className="mt-12">
              <AdPlaceholder position="homepage_latest_series_banner" />
            </div>
          </div>
        )}

        {/* 3. Top Rated */}
        {topRatedContent.length > 0 && (
          <FilterableCarousel 
            title="Top Rated" 
            items={topRatedContent} 
            endpointType="top_rated"
          />
        )}

        {franchisesContent.length > 0 && <FranchisesCarousel items={franchisesContent} />}

        {/* 3. Genre Content */}
        {genresData.availableGenres && genresData.availableGenres.length > 0 && (
          <GenreCarousel genresData={genresData} />
        )}

        {/* 4. Best of */}
        {bestOfData.availableNetworks && bestOfData.availableNetworks.length > 0 && (
          <BestOfCarousel 
            bestOfData={bestOfData} 
          />
        )}

        {/* 5. Directors */}
        {directorsData.availablePeople && directorsData.availablePeople.length > 0 && (
          <PersonCarousel
            title="Directors"
            personData={directorsData}
            personType="director"
          />
        )}

        {/* 6. Male Actors */}
        {maleActorsData.availablePeople && maleActorsData.availablePeople.length > 0 && (
          <PersonCarousel
            title="Male Actor"
            personData={maleActorsData}
            personType="maleActors"
          />
        )}

        {/* 7. Female Actresses */}
        {femaleActorsData.availablePeople && femaleActorsData.availablePeople.length > 0 && (
          <PersonCarousel
            title="Female Actress"
            personData={femaleActorsData}
            personType="femaleActors"
          />
        )}
      </div>
    </div>
  );
}

