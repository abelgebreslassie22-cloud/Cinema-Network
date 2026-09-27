import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { ContentItem } from '../types';

interface FranchisesCarouselProps {
  items: any[];
}

export default function FranchisesCarousel({ items }: FranchisesCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(20);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScrollButtons = () => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
  };

  const franchises = useMemo(() => {
    if (!items || items.length === 0) return [];

    // Check if items are already pre-computed franchise objects
    const isPrecomputed = items.length > 0 && items[0] && ('count' in items[0]) && ('posters' in items[0]);
    if (isPrecomputed) {
      return items.map((f: any) => ({
        id: f.id || f.name || '',
        name: f.name || '',
        count: f.count || 0,
        yearRange: f.yearRange || '',
        avgRating: String(f.avgRating || '0.0'),
        numAvgRating: typeof f.numAvgRating === 'number' ? f.numAvgRating : parseFloat(f.avgRating || 0) || 0,
        posters: Array.isArray(f.posters) ? f.posters.slice(0, 5) : [],
        description: f.description || ''
      }));
    }

    const franchiseMap = new Map<string, ContentItem[]>();
    const namesMap = new Map<string, string>();

    items.forEach(item => {
      let name = (item.franchiseName || item.franchise || '').trim();
      let franchiseId = item.franchiseId || null;

      if (name || franchiseId) {
        const key = franchiseId ? `id_${franchiseId}` : `name_${name.toLowerCase()}`;
        if (!franchiseMap.has(key)) {
          franchiseMap.set(key, []);
          if (name) namesMap.set(key, name);
        }
        
        // Avoid duplicate items inside the same franchise group
        const existing = franchiseMap.get(key)!;
        if (!existing.some(e => e.id === item.id || (e.title && item.title && e.title.toLowerCase() === item.title.toLowerCase()))) {
          existing.push(item);
        }
      }
    });

    return Array.from(franchiseMap.entries()).map(([key, groupItems]) => {
      groupItems.sort((a, b) => (a.year || 0) - (b.year || 0));
      const firstYear = groupItems[0]?.year || '';
      const lastYear = groupItems[groupItems.length - 1]?.year || '';
      const yearRange = firstYear === lastYear ? `${firstYear}` : `${firstYear}-${lastYear}`;
      const avgRating = (groupItems.reduce((acc, curr) => acc + (curr.rating || 0), 0) / groupItems.length).toFixed(1);
      
      const posters = groupItems.map(item => item.posterUrl ? item.posterUrl.replace('/w500/', '/w342/') : '').filter(Boolean);
      const displayPosters = posters.slice(0, 5);

      const name = namesMap.get(key) || 'Unknown Franchise';
      const id = key.startsWith('id_') ? key.replace('id_', '') : name;

      return {
        id,
        name,
        count: groupItems.length,
        yearRange,
        avgRating,
        numAvgRating: parseFloat(avgRating) || 0,
        posters: displayPosters,
        description: groupItems[0]?.franchiseDescription || groupItems[0]?.description || ''
      };
    })
    // Only display franchises that have 2 or more movies in the database (or explicit name)
    .filter(f => f.count >= 2 || f.name.length > 0)
    .sort((a, b) => b.count - a.count || b.numAvgRating - a.numAvgRating);
  }, [items]);

  // Reset visibleCount when items change
  useEffect(() => {
    setVisibleCount(20);
  }, [items]);

  const displayedFranchises = useMemo(() => {
    return franchises.slice(0, visibleCount);
  }, [franchises, visibleCount]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScrollButtons();

    const resizeObserver = new ResizeObserver(() => {
      checkScrollButtons();
    });
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, [displayedFranchises]);

  const handleScroll = () => {
    checkScrollButtons();
    if (scrollRef.current) {
      const { scrollLeft, clientWidth, scrollWidth } = scrollRef.current;
      if (scrollLeft + clientWidth >= scrollWidth - 450) {
        setVisibleCount(prev => Math.min(prev + 10, franchises.length));
      }
    }
  };

  const scrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -450, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 450, behavior: 'smooth' });
      setVisibleCount(prev => Math.min(prev + 10, franchises.length));
    }
  };

  if (franchises.length === 0) return null;

  return (
    <div id="franchises-section" className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 id="franchises-heading" className="flex items-center gap-2 text-2xl font-poppins font-bold text-white">
          Franchises
          <ChevronRight className="w-6 h-6 text-brand-muted" />
        </h2>
      </div>

      <div className="relative group/carousel">
        {canScrollLeft && (
          <button 
            id="franchise-hover-scroll-left"
            onClick={scrollLeft} 
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-30 p-2 rounded-full glass bg-black/70 hover:bg-brand-primary text-white transition-all opacity-0 group-hover/carousel:opacity-100 hidden sm:block shadow-lg cursor-pointer"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        <div 
          id="franchise-carousel-container"
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex overflow-x-auto gap-4 sm:gap-6 pb-6 snap-x snap-mandatory"
        >
          {displayedFranchises.map((franchise) => (
            <Link 
              key={franchise.id || franchise.name}
              id={`franchise-card-${encodeURIComponent(franchise.name).toLowerCase()}`}
              to={`/franchise/${encodeURIComponent(franchise.id || franchise.name)}`}
              className="snap-start shrink-0 w-[300px] sm:w-[400px] md:w-[450px] bg-[#151B2D] border border-white/5 rounded-2xl overflow-hidden hover:border-brand-primary/30 transition-all flex h-[220px] group/card"
            >
              <div className="w-1/2 p-5 flex flex-col justify-between">
                <div>
                  <h3 className="font-poppins font-semibold text-white text-lg line-clamp-2 leading-tight mb-2 group-hover/card:text-brand-primary transition-colors">
                    {franchise.name}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-brand-muted mb-2 font-mono">
                    <span>{franchise.count} titles</span>
                    <span>•</span>
                    <span>{franchise.yearRange}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="flex items-center text-brand-secondary font-medium">
                      <Star className="w-3 h-3 fill-current mr-1" />
                      {franchise.avgRating} avg
                    </span>
                  </div>
                </div>
                <p className="text-xs text-white/60 line-clamp-3 mt-4">
                  {franchise.description}
                </p>
              </div>
              <div className="w-1/2 relative overflow-hidden bg-black flex -space-x-4 p-4 items-center justify-end">
                {franchise.posters.map((poster, idx) => (
                  <div 
                    key={idx} 
                    className="relative shrink-0 rounded-lg overflow-hidden border border-white/10 shadow-xl transition-transform duration-300 group-hover/card:scale-105"
                    style={{ 
                      zIndex: idx, 
                      width: '80px', 
                      height: '120px',
                      transform: `rotate(${(idx - (franchise.posters.length-1)/2) * 5}deg) scale(${1 - (franchise.posters.length - 1 - idx) * 0.05})`,
                      transformOrigin: 'center'
                    }}
                  >
                    <img 
                      src={poster} 
                      alt="" 
                      loading="lazy" 
                      decoding="async" 
                      referrerPolicy="no-referrer" 
                      className="w-full h-full object-cover" 
                    />
                  </div>
                ))}
              </div>
            </Link>
          ))}
        </div>

        {canScrollRight && (
          <button 
            id="franchise-hover-scroll-right"
            onClick={scrollRight} 
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-30 p-2 rounded-full glass bg-black/70 hover:bg-brand-primary text-white transition-all opacity-0 group-hover/carousel:opacity-100 hidden sm:block shadow-lg cursor-pointer"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}
