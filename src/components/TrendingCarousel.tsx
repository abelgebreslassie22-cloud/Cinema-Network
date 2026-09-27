import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Star, ChevronLeft, ChevronRight, ChevronRight as ChevronRightIcon, Bookmark } from 'lucide-react';
import { ContentItem } from '../types';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { auth } from '../utils/firebase';
import { getStartOfTodayUTC3 } from '../utils/dateUtils';

interface TrendingCarouselProps {
  title: string;
  items: ContentItem[];
}

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

export default function TrendingCarousel({ title, items }: TrendingCarouselProps) {
  const { user } = useAuth();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeFilter, setActiveFilter] = useState('Day');
  const [isSwitching, setIsSwitching] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const filters = ['Day', 'Week', 'Month'];

  const { watchlistIds, toggleWatchlist, views = [], downloads = [] } = useData();
  const navigate = useNavigate();

  const checkScrollButtons = () => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
  };

  const sortedItems = useMemo(() => {
    const startOfToday = getStartOfTodayUTC3();
    let cutoff = startOfToday;
    if (activeFilter === 'Day') {
      cutoff = startOfToday; // New day starts at 00:00:00 UTC+3
    } else if (activeFilter === 'Week') {
      cutoff = startOfToday - 6 * 24 * 60 * 60 * 1000;
    } else if (activeFilter === 'Month') {
      cutoff = startOfToday - 29 * 24 * 60 * 60 * 1000;
    }

    const downloadCounts: Record<string, number> = {};
    const totalDownloadCounts: Record<string, number> = {};
    const viewCounts: Record<string, number> = {};

    for (let i = 0; i < downloads.length; i++) {
      const d = downloads[i];
      const vid = d.contentId || d.id;
      if (!vid) continue;
      const ts = parseTimestamp(d.timestamp);

      totalDownloadCounts[vid] = (totalDownloadCounts[vid] || 0) + 1;
      if (ts >= cutoff) {
        downloadCounts[vid] = (downloadCounts[vid] || 0) + 1;
      }
    }

    for (let i = 0; i < views.length; i++) {
      const v = views[i];
      const vid = v.contentId || v.id;
      if (!vid) continue;
      const ts = parseTimestamp(v.timestamp);

      if (ts >= cutoff) {
        viewCounts[vid] = (viewCounts[vid] || 0) + 1;
      }
    }

    return [...items]
      .sort((a, b) => {
        // Downloads in selected window get highest weight (100 pts each)
        // Views in selected window get secondary weight (1 pt each)
        // Total downloads get tertiary weight (0.1 pt each)
        const scoreA = (downloadCounts[a.id] || 0) * 100 + (viewCounts[a.id] || 0) * 1 + (totalDownloadCounts[a.id] || 0) * 0.1;
        const scoreB = (downloadCounts[b.id] || 0) * 100 + (viewCounts[b.id] || 0) * 1 + (totalDownloadCounts[b.id] || 0) * 0.1;

        if (scoreB !== scoreA) {
          return scoreB - scoreA;
        }
        const ratingDiff = (Number(b.rating) || 0) - (Number(a.rating) || 0);
        if (Math.abs(ratingDiff) > 0.01) return ratingDiff;
        return (b.year || 0) - (a.year || 0);
      })
      .slice(0, 12);
  }, [items, views, downloads, activeFilter]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScrollButtons();

    const resizeObserver = new ResizeObserver(() => {
      checkScrollButtons();
    });
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, [sortedItems, isSwitching, activeFilter]);

  const handleFilterChange = (filter: string) => {
    if (filter === activeFilter) return;
    setIsSwitching(true);
    setActiveFilter(filter);
    if (scrollRef.current) scrollRef.current.scrollTo({ left: 0 });
    setTimeout(() => {
      setIsSwitching(false);
    }, 280);
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
      scrollRef.current.scrollBy({ left: -400, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 400, behavior: 'smooth' });
    }
  };

  if (sortedItems.length === 0 && !isSwitching) return null;

  return (
    <div className="w-full relative z-20">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6 px-4 sm:px-0">
        <Link to="#" className="flex items-center gap-1 group">
          <h2 className="text-xl sm:text-2xl font-poppins font-bold text-white tracking-tight group-hover:text-white/80 transition-colors">{title}</h2>
          <ChevronRightIcon className="w-5 h-5 text-white/50 group-hover:text-white transition-colors mt-0.5" />
        </Link>
        
        <div className="flex items-center bg-[#1a1a1a] rounded-full p-1 border border-white/10 w-fit">
          {filters.map(filter => (
            <button
              key={filter}
              onClick={() => handleFilterChange(filter)}
              className={`px-4 py-1.5 text-xs sm:text-sm font-medium rounded-full transition-all ${
                activeFilter === filter 
                  ? 'bg-white text-black shadow-sm' 
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              {filter}
            </button>
          ))}
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
          <div className="flex overflow-x-auto gap-4 sm:gap-6 pb-6 px-4 sm:px-0 snap-x snap-mandatory">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex-shrink-0 w-[280px] sm:w-[320px] md:w-[380px]">
                <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-white/[0.04] border border-white/10">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent animate-shimmer" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div 
            ref={scrollRef}
            onScroll={checkScrollButtons}
            className="flex overflow-x-auto gap-4 sm:gap-6 pb-6 px-4 sm:px-0 snap-x snap-mandatory animate-in fade-in duration-200"
          >
            {sortedItems.map((item, i) => {
              const fallbackImage = item.posterUrl || item.backdropUrl;
              const isBookmarked = watchlistIds.includes(item.id);
              return (
                <Link 
                  key={item.id} 
                  to={`/title/${item.id}`}
                  className="flex-shrink-0 w-[280px] sm:w-[320px] md:w-[380px] snap-start group/card outline-none"
                >
                  <div 
                    className="relative aspect-video w-full overflow-hidden bg-brand-card/50 transition-all duration-300 group-hover/card:shadow-[0_0_20px_rgba(255,255,255,0.1)] border border-white/10"
                    style={{ 
                      borderRadius: '16px',
                    }}
                  >
                    <img 
                      src={item.backdropUrl || fallbackImage} 
                      alt={item.title} 
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover transition-transform duration-700 group-hover/card:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/40 to-transparent opacity-90" />
                    
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
                    
                    {/* Content Info and Ranking Number */}
                    <div className="absolute bottom-3 left-4 right-4 flex items-end gap-3">
                      {/* Ranking Number */}
                      <div className="flex-shrink-0 relative">
                        <span className="text-5xl sm:text-6xl font-black italic tracking-tighter"
                              style={{
                                color: 'transparent',
                                WebkitTextStroke: '2px #ffb800',
                                backgroundImage: 'repeating-linear-gradient(45deg, #ffb800 0, #ffb800 2px, transparent 2px, transparent 6px)',
                                WebkitBackgroundClip: 'text',
                                backgroundClip: 'text',
                                textShadow: '0 4px 10px rgba(0,0,0,0.5)',
                              }}>
                          {i + 1}
                        </span>
                      </div>

                      <div className="pb-1 overflow-hidden">
                        <h3 className="font-poppins font-bold text-white truncate text-base sm:text-lg group-hover/card:text-brand-primary transition-colors">
                          {item.title}
                        </h3>
                        
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex items-center gap-1">
                            <Star className="w-3.5 h-3.5 text-brand-primary fill-brand-primary" />
                            <span className="text-white text-xs font-semibold">{Number(item.rating || 0).toFixed(1)}</span>
                          </div>
                          <span className="text-white/60 text-[10px]">&bull;</span>
                          <div className="">
                            <span className="text-white/80 text-xs font-semibold">{item.year}</span>
                          </div>
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
