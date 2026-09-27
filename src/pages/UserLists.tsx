import React, { useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';

import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { 
  Loader2, Library, History, CheckCircle2, Heart, WifiOff, Star, 
  Bookmark, Mail, User, Calendar, Eye, Clapperboard 
} from 'lucide-react';
import { ContentItem } from '../types';
import emptyStateImg from '../assets/images/cinema_empty_state_1789120853211.jpg';

export default function UserLists() {
  const [searchParams, setSearchParams] = useSearchParams();
  const listType = searchParams.get('type') || 'mylists';
  const navigate = useNavigate();
  const { watchlistIds, watchedIds, likedIds, content: contextContent, toggleWatchlist } = useData();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [listItems, setListItems] = useState<ContentItem[]>([]);

  const titles = {
    'mylists': 'My Lists',
    'watchlist': 'Watchlist',
    'watched': 'Already Watched',
    'liked': 'Liked Content'
  };

  const allCount = Array.from(new Set([...watchlistIds, ...watchedIds, ...likedIds])).length;

  const listTabs = [
    { id: 'mylists', label: 'My Lists', icon: Library, count: allCount },
    { id: 'watchlist', label: 'Watchlist', icon: History, count: watchlistIds.length },
    { id: 'watched', label: 'Already Watched', icon: CheckCircle2, count: watchedIds.length },
    { id: 'liked', label: 'Liked', icon: Heart, count: likedIds.length }
  ];

  const handleListTypeChange = (type: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('type', type);
    setSearchParams(newParams, { replace: true });
  };

  const handleBookmarkClick = async (e: React.MouseEvent, contentId: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      navigate('/login');
      return;
    }

    await toggleWatchlist(contentId);
  };

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      navigate('/login');
      return;
    }

    let activeIds: string[] = [];
    if (listType === 'watchlist') {
      activeIds = watchlistIds;
    } else if (listType === 'watched') {
      activeIds = watchedIds;
    } else if (listType === 'liked') {
      activeIds = likedIds;
    } else {
      activeIds = Array.from(new Set([...watchlistIds, ...watchedIds, ...likedIds]));
    }

    if (activeIds.length === 0) {
      setListItems([]);
      setLoading(false);
      return;
    }

    // 1. Instantly map items from context content if available
    const availableItemsMap = new Map<string, ContentItem>((contextContent || []).map(i => [i.id, i]));
    const matchedItems: ContentItem[] = [];
    const missingIds: string[] = [];

    activeIds.forEach(id => {
      if (availableItemsMap.has(id)) {
        matchedItems.push(availableItemsMap.get(id)!);
      } else {
        missingIds.push(id);
      }
    });

    // If all items matched instantly, update listItems without full-screen loading spinner
    if (matchedItems.length > 0) {
      setListItems(matchedItems);
      setLoading(false);
    }

    // 2. Fetch missing items in the background if any
    if (missingIds.length > 0) {
      if (matchedItems.length === 0) {
        setLoading(true);
      }
      fetch(`/api/content/batch?ids=${encodeURIComponent(missingIds.join(","))}`)
        .then(res => res.ok ? res.json() : [])
        .then(data => {
          if (Array.isArray(data)) {
            const fetchedMap = new Map<string, ContentItem>(data.map((i: any) => [i.id, i as ContentItem]));
            const fullList: ContentItem[] = [];
            activeIds.forEach(id => {
              if (availableItemsMap.has(id)) {
                fullList.push(availableItemsMap.get(id)!);
              } else if (fetchedMap.has(id)) {
                fullList.push(fetchedMap.get(id)!);
              }
            });
            setListItems(fullList);
          }
        })
        .catch(err => {
          console.error("Error fetching missing list items:", err);
          if (matchedItems.length === 0) setError(true);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [user, authLoading, listType, navigate, watchlistIds, watchedIds, likedIds, contextContent]);

  // Derived user details
  const displayName = user?.name || user?.displayName || 'Abel Gebreslassie';
  const userInitial = (displayName.trim()[0] || 'A').toUpperCase();
  const username = user?.username || (user?.email ? user.email.split('@')[0] : 'abel2222');
  const userEmail = user?.email || 'abel.gebreslassie20@gmail.com';

  const formatJoinedDate = (dateVal?: string | number | Date | null) => {
    if (!dateVal) return 'Joined recently';
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return 'Joined recently';
      return `Joined ${d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
    } catch {
      return 'Joined recently';
    }
  };

  const [joinedDate, setJoinedDate] = useState<string>(() => formatJoinedDate(user?.createdAt));

  useEffect(() => {
    if (user?.createdAt) {
      setJoinedDate(formatJoinedDate(user.createdAt));
    } else if (user?.email || user?.uid) {
      fetch(`/api/user/profile?email=${encodeURIComponent(user.email || '')}&uid=${encodeURIComponent(user.uid || '')}`)
        .then(r => r.ok ? r.json() : null)
        .then(p => {
          if (p?.createdAt) {
            setJoinedDate(formatJoinedDate(p.createdAt));
          }
        })
        .catch(() => {});
    }
  }, [user]);

  // Iconic movie posters matching the exact screenshot collage
  const BANNER_POSTER_COLUMNS = [
    [
      "https://image.tmdb.org/t/p/w500/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg", // Inception
      "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg", // Interstellar
      "https://image.tmdb.org/t/p/w500/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg", // Fight Club
    ],
    [
      "https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg", // Oppenheimer
      "https://image.tmdb.org/t/p/w500/393WhBv5m7wBGauo5S1S4pI5y0D.jpg", // Spirited Away
      "https://image.tmdb.org/t/p/w500/d5NXSklXo0qyIYkgV94XAgMIckC.jpg", // Dune
    ],
    [
      "https://image.tmdb.org/t/p/w500/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg", // Spider-Man
      "https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg", // The Dark Knight
      "https://image.tmdb.org/t/p/w500/fqv8v6AycXKsivp1TddfqSrPRKd.jpg", // Arcane
    ],
    [
      "https://image.tmdb.org/t/p/w500/r2J02Z2OpNTctfOSN2Ydg39gWv3.jpg", // Guardians of the Galaxy
      "https://image.tmdb.org/t/p/w500/7WsyChQLEftFiDOVTGKV3hFpyyt.jpg", // Avengers
      "https://image.tmdb.org/t/p/w500/bOGkgRGdhrBYJSLpXaxhXVstNsV.jpg", // Inside Out 2
    ]
  ];

  return (
    <div className="min-h-screen pt-56 sm:pt-48 md:pt-40 pb-20 px-3.5 sm:px-6 lg:px-8 max-w-[1440px] mx-auto">
      {/* User Profile Banner - Matching Exact Screenshot Design */}
      {user && (
        <div className="mb-8 rounded-3xl bg-[#060811] border border-amber-500/30 p-6 sm:p-8 relative overflow-hidden shadow-[0_12px_45px_rgba(0,0,0,0.7)]">
          {/* Ambient Warm Corner Glows */}
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[110px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-orange-600/10 rounded-full blur-[90px] pointer-events-none" />

          {/* Cinematic Angled Movie Posters Collage in Background (Center-Right) */}
          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none">
            <div className="absolute left-[34%] sm:left-[38%] md:left-[42%] right-[-10%] -top-28 -bottom-28 flex gap-3.5 sm:gap-4.5 transform -rotate-[13deg] scale-105 opacity-30 filter brightness-75 contrast-125">
              {BANNER_POSTER_COLUMNS.map((col, colIdx) => (
                <div
                  key={colIdx}
                  className={`flex flex-col gap-3.5 sm:gap-4.5 shrink-0 ${
                    colIdx % 2 === 1 ? '-translate-y-10 sm:-translate-y-14' : 'translate-y-4 sm:translate-y-6'
                  }`}
                >
                  {col.map((poster, pIdx) => (
                    <div
                      key={pIdx}
                      className="w-24 sm:w-32 md:w-38 aspect-[2/3] rounded-xl overflow-hidden shadow-2xl border border-white/5 shrink-0"
                    >
                      <img
                        src={poster}
                        alt=""
                        loading="eager"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Vignette & Gradient Overlays for Smooth Integration & High Contrast */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#060811] via-[#060811]/70 sm:via-[#060811]/35 to-[#060811]/85" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#060811] via-transparent to-[#060811]/75" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#060811]/50 via-transparent to-[#060811]/75" />
          </div>

          {/* Profile Card Content */}
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            {/* Left: Avatar & User Information */}
            <div className="flex flex-col sm:flex-row items-center sm:items-center gap-4 sm:gap-6 text-center sm:text-left pt-1 sm:pt-0">
              {/* Circular Avatar with Glowing Amber Ring */}
              <div className="relative shrink-0 my-1 sm:my-0">
                <div className="w-24 h-24 sm:w-28 md:w-32 sm:h-28 md:h-32 rounded-full border-[3px] border-amber-500 shadow-[0_0_25px_rgba(245,158,11,0.5)] bg-gradient-to-b from-[#161F36] to-[#0A0E17] flex items-center justify-center overflow-hidden">
                  {user.photoURL ? (
                    <img 
                      src={user.photoURL} 
                      alt={displayName} 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="text-4xl sm:text-5xl font-black font-poppins text-transparent bg-clip-text bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 select-none">
                      {userInitial}
                    </span>
                  )}
                </div>
                {/* Green Online Status Indicator */}
                <div 
                  className="absolute bottom-1 right-1 sm:bottom-1.5 sm:right-1.5 w-5 h-5 rounded-full bg-emerald-500 border-3 border-[#060811] shadow-[0_0_8px_rgba(16,185,129,0.8)] flex items-center justify-center" 
                  title="Online"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                </div>
              </div>

              {/* User Metadata */}
              <div className="min-w-0 w-full sm:w-auto">
                <div className="flex flex-col sm:flex-row items-center sm:items-center gap-1.5 sm:gap-2.5">
                  <h2 className="text-2xl sm:text-3xl font-poppins font-bold text-white tracking-tight">
                    {displayName}
                  </h2>
                  <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.15)] whitespace-nowrap">
                    <span>@{username}</span>
                  </div>
                </div>

                <div className="flex items-center justify-center sm:justify-start gap-2 text-xs sm:text-sm text-gray-400 mt-2">
                  <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span className="truncate max-w-[260px] sm:max-w-none">{userEmail}</span>
                </div>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 sm:gap-3 text-xs sm:text-sm text-gray-400 mt-2">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap bg-white/[0.03] sm:bg-transparent px-2.5 py-0.5 sm:px-0 sm:py-0 rounded-full border border-white/5 sm:border-transparent">
                    <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span>Personal Collection</span>
                  </span>
                  <span className="text-gray-600 hidden sm:inline">•</span>
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap bg-white/[0.03] sm:bg-transparent px-2.5 py-0.5 sm:px-0 sm:py-0 rounded-full border border-white/5 sm:border-transparent">
                    <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span>{joinedDate}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Watchlist / Watched / Liked Metric Counters */}
            <div className="bg-[#070A12]/90 border border-white/10 rounded-2xl p-4 sm:p-5 flex items-center justify-around gap-6 sm:gap-8 backdrop-blur-md self-center lg:self-auto shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
              <div className="text-center flex flex-col items-center min-w-[65px]">
                <Bookmark className="w-5 h-5 text-amber-500 mb-1" />
                <span className="text-2xl sm:text-3xl font-bold text-white font-poppins">{watchlistIds.length}</span>
                <span className="text-[10px] sm:text-[11px] text-gray-400 font-semibold tracking-wider uppercase mt-0.5">WATCHLIST</span>
              </div>
              <div className="w-[1px] h-10 bg-white/10" />
              <div className="text-center flex flex-col items-center min-w-[65px]">
                <Eye className="w-5 h-5 text-cyan-400 mb-1" />
                <span className="text-2xl sm:text-3xl font-bold text-white font-poppins">{watchedIds.length}</span>
                <span className="text-[10px] sm:text-[11px] text-gray-400 font-semibold tracking-wider uppercase mt-0.5">WATCHED</span>
              </div>
              <div className="w-[1px] h-10 bg-white/10" />
              <div className="text-center flex flex-col items-center min-w-[65px]">
                <Heart className="w-5 h-5 text-rose-500 mb-1" />
                <span className="text-2xl sm:text-3xl font-bold text-white font-poppins">{likedIds.length}</span>
                <span className="text-[10px] sm:text-[11px] text-gray-400 font-semibold tracking-wider uppercase mt-0.5">LIKED</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header & Segmented Tabs Bar */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-poppins font-bold text-white tracking-tight">
              My Lists
            </h1>
            <span className="text-xs font-medium text-gray-400 bg-[#131722] border border-white/10 px-3 py-1 rounded-full">
              {listItems.length} items
            </span>
          </div>
          <p className="text-xs sm:text-sm text-gray-400 mt-1">
            Manage and view your saved movies, watchlist, and personal collection.
          </p>
        </div>

        {/* Tab Segmented Controls - 4-Column Grid on Mobile, Flex on Desktop, No scrollbar */}
        <div className="bg-[#0B0F19] border border-white/10 rounded-2xl p-1 sm:p-1.5 grid grid-cols-4 sm:flex items-center gap-1 sm:gap-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.3)] w-full md:w-auto">
          {listTabs.map((tab) => {
            const active = listType === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => handleListTypeChange(tab.id)}
                className={`relative flex items-center justify-center gap-1 sm:gap-2 px-1.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-sm font-medium transition-all duration-200 cursor-pointer text-center select-none ${
                  active
                    ? 'text-amber-400 font-semibold bg-white/[0.05] sm:bg-transparent'
                    : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${active ? 'text-amber-400' : 'text-gray-400'}`} />
                <span className="truncate">
                  {tab.id === 'watched' ? (
                    <>
                      <span className="hidden sm:inline">Already </span>
                      <span>Watched</span>
                    </>
                  ) : tab.id === 'mylists' ? (
                    <>
                      <span className="hidden sm:inline">My </span>
                      <span>Lists</span>
                    </>
                  ) : (
                    tab.label
                  )}
                </span>
                {active && (
                  <span className="absolute bottom-0 left-2 right-2 sm:left-3 sm:right-3 h-[2px] bg-gradient-to-r from-amber-500 to-orange-500 rounded-full shadow-[0_2px_8px_rgba(245,158,11,0.6)]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
        </div>
      ) : listItems.length > 0 ? (
        /* Carousel-style Card Grid */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6 animate-in fade-in duration-200">
          {listItems.map((item) => {
            const isBookmarked = watchlistIds.includes(item.id);
            return (
              <Link 
                key={item.id} 
                to={`/title/${item.id}`}
                className="group/card outline-none block"
              >
                <div className="relative">
                  {/* Image Container with signature cut corner */}
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
                      onClick={(e) => handleBookmarkClick(e, item.id)}
                      className={`absolute top-3 right-3 z-20 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer backdrop-blur-md border ${
                        isBookmarked
                          ? 'bg-gradient-to-br from-[#FF8C00] to-[#FFA726] border-[#FF8C00] text-[#070B14] shadow-[0_4px_12px_rgba(255,140,0,0.35)] hover:scale-110'
                          : 'bg-black/40 border-white/10 text-white/80 hover:bg-black/60 hover:text-white hover:border-white/20 hover:scale-110'
                      }`}
                      title={isBookmarked ? "Remove from Watchlist" : "Add to Watchlist"}
                    >
                      <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`} />
                    </button>

                    {/* Small decorative corner triangle */}
                    <div 
                      className="absolute bottom-0 right-0 w-6 h-6 bg-[#1a1a1a]/80 backdrop-blur-md"
                      style={{
                        clipPath: 'polygon(100% 0, 0 100%, 100% 100%)'
                      }}
                    />
                  </div>
                  
                  {/* Content Info */}
                  <div className="px-1">
                    <h3 className="font-poppins font-bold text-white truncate text-[15px] group-hover/card:text-amber-400 transition-colors">
                      {item.title}
                    </h3>
                    
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex items-center gap-1 bg-transparent border border-white/10 rounded-full px-2 py-0.5">
                        <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                        <span className="text-white text-xs font-semibold">{Number(item.rating || 0).toFixed(1)}</span>
                      </div>
                      {item.year && (
                        <div className="bg-transparent border border-white/10 rounded-full px-2 py-0.5">
                          <span className="text-white/60 text-xs font-semibold">{item.year}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : error ? (
        <div className="text-center py-20 bg-[#090D17] rounded-3xl border border-white/5 flex flex-col items-center">
          <WifiOff className="w-12 h-12 text-red-500 opacity-80 mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">Connection Error</h3>
          <p className="text-gray-400 mb-6">Please check your internet connection and try again.</p>
          <button onClick={() => window.location.reload()} className="px-6 py-2 bg-amber-500 text-black font-semibold rounded-xl cursor-pointer">Retry</button>
        </div>
      ) : (
        /* Empty State Card Matching the Provided Design */
        <div className="relative w-full rounded-3xl border border-white/10 bg-[#070A12] p-6 sm:p-10 lg:p-12 overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.6)] min-h-[360px] flex flex-col lg:flex-row items-center justify-between gap-8">
          {/* Left: 3D Cinema Illustration with Director Chair & Popcorn */}
          <div className="relative w-full lg:w-1/2 flex items-center justify-center">
            <div className="relative w-full max-w-[440px] rounded-2xl overflow-hidden shadow-2xl">
              <img
                src={emptyStateImg}
                alt="Cinema Director Chair, Popcorn and Clapperboard"
                className="w-full h-auto object-cover rounded-2xl shadow-lg"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[#070A12]/90 hidden lg:block" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#070A12] via-transparent to-transparent lg:hidden" />
            </div>
          </div>

          {/* Right: Informative Empty State Text & CTA */}
          <div className="relative z-10 w-full lg:w-1/2 flex flex-col items-center lg:items-start text-center lg:text-left">
            <h3 className="text-2xl sm:text-3xl lg:text-4xl font-poppins font-bold text-white tracking-tight leading-snug">
              Your list is looking a little <span className="text-amber-500">empty</span> ✨
            </h3>
            <p className="text-sm sm:text-base text-gray-400 mt-3 max-w-md leading-relaxed">
              Save movies and shows you love, track what you&apos;ve watched, and build your own collection.
            </p>

            <div className="flex items-center gap-4 mt-8 flex-wrap justify-center lg:justify-start">
              <button
                onClick={() => navigate('/')}
                className="px-7 py-3.5 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold rounded-2xl transition-all duration-300 hover:scale-105 active:scale-95 shadow-[0_4px_20px_rgba(245,158,11,0.35)] cursor-pointer flex items-center gap-2.5 text-sm sm:text-base"
              >
                <Clapperboard className="w-5 h-5 text-black" />
                <span>Browse Movies</span>
              </button>

              {/* Playful Dotted Golden Arrow pointing towards Browse Movies */}
              <div className="hidden sm:flex items-center text-amber-500/80">
                <svg width="80" height="36" viewBox="0 0 80 36" fill="none">
                  <path
                    d="M75 10 C 58 28, 30 32, 12 18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeDasharray="4 4"
                    strokeLinecap="round"
                  />
                  <path
                    d="M19 13 L 10 18 L 18 24"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}