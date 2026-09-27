import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Star, ChevronLeft, ChevronRight, ChevronRight as ChevronRightIcon, ChevronDown, Bookmark, Loader2 } from 'lucide-react';
import { ContentItem } from '../types';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { auth } from '../utils/firebase';
import CarouselCardsSkeleton from './CarouselCardsSkeleton';

interface GenreCarouselProps {
  genresData: any;
}

function orderGenres(genres: string[]): string[] {
  if (!genres || !Array.isArray(genres) || genres.length === 0) return [];
  const list = [...genres];
  const actionIdx = list.findIndex(g => g.toLowerCase() === 'action');
  const dramaIdx = list.findIndex(g => g.toLowerCase() === 'drama');

  if (actionIdx !== -1 && dramaIdx !== -1) {
    const actionItem = list[actionIdx];
    const dramaItem = list[dramaIdx];
    const remaining = list.filter(g => g.toLowerCase() !== 'action' && g.toLowerCase() !== 'drama');
    return [actionItem, ...remaining.slice(0, 3), dramaItem, ...remaining.slice(3)];
  } else if (actionIdx !== -1) {
    const actionItem = list[actionIdx];
    const remaining = list.filter(g => g.toLowerCase() !== 'action');
    return [actionItem, ...remaining];
  }
  return list;
}

