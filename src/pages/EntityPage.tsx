import OfflineScreen from '../components/OfflineScreen';
import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { WifiOff, Star } from 'lucide-react';
import { useData } from '../context/DataContext';
import { ContentItem } from '../types';
import ContentGrid from '../components/ContentGrid';
import { formatDuration } from '../utils/format';

interface EntityDetails {
  name: string;
  biography?: string;
  description?: string;
  birthday?: string;
  age?: number;
  profile_path?: string;
  logo_path?: string;
  headquarters?: string;
  homepage?: string;
  place_of_birth?: string;
}

export default function EntityPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { content: globalContent } = useData();
  const [fetchedContent, setFetchedContent] = useState<any[]>([]);
  const [isContentLoading, setIsContentLoading] = useState(true);
  const location = useLocation();
  const decodedName = decodeURIComponent(name || '');
  
  const isStudioRoute = location.pathname.startsWith('/studio/');

  const handleBack = () => {
    if (window.history.state && typeof window.history.state.idx === 'number' && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  // State for TMDb dynamic details
  const [details, setDetails] = useState<EntityDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isBioExpanded, setIsBioExpanded] = useState(false);

  // Fetch local content matching or full catalog
  useEffect(() => {
    const fetchContent = async () => {
      setIsContentLoading(true);
      try {
        const searchRes = await fetch(`/api/content/search?q=${encodeURIComponent(decodedName)}`);
        let data = await searchRes.json();
        if (!Array.isArray(data) || data.length === 0) {
          const allRes = await fetch(`/api/content`);
          const allData = await allRes.json();
          data = Array.isArray(allData) ? allData : (allData.data || []);
        }
        setFetchedContent(data);
      } catch (e) {
        console.error(e);
        setError(true);
      } finally {
        setIsContentLoading(false);
      }
    };
    fetchContent();
  }, [decodedName]);

  // Combine globalContent from DataContext and fetchedContent to ensure complete catalog availability
  const content = useMemo(() => {
    const map = new Map<string, any>();
    if (Array.isArray(globalContent)) {
      globalContent.forEach(item => { if (item?.id) map.set(item.id, item); });
    }
    if (Array.isArray(fetchedContent)) {
      fetchedContent.forEach(item => { if (item?.id) map.set(item.id, item); });
    }
    return Array.from(map.values());
  }, [globalContent, fetchedContent]);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setIsBioExpanded(false);

    const endpoint = isStudioRoute
      ? `/api/studio/details/${encodeURIComponent(decodedName)}`
      : `/api/person/details/${encodeURIComponent(decodedName)}`;

    fetch(endpoint)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          setDetails(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('Error fetching details from TMDB proxy:', err);
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [decodedName, isStudioRoute]);

  // Find related titles in local content database + TMDB fallback titles
  const relatedContent = useMemo(() => {
    const rawTarget = decodedName.toLowerCase().trim();
    if (!rawTarget) return [];

    const targetClean = rawTarget
      .replace(/^(the\s+|a\s+|an\s+)/i, '')
      .replace(/(\s+company|\s+studios|\s+pictures|\s+inc\.?|\s+ltd\.?|\s+corp\.?|\s+entertainment)$/i, '')
      .trim();

    let localRelated: ContentItem[] = [];

    if (Array.isArray(content) && content.length > 0) {
      if (isStudioRoute) {
        const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const exactMatchRegex = new RegExp(`\\b${escapeRegExp(rawTarget)}\\b`, 'i');
        const exactCleanMatchRegex = targetClean ? new RegExp(`\\b${escapeRegExp(targetClean)}\\b`, 'i') : null;

        localRelated = content.filter((item) => {
          if (!item) return false;
          const studioNames: string[] = [];
          if (item.studio) studioNames.push(item.studio);
          if (item.network) studioNames.push(item.network);
          if (Array.isArray(item.studiosData)) {
            item.studiosData.forEach((s: any) => {
              const nameStr = typeof s === 'string' ? s : s?.name;
              if (nameStr) studioNames.push(nameStr);
            });
          }
          if (Array.isArray(item.networks)) {
            item.networks.forEach((n: any) => {
              const nameStr = typeof n === 'string' ? n : n?.name;
              if (nameStr) studioNames.push(nameStr);
            });
          }
          if (Array.isArray((item as any).productionCompanies)) {
            (item as any).productionCompanies.forEach((p: any) => {
              const nameStr = typeof p === 'string' ? p : p?.name;
              if (nameStr) studioNames.push(nameStr);
            });
          }

          return studioNames.some(sName => {
            const sLower = sName.toLowerCase().trim();
            if (sLower === rawTarget) return true;
            if (exactMatchRegex.test(sLower)) return true;
            
            if (targetClean) {
              const sClean = sLower
                .replace(/^(the\s+|a\s+|an\s+)/i, '')
                .replace(/(\s+company|\s+studios|\s+pictures|\s+inc\.?|\s+ltd\.?|\s+corp\.?|\s+entertainment)$/i, '')
                .trim();
              if (sClean === targetClean) return true;
              if (exactCleanMatchRegex && exactCleanMatchRegex.test(sClean)) return true;
            }
            return false;
          });
        });
      } else {
        const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const exactMatchRegex = new RegExp(`\\b${escapeRegExp(rawTarget)}\\b`, 'i');
        
        const isNameMatch = (nameStr: string) => {
          if (!nameStr) return false;
          const n = nameStr.toLowerCase().trim();
          if (n === rawTarget) return true;
          if (n.split(/,\s*/).includes(rawTarget)) return true;
          return exactMatchRegex.test(n);
        };

        localRelated = content.filter((item) => {
          if (!item) return false;
          if (item.director && isNameMatch(item.director)) return true;
          if (item.actorsData?.some((a) => a?.name && isNameMatch(a.name))) return true;
          if (typeof item.cast === 'string' && isNameMatch(item.cast)) return true;
          if (Array.isArray(item.cast) && item.cast.some((c: any) => isNameMatch(typeof c === 'string' ? c : c?.name || ''))) return true;
          if (Array.isArray(item.maleActors) && item.maleActors.some((a: any) => isNameMatch(typeof a === 'string' ? a : a?.name || ''))) return true;
          if (Array.isArray(item.femaleActors) && item.femaleActors.some((a: any) => isNameMatch(typeof a === 'string' ? a : a?.name || ''))) return true;
          return false;
        });
      }
    }

    const localSorted = [...localRelated].sort((a, b) => (b?.rating || 0) - (a?.rating || 0));
    return localSorted;
  }, [decodedName, content, isStudioRoute]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [decodedName]);

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Format birthday to beautiful editorial string (e.g., August 1, 1965 • 60 years old)
  const formattedBirthInfo = useMemo(() => {
    if (!details?.birthday) return null;
    try {
      const date = new Date(details.birthday);
      const options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' };
      const formattedDate = date.toLocaleDateString('en-US', options);

      // Calculate age
      const birthDate = new Date(details.birthday);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }

      return `${formattedDate} • ${age} years old`;
    } catch (e) {
      return details.birthday;
    }
  }, [details?.birthday]);

  // Fallback photo/logo if TMDB returns null
  const photoUrl = useMemo(() => {
    if (!Array.isArray(content)) return '';
    if (isStudioRoute) {
      if (details?.logo_path) return details.logo_path;
      const localStudio = content
        .flatMap((item) => item?.studiosData || [])
        .find((s) => s?.name?.toLowerCase() === decodedName.toLowerCase());
      return localStudio?.logoUrl || '';
    } else {
      if (details?.profile_path) return details.profile_path;
      // Search in content for local photos
      const localDirector = content.find(
        (item) => item?.director?.toLowerCase() === decodedName.toLowerCase() && item?.directorPhotoUrl
      );
      if (localDirector?.directorPhotoUrl) return localDirector.directorPhotoUrl;

      const localActor = content
        .flatMap((item) => item?.actorsData || [])
        .find((a) => a?.name?.toLowerCase() === decodedName.toLowerCase() && a?.photoUrl);
      return localActor?.photoUrl || '';
    }
  }, [details, decodedName, content, isStudioRoute]);

  if (error) {
    return (
      <div className="pt-28 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto min-h-screen flex items-center justify-center">
        <div className="text-center bg-[#151B2D]/50 p-8 rounded-3xl border border-white/5 flex flex-col items-center">
           <WifiOff className="w-12 h-12 text-red-500 opacity-80 mb-4" />
           <h3 className="text-xl font-bold text-white mb-2">Connection Error</h3>
           <p className="text-gray-400 mb-6">Please check your internet connection and try again.</p>
           <button onClick={() => window.location.reload()} className="px-6 py-3 bg-brand-primary text-white rounded-full font-medium transition-transform hover:scale-105 active:scale-95">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-28 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto min-h-screen">
      {/* Back button matched to the elegant round style in screenshot */}
      <div className="flex items-center gap-3 mb-12">
        <button
          onClick={handleBack}
          className="w-10 h-10 rounded-full border border-white/10 bg-white/5 flex items-center justify-center hover:bg-white/10 hover:border-white/20 text-white transition-all cursor-pointer"
          aria-label="Go back"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
        </button>
        <button 
          onClick={handleBack}
          className="text-white/80 font-medium hover:text-white transition-colors cursor-pointer text-sm sm:text-base"
        >
          Back
        </button>
      </div>

      {/* Main entity header banner section */}
      <div className="flex flex-col md:flex-row gap-8 md:gap-12 items-center md:items-start mb-16">
        {/* Avatar / Brand Logo container */}
        {photoUrl ? (
          <div className={`shrink-0 ${isStudioRoute ? 'w-64 h-32 bg-white/5 rounded-2xl p-4 border border-white/10 flex items-center justify-center' : 'w-40 h-40 md:w-48 md:h-48 rounded-full overflow-hidden border-2 border-white/10 shadow-xl'}`}>
            <img
              src={photoUrl}
              alt={decodedName}
              className={`w-full h-full ${isStudioRoute ? 'object-contain filter brightness-90 grayscale hover:grayscale-0 transition-all duration-300' : 'object-cover'}`}
              referrerPolicy="no-referrer"
            />
          </div>
        ) : (
          <div className={`shrink-0 flex items-center justify-center bg-white/15 text-4xl font-bold text-white border border-white/10 shadow-lg ${isStudioRoute ? 'w-64 h-32 rounded-2xl' : 'w-40 h-40 md:w-48 md:h-48 rounded-full'}`}>
            {decodedName.charAt(0)}
          </div>
        )}

        {/* Biography/Detail information */}
        <div className="flex-1 text-center md:text-left">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-tight mb-2">
            {decodedName}
          </h1>

          {isStudioRoute ? (
            <div className="flex flex-col sm:flex-row items-center gap-3 mt-3">
              <span className="px-3 py-1 bg-white/10 text-white/80 text-xs font-bold uppercase tracking-widest rounded-full border border-white/10">
                Studio
              </span>
              {details?.headquarters && (
                <span className="text-sm font-mono text-gray-400">
                  • {details.headquarters}
                </span>
              )}
            </div>
          ) : (
            formattedBirthInfo && (
              <div className="text-sm md:text-base font-mono text-gray-400 mt-2 mb-4">
                {formattedBirthInfo}
              </div>
            )
          )}

          {/* Description/Bio with fixed Read More toggling */}
          <div className="text-gray-400 leading-relaxed mt-4 max-w-3xl text-sm sm:text-base">
            {isLoading ? (
              <div className="animate-pulse space-y-2">
                <div className="h-4 bg-white/10 rounded w-full"></div>
                <div className="h-4 bg-white/10 rounded w-5/6"></div>
                <div className="h-4 bg-white/10 rounded w-4/5"></div>
              </div>
            ) : (
              <>
                <div className="whitespace-pre-line text-gray-400">
                  {(() => {
                    const fullText = isStudioRoute
                      ? details?.description || `${decodedName} is an active film production studio.`
                      : details?.biography || `${decodedName} is a distinguished cinema professional.`;
                    
                    if (isBioExpanded || fullText.length <= 290) {
                      return fullText;
                    }
                    return fullText.slice(0, 290) + '...';
                  })()}
                </div>

                {/* Show toggle button if text is long enough */}
                {(((isStudioRoute ? details?.description : details?.biography) || '').length > 290) && (
                  <button
                    onClick={() => setIsBioExpanded(!isBioExpanded)}
                    className="text-white font-bold underline mt-4 hover:text-brand-primary transition-colors cursor-pointer text-sm inline-block"
                  >
                    {isBioExpanded ? 'Show less' : 'Read More'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* List of Known For Titles */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 border-b border-white/5 pb-4">
          <div className="flex items-baseline gap-3">
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {isStudioRoute ? 'Titles' : 'Known For'}
            </h2>
            <span className="text-sm font-mono text-gray-500">{relatedContent.length} titles</span>
          </div>

          {/* Switch Modes (only has list/grid toggle, Filter and Sort removed as requested) */}
          <div className="flex items-center self-end sm:self-auto bg-white/5 rounded-full p-1 border border-white/10">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 transition-all rounded-full cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-white text-black shadow-sm'
                  : 'bg-transparent text-gray-400 hover:text-white'
              }`}
              title="List View"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
              </svg>
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 transition-all rounded-full cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-white text-black shadow-sm'
                  : 'bg-transparent text-gray-400 hover:text-white'
              }`}
              title="Grid View"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
            </button>
          </div>
        </div>

        {/* Content View display logic */}
        {isContentLoading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white/5 rounded-2xl border border-white/5">
            <div className="flex gap-2 mb-4">
              {[0, 1, 2].map((i) => (
                <div 
                  key={i} 
                  className="w-3 h-3 bg-brand-primary rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
            <p className="text-gray-400 animate-pulse">Searching titles...</p>
          </div>
        ) : relatedContent.length === 0 ? (
          <div className="text-center py-16 bg-white/5 rounded-2xl border border-white/5">
            <p className="text-gray-400">No titles found for {decodedName}.</p>
          </div>
        ) : viewMode === 'grid' ? (
          <ContentGrid items={relatedContent} />
        ) : (
          <div className="flex flex-col gap-4">
            {relatedContent.map((item, index) => (
              <div
                key={item.id}
                className="flex gap-4 md:gap-6 bg-[#0D0E12]/80 border border-white/10 rounded-2xl p-4 items-center group hover:bg-white/5 transition-all cursor-pointer"
                onClick={() => navigate(`/title/${item.id}`)}
              >
                <span className="text-gray-500 font-mono text-sm w-6 text-center">{index + 1}</span>
                <div 
                  className="w-16 h-24 md:w-20 md:h-28 shrink-0 relative overflow-hidden bg-brand-card/50"
                  style={{
                    borderRadius: '8px',
                    clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%)'
                  }}
                >
                  <img
                    src={item.posterUrl}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    referrerPolicy="no-referrer"
                  />
                  <div 
                    className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#1a1a1a]/80"
                    style={{
                      clipPath: 'polygon(100% 0, 0 100%, 100% 100%)'
                    }}
                  />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg md:text-xl font-bold text-white group-hover:text-brand-primary transition-colors mb-2">
                    {item.title}
                  </h3>
                  <div className="flex items-center gap-4 text-xs md:text-sm text-gray-400 font-mono">
                    <span>{item.year}</span>
                    {item.duration && <span>• {formatDuration(item.duration)}</span>}
                    <span className="uppercase">{item.category}</span>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-3 pr-4">
                  <div className="flex items-center gap-1 bg-transparent border border-white/10 rounded-full px-2.5 py-1">
                    <Star className="w-3.5 h-3.5 text-brand-primary fill-brand-primary" />
                    <span className="text-white text-xs font-semibold">{Number(item.rating || 0).toFixed(1)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
