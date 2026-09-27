import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Star, ChevronLeft, ChevronRight, ChevronRight as ChevronRightIcon, Bookmark } from 'lucide-react';
import { ContentItem } from '../types';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { auth } from '../utils/firebase';
import CarouselCardsSkeleton from './CarouselCardsSkeleton';

interface FilterableCarouselProps {
  title: string;
  items: ContentItem[];
  showAddedLabel?: boolean;
}

export default function FilterableCarousel({ title, items: initialItems, showAddedLabel = false, endpointType }: FilterableCarouselProps & { endpointType?: string }) {
  const { user } = useAuth();
  const { watchlistIds, toggleWatchlist } = useData();
  const navigate = useNavigate();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();
  const categoryFilter = searchParams.get('category');
  const hasCategoryFilter = !!categoryFilter;

  const allFilters = [
    { id: 'Movie', label: 'Movie', categoryMatch: 'Movies' },
    { id: 'TV Show', label: 'TV Show', categoryMatch: 'Series' },
    { id: 'Animation', label: 'Animation', categoryMatch: 'Animation' },
    { id: 'Anime', label: 'Anime', categoryMatch: 'Anime' },
    { id: 'Asian', label: 'Asian', categoryMatch: 'Asian Drama' },
    { id: 'Indian', label: 'Indian', categoryMatch: 'Indian' },
  ];

  const availableFilters = hasCategoryFilter ? [] : allFilters;
  const initialActive = !hasCategoryFilter ? 'Movie' : (categoryFilter || 'All');

  const [items, setItems] = useState<ContentItem[]>(initialItems);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [activeFilter, setActiveFilter] = useState(initialActive);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  
  // Track if initial mount has completed
  const isFirstMount = useRef(true);

  const checkScrollButtons = () => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScrollButtons();

    const resizeObserver = new ResizeObserver(() => {
      checkScrollButtons();
    });
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, [items, isSwitching, activeFilter]);

  useEffect(() => {
    const nextActive = !hasCategoryFilter ? 'Movie' : (categoryFilter || 'All');
    setActiveFilter(nextActive);
  }, [categoryFilter, hasCategoryFilter]);

  useEffect(() => {
    if (initialItems && initialItems.length > 0 && activeFilter === initialActive) {
      setItems(initialItems);
    }
  }, [initialItems, activeFilter, initialActive]);

  useEffect(() => {
    if (!endpointType) return;

    if (isFirstMount.current) {
      isFirstMount.current = false;
      // If we already have initial items from parent server-data matching the default filter, use them
      if (initialItems && initialItems.length > 0) {
        setItems(initialItems);
        return;
      }
    }

    let isMounted = true;
    setIsSwitching(true);

    const safetyTimer = setTimeout(() => {
      if (isMounted) setIsSwitching(false);
    }, 6000);

    const controller = new AbortController();

    const fetchNewFilter = async () => {
      try {
        const catParam = hasCategoryFilter ? (categoryFilter || 'All') : 'All';
        const res = await fetch(`/api/home/carousel?type=${endpointType}&category=${encodeURIComponent(catParam)}&subFilter=${encodeURIComponent(activeFilter)}&offset=0&limit=20`, {
          signal: controller.signal
        });
        if (res.ok && isMounted) {
          const data = await res.json();
          setItems(data.items || []);
          setHasMore(data.hasMore && (data.items || []).length < 50);
          if (scrollRef.current) scrollRef.current.scrollTo({ left: 0 });
        }
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          console.error("Failed to fetch filter data", e);
        }
      } finally {
        clearTimeout(safetyTimer);
        if (isMounted) {
          setIsSwitching(false);
          setLoadingMore(false);
        }
      }
    };

    fetchNewFilter();
    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
      controller.abort();
    };
  }, [activeFilter, endpointType, categoryFilter, hasCategoryFilter]);

  const loadMore = async () => {
    if (!endpointType || loadingMore || isSwitching || !hasMore || items.length >= 50) return;
    
    setLoadingMore(true);
    try {
      const catParam = hasCategoryFilter ? (categoryFilter || 'All') : 'All';
      const res = await fetch(`/api/home/carousel?type=${endpointType}&category=${encodeURIComponent(catParam)}&subFilter=${encodeURIComponent(activeFilter)}&offset=${items.length}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        if (data.items && data.items.length > 0) {
          setItems(prev => {
            const newItems = [...prev];
            data.items.forEach((item: any) => {
              if (!newItems.find(i => i.id === item.id)) {
                newItems.push(item);
              }
            });
            return newItems;
          });
          setHasMore(data.hasMore && items.length + data.items.length < 50);
        } else {
          setHasMore(false);
        }
      }
    } catch (e) {
      console.error("Failed to load more items", e);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleScroll = () => {
    checkScrollButtons();
    if (scrollRef.current) {
      const { scrollLeft, clientWidth, scrollWidth } = scrollRef.current;
      // Preload when approaching the end
      if (scrollLeft + clientWidth >= scrollWidth - 600) {
        loadMore();
      }
    }
  };

  const handleBookmarkClick = async (e: React.MouseEvent, contentId: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      navigate('/login');
      return;
    }

    await toggleWatchlist(contentId);
  };

  const scrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -300, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 300, behavior: 'smooth' });
    }
  };

  if (items.length === 0 && !isSwitching) return null;

  return (
    <div className="w-full relative z-20">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6 px-4 sm:px-0">
        <Link to="#" className="flex items-center gap-1 group">
          <h2 className="text-xl sm:text-2xl font-poppins font-bold text-white tracking-tight group-hover:text-white/80 transition-colors">{title}</h2>
          <ChevronRightIcon className="w-5 h-5 text-white/50 group-hover:text-white transition-colors mt-0.5" />
        </Link>
        
        {!hasCategoryFilter && availableFilters.length > 1 && (
          <div className="flex flex-wrap items-center bg-[#1a1a1a] rounded-full p-1 border border-white/10">
            {availableFilters.map(filter => (
              <button
                key={filter.id}
                onClick={() => {
                  if (activeFilter !== filter.id) {
                    setActiveFilter(filter.id);
                  }
                }}
                className={`px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium rounded-full transition-all ${
                  activeFilter === filter.id 
                    ? 'bg-white text-black shadow-sm' 
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative group">
        {canScrollLeft && (
          <button 
            onClick={scrollLeft} 
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-30 p-2 rounded-full glass bg-black/50 hover:bg-brand-primary text-white transition-colors opacity-0 group-hover:opacity-100 hidden sm:block cursor-pointer shadow-lg"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        {isSwitching ? (
          <div className="px-4 sm:px-0 pb-6">
            <CarouselCardsSkeleton count={8} />
          </div>
        ) : (
          <div 
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex overflow-x-auto gap-4 sm:gap-6 pb-6 px-4 sm:px-0 snap-x snap-mandatory animate-in fade-in duration-200"
          >
            {items.map((item, i) => {
              const isBookmarked = watchlistIds.includes(item.id);
              return (
                <Link 
                  key={item.id} 
                  to={`/title/${item.id}`}
                  className="flex-shrink-0 w-[150px] sm:w-[180px] md:w-[200px] snap-start group/card outline-none"
                >
                  <div className="relative">
                    {/* Image Container with custom chamfered corner */}
                    <div 
                      className="relative aspect-[2/3] w-full overflow-hidden bg-brand-card/50 transition-all duration-300 group-hover/card:shadow-[0_0_20px_rgba(255,255,255,0.1)] mb-3 bg-white/5"
                      style={{ 
                        borderRadius: '16px',
                        clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 24px), calc(100% - 24px) 100%, 0 100%)'
                      }}
                    >
                      <img 
                        src={item.posterUrl} 
                        alt={item.title} 
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover transition-transform duration-700 group-hover/card:scale-110"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 via-transparent to-transparent opacity-60" />
                      
                      {/* Bookmark Button */}
                      <button
                        onClick={(e) => handleBookmarkClick(e, item.id)}
                        className={`absolute top-3 right-3 z-20 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer backdrop-blur-md border ${
                          isBookmarked
                            ? 'bg-gradient-to-br from-[#FF8C00] to-[#FFA726] border-[#FF8C00] text-[#070B14] shadow-[0_4px_12px_rgba(255,140,0,0.35)] hover:scale-110'
                            : 'bg-black/40 border-white/10 text-white/80 hover:bg-black/60 hover:text-white hover:border-white/20 hover:scale-110'
                        }`}
                        title={isBookmarked ? "Remove from Watch Later" : "Add to Watch Later"}
                      >
                        <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`} />
                      </button>
                      
                      {/* Small decorative triangle in the cut */}
                    <div 
                      className="absolute bottom-0 right-0 w-6 h-6 bg-[#1a1a1a]/80 backdrop-blur-md"
                      style={{
                        clipPath: 'polygon(100% 0, 0 100%, 100% 100%)'
                      }}
                    />
                  </div>
                  
                  {/* Content Info */}
                  <div className="px-1">
                    <h3 className="font-poppins font-bold text-white truncate text-[15px] group-hover/card:text-brand-primary transition-colors">
                      {item.title}
                    </h3>
                    {showAddedLabel && (
                      <p className="text-brand-primary text-xs font-semibold mt-0.5 mb-1.5">Added</p>
                    )}
                    
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex items-center gap-1 bg-transparent border border-white/10 rounded-full px-2 py-0.5">
                        <Star className="w-3 h-3 text-brand-primary fill-brand-primary" />
                        <span className="text-white text-xs font-semibold">{Number(item.rating || 0).toFixed(1)}</span>
                      </div>
                      <div className="bg-transparent border border-white/10 rounded-full px-2 py-0.5">
                        <span className="text-white/60 text-xs font-semibold">{item.year}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            );
            })}
          </div>
        )}

        {canScrollRight && (
          <button 
            onClick={scrollRight} 
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-30 p-2 rounded-full glass bg-black/50 hover:bg-brand-primary text-white transition-colors opacity-0 group-hover:opacity-100 hidden sm:block cursor-pointer shadow-lg"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}