export default function GenreCarousel({ genresData }: GenreCarouselProps) {
  const { user } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();
  const categoryFilter = searchParams.get('category'); // 'Movies', 'Series', 'Animation', etc.
  
  // Category logic (Dropdown 1)
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const allCategories = ['Movie', 'TV Show', 'Animation', 'Anime', 'Asian', 'Indian'];
  const [selectedCategory, setSelectedCategory] = useState(allCategories[0]);
  
  // Genre logic (Dropdown 2)
  const [isGenreDropdownOpen, setIsGenreDropdownOpen] = useState(false);
  const genreDropdownRef = useRef<HTMLDivElement>(null);
  
  // If categoryFilter is present, use it. Otherwise use selectedCategory.
  const activeCategoryForFilter = categoryFilter || selectedCategory;

  const fallbackGenres = ['Action', 'Comedy', 'Thriller', 'Romance', 'Drama', 'Crime', 'Horror', 'Sci-Fi', 'Fantasy'];
  const initialGenres = orderGenres(
    genresData?.availableGenres && genresData.availableGenres.length > 0 ? genresData.availableGenres : fallbackGenres
  );
  const [availableGenresList, setAvailableGenresList] = useState<string[]>(initialGenres);
  
  const [selectedGenre, setSelectedGenre] = useState(
    genresData?.defaultGenre === 'Action' || !genresData?.defaultGenre 
      ? (initialGenres[0] || 'Action') 
      : genresData.defaultGenre
  );

  const { watchlistIds, toggleWatchlist } = useData();
  const navigate = useNavigate();

  const [items, setItems] = useState<any[]>(genresData?.items || []);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [hasMore, setHasMore] = useState((genresData?.items?.length || 0) >= 20);
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
  }, [items, isSwitching, selectedGenre, selectedCategory]);

  // When genresData or categoryFilter changes, reset
  useEffect(() => {
    if (genresData?.availableGenres && genresData.availableGenres.length > 0) {
      const ordered = orderGenres(genresData.availableGenres);
      setAvailableGenresList(ordered);
      if (!selectedGenre || !ordered.includes(selectedGenre)) {
        setSelectedGenre(ordered[0] || 'Action');
      }
    }
    if (genresData?.defaultGenre) {
      setSelectedGenre(genresData.defaultGenre);
    }
  }, [categoryFilter, genresData]);

  // Fetch when category or genre changes
  useEffect(() => {
    if (!selectedGenre) return;
    
    let isMounted = true;
    setIsSwitching(true);

    // Safety timeout so it NEVER gets stuck
    const safetyTimer = setTimeout(() => {
      if (isMounted) setIsSwitching(false);
    }, 6000);

    const controller = new AbortController();

    const fetchNewGenre = async () => {
      try {
        const res = await fetch(`/api/home/carousel?type=genres&category=${encodeURIComponent(activeCategoryForFilter || 'All')}&subFilter=${encodeURIComponent(selectedGenre)}&offset=0&limit=20`, {
          signal: controller.signal
        });
        if (res.ok && isMounted) {
          const data = await res.json();
          setItems(data.items || []);
          setHasMore(data.hasMore && (data.items || []).length < 50);
          if (data.availableGenres && data.availableGenres.length > 0) {
            const ordered = orderGenres(data.availableGenres);
            setAvailableGenresList(ordered);
            if (!ordered.includes(selectedGenre)) {
              setSelectedGenre(ordered[0] || 'Action');
            }
          }
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
    fetchNewGenre();
    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
      controller.abort();
    };
  }, [selectedGenre, activeCategoryForFilter]);

  const loadMore = async () => {
    if (loadingMore || isSwitching || !hasMore || items.length >= 50) return;
    
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/home/carousel?type=genres&category=${encodeURIComponent(activeCategoryForFilter || 'All')}&subFilter=${encodeURIComponent(selectedGenre)}&offset=${items.length}&limit=10`);
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

  const handleScroll = () => {
    checkScrollButtons();
    if (scrollRef.current) {
      const { scrollLeft, clientWidth, scrollWidth } = scrollRef.current;
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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setIsCategoryDropdownOpen(false);
      }
      if (genreDropdownRef.current && !genreDropdownRef.current.contains(event.target as Node)) {
        setIsGenreDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!selectedGenre && items.length === 0 && !isSwitching) return null;

  return (
    <div className={`w-full relative ${(isCategoryDropdownOpen || isGenreDropdownOpen) ? 'z-50' : 'z-20'}`}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6 px-4 sm:px-0">
        <Link to="#" className="flex items-center gap-1 group">
          <h2 className="text-xl sm:text-2xl font-poppins font-bold text-white tracking-tight group-hover:text-white/80 transition-colors">
            {categoryFilter ? `${categoryFilter === 'Series' ? 'TV Show' : categoryFilter === 'Movies' ? 'Movie' : categoryFilter} Genre` : 'Genre'}
          </h2>
          <ChevronRightIcon className="w-5 h-5 text-white/50 group-hover:text-white transition-colors mt-0.5" />
        </Link>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Category Dropdown (Only show if not on a specific category page) */}
          {!categoryFilter && (
            <div className="relative" ref={categoryDropdownRef}>
              <button
                onClick={() => {
                  setIsCategoryDropdownOpen(!isCategoryDropdownOpen);
                  setIsGenreDropdownOpen(false);
                }}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-[#1a1a1a] border border-white/10 rounded-full hover:bg-[#2a2a2a] transition-colors text-white min-w-[120px] justify-between"
              >
                <span>{selectedCategory}</span>
                <ChevronDown className={`w-4 h-4 text-white/60 transition-transform ${isCategoryDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isCategoryDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 w-48 bg-[#2a2a2a] border border-white/10 rounded-xl shadow-xl overflow-hidden z-50 py-1">
                  <div className="max-h-64 overflow-y-auto">
                    {allCategories.map(cat => (
                      <button
                        key={cat}
                        onClick={() => {
                          setSelectedCategory(cat);
                          setIsCategoryDropdownOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-white/10 transition-colors ${
                          selectedCategory === cat ? 'text-brand-primary font-bold bg-white/5' : 'text-white'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Genre Dropdown */}
          <div className="relative" ref={genreDropdownRef}>
            <button
              onClick={() => {
                setIsGenreDropdownOpen(!isGenreDropdownOpen);
                setIsCategoryDropdownOpen(false);
              }}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-[#1a1a1a] border border-white/10 rounded-full hover:bg-[#2a2a2a] transition-colors text-white min-w-[140px] justify-between"
            >
              <span className="truncate max-w-[120px] flex items-center gap-1.5">
                {isSwitching && <Loader2 className="w-3.5 h-3.5 text-brand-primary animate-spin inline-block" />}
                {selectedGenre}
              </span>
              <ChevronDown className={`w-4 h-4 text-white/60 transition-transform ${isGenreDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isGenreDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 w-48 bg-[#2a2a2a] border border-white/10 rounded-xl shadow-xl overflow-hidden z-50 py-1">
                <div className="max-h-64 overflow-y-auto py-1">
                  {availableGenresList.map((genre: string) => (
                    <button
                      key={genre}
                      onClick={() => {
                        setSelectedGenre(genre);
                        setIsGenreDropdownOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-white/10 transition-colors ${
                        selectedGenre === genre ? 'text-brand-primary font-bold bg-white/5' : 'text-white'
                      }`}
                    >
                      {genre}
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
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-10 p-2 rounded-full glass bg-black/50 hover:bg-brand-primary text-white transition-colors opacity-0 group-hover:opacity-100 hidden sm:block cursor-pointer shadow-lg"
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
            className="flex overflow-x-auto gap-3 sm:gap-4 pb-6 px-4 sm:px-0 snap-x snap-mandatory animate-in fade-in duration-200"
          >
            {items.map((item) => {
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
                        src={item.posterUrl || item.backdropUrl} 
                        alt={item.title} 
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover transition-transform duration-700 group-hover/card:scale-110"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-gray-900/80 via-transparent to-transparent opacity-60" />
                      
                      {/* Small decorative triangle in the cut */}
                      <div 
                        className="absolute bottom-0 right-0 w-6 h-6 bg-[#1a1a1a]/80 backdrop-blur-md"
                        style={{
                          clipPath: 'polygon(100% 0, 0 100%, 100% 100%)'
                        }}
                      />
                      
                      {/* Bookmark Button */}
                      <button
                        onClick={(e) => handleBookmarkClick(e, item.id)}
                        className={`absolute top-2 right-2 z-20 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer backdrop-blur-md border ${
                          isBookmarked
                            ? 'bg-gradient-to-br from-[#FF8C00] to-[#FFA726] border-[#FF8C00] text-[#070B14] shadow-[0_4px_12px_rgba(255,140,0,0.35)] hover:scale-110'
                            : 'bg-black/40 border-white/10 text-white/80 hover:bg-black/60 hover:text-white hover:border-white/20 hover:scale-110'
                        }`}
                        title={isBookmarked ? "Remove from Watch Later" : "Add to Watch Later"}
                      >
                        <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`} />
                      </button>
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
            })}
          </div>
        )}

        {canScrollRight && (
          <button 
            onClick={scrollRight} 
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-10 p-2 rounded-full glass bg-black/50 hover:bg-brand-primary text-white transition-colors opacity-0 group-hover:opacity-100 hidden sm:block cursor-pointer shadow-lg"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}
