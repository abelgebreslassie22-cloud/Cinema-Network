import React from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

interface HomeSkeletonProps {
  isOffline?: boolean;
  category?: string | null;
}

export default function HomeSkeleton({ isOffline, category }: HomeSkeletonProps) {
  const categoryLabel = category
    ? (category.toLowerCase() === 'series' || category.toLowerCase() === 'tv' ? 'TV Shows' : category)
    : null;

  return (
    <div id="home-skeleton-loader" className="pb-16 pt-[188px] sm:pt-40 max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 space-y-12 animate-in fade-in duration-300">
      {isOffline && (
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-200 px-4 py-3 rounded-2xl flex items-center justify-between gap-3 text-sm animate-pulse">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
            <span>You are offline. Showing skeleton loading structure.</span>
          </div>
          <button 
            onClick={() => window.location.reload()} 
            className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      )}

      {/* Category Header Skeleton if a category is selected */}
      {categoryLabel && (
        <div className="pt-2 border-b border-white/5 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-44 bg-white/10 rounded-xl animate-pulse" />
            <div className="h-5 w-16 bg-brand-primary/20 rounded-full animate-pulse" />
          </div>
        </div>
      )}

      {/* 1. Hero / Featured Banner Skeleton */}
      <div className="w-full h-[220px] sm:h-[300px] bg-gradient-to-r from-white/[0.04] via-white/[0.08] to-white/[0.03] rounded-3xl border border-white/5 flex flex-col justify-end p-6 sm:p-8 gap-3 animate-pulse relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="relative z-10 space-y-2.5">
          <div className="w-24 h-5 bg-brand-primary/30 rounded-full" />
          <div className="w-2/3 max-w-md h-8 sm:h-10 bg-white/15 rounded-xl" />
          <div className="w-1/2 max-w-sm h-4 bg-white/10 rounded-lg" />
        </div>
      </div>

      {/* 2. Trending Carousel Skeleton (Wide Aspect Cards) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-36 h-7 bg-white/15 rounded-lg animate-pulse" />
            <div className="w-6 h-6 bg-white/10 rounded-full animate-pulse" />
          </div>
          <div className="hidden sm:flex gap-2">
            <div className="w-8 h-8 rounded-full bg-white/5 animate-pulse" />
            <div className="w-8 h-8 rounded-full bg-white/5 animate-pulse" />
          </div>
        </div>
        <div className="flex gap-4 sm:gap-6 overflow-hidden hide-scrollbar pb-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div 
              key={`trending-skel-${i}`} 
              className="flex-shrink-0 w-[260px] sm:w-[320px] md:w-[360px] aspect-video bg-white/[0.04] rounded-2xl border border-white/5 p-4 flex flex-col justify-between relative overflow-hidden animate-pulse"
            >
              <div className="flex justify-between items-start">
                <div className="w-7 h-7 rounded-lg bg-brand-primary/20" />
                <div className="w-14 h-5 bg-white/10 rounded-md" />
              </div>
              <div className="space-y-2">
                <div className="w-3/4 h-5 bg-white/15 rounded-md" />
                <div className="flex gap-2">
                  <div className="w-12 h-3 bg-white/10 rounded" />
                  <div className="w-16 h-3 bg-white/10 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Latest Section Skeleton (Portrait Cards) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="w-32 h-7 bg-white/15 rounded-lg animate-pulse" />
          <div className="flex gap-2">
            <div className="w-20 h-7 bg-white/10 rounded-full animate-pulse" />
            <div className="w-20 h-7 bg-white/5 rounded-full animate-pulse" />
          </div>
        </div>
        <div className="flex gap-3.5 sm:gap-5 overflow-hidden hide-scrollbar pb-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div 
              key={`latest-skel-${i}`} 
              className="flex-shrink-0 w-[140px] sm:w-[170px] md:w-[190px] space-y-3 animate-pulse"
            >
              <div className="w-full aspect-[2/3] bg-white/[0.04] rounded-2xl border border-white/5 relative overflow-hidden">
                <div className="absolute top-2.5 right-2.5 w-10 h-4 bg-white/10 rounded-md" />
              </div>
              <div className="w-4/5 h-4 bg-white/15 rounded-md" />
              <div className="flex justify-between items-center">
                <div className="w-10 h-3 bg-white/10 rounded" />
                <div className="w-12 h-3 bg-white/10 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Top Rated Skeleton */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="w-36 h-7 bg-white/15 rounded-lg animate-pulse" />
        </div>
        <div className="flex gap-3.5 sm:gap-5 overflow-hidden hide-scrollbar pb-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div 
              key={`toprated-skel-${i}`} 
              className="flex-shrink-0 w-[140px] sm:w-[170px] md:w-[190px] space-y-3 animate-pulse"
            >
              <div className="w-full aspect-[2/3] bg-white/[0.04] rounded-2xl border border-white/5 relative overflow-hidden" />
              <div className="w-4/5 h-4 bg-white/15 rounded-md" />
              <div className="w-1/3 h-3 bg-white/10 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* 5. Franchises Carousel Skeleton */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="w-40 h-7 bg-white/15 rounded-lg animate-pulse" />
        </div>
        <div className="flex gap-4 sm:gap-6 overflow-hidden hide-scrollbar pb-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div 
              key={`franchise-skel-${i}`} 
              className="flex-shrink-0 w-[300px] sm:w-[380px] md:w-[420px] h-[200px] bg-[#151B2D]/60 border border-white/5 rounded-2xl p-5 flex justify-between gap-4 animate-pulse"
            >
              <div className="w-1/2 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="w-3/4 h-5 bg-white/15 rounded" />
                  <div className="w-1/2 h-3 bg-white/10 rounded" />
                </div>
                <div className="w-2/3 h-4 bg-brand-primary/20 rounded" />
              </div>
              <div className="w-1/2 flex items-center justify-end gap-1">
                <div className="w-16 h-24 bg-white/10 rounded-lg shadow-lg" />
                <div className="w-16 h-24 bg-white/15 rounded-lg shadow-xl -ml-6" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 6. Genre / Best of Skeleton */}
      <div className="space-y-4">
        <div className="flex items-center gap-3 overflow-hidden pb-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={`genre-tab-skel-${i}`} className="w-24 h-8 bg-white/5 rounded-full flex-shrink-0 animate-pulse" />
          ))}
        </div>
        <div className="flex gap-3.5 sm:gap-5 overflow-hidden hide-scrollbar pb-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div 
              key={`genre-item-skel-${i}`} 
              className="flex-shrink-0 w-[140px] sm:w-[170px] md:w-[190px] space-y-3 animate-pulse"
            >
              <div className="w-full aspect-[2/3] bg-white/[0.04] rounded-2xl border border-white/5" />
              <div className="w-3/4 h-4 bg-white/15 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
