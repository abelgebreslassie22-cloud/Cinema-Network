import { ContentItem } from '../types';
import ContentCard from './ContentCard';
import { motion } from 'motion/react';
import React, { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ContentGridProps {
  title?: string;
  items: ContentItem[];
  scrollable?: boolean;
}

export default function ContentGrid({ title, items, scrollable = false }: ContentGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(60);

  if (items.length === 0) {
    return null;
  }

  const scrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -320, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 320, behavior: 'smooth' });
    }
  };

  const displayedItems = scrollable ? items : items.slice(0, visibleCount);

  return (
    <div className="mb-16">
      {title && (
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4 flex-grow">
            <h2 className="text-2xl font-poppins font-bold text-white whitespace-nowrap">{title}</h2>
            <div className="flex-grow h-px bg-gradient-to-r from-white/10 to-transparent" />
          </div>
          {scrollable && (
            <div className="hidden sm:flex items-center gap-2">
              <button 
                onClick={scrollLeft} 
                className="p-2 rounded-xl glass bg-white/5 hover:bg-white/10 text-white transition-colors border border-white/5 hover:border-white/10"
                aria-label="Scroll left"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button 
                onClick={scrollRight} 
                className="p-2 rounded-xl glass bg-white/5 hover:bg-white/10 text-white transition-colors border border-white/5 hover:border-white/10"
                aria-label="Scroll right"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      )}

      {scrollable ? (
        <div className="relative -mx-4 px-4 sm:mx-0 sm:px-0">
          <div
            ref={scrollRef}
            className="flex overflow-x-auto gap-4 sm:gap-6 pb-6 snap-x snap-mandatory"
            
          >
            {displayedItems.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: (index % 6) * 0.05 }}
                className="flex-shrink-0 w-[160px] sm:w-[200px] md:w-[220px] snap-start"
              >
                <ContentCard item={item} />
              </motion.div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div 
            data-testid="search-results-grid"
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6"
          >
            {displayedItems.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: (index % 6) * 0.05 }}
              >
                <ContentCard item={item} />
              </motion.div>
            ))}
          </div>
          {!scrollable && items.length > visibleCount && (
            <div className="mt-12 flex justify-center">
              <button
                onClick={() => setVisibleCount(prev => prev + 60)}
                className="px-8 py-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium transition-all hover:scale-105 active:scale-95"
              >
                Load More
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
