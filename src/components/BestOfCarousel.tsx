import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Star, ChevronLeft, ChevronRight, ChevronRight as ChevronRightIcon, ChevronDown, Bookmark, Loader2 } from 'lucide-react';
import { ContentItem } from '../types';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { auth } from '../utils/firebase';
import CarouselCardsSkeleton from './CarouselCardsSkeleton';

interface BestOfCarouselProps {
  bestOfData: any;
}

export default function BestOfCarousel({ bestOfData }: BestOfCarouselProps) {
  const { user } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [searchParams] = useSearchParams();
  const categoryFilter = searchParams.get('category') || 'All';

  const networksMap: Record<string, string[]> = {
    All: [
      'Warner Bros. Pictures', 'Universal Pictures', 'Paramount Pictures', '20th Century Studios',
      'Walt Disney Pictures', 'Columbia Pictures', 'Marvel Studios', 'Pixar',
      'Netflix', 'HBO Max', 'A24', 'Sony Pictures', 'Studio Ghibli', 'DreamWorks Animation',
      'Lucasfilm', 'Prime Video', 'Apple TV+', 'Hulu', 'Illumination', 'Lionsgate'
    ],
    Movies: [
      'Warner Bros. Pictures', 'Universal Pictures', 'Paramount Pictures', '20th Century Studios',
      'Walt Disney Pictures', 'Columbia Pictures', 'Marvel Studios', 'Pixar',
      'A24', 'Sony Pictures', 'Lucasfilm', 'Lionsgate', 'New Line Cinema', 'Miramax', 
      'Legendary Pictures', 'Focus Features', 'Searchlight Pictures', 'Annapurna Pictures', 'Orion Pictures', 'Amblin Entertainment'
    ],
    Series: [
      'HBO', 'Netflix', 'AMC', 'FX', 'Showtime', 'NBC', 'CBS', 'ABC', 'Prime Video', 'Apple TV+', 
      'Hulu', 'BBC', 'Channel 4', 'The CW', 'USA Network', 'Starz', 'Syfy', 'TNT', 'Comedy Central', 'ITV'
    ],
    Animation: [
      'Pixar', 'Studio Ghibli', 'Walt Disney Animation Studios', 'DreamWorks Animation', 
      'Illumination', 'Sony Pictures Animation', 'Cartoon Network', 'Nickelodeon', 'Blue Sky Studios', 
      'Laika', 'Warner Bros. Animation', 'Netflix Animation', 'Aardman Animations', 'Wētā FX', 
      'Tatsunoko Production', 'Sunrise', 'Toei Animation', 'Hasbro Studios', 'Titmouse', 'Frederator Studios'
    ],
    Anime: [
      'Studio Ghibli', 'Madhouse', 'MAPPA', 'Ufotable', 'Bones', 'Kyoto Animation', 'Toei Animation', 
      'Sunrise', 'Wit Studio', 'A-1 Pictures', 'CloverWorks', 'J.C.Staff', 'Trigger', 'Pierrot', 
      'Production I.G', 'Shaft', 'David Production', 'White Fox', 'P.A. Works', 'Kinema Citrus'
    ],
    Asian: [
      'tvN', 'JTBC', 'SBS', 'KBS2', 'MBC', 'OCN', 'Netflix', 'Tencent Video', 'iQIYI', 'Youku', 
      'GMMTV', 'Fuji TV', 'TBS', 'NTV', 'TV Asahi', 'Viu', 'Viki', 'CCTV', 'Hunan TV', 'Mango TV'
    ],
    Indian: [
      'Yash Raj Films', 'Dharma Productions', 'Red Chillies Entertainment', 'T-Series', 'Zee Studios', 
      'Viacom18 Studios', 'Reliance Entertainment', 'Nadiadwala Grandson', 'Excel Entertainment', 
      'Madras Talkies', 'Lyca Productions', 'Hombale Films', 'Mythri Movie Makers', 'Geetha Arts', 
      'Sun Pictures', 'AVM Productions', 'Pen Studios', 'Salman Khan Films', 'Cape of Good Films', 'Bhansali Productions'
    ]
  };

  const sortedNetworks = React.useMemo(() => {
    const top20 = networksMap[categoryFilter as keyof typeof networksMap] || networksMap.All;
    const availableNetworks = bestOfData?.availableNetworks || [];
    
    // Sort dynamic networks alphabetically
    const rest = availableNetworks
      .filter((n: string) => !top20.some(t => t.toLowerCase() === n.toLowerCase()))
      .sort((a: string, b: string) => a.localeCompare(b));

    return [...top20, ...rest];
  }, [bestOfData, categoryFilter]);

  const [activeNetwork, setActiveNetwork] = useState(bestOfData?.defaultNetwork || sortedNetworks[0] || 'Warner Bros. Pictures');
  const [items, setItems] = useState<any[]>(bestOfData?.items || []);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [hasMore, setHasMore] = useState((bestOfData?.items?.length || 0) >= 20);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

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
  }, [items, isSwitching, activeNetwork]);

  // When bestOfData or categoryFilter changes, reset activeNetwork and items
  useEffect(() => {
    if (bestOfData?.defaultNetwork) {
      setActiveNetwork(bestOfData.defaultNetwork);
      setItems(bestOfData.items || []);
      setHasMore((bestOfData.items?.length || 0) >= 20);
      setIsSwitching(false);
    } else if (sortedNetworks.length > 0) {
      setActiveNetwork(sortedNetworks[0]);
      setItems([]);
      setHasMore(true);
    }
    if (scrollRef.current) scrollRef.current.scrollTo({ left: 0 });
  }, [categoryFilter, bestOfData]);

  // Synchronize items with parent data or fetch if network changed
  useEffect(() => {
    // If it matches the current bestOfData payload, no need to re-fetch
    if (activeNetwork === bestOfData?.defaultNetwork && bestOfData?.items && bestOfData.items.length > 0) {
      setItems(bestOfData.items);
      setHasMore((bestOfData.items?.length || 0) >= 20);
      setIsSwitching(false);
      return;
    }
    if (!activeNetwork) return;

    let isMounted = true;
    setIsSwitching(true);

    // Timeout safety fallback so it NEVER gets stuck
    const safetyTimer = setTimeout(() => {
      if (isMounted) setIsSwitching(false);
    }, 6000);

    const controller = new AbortController();

    const fetchNewNetwork = async () => {
      try {
        const res = await fetch(`/api/home/carousel?type=best_of&category=${encodeURIComponent(categoryFilter)}&subFilter=${encodeURIComponent(activeNetwork)}&offset=0&limit=20`, {
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
          console.error(e);
        }
      } finally {
        clearTimeout(safetyTimer);
        if (isMounted) {
          setIsSwitching(false);
          setLoadingMore(false);
        }
      }
    };
    fetchNewNetwork();
    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
      controller.abort();
    };
  }, [activeNetwork, categoryFilter]);

  const loadMore = async () => {
    if (loadingMore || isSwitching || !hasMore || items.length >= 50) return;
    
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/home/carousel?type=best_of&category=${encodeURIComponent(categoryFilter)}&subFilter=${encodeURIComponent(activeNetwork)}&offset=${items.length}&limit=10`);
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
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  };

  const { watchlistIds, toggleWatchlist } = useData();
  const navigate = useNavigate();

  const handleBookmarkClick = async (e: React.MouseEvent, contentId: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      navigate('/login');
      return;
    }

    await toggleWatchlist(contentId);
  };

  const handleScroll = () => {
    checkScrollButtons();
    if (scrollRef.current) {
      const { scrollLeft, clientWidth, scrollWidth } = scrollRef.current;
      if (scrollLeft + clientWidth >= scrollWidth - 600) {
        loadMore();
      }
    }
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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!activeNetwork && items.length === 0 && !isSwitching) return null;

  return (
    <div className={`w-full relative ${isDropdownOpen ? 'z-50' : 'z-20'}`}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6 px-4 sm:px-0">
        <div className="flex items-center gap-4">
          <Link to="#" className="flex items-center gap-1 group">
            <h2 className="text-xl sm:text-2xl font-poppins font-bold text-white tracking-tight group-hover:text-white/80 transition-colors">Best of</h2>
            <ChevronRightIcon className="w-5 h-5 text-white/50 group-hover:text-white transition-colors mt-0.5" />
          </Link>
          
          {/* Custom Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button 
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center justify-between gap-2 px-4 py-1.5 bg-[#1a1a1a] border border-white/10 rounded-full text-sm font-medium text-white min-w-[140px]"
            >
              <span className="truncate max-w-[140px] flex items-center gap-1.5">
                {isSwitching && <Loader2 className="w-3.5 h-3.5 text-brand-primary animate-spin inline-block" />}
                {activeNetwork}
              </span>
              <ChevronDown className="w-4 h-4 text-white/60" />
            </button>
            
            {isDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 w-48 bg-[#2a2a2a] border border-white/10 rounded-xl shadow-xl overflow-hidden z-50 py-1">
                <div className="max-h-64 overflow-y-auto">
                  {sortedNetworks.map(network => (
                    <button
                      key={network}
                      onClick={() => {
                        setActiveNetwork(network);
                        setIsDropdownOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                        activeNetwork === network 
                          ? 'bg-blue-500/20 text-[#60a5fa]' 
                          : 'text-white/80 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      {network}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
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
            {items.length === 0 ? (
              <div className="w-full py-12 flex items-center justify-center text-white/50 text-sm">
                No content found for {activeNetwork}.
              </div>
            ) : (
              items.map((item) => {
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
                      className="relative aspect-[2/3] w-full overflow-hidden bg-brand-card/50 transition-all duration-300 group-hover/card:shadow-[0_0_20px_rgba(255,255,255,0.1)] mb-3"
                      style={{ 
                        borderRadius: '16px',
                        clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 24px), calc(100% - 24px) 100%, 0 100%)'
                      }}
                    >
                      <img 
                        src={item.posterUrl ? item.posterUrl.replace('/w500/', '/w342/') : ''} 
                        alt={item.title} 
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover/card:scale-110 z-10"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 via-transparent to-transparent opacity-60 z-20" />
                      
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
              })
            )}
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
