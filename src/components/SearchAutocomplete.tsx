import React, { useState, useEffect, useRef } from 'react';
import { Search, X, ArrowRight, SearchX, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ContentItem } from '../types';
import { searchContent } from '../utils/search';
import { useData } from '../context/DataContext';
import { getDisplayCategory } from '../utils/format';

interface Props {
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  onSearch?: (query: string) => void;
  initialValue?: string;
  variant?: 'hero' | 'navbar';
}

export default function SearchAutocomplete({ 
  className = '', 
  placeholder = 'Search Movies',
  autoFocus = false,
  onSearch,
  initialValue = '',
  variant = 'hero'
}: Props) {
  
  const [query, setQuery] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<ContentItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef<HTMLFormElement>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const categoryParam = searchParams.get('category');

  useEffect(() => {
    setQuery(initialValue);
  }, [initialValue]);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      setShowSuggestions(false);
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    const abortController = new AbortController();
    setIsSearching(true);
    
    const debounceTimer = setTimeout(() => {
      const activeCategory = categoryParam || '';
      
      const url = activeCategory
        ? `/api/content/search-suggestions?q=${encodeURIComponent(trimmedQuery)}&category=${encodeURIComponent(activeCategory)}`
        : `/api/content/search-suggestions?q=${encodeURIComponent(trimmedQuery)}`;

      fetch(url, { signal: abortController.signal })
        .then(r => r.json())
        .then(data => {
          setSuggestions(data);
          setShowSuggestions(true);
          setIsSearching(false);
        })
        .catch(err => {
          if (err.name === 'AbortError') return;
          console.error(err);
          setIsSearching(false);
        });
    }, 450);

    return () => {
      clearTimeout(debounceTimer);
      abortController.abort();
    };
  }, [query, categoryParam]);

  // Handle click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length >= 2) {
      setShowSuggestions(false);
      if (onSearch) {
        onSearch(query);
      } else {
        if (categoryParam) {
          navigate(`/search?q=${encodeURIComponent(query)}&category=${encodeURIComponent(categoryParam)}`);
        } else {
          navigate(`/search?q=${encodeURIComponent(query)}`);
        }
      }
    }
  };

  const isNavbar = variant === 'navbar';

  // Dynamic placeholder text matching current section context
  const getDynamicPlaceholder = () => {
    if (placeholder !== 'Search Movies') return placeholder;
    if (categoryParam === 'Series') return 'Search TV Shows';
    if (categoryParam === 'Animation') return 'Search Animations';
    if (categoryParam === 'Anime') return 'Search Anime';
    if (categoryParam === 'Asian') return 'Search Asian Dramas';
    if (categoryParam === 'Indian') return 'Search Indian Cinema';
    return 'Search Movies';
  };

  return (
    <form ref={wrapperRef} onSubmit={handleSubmit} className={`relative w-full z-40 ${className}`}>
      {/* Glow Effect behind the input on focus */}
      <div className={`absolute inset-0 bg-[#FF8C00]/5 rounded-full blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 pointer-events-none`} />

      {/* Main glass input container */}
      <div className={`relative flex items-center w-full rounded-full bg-white/[0.04] backdrop-blur-[20px] border border-white/5 shadow-[0_12px_32px_rgba(0,0,0,0.3)] transition-all duration-300 focus-within:border-white/10 focus-within:bg-white/[0.07] overflow-hidden group ${
        isNavbar ? 'h-[44px]' : 'h-[82px] rounded-[24px]'
      }`}>
        
        
        {/* Large search icon */}
        <div className={`flex items-center pointer-events-none shrink-0 ${isNavbar ? 'pl-4' : 'pl-6'}`}>
          <Search className={`text-[#7D8597] group-focus-within:text-[#FF8C00] transition-colors duration-300 ${
            isNavbar ? 'h-4 w-4' : 'h-6 w-6'
          }`} />
        </div>

        {/* Input area */}
        <input 
          id="site-search-input"
          data-testid="site-search-input"
          type="text" 
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          onFocus={() => {
            if (query.trim().length > 0) setShowSuggestions(true);
          }}
          placeholder={getDynamicPlaceholder()}
          autoFocus={autoFocus}
          className={`w-full bg-transparent text-white focus:outline-none h-full ${
            isNavbar 
              ? 'pl-3 pr-10 text-[14px] font-medium placeholder-[#7D8597]/60' 
              : 'pl-4 pr-32 text-lg sm:text-xl md:text-[22px] font-medium placeholder-[#7D8597]/70'
          }`}
        />

        {/* Action Controls right side */}
        <div className="absolute right-3 flex items-center gap-2">
          {/* Rotating circle loading indicator */}
          <AnimatePresence>
            {isSearching && (
              <motion.div
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ duration: 0.15 }}
                className="flex items-center justify-center pointer-events-none pr-1"
              >
                <Loader2 className={`animate-spin text-[#FF8C00] ${isNavbar ? 'w-4 h-4' : 'w-5 h-5'}`} />
              </motion.div>
            )}
          </AnimatePresence>

          {query.trim().length > 0 && (
            <button 
              type="button"
              onClick={() => {
                setQuery('');
                setShowSuggestions(false);
              }}
              className="p-1 text-[#7D8597] hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Glowing Orange search arrow button (only for hero variant) */}
          {!isNavbar && (
            <button 
              type="submit"
              className="w-[54px] h-[54px] bg-gradient-to-r from-[#FF8C00] to-[#FFA726] rounded-full flex items-center justify-center text-[#070B14] hover:scale-105 active:scale-95 hover:shadow-[0_0_20px_rgba(255,140,0,0.6)] cursor-pointer transition-all duration-300 relative overflow-hidden"
            >
              {/* Soft ripple hover layer */}
              <span className="absolute inset-0 bg-white/20 translate-y-full hover:translate-y-0 transition-transform duration-300" />
              <ArrowRight className="w-5 h-5 relative z-10 stroke-[2.5px]" />
            </button>
          )}
        </div>
      </div>

      {/* Premium Suggestions Dropdown matching Dark Luxury theme */}
      
      {/* Empty State */}
      {showSuggestions && query.trim().length >= 2 && !isSearching && suggestions.length === 0 && (
        <div 
          className="absolute top-[calc(100%+8px)] left-0 right-0 bg-[#0E1118]/95 backdrop-blur-[24px] border border-white/10 rounded-2xl overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.65)] flex flex-col z-[100] p-8 items-center justify-center animate-in fade-in slide-in-from-top-3 duration-300"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0, rotate: -10 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: 'spring', damping: 15, stiffness: 200 }}
            className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 border border-white/10"
          >
            <SearchX className="w-8 h-8 text-[#FF8C00]/80" />
          </motion.div>
          <h3 className="text-white font-bold text-lg mb-1">No matches found</h3>
          <p className="text-[#7D8597] text-sm text-center">
            We couldn't find anything for "<span className="text-white/80">{query}</span>"
          </p>
        </div>
      )}

      {/* Premium Suggestions Dropdown matching Dark Luxury theme */}
      {showSuggestions && suggestions.length > 0 && (
        <div 
          data-testid="search-suggestions-container"
          className="absolute top-[calc(100%+8px)] left-0 right-0 bg-[#0E1118]/95 backdrop-blur-[24px] border border-white/10 rounded-2xl overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.65)] flex flex-col z-[100] animate-in fade-in slide-in-from-top-3 duration-300"
        >
          <div className="px-5 py-3 text-xs text-[#7D8597] font-semibold tracking-wider uppercase border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
            <span>Quick Suggestions ({categoryParam || 'All'})</span>
            <span>{suggestions.length} Match(es)</span>
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {suggestions.map(item => (
              <div 
                key={item.id} 
                data-testid="search-suggestion-item"
                data-item-title={item.title}
                data-item-year={item.year || (item as any).release_date?.slice(0, 4) || (item as any).releaseDate?.slice(0, 4)}
                data-item-type={(item as any).type || (item as any).media_type || item.category}
                data-item-href={`/title/${item.id}`}
                onClick={() => {
                  setShowSuggestions(false);
                  setQuery('');
                  navigate(`/title/${item.id}`);
                }}
                className="flex items-center gap-4 p-3.5 sm:px-6 hover:bg-white/[0.04] cursor-pointer transition-colors text-left group/item"
              >
                {item.posterUrl ? (
                  <img 
                    src={item.posterUrl} 
                    alt={item.title} 
                    className="w-10 h-14 object-cover rounded-xl shadow-md shrink-0 border border-white/5 group-hover/item:border-[#FF8C00]/40 transition-colors" 
                  />
                ) : (
                  <div className="w-10 h-14 bg-white/5 rounded-xl flex flex-col items-center justify-center shrink-0 border border-white/5">
                    <span className="text-[9px] text-[#7D8597] text-center leading-none">No Poster</span>
                  </div>
                )}
                <div className="flex flex-col flex-grow overflow-hidden justify-center">
                  <span 
                    data-testid="suggestion-title-text"
                    className="font-poppins font-bold text-white group-hover/item:text-[#FF8C00] truncate text-[15px] transition-colors"
                  >
                    {item.title}
                  </span>
                  <div className="flex items-center gap-2 text-[12px] text-[#7D8597] mt-1 font-medium">
                    <span className="text-white/60">{getDisplayCategory(item)}</span>
                    <span className="w-1 h-1 rounded-full bg-white/10" />
                    <span>{item.year}</span>
                    {item.rating > 0 && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-white/10" />
                        <span className="text-[#FFD54F]">★ {Number(item.rating || 0).toFixed(1)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}
