import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { Ad } from '../utils/ads';
import AdPlaceholder from './AdPlaceholder';

export default function GlobalAds() {
  const { ads, trackAdClick, trackAdImpression } = useData();
  const location = useLocation();

  // State to track closed/triggered timestamps from localStorage for the 5-minute cooldown
  const [floatingClosedTime, setFloatingClosedTime] = useState<number>(() => {
    return Number(localStorage.getItem('last_floating_ad_closed') || '0');
  });

  const [popunderTriggeredTime, setPopunderTriggeredTime] = useState<number>(() => {
    return Number(localStorage.getItem('last_popunder_ad_triggered') || '0');
  });

  // Check if dates are scheduled
  const isScheduled = (adItem: Ad): boolean => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    if (adItem.startDate) {
      const start = new Date(adItem.startDate);
      start.setHours(0, 0, 0, 0);
      if (now < start) return false;
    }
    if (adItem.endDate) {
      const end = new Date(adItem.endDate);
      end.setHours(23, 59, 59, 999);
      if (now > end) return false;
    }
    return true;
  };

  // Cooldown definitions (1 minute = 60,000 ms)
  const COOLDOWN_DURATION = 1 * 60 * 1000;
  const now = Date.now();
  const isFloatingAdCooldown = now - floatingClosedTime < COOLDOWN_DURATION;
  const isPopunderCooldown = now - popunderTriggeredTime < COOLDOWN_DURATION;

  // Find active ads for both slots
  const activePopunderAds = ads.filter(
    (adItem) =>
      (adItem.position === 'popunder_click_redirect' || adItem.type === 'popunder') &&
      adItem.status === 'active' &&
      isScheduled(adItem)
  );

  const activeFloatingAd = ads.find(
    (adItem) =>
      (adItem.position === 'floating_overlay_ad' || adItem.type === 'floating') &&
      adItem.status === 'active' &&
      isScheduled(adItem)
  );

  // Register impression for popunder once when loaded (if not on cooldown)
  useEffect(() => {
    if (activePopunderAds.length > 0 && !isPopunderCooldown) {
      activePopunderAds.forEach((adItem) => {
        trackAdImpression(adItem.id);
      });
    }
  }, [activePopunderAds.length, isPopunderCooldown]);

  // Register impression for floating ad when shown
  useEffect(() => {
    if (activeFloatingAd && !isFloatingAdCooldown) {
      trackAdImpression(activeFloatingAd.id);
    }
  }, [activeFloatingAd?.id, isFloatingAdCooldown]);

  // Handle global popunder click redirect
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      // Don't intercept clicks in the Admin views to prevent annoying admins
      if (location.pathname.startsWith('/admin')) {
        return;
      }

      // Check popunder cooldown
      const currentNow = Date.now();
      if (currentNow - popunderTriggeredTime < COOLDOWN_DURATION) {
        return;
      }

      const target = e.target as HTMLElement;
      
      // Look for any clickable element (button, link, interactive elements, cards, download buttons, etc.)
      const clickable = target.closest('button, a, [role="button"], .cursor-pointer, input[type="submit"], input[type="button"], .download-btn, [class*="download"]');

      // Ignore clicks on close buttons of the floating ad, or the floating ad container itself
      if (clickable && (clickable.closest('.floating-ad-container') || clickable.closest('.close-ad-btn'))) {
        return;
      }

      if (clickable && activePopunderAds.length > 0) {
        // Pick one at random
        const selectedAd = activePopunderAds[Math.floor(Math.random() * activePopunderAds.length)];
        if (selectedAd.destinationUrl) {
          trackAdClick(selectedAd.id);
          const triggeredTime = Date.now();
          localStorage.setItem('last_popunder_ad_triggered', triggeredTime.toString());
          setPopunderTriggeredTime(triggeredTime);
          window.open(selectedAd.destinationUrl, '_blank', 'noopener,noreferrer');
        }
      }
    };

    document.addEventListener('click', handleGlobalClick);
    return () => {
      document.removeEventListener('click', handleGlobalClick);
    };
  }, [activePopunderAds, location.pathname, trackAdClick, popunderTriggeredTime, isPopunderCooldown]);

  const handleCloseFloatingAd = () => {
    const closedTime = Date.now();
    localStorage.setItem('last_floating_ad_closed', closedTime.toString());
    setFloatingClosedTime(closedTime);
  };

  const isAdmin = location.pathname.startsWith('/admin');
  if (isAdmin) {
    return null; // Don't show public floating ad overlay in admin dashboards
  }

  return (
    <>
      {activeFloatingAd && !isFloatingAdCooldown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-300">
          {/* Main big and centered container */}
          <div className="floating-ad-container relative w-full max-w-[550px] bg-[#10141e]/95 border border-white/10 rounded-2xl p-6 sm:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.8)] flex flex-col transition-all duration-300 animate-in zoom-in-95 duration-200">
            
            {/* Close Button Top Right */}
            <button
              onClick={handleCloseFloatingAd}
              className="close-ad-btn absolute top-4 right-4 w-9 h-9 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center border border-white/10 text-white/70 hover:text-white transition-all cursor-pointer shadow-md z-10"
              title="Close Advertisement"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Label */}
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[10px] bg-brand-primary/20 text-brand-primary border border-brand-primary/20 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                Sponsored Overlay Ad
              </span>
            </div>

            {/* Ad content using our main AdPlaceholder renderer */}
            <div className="overflow-hidden rounded-xl border border-white/5 bg-black/40">
              <AdPlaceholder position={activeFloatingAd.position} previewAd={activeFloatingAd} />
            </div>

            {/* Interactive hint */}
            <p className="text-[11px] text-brand-muted mt-3 text-center">
              Click the 'X' button in the top-right to close and return to the site.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
