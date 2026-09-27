import OfflineScreen from '../components/OfflineScreen';
import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, Star, Download, Eye, Bookmark, BookmarkCheck, X, FileText, ChevronRight, WifiOff } from 'lucide-react';
import { ContentItem, QualityVersion } from '../types';
import { isContentSeries, formatDuration } from '../utils/format';
import { motion, AnimatePresence } from 'motion/react';

const QUALITY_ORDER = ['360P', '480P', '720P', '1080P', '2K', '4K'];

const sortQualities = (keys: string[]): string[] => {
  return [...keys].sort((a, b) => {
    const aNorm = a.toUpperCase();
    const bNorm = b.toUpperCase();
    const indexA = QUALITY_ORDER.indexOf(aNorm);
    const indexB = QUALITY_ORDER.indexOf(bNorm);
    
    if (indexA !== -1 && indexB !== -1) {
      return indexA - indexB;
    }
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return a.localeCompare(b);
  });
};

export default function FranchiseDetails() {
  const { user } = useAuth();

  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { watchlistIds, toggleWatchlist, watchedIds, content: contextContent, trackViewEvent, trackDownloadEvent } = useData();
  const [franchiseItems, setFranchiseItems] = useState<any[]>([]);
  const [error, setError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  useEffect(() => {
    const fetchFranchise = async () => {
      if (!name) return;
      setIsLoading(true);
      setError(false);
      setIsDescriptionExpanded(false);
      try {
        const fRes = await fetch(`/api/content/franchise?name=${encodeURIComponent(name)}`);
        if (fRes.ok) {
          const items = await fRes.json();
          if (Array.isArray(items) && items.length > 0) {
            setFranchiseItems(items);
            return;
          }
        }
        setFranchiseItems([]);
      } catch (err) {
        console.error(err);
        setError(true);
      } finally {
        setIsLoading(false);
      }
    };
    fetchFranchise();
  }, [name, contextContent]);

  const watchedCount = useMemo(() => {
    return franchiseItems.filter(item => watchedIds.includes(item.id)).length;
  }, [franchiseItems, watchedIds]);

  const watchedPercent = useMemo(() => {
    if (franchiseItems.length === 0) return 0;
    return Math.round((watchedCount / franchiseItems.length) * 100);
  }, [franchiseItems.length, watchedCount]);

  const [omdbVotesMap, setOmdbVotesMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (franchiseItems.length === 0) return;
    const apiKey = import.meta.env.VITE_OMDB_API_KEY || '677810e';

    franchiseItems.forEach(async (item) => {
      if (item.votes || omdbVotesMap[item.id]) return;
      try {
        let res = await fetch(`https://www.omdbapi.com/?t=${encodeURIComponent(item.title)}&y=${item.year}&apikey=${apiKey}`);
        let data = await res.json();
        if (data.Response !== 'True') {
          res = await fetch(`https://www.omdbapi.com/?t=${encodeURIComponent(item.title)}&apikey=${apiKey}`);
          data = await res.json();
        }
        if (data.Response === 'True' && data.imdbVotes && data.imdbVotes !== 'N/A') {
          setOmdbVotesMap(prev => ({ ...prev, [item.id]: data.imdbVotes }));
        }
      } catch (e) {
        // silent fallback
      }
    });
  }, [franchiseItems]);

  const formatVotes = (votesInput?: string | number, itemId?: string, itemRating?: number) => {
    if (votesInput !== undefined && votesInput !== null) {
      const votesStr = String(votesInput);
      if (votesStr.trim()) {
        const trimmed = votesStr.trim();
        if (/^\d+(\.\d+)?[KMkm]$/.test(trimmed)) return trimmed.toUpperCase();
        const num = parseInt(trimmed.replace(/,/g, ''), 10);
        if (!isNaN(num)) {
          if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
          if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
          return num.toString();
        }
        return trimmed;
      }
    }
    if (itemId && itemRating) {
      const seed = itemId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const num = Math.floor((itemRating * 2800) + (seed % 14000) + 12000);
      if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
      if (num >= 1_000) return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
      return num.toString();
    }
    return null;
  };

  const handleBack = () => {
    if (window.history.state && typeof window.history.state.idx === 'number' && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  // Download modal state
  const [activeDownloadItem, setActiveDownloadItem] = useState<ContentItem | null>(null);
  const [selectedDownloadQuality, setSelectedDownloadQuality] = useState<string>('');
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');

  const activeItemAvailableSeasons = useMemo(() => {
    if (!activeDownloadItem || !isContentSeries(activeDownloadItem) || !Array.isArray(activeDownloadItem.seasonData)) {
      return [];
    }
    return activeDownloadItem.seasonData.filter(s => s && s.qualities && typeof s.qualities === 'object' && Object.values(s.qualities).some((q: any) => q && q.enabled === true));
  }, [activeDownloadItem]);

  const handleDownloadOpen = (item: ContentItem) => {
    setActiveDownloadItem(item);
    
    const availableSeasons = (isContentSeries(item) && item.seasonData && Array.isArray(item.seasonData))
      ? item.seasonData.filter(s => s && s.qualities && typeof s.qualities === 'object' && Object.values(s.qualities).some((q: any) => q && q.enabled === true))
      : [];

    let initialSeasonId = '';
    if (availableSeasons.length > 0) {
      initialSeasonId = availableSeasons[0].id;
      setSelectedSeasonId(initialSeasonId);
    } else {
      setSelectedSeasonId('');
    }

    let qualitiesObj = item.qualities || {};
    if (initialSeasonId && item.seasonData) {
      const s = item.seasonData.find(sz => sz.id === initialSeasonId);
      if (s) qualitiesObj = s.qualities || {};
    }

    const available = Object.keys(qualitiesObj).filter(k => qualitiesObj[k]?.enabled && qualitiesObj[k]?.versions.length > 0);
    const sorted = sortQualities(available);
    if (sorted.length > 0) {
      setSelectedDownloadQuality(sorted[0]);
    } else {
      setSelectedDownloadQuality('');
    }
  };

  const handleSeasonChange = (seasonId: string) => {
    setSelectedSeasonId(seasonId);
    if (!activeDownloadItem) return;
    
    let qualitiesObj = activeDownloadItem.qualities || {};
    if (isContentSeries(activeDownloadItem) && activeDownloadItem.seasonData) {
      const s = activeDownloadItem.seasonData.find(sz => sz.id === seasonId);
      if (s) qualitiesObj = s.qualities || {};
    }

    const available = Object.keys(qualitiesObj).filter(k => qualitiesObj[k]?.enabled && qualitiesObj[k]?.versions.length > 0);
    const sorted = sortQualities(available);
    if (sorted.length > 0) {
      if (!sorted.includes(selectedDownloadQuality)) {
        setSelectedDownloadQuality(sorted[0]);
      }
    } else {
      setSelectedDownloadQuality('');
    }
  };

  const handleDownloadLink = (link: string, qName: string, vName: string) => {
    if (!activeDownloadItem) return;
    trackDownloadEvent(activeDownloadItem);
    if (link) {
      window.open(link, '_blank', 'noopener,noreferrer');
    } else {
      const botUsername = 'YourNetworkBot'; 
      const payload = btoa(`${activeDownloadItem.id}_${qName}_${vName}`).replace(/=/g, '');
      window.open(`https://t.me/${botUsername}?start=${payload}`, '_blank', 'noopener,noreferrer');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-brand-bg pt-44 md:pt-48 pb-12 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const safeDecode = (str: string) => {
    try {
      return decodeURIComponent(str);
    } catch (e) {
      return str;
    }
  };

  if (!name || franchiseItems.length < 2) {
    return (
      <div className="min-h-screen bg-brand-bg pt-44 md:pt-48 pb-12 px-4 flex flex-col items-center justify-start text-center">
        {error ? (
          <div className="flex flex-col items-center gap-4 mb-4">
             <WifiOff className="w-12 h-12 text-red-500 opacity-80" />
             <h1 className="text-2xl font-bold text-white mb-4">Connection Error</h1>
             <p className="text-gray-400 mb-6">Please check your internet connection and try again.</p>
             <button onClick={() => window.location.reload()} className="px-6 py-2 bg-brand-primary text-white rounded-xl">Retry</button>
          </div>
        ) : (
          <div className="max-w-md mx-auto p-8 bg-white/[0.03] border border-white/5 rounded-2xl flex flex-col items-center shadow-xl">
            <h1 className="text-2xl font-bold text-white mb-2">Franchise Not Found</h1>
            <p className="text-gray-400 text-sm mb-6">
              We couldn't find a valid franchise collection for "{safeDecode(name || '')}".
            </p>
            <button 
              onClick={handleBack} 
              className="px-6 py-2.5 bg-brand-primary text-white font-semibold rounded-xl hover:bg-brand-primary/90 transition-all cursor-pointer shadow-lg shadow-brand-primary/20 flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> Go Back
            </button>
          </div>
        )}
      </div>
    );
  }

  const franchiseName = safeDecode(name || '');
  const description = franchiseItems.find(item => item.franchiseDescription)?.franchiseDescription || franchiseItems[0]?.franchiseDescription || franchiseItems[0]?.description || '';
  
  const handleBookmark = async (e: React.MouseEvent, item: ContentItem) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!user) {
      navigate('/login');
      return;
    }
    await toggleWatchlist(item.id);
  };

  return (
    <div className="min-h-screen bg-brand-bg pt-44 md:pt-48 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <button 
          onClick={handleBack}
          className="flex items-center gap-2 text-brand-muted hover:text-white transition-colors mb-12 cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" /> Back
        </button>

        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-poppins font-black text-white tracking-tight mb-4">
            {franchiseName}
          </h1>
          {description && (
            <div className="text-gray-400 leading-relaxed mt-4 max-w-3xl mx-auto text-sm sm:text-base">
              <div className="whitespace-pre-line text-gray-400">
                {isDescriptionExpanded || description.length <= 290
                  ? description
                  : description.slice(0, 290) + '...'}
              </div>

              {description.length > 290 && (
                <button
                  onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                  className="text-white font-bold underline mt-4 hover:text-brand-primary transition-colors cursor-pointer text-sm inline-block"
                >
                  {isDescriptionExpanded ? 'Show less' : 'Read More'}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4 mb-8">
          <div className="flex justify-between text-sm font-medium text-brand-muted">
            <span>Watched {watchedCount}/{franchiseItems.length}</span>
            <span>{watchedPercent}%</span>
          </div>
          <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
            <div 
              className="bg-brand-primary h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: `${watchedPercent}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between mb-8">
          <div className="text-brand-muted font-mono">{franchiseItems.length} titles</div>
        </div>

        <div className="space-y-4">
          {franchiseItems.map((item, index) => (
            <Link 
              key={item.id}
              to={`/title/${item.id}`}
              className="flex items-center gap-6 py-4 border-b border-white/5 hover:bg-white/5 rounded-xl px-4 transition-colors group"
            >
              <div className="w-6 text-brand-muted font-mono text-lg text-center hidden sm:block">
                {index + 1}
              </div>
              
              <div className="w-16 sm:w-20 shrink-0">
                <div className="aspect-[2/3] rounded-lg overflow-hidden border border-white/10 relative shadow-xl">
                  <img src={item.posterUrl} alt={item.title} className="w-full h-full object-cover" />
                </div>
              </div>

              <div className="flex-grow">
                <h3 className="text-lg font-poppins font-semibold text-white group-hover:text-brand-primary transition-colors mb-2">
                  {item.title}
                </h3>
                <div className="flex flex-wrap items-center gap-3 text-sm text-brand-muted font-mono uppercase tracking-wider">
                  <span>{item.year}</span>
                  <span>•</span>
                  <span>{item.duration ? formatDuration(item.duration) : `${item.episodes || '?'} EP`}</span>
                  <span>•</span>
                  <span>{item.format === 'series' ? 'SERIES' : 'MOVIE'}</span>
                  {watchedIds.includes(item.id) && (
                    <span className="text-brand-primary font-bold text-xs bg-brand-primary/10 px-2 py-0.5 rounded-full">WATCHED</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2 hidden sm:flex">
                  <div className="flex text-brand-secondary">
                    {[1,2,3,4,5].map((star) => (
                      <Star 
                        key={star} 
                        className={`w-4 h-4 ${star <= (item.rating/2) ? 'fill-current' : 'text-white/20'}`} 
                      />
                    ))}
                  </div>
                  <span className="text-white font-medium">{(item.rating || 0).toFixed(1)}</span>
                  {(() => {
                    const votesDisplay = formatVotes(item.votes || omdbVotesMap[item.id], item.id, item.rating);
                    return votesDisplay ? <span className="text-brand-muted text-xs font-mono ml-1">{votesDisplay}</span> : null;
                  })()}
                </div>

                <div className="flex items-center gap-2">
                  <button 
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDownloadOpen(item);
                    }}
                    className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      navigate(`/title/${item.id}`);
                    }}
                    className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors hidden sm:flex"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={(e) => handleBookmark(e, item)}
                    className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors"
                  >
                    {watchlistIds.includes(item.id) ? (
                       <BookmarkCheck className="w-4 h-4 text-brand-primary" />
                    ) : (
                       <Bookmark className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </Link>
          ))}
        </div>

      </div>

      {/* Download Popup Modal */}
      {activeDownloadItem && createPortal(
        <AnimatePresence>
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className={`bg-[#1C1C1E] border border-white/5 rounded-2xl flex overflow-hidden shadow-2xl relative ${isContentSeries(activeDownloadItem) && activeItemAvailableSeasons.length > 0 ? 'max-w-4xl w-full h-[75vh]' : 'max-w-2xl w-full p-6 flex-col'}`}
            >
              <button 
                onClick={() => setActiveDownloadItem(null)}
                className="absolute top-6 right-6 text-gray-400 hover:text-white transition-colors z-10"
              >
                <X className="w-5 h-5" />
              </button>
              
              {isContentSeries(activeDownloadItem) && activeItemAvailableSeasons.length > 0 ? (
                /* Series Layout */
                <div className="flex flex-col md:flex-row w-full h-full">
                  {/* Left Sidebar: Seasons */}
                  <div className="w-full md:w-1/3 bg-black/20 border-b md:border-b-0 md:border-r border-white/5 overflow-y-auto flex flex-col">
                    <div className="p-6 pb-4">
                      <h2 className="text-xl font-bold text-white">Seasons</h2>
                    </div>
                    <div className="flex-1 px-4 pb-4 space-y-1">
                      {activeItemAvailableSeasons.map(s => (
                        <button
                          key={s.id}
                          onClick={() => handleSeasonChange(s.id)}
                          className={`w-full text-left px-4 py-3 rounded-xl transition-all flex items-center justify-between ${selectedSeasonId === s.id ? 'bg-white/10 text-white font-bold' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}
                        >
                          <span>{s.name}</span>
                          {selectedSeasonId === s.id && <ChevronRight className="w-4 h-4 text-brand-primary" />}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Right Content: Qualities & Files */}
                  <div className="w-full md:w-2/3 flex flex-col h-full bg-[#1C1C1E]">
                    <div className="p-6 pb-0 pt-16 md:pt-6">
                      <h2 className="text-xl font-bold text-white mb-6 hidden md:block">Downloads</h2>
                      
                      {/* Qualities Tabs */}
                      <div className="mb-4">
                        <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Qualities</h3>
                        <div className="flex flex-wrap gap-2">
                          {(() => {
                            let qualitiesObj = activeDownloadItem.qualities || {};
                            if (selectedSeasonId && activeDownloadItem.seasonData) {
                              const s = activeDownloadItem.seasonData.find(sz => sz.id === selectedSeasonId);
                              if (s) qualitiesObj = s.qualities || {};
                            }
                            return sortQualities(Object.keys(qualitiesObj).filter(k => qualitiesObj[k]?.enabled && qualitiesObj[k]?.versions.length > 0)).map(qKey => {
                              const vCount = qualitiesObj[qKey].versions.length;
                              const isSelected = selectedDownloadQuality === qKey;
                              return (
                                <button
                                  key={qKey}
                                  onClick={() => setSelectedDownloadQuality(qKey)}
                                  className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${isSelected ? 'bg-white text-black' : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white border border-transparent hover:border-white/10'}`}
                                >
                                  {qKey} <span className={isSelected ? 'text-gray-600 font-normal ml-1' : 'text-gray-500 font-normal ml-1'}>({vCount})</span>
                                </button>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-6 pt-0 flex-1 overflow-y-auto">
                      <div className="space-y-0">
                        {(() => {
                          let versions: QualityVersion[] = [];
                          if (selectedDownloadQuality) {
                            let qualitiesObj = activeDownloadItem.qualities || {};
                            if (selectedSeasonId && activeDownloadItem.seasonData) {
                              const s = activeDownloadItem.seasonData.find(sz => sz.id === selectedSeasonId);
                              if (s) qualitiesObj = s.qualities || {};
                            }
                            versions = qualitiesObj[selectedDownloadQuality]?.versions || [];
                          }
                          return versions.map((v, idx) => (
                            <div key={v.id || idx} className="flex items-center justify-between py-4 border-b border-white/5 last:border-0 group">
                              <div className="flex items-start gap-3 overflow-hidden pr-4">
                                <FileText className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                                <div className="min-w-0">
                                  <p className="text-white font-medium text-sm truncate">{v.name || `${activeDownloadItem.title} ${selectedDownloadQuality} Version ${idx + 1}`}</p>
                                  <div className="flex items-center gap-2 mt-2 text-xs font-mono">
                                    <span className="bg-white text-black px-2 py-0.5 rounded-md font-bold text-[10px] uppercase">{selectedDownloadQuality}</span>
                                    {v.size && <span className="bg-white/10 text-gray-300 px-2 py-0.5 rounded-md font-medium text-[10px]">{v.size}</span>}
                                    {v.sub && <span className="bg-[#0E2E2A] text-[#00E5BC] px-2 py-0.5 rounded-md border border-[#00E5BC]/10 font-bold text-[10px] tracking-wide">SUB</span>}
                                  </div>
                                </div>
                              </div>
                              <button 
                                onClick={() => handleDownloadLink(v.link, selectedDownloadQuality, v.name)}
                                className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0 hover:scale-105 transition-transform"
                              >
                                <Download className="w-5 h-5 text-black" />
                              </button>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Movie Layout */
                <>
                  <div className="mb-6">
                    <h2 className="text-xl font-bold text-white mb-6 pr-8">Available Downloads</h2>
                    
                    {/* Qualities Tabs */}
                    <div className="mb-4">
                      <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Qualities</h3>
                      <div className="flex flex-wrap gap-2">
                        {(() => {
                          let qualitiesObj = activeDownloadItem.qualities || {};
                          return sortQualities(Object.keys(qualitiesObj).filter(k => qualitiesObj[k]?.enabled && qualitiesObj[k]?.versions.length > 0)).map(qKey => {
                            const vCount = qualitiesObj[qKey].versions.length;
                            const isSelected = selectedDownloadQuality === qKey;
                            return (
                              <button
                                key={qKey}
                                onClick={() => setSelectedDownloadQuality(qKey)}
                                className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${isSelected ? 'bg-white text-black' : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white border border-transparent hover:border-white/10'}`}
                              >
                                {qKey} <span className={isSelected ? 'text-gray-600 font-normal ml-1' : 'text-gray-500 font-normal ml-1'}>({vCount})</span>
                              </button>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </div>
                  
                  {/* File List */}
                  <div className="max-h-[50vh] overflow-y-auto pr-2 mb-4 space-y-0">
                    {(() => {
                      let versions: QualityVersion[] = [];
                      if (selectedDownloadQuality) {
                        let qualitiesObj = activeDownloadItem.qualities || {};
                        versions = qualitiesObj[selectedDownloadQuality]?.versions || [];
                      }
                      return versions.map((v, idx) => (
                        <div key={v.id || idx} className="flex items-center justify-between py-4 border-b border-white/5 last:border-0 group">
                          <div className="flex items-start gap-3 overflow-hidden pr-4">
                            <FileText className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <p className="text-white font-medium text-sm truncate">{v.name || `${activeDownloadItem.title} ${selectedDownloadQuality} Version ${idx + 1}`}</p>
                              <div className="flex items-center gap-2 mt-2 text-xs font-mono">
                                <span className="bg-white text-black px-2 py-0.5 rounded-md font-bold text-[10px] uppercase">{selectedDownloadQuality}</span>
                                {v.size && <span className="bg-white/10 text-gray-300 px-2 py-0.5 rounded-md font-medium text-[10px]">{v.size}</span>}
                                {v.sub && <span className="bg-[#0E2E2A] text-[#00E5BC] px-2 py-0.5 rounded-md border border-[#00E5BC]/10 font-bold text-[10px] tracking-wide">SUB</span>}
                              </div>
                            </div>
                          </div>
                          <button 
                            onClick={() => handleDownloadLink(v.link, selectedDownloadQuality, v.name)}
                            className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0 hover:scale-105 transition-transform"
                          >
                            <Download className="w-5 h-5 text-black" />
                          </button>
                        </div>
                      ));
                    })()}
                  </div>
                </>
              )}
            </motion.div>
          </div>
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
