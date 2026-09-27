import React from 'react';

interface CarouselCardsSkeletonProps {
  count?: number;
  isWide?: boolean;
}

export default function CarouselCardsSkeleton({ count = 8, isWide = false }: CarouselCardsSkeletonProps) {
  const items = Array.from({ length: count }, (_, i) => i);

  if (isWide) {
    return (
      <div className="flex gap-4 sm:gap-6 overflow-x-hidden py-1 w-full animate-in fade-in duration-200">
        {items.map((key) => (
          <div
            key={key}
            className="flex-shrink-0 w-[260px] sm:w-[320px] md:w-[360px] select-none"
          >
            <div className="relative">
              {/* Wide Aspect 16:9 skeleton */}
              <div 
                className="relative aspect-video w-full overflow-hidden bg-white/[0.06] border border-white/5 rounded-2xl mb-3 animate-pulse"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]" />
              </div>

              {/* Info skeleton */}
              <div className="px-1 space-y-2">
                <div className="h-4 bg-white/15 rounded-md w-3/4 animate-pulse" />
                <div className="flex items-center gap-2">
                  <div className="h-5 bg-white/10 rounded-full w-14 animate-pulse" />
                  <div className="h-5 bg-white/10 rounded-full w-12 animate-pulse" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-4 sm:gap-6 overflow-x-hidden py-1 w-full animate-in fade-in duration-200">
      {items.map((key) => (
        <div
          key={key}
          className="flex-shrink-0 w-[150px] sm:w-[180px] md:w-[200px] select-none"
        >
          <div className="relative">
            {/* Chamfered 2:3 card skeleton */}
            <div 
              className="relative aspect-[2/3] w-full overflow-hidden bg-white/[0.06] border border-white/5 mb-3 animate-pulse"
              style={{ 
                borderRadius: '16px',
                clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 24px), calc(100% - 24px) 100%, 0 100%)'
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]" />
              {/* Small decorative triangle in the cut */}
              <div 
                className="absolute bottom-0 right-0 w-6 h-6 bg-[#1a1a1a]/80"
                style={{
                  clipPath: 'polygon(100% 0, 0 100%, 100% 100%)'
                }}
              />
            </div>

            {/* Info skeleton */}
            <div className="px-1 space-y-2">
              <div className="h-4 bg-white/15 rounded-md w-4/5 animate-pulse" />
              <div className="flex items-center gap-2">
                <div className="h-5 bg-white/10 rounded-full w-12 animate-pulse" />
                <div className="h-5 bg-white/10 rounded-full w-10 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
