import { useEffect, useRef, useState } from 'react';
import { Film, ArrowUpRight } from 'lucide-react';
import { Ad } from '../utils/ads';
import { useData } from '../context/DataContext';

interface Props {
  position: string; // The slot key, e.g. 'homepage_search_banner', 'movies_page_banner', etc.
  className?: string;
  previewAd?: Ad; // Optional ad to force-display for Admin Preview
}

export default function AdPlaceholder({ position, className = '', previewAd }: Props) {
  const { ads, customSlots, trackAdImpression, trackAdClick } = useData();
  const [ad, setAd] = useState<Ad | null>(null);
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [mounted, setMounted] = useState(false);
  const adRef = useRef<HTMLDivElement>(null);
  const trackedRef = useRef<string | null>(null);

  // Determine active device type
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 640) {
        setDevice('mobile');
      } else if (width < 1024) {
        setDevice('tablet');
      } else {
        setDevice('desktop');
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    setMounted(true);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Check if an ad is within scheduled dates
  const isScheduled = (adItem: Ad): boolean => {
    const now = new Date();
    now.setHours(0,0,0,0);

    if (adItem.startDate) {
      const start = new Date(adItem.startDate);
      start.setHours(0,0,0,0);
      if (now < start) return false;
    }
    if (adItem.endDate) {
      const end = new Date(adItem.endDate);
      end.setHours(23,59,59,999);
      if (now > end) return false;
    }
    return true;
  };

  // Rotation selection engine
  const getActiveAd = (slotPosition: string): Ad | null => {
    const activeAds = ads.filter(adItem => 
      adItem.position === slotPosition && 
      adItem.status === 'active' && 
      isScheduled(adItem)
    );

    if (activeAds.length === 0) return null;
    if (activeAds.length === 1) return activeAds[0];

    const slotConfig = customSlots.find(s => s.id === slotPosition);
    const strategy = slotConfig?.rotationStrategy || 'weighted';

    if (strategy === 'round-robin') {
      const key = `ad_rr_idx_${slotPosition}`;
      const stored = localStorage.getItem(key);
      let rrIndex = stored ? parseInt(stored, 10) : 0;
      if (isNaN(rrIndex) || rrIndex >= activeAds.length) rrIndex = 0;
      localStorage.setItem(key, ((rrIndex + 1) % activeAds.length).toString());
      return activeAds[rrIndex];
    } else if (strategy === 'weighted') {
      const totalWeight = activeAds.reduce((sum, adItem) => sum + (adItem.weight || 10), 0);
      let rand = Math.random() * totalWeight;
      for (const adItem of activeAds) {
        const weight = adItem.weight || 10;
        if (rand < weight) {
          return adItem;
        }
        rand -= weight;
      }
      return activeAds[0];
    } else {
      const randIndex = Math.floor(Math.random() * activeAds.length);
      return activeAds[randIndex];
    }
  };

  // Fetch or rotate active ad
  useEffect(() => {
    if (previewAd) {
      setAd(previewAd);
    } else if (mounted) {
      const activeAd = getActiveAd(position);
      setAd(activeAd);
    }
  }, [position, device, previewAd, mounted, ads, customSlots]);

  // Track impressions on mount / ad change
  useEffect(() => {
    if (ad && !previewAd && trackedRef.current !== ad.id) {
      trackAdImpression(ad.id);
      trackedRef.current = ad.id;
    }
  }, [ad, previewAd]);

  // Execute external Javascript / Network Codes safely inside container
  useEffect(() => {
    if (adRef.current && ad && (ad.type === 'javascript' || ad.type === 'network') && ad.customCode) {
      // Clear container first
      adRef.current.innerHTML = '';
      
      const container = document.createElement('div');
      container.innerHTML = ad.customCode;
      adRef.current.appendChild(container);

      // Extract and execute scripts manually since innerHTML doesn't execute script tags
      const scripts = container.querySelectorAll('script');
      scripts.forEach(oldScript => {
        const newScript = document.createElement('script');
        Array.from(oldScript.attributes).forEach(attr => {
          newScript.setAttribute(attr.name, attr.value);
        });
        if (oldScript.src) {
          newScript.src = oldScript.src;
        } else {
          newScript.textContent = oldScript.textContent;
        }
        oldScript.parentNode?.replaceChild(newScript, oldScript);
      });
    }
  }, [ad]);

  const handleAdClick = () => {
    if (ad && !previewAd) {
      trackAdClick(ad.id);
    }
  };


  const isAdmin = localStorage.getItem('isAdmin') === 'true';

  if (!ad) {
    // In admin dashboard view, show a pleasant dotted layout so they know it is an available slot
    if (isAdmin && window.location.pathname.includes('/admin')) {
      return (
        <div className={`border border-white/5 bg-white/5 border-dashed rounded-2xl flex flex-col items-center justify-center p-6 text-brand-muted/40 min-h-[90px] ${className}`}>
          <span className="text-xs uppercase tracking-widest font-semibold bg-brand-bg px-2 py-0.5 rounded border border-white/5 mb-1">
            Available Ad Slot
          </span>
          <span className="text-[10px] font-mono">{position}</span>
        </div>
      );
    }
    // Return null in production/public if no ad is active
    return null;
  }

  // Get active creative URL depending on screen size
  let activeImageUrl = ad.imageUrlDesktop;
  if (device === 'mobile' && ad.imageUrlMobile) {
    activeImageUrl = ad.imageUrlMobile;
  } else if (device === 'tablet' && ad.imageUrlTablet) {
    activeImageUrl = ad.imageUrlTablet;
  }

  return (
    <div className={`w-full overflow-hidden relative ${className}`}>
      {/* Visual Indicator of ad in preview/admin */}
      {previewAd && (
        <div className="absolute top-1 left-1 bg-brand-primary text-white text-[9px] font-bold px-1.5 py-0.5 rounded z-50 shadow-lg">
          Live Preview
        </div>
      )}

      {/* RENDER BY TYPE */}
      {ad.type === 'image' && (
        <a 
          href={ad.destinationUrl || '#'} 
          target="_blank" 
          rel="noopener noreferrer" 
          onClick={handleAdClick}
          className="block w-full group relative"
        >
          <img 
            src={activeImageUrl} 
            alt={ad.name} 
            className="w-full h-auto object-cover rounded-2xl border border-white/5 group-hover:border-brand-primary/40 transition-all duration-300"
          />
          <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-md text-[8px] sm:text-[10px] text-white/70 px-1.5 py-0.5 rounded tracking-wide font-bold uppercase pointer-events-none">
            Ad
          </div>
        </a>
      )}

      {(ad.type === 'image-text' || ad.type === 'floating') && (
        <a 
          href={ad.destinationUrl || '#'} 
          target="_blank" 
          rel="noopener noreferrer" 
          onClick={handleAdClick}
          className="block w-full group"
        >
          <div className="flex flex-col md:flex-row gap-4 p-4 md:p-6 bg-brand-card/70 backdrop-blur-md rounded-2xl border border-white/5 hover:border-brand-primary/40 hover:shadow-[0_0_20px_rgba(255,107,0,0.15)] transition-all duration-300">
            {activeImageUrl && (
              <div className="w-full md:w-1/3 aspect-[16/9] md:aspect-auto md:h-28 overflow-hidden rounded-xl shrink-0">
                <img 
                  src={activeImageUrl} 
                  alt={ad.name} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>
            )}
            <div className="flex-1 flex flex-col justify-between min-w-0">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] bg-brand-primary/20 text-brand-primary border border-brand-primary/30 px-1.5 py-0.5 rounded font-bold uppercase">
                    Sponsored
                  </span>
                  {ad.priority === 'high' && (
                    <span className="text-[9px] bg-red-500/10 text-red-400 px-1 rounded">Featured</span>
                  )}
                </div>
                <h4 className="text-sm sm:text-base font-poppins font-bold text-white group-hover:text-brand-primary transition-colors truncate">
                  {ad.headline || ad.name}
                </h4>
                <p className="text-xs text-brand-muted line-clamp-2 mt-1">
                  {ad.description}
                </p>
              </div>
              
              {ad.buttonText && (
                <div className="mt-3 flex items-center gap-1.5 text-xs font-bold text-brand-primary group-hover:underline">
                  {ad.buttonText}
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          </div>
        </a>
      )}

      {ad.type === 'popunder' && (
        <div className="hidden" />
      )}

      {ad.type === 'html' && (
        <div 
          onClick={handleAdClick}
          className="w-full overflow-auto text-center flex justify-center"
          dangerouslySetInnerHTML={{ __html: ad.customCode || '' }}
        />
      )}

      {(ad.type === 'javascript' || ad.type === 'network') && (
        <div 
          ref={adRef} 
          onClick={handleAdClick}
          className="w-full overflow-auto text-center flex justify-center"
        />
      )}

      {ad.type === 'iframe' && (
        <div 
          onClick={handleAdClick}
          className="w-full overflow-hidden flex justify-center rounded-2xl border border-white/5"
        >
          <iframe 
            src={ad.destinationUrl || 'about:blank'} 
            title={ad.name}
            className="w-full border-0 min-h-[250px]"
            sandbox="allow-scripts allow-same-origin allow-popups"
            dangerouslySetInnerHTML={ad.customCode ? { __html: ad.customCode } : undefined}
          />
        </div>
      )}
    </div>
  );
}
