import React, { useRef, useMemo, useState, useEffect } from 'react';
import { ContentItem } from '../types';
import { Star, Target, ChevronRight, ChevronLeft, ShieldAlert, Bookmark } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { SimilarContentResult } from '../utils/recommendations';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { auth } from '../utils/firebase';

interface SimilarContentCarouselProps {
  results: any[];
}

export default function SimilarContentCarousel({ results }: SimilarContentCarouselProps) {
  const { user } = useAuth();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const isAdmin = localStorage.getItem('isAdmin') === 'true';

  const { watchlistIds, toggleWatchlist } = useData();
  const navigate = useNavigate();

  const sortedResults = useMemo(() => {
    return results;
  }, [results]);

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
  }, [sortedResults]);

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

  if (results.length === 0) return null;

  return (
    <div className="w-full relative z-20">
      <div className="flex items-center gap-3 mb-6 px-4 sm:px-0">
        <Target className="w-6 h-6 text-brand-primary" />
        <h2 className="text-xl sm:text-2xl font-poppins font-bold text-white tracking-tight">You May Also Like</h2>
        <div className="flex-grow h-px bg-gradient-to-r from-white/10 to-transparent ml-4" />
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

        <div 
          ref={scrollRef}
          onScroll={checkScrollButtons}
          className="flex overflow-x-auto gap-4 sm:gap-6 pb-6 px-4 sm:px-0 snap-x snap-mandatory animate-in fade-in duration-200"
        >
          {sortedResults.map((item) => {
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
                    
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex items-center gap-1 bg-transparent border border-white/10 rounded-full px-2 py-0.5">
                        <Star className="w-3 h-3 text-brand-primary fill-brand-primary" />
                        <span className="text-white text-xs font-semibold">{Number(item.rating || 0).toFixed(1)}</span>
                      </div>
                      {item.year && (
                        <div className="bg-transparent border border-white/10 rounded-full px-2 py-0.5">
                          <span className="text-white/60 text-xs font-semibold">{item.year}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

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
