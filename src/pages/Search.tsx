import OfflineScreen from '../components/OfflineScreen';
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import ContentGrid from '../components/ContentGrid';
import { Search as SearchIcon, Loader2, WifiOff } from 'lucide-react';
import AdPlaceholder from '../components/AdPlaceholder';

export default function Search() {
  const [searchParams] = useSearchParams();
  const queryParam = searchParams.get('q') || '';
  const categoryParam = searchParams.get('category') || 'All';

  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Fetch results when queryParam or categoryParam changes
  useEffect(() => {
    let isMounted = true;
    const abortController = new AbortController();

    const fetchResults = async () => {
      if (queryParam && queryParam.trim().length < 2) {
        setResults([]);
        setLoading(false);
        return;
      }

      const cacheKey = `search::${queryParam || ''}::${categoryParam || 'All'}`;
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (isMounted) {
            setResults(parsed);
            setLoading(false);
          }
          return;
        } catch (e) {
          console.warn('Cache parse error', e);
        }
      }

      setLoading(true);
      setError(false);
      try {
        let res;
        if (queryParam) {
          const cat = categoryParam === 'All' ? '' : `&category=${encodeURIComponent(categoryParam)}`;
          res = await fetch(`/api/content/search?q=${encodeURIComponent(queryParam)}${cat}`, { signal: abortController.signal });
        } else {
          const cat = categoryParam === 'All' ? '' : `category=${encodeURIComponent(categoryParam)}`;
          res = await fetch(`/api/content?${cat}&limit=50`, { signal: abortController.signal });
        }
        if (res.ok) {
          const data = await res.json();
          let filtered = data.data || data;
          if (isMounted) {
            const finalData = Array.isArray(filtered) ? filtered : [];
            setResults(finalData);
            sessionStorage.setItem(cacheKey, JSON.stringify(finalData));
          }
        } else {
          if (isMounted) setError(true);
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error("Search fetch error:", err);
        if (isMounted) setError(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchResults();
    return () => { 
      isMounted = false; 
      abortController.abort();
    };
  }, [queryParam, categoryParam]);

  let title = `${categoryParam === 'All' ? 'All Content' : categoryParam === 'Series' ? 'TV Show' : categoryParam === 'Indian' ? 'Indian Cinema' : categoryParam}`;
  if (queryParam) {
    title = `Results for "${queryParam}"`;
  }

  return (
    <div className="pt-36 sm:pt-40 pb-12 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
         {/* Page Title */}
         <div className="flex items-center gap-4 mb-6">
           <h2 className="text-2xl font-poppins font-bold text-white">{title}</h2>
           <div className="flex-grow h-px bg-gradient-to-r from-white/10 to-transparent" />
         </div>

         {/* Category Page Top Banner */}
         {categoryParam === 'Movies' && !queryParam && (
           <div className="mb-8">
             <AdPlaceholder position="movies_page_banner" />
           </div>
         )}
         {categoryParam === 'Series' && !queryParam && (
           <div className="mb-8">
             <AdPlaceholder position="series_page_banner" />
           </div>
         )}
         {categoryParam === 'Animation' && !queryParam && (
           <div className="mb-8">
             <AdPlaceholder position="animation_page_banner" />
           </div>
         )}
         {categoryParam === 'Anime' && !queryParam && (
           <div className="mb-8">
             <AdPlaceholder position="anime_page_banner" />
           </div>
         )}

         {error ? (
            <div className="py-20 text-center space-y-4 bg-white/[0.02] border border-white/5 rounded-3xl p-8">
              <WifiOff className="w-12 h-12 text-red-500 mx-auto opacity-50" />
              <h3 className="text-xl font-bold text-white">Connection Error</h3>
              <p className="text-sm text-gray-400 max-w-md mx-auto">
                Please check your internet connection and try again.
              </p>
              <button onClick={() => window.location.reload()} className="mt-4 px-6 py-2 bg-brand-primary text-white rounded-xl hover:bg-brand-primary/90 transition-colors">
                Retry
              </button>
            </div>
         ) : loading ? (
            <div id="search-grid-skeleton" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6 animate-in fade-in duration-200">
              {Array.from({ length: 12 }).map((_, idx) => (
                <div key={idx} className="space-y-3 animate-pulse select-none">
                  <div 
                    className="relative aspect-[2/3] w-full overflow-hidden bg-white/[0.06] border border-white/5 mb-3"
                    style={{ 
                      borderRadius: '16px',
                      clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 24px), calc(100% - 24px) 100%, 0 100%)'
                    }}
                  >
                    <div className="absolute bottom-0 right-0 w-6 h-6 bg-[#1a1a1a]/80" style={{ clipPath: 'polygon(100% 0, 0 100%, 100% 100%)' }} />
                  </div>
                  <div className="h-4 bg-white/15 rounded-md w-4/5" />
                  <div className="flex items-center gap-2">
                    <div className="h-5 bg-white/10 rounded-full w-12" />
                    <div className="h-5 bg-white/10 rounded-full w-10" />
                  </div>
                </div>
              ))}
            </div>
         ) : results.length === 0 ? (
            <div className="py-16 text-center space-y-3 bg-white/[0.01] border border-white/5 rounded-3xl p-8">
              <SearchIcon className="w-12 h-12 text-gray-500 mx-auto opacity-40" />
              <h3 className="text-lg font-semibold text-white">No content found</h3>
              <p className="text-sm text-gray-400 max-w-md mx-auto">
                {queryParam ? `We couldn't find any title, actor, or genre matching "${queryParam}".` : 'No content available in this category.'}
              </p>
            </div>
          ) : (
            <ContentGrid items={results} />
         )}
      </div>
    </div>
  );
}

