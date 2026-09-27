import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Star, Bookmark } from 'lucide-react';
import { ContentItem } from '../types';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';

export default function ContentCard({ item }: { item: ContentItem }) {
  const { user } = useAuth();
  const { watchlistIds, toggleWatchlist } = useData();
  const navigate = useNavigate();
  const isBookmarked = watchlistIds.includes(item.id);

  const handleBookmarkClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      navigate('/login');
      return;
    }

    await toggleWatchlist(item.id);
  };

  const displayYear = item.year || (item as any).release_date?.slice(0, 4) || (item as any).releaseDate?.slice(0, 4);

  return (
    <Link 
      to={`/title/${item.id}`} 
      data-testid="search-result-card"
      data-item-title={item.title}
      data-item-year={displayYear}
      data-item-type={(item as any).type || (item as any).media_type || item.category}
      className="group/card outline-none block w-full"
    >
      <div className="relative">
        {/* Image Container with signature chamfered cut corner */}
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
            onClick={handleBookmarkClick}
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
            {displayYear && (
              <div className="bg-transparent border border-white/10 rounded-full px-2 py-0.5">
                <span className="text-white/60 text-xs font-semibold">{displayYear}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
