import React, { useState, useMemo } from 'react';
import { ContentItem, ContentCategory } from '../../types';
import { ArrowLeft, Save, Plus, Trash2, Link as LinkIcon, Image as ImageIcon, Search, RefreshCw, Check, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useData } from '../../context/DataContext';

import QualityManager from '../../components/QualityManager';

const NO_IMAGE_PLACEHOLDER = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><rect width="100%" height="100%" fill="%23101524"/><g fill="%2364748b" font-family="system-ui,sans-serif" text-anchor="middle"><rect x="15" y="15" width="270" height="420" rx="16" fill="none" stroke="%23334155" stroke-width="2" stroke-dasharray="8 4"/><path d="M110 180h80c5 0 9 4 9 9v72c0 5-4 9-9 9h-80c-5 0-9-4-9-9v-72c0-5 4-9 9-9z" fill="none" stroke="%23475569" stroke-width="2"/><circle cx="130" cy="205" r="8" fill="%23475569"/><path d="M106 254l25-25 15 15 25-25 23 23" fill="none" stroke="%23475569" stroke-width="2"/><text x="150" y="320" font-size="16" font-weight="bold" fill="%2394a3b8" letter-spacing="2">NO IMAGE</text><text x="150" y="345" font-size="11" font-weight="600" fill="%2364748b" letter-spacing="1">AVAILABLE</text></g></svg>`;

const NO_BACKDROP_PLACEHOLDER = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450"><rect width="100%" height="100%" fill="%23101524"/><g fill="%2364748b" font-family="system-ui,sans-serif" text-anchor="middle"><rect x="20" y="20" width="760" height="410" rx="20" fill="none" stroke="%23334155" stroke-width="2" stroke-dasharray="10 5"/><path d="M360 160h80c5 0 9 4 9 9v72c0 5-4 9-9 9h-80c-5 0-9-4-9-9v-72c0-5 4-9 9-9z" fill="none" stroke="%23475569" stroke-width="2"/><circle cx="380" cy="185" r="8" fill="%23475569"/><path d="M356 234l25-25 15 15 25-25 23 23" fill="none" stroke="%23475569" stroke-width="2"/><text x="400" y="300" font-size="20" font-weight="bold" fill="%2394a3b8" letter-spacing="3">NO IMAGE AVAILABLE</text></g></svg>`;


interface ContentFormProps {
  item?: ContentItem;
  mode?: 'edit' | 'manual' | 'auto' | null;
  initialSearchQuery?: string;
  onSave: (data: any) => void;
  onCancel: () => void;
}

export default function ContentForm({ item, mode, initialSearchQuery, onSave, onCancel }: ContentFormProps) {
  const { content: globalContent } = useData();
  const [isOpenSelect, setIsOpenSelect] = useState(false);
  const categoryOptions: ContentCategory[] = ['Movies', 'Series', 'Animation', 'Anime', 'Indian'];

  const existingFranchises = useMemo(() => {
    const set = new Set<string>();
    globalContent.forEach(i => {
      const fn = (i.franchise || i.franchiseName || '').trim();
      if (fn) set.add(fn);
    });
    return Array.from(set).sort();
  }, [globalContent]);

  const [formData, setFormData] = useState<any>({
    title: item?.title || '',
    category: item?.category || 'Movies',
    year: item?.year || new Date().getFullYear(),
    releaseDate: item?.releaseDate || '',
    rating: item?.rating || 0.0,
    genres: item?.genres ? (Array.isArray(item.genres) ? item.genres.join(', ') : item.genres) : '',
    cast: item?.cast ? (Array.isArray(item.cast) ? item.cast.join(', ') : item.cast) : '',
    network: item?.network || '',
    franchise: item?.franchise || '',
    director: item?.director || '',
    maleActors: item?.maleActors || [],
    femaleActors: item?.femaleActors || [],
    description: item?.description || '',
    posterUrl: item?.posterUrl || '',
    backdropUrl: item?.backdropUrl || '',
    trailerUrl: item?.trailerUrl || '',
    duration: item?.duration || '',
    status: item?.status || '',
    language: item?.language || '',
    format: item?.format || (item?.category === 'Series' || item?.category === 'Asian Drama' ? 'series' : (item?.category === 'Movies' || item?.category === 'Animation' ? 'movie' : 'series')),
    episodes: item?.episodes || '',
    seasons: item?.seasons || '',
    qualities: item?.qualities || {
      '360P': { enabled: false, versions: [] },
      '480P': { enabled: false, versions: [] },
      '720P': { enabled: false, versions: [] },
      '1080P': { enabled: false, versions: [] },
      '2K': { enabled: false, versions: [] },
      '4K': { enabled: false, versions: [] }
    },
    seasonData: item?.seasonData || []
  });

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, fieldName: string) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData((prev: any) => ({ ...prev, [fieldName]: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const [tmdbSearchQuery, setTmdbSearchQuery] = useState(initialSearchQuery || '');
  const [isSearchingTmdb, setIsSearchingTmdb] = useState(false);
  const [tmdbResults, setTmdbResults] = useState<any[]>([]);
  const [tmdbError, setTmdbError] = useState('');

  // Ensure default seasons (5 seasons) exist when format is series
  React.useEffect(() => {
    if (formData.format === 'series' && (!formData.seasonData || formData.seasonData.length === 0)) {
      const initialSeasons = Array.from({ length: 5 }, (_, idx) => {
        const sNum = idx + 1;
        return {
          id: `season_${sNum}_${Date.now()}_${idx}`,
          seasonNumber: sNum,
          name: `Season ${sNum}`,
          qualities: {
            '360P': { enabled: false, versions: [] },
            '480P': { enabled: false, versions: [] },
            '720P': { enabled: false, versions: [] },
            '1080P': { enabled: false, versions: [] },
            '2K': { enabled: false, versions: [] },
            '4K': { enabled: false, versions: [] }
          }
        };
      });
      setFormData((prev: any) => ({
        ...prev,
        seasonData: initialSeasons
      }));
    }
  }, [formData.format]);

  // Expose global setters for Playwright automation to directly update links
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__updateFormLink = (quality: string, index: number, url: string, seasonIndex?: number) => {
        setFormData((prev: any) => {
          if (seasonIndex !== undefined) {
            // Update Series Link
            const newSeasonData = [...(prev.seasonData || [])];
            if (!newSeasonData[seasonIndex]) {
              newSeasonData[seasonIndex] = {
                id: Date.now().toString(),
                seasonNumber: seasonIndex + 1,
                name: `Season ${seasonIndex + 1}`,
                qualities: {
                  '360P': { enabled: false, versions: [] },
                  '480P': { enabled: false, versions: [] },
                  '720P': { enabled: false, versions: [] },
                  '1080P': { enabled: true, versions: [{ id: Date.now().toString(), name: 'Default', link: url, size: '', sub: false }] },
                  '2K': { enabled: false, versions: [] },
                  '4K': { enabled: false, versions: [] }
                }
              };
            } else {
              const sz = { ...newSeasonData[seasonIndex] };
              if (!sz.qualities[quality]) {
                sz.qualities[quality] = { enabled: true, versions: [] };
              }
              const newVersions = [...(sz.qualities[quality].versions || [])];
              if (newVersions[index]) {
                newVersions[index] = { ...newVersions[index], link: url };
              } else {
                newVersions.push({ id: Date.now().toString(), name: 'Default', link: url, size: '', sub: false });
              }
              sz.qualities = {
                ...sz.qualities,
                [quality]: {
                  enabled: true,
                  versions: newVersions
                }
              };
              newSeasonData[seasonIndex] = sz;
            }
            return { ...prev, seasonData: newSeasonData };
          } else {
            // Update Movie Link
            const newQualities = { ...prev.qualities };
            if (newQualities[quality] && newQualities[quality].versions[index]) {
              const newVersions = [...newQualities[quality].versions];
              newVersions[index] = { ...newVersions[index], link: url };
              newQualities[quality] = {
                ...newQualities[quality],
                versions: newVersions
              };
            }
            return { ...prev, qualities: newQualities };
          }
        });
      };
    }
  }, []);

  // Auto-search if initialSearchQuery is provided
  React.useEffect(() => {
    if (mode === 'auto' && initialSearchQuery) {
      handleTmdbSearch(initialSearchQuery);
    }
  }, [mode, initialSearchQuery]);

  React.useEffect(() => {
    if (mode === 'auto' && tmdbSearchQuery && tmdbSearchQuery.length > 2) {
      const timer = setTimeout(() => {
        handleTmdbSearch(tmdbSearchQuery);
      }, 500);
      return () => clearTimeout(timer);
    } else if (!tmdbSearchQuery) {
      setTmdbResults([]);
    }
  }, [tmdbSearchQuery, mode]);

  const handleTmdbSearch = async (queryToSearch?: string) => {
    const query = typeof queryToSearch === 'string' ? queryToSearch : tmdbSearchQuery;
    if (!query) return;
    setIsSearchingTmdb(true);
    setTmdbResults([]);
    setTmdbError('');
    try {
      const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('Unable to retrieve metadata. Please try again.');
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        setTmdbResults(data.results.slice(0, 5));
      } else {
        setTmdbError('No matching content found.');
      }
    } catch (err) {
      setTmdbError('Unable to retrieve metadata. Please try again.');
    }
    setIsSearchingTmdb(false);
  };

  const handleApplyTmdb = async (result: any) => {
    try {
      const type = result.media_type === 'tv' ? 'series' : 'movie';
      const detailRes = await fetch(`/api/tmdb/details/${type}/${result.id}?title=${encodeURIComponent(result.title || result.name || '')}&release_date=${encodeURIComponent(result.release_date || result.first_air_date || '')}`);
      if (!detailRes.ok) throw new Error('Unable to retrieve metadata. Please try again.');
      const details = await detailRes.json();
      
      let newCategory: any = 'Movies';
      const isAnimation = details.genres?.some((g: any) => g.name.toLowerCase() === 'animation');
      const isJapanese = details.original_language === 'ja';
      
      const isIndianLanguage = ['hi', 'te', 'ta', 'kn', 'ml', 'pa', 'gu', 'mr', 'bn', 'ur', 'or', 'as'].includes(details.original_language?.toLowerCase() || '');
      const isIndianCountry = details.production_countries?.some((c: any) => c.iso_3166_1 === 'IN' || c.name?.toLowerCase().includes('india')) ||
                              details.origin_country?.includes('IN') ||
                              result.origin_country?.includes('IN');
      const isIndian = isIndianLanguage || isIndianCountry;
      
      if (isIndian) {
          newCategory = 'Indian';
      } else if (isJapanese && isAnimation) {
          newCategory = 'Anime';
      } else if (result.media_type === 'tv') {
          newCategory = 'Series';
      } else {
          newCategory = 'Movies';
      }
      const releaseDate = details.release_date || details.first_air_date || '';
      const year = releaseDate ? releaseDate.substring(0, 4) : new Date().getFullYear();
      
      const genres = details.genres ? details.genres.map((g: any) => g.name).join(', ') : '';
      const cast = details.credits?.cast ? details.credits.cast.slice(0, 5).map((c: any) => c.name).join(', ') : '';

      let newSeasonData = formData.seasonData || [];
      if (result.media_type === 'tv' && details.seasons) {
         newSeasonData = details.seasons.filter((s:any) => s.season_number > 0).map((s: any) => ({
            id: s.id.toString(),
            seasonNumber: s.season_number,
            name: s.name || `Season ${s.season_number}`,
            qualities: {
               '360P': { enabled: false, versions: [] },
               '480P': { enabled: false, versions: [] },
               '720P': { enabled: false, versions: [] },
               '1080P': { enabled: false, versions: [] },
               '2K': { enabled: false, versions: [] },
               '4K': { enabled: false, versions: [] }
            }
         }));
      }

      let fetchedNetwork = formData.network || '';
      if (details.networks && details.networks.length > 0) {
        fetchedNetwork = details.networks[0].name;
      } else if (details.production_companies && details.production_companies.length > 0) {
        fetchedNetwork = details.production_companies[0].name;
      }

      const fetchedActorsData = details.credits?.cast ? details.credits.cast.slice(0, 12).map((c: any) => ({
        name: c.name,
        photoUrl: c.profile_path ? `https://image.tmdb.org/t/p/w500${c.profile_path}` : null
      })) : [];

      const fetchedStudiosData = details.production_companies && details.production_companies.length > 0 ? details.production_companies.map((c: any) => ({
        name: c.name,
        logoUrl: c.logo_path ? `https://image.tmdb.org/t/p/w500${c.logo_path}` : null
      })) : (details.networks && details.networks.length > 0 ? details.networks.map((n: any) => ({
        name: n.name,
        logoUrl: n.logo_path ? `https://image.tmdb.org/t/p/w500${n.logo_path}` : null
      })) : []);

      let directorObj = details.credits?.crew?.find((c: any) => c.job === 'Director');
      if (!directorObj && details.aggregate_credits?.crew) {
        const dirCandidates = details.aggregate_credits.crew
          .filter((c: any) => c.jobs && c.jobs.some((j: any) => j.job === 'Director'))
          .map((c: any) => {
            const dJob = c.jobs.find((j: any) => j.job === 'Director');
            return {
              name: c.name,
              profile_path: c.profile_path,
              episodes: dJob ? dJob.episode_count : 0
            };
          })
          .sort((a: any, b: any) => b.episodes - a.episodes);
        if (dirCandidates.length > 0) {
          directorObj = dirCandidates[0];
        }
      }
      if (!directorObj && details.created_by && details.created_by.length > 0) {
        directorObj = details.created_by[0];
      }
      if (!directorObj && details.credits?.crew) {
        directorObj = details.credits.crew.find((c: any) => c.job === 'Creator' || c.job === 'Showrunner' || c.job === 'Executive Producer' || c.job === 'Writer');
      }
      const fetchedDirector = directorObj ? directorObj.name : '';
      const fetchedDirectorPhotoUrl = directorObj && directorObj.profile_path ? `https://image.tmdb.org/t/p/w500${directorObj.profile_path}` : (formData.directorPhotoUrl || null);
      const fetchedMaleActors = details.credits?.cast ? details.credits.cast.filter((c: any) => c.gender === 2).map((c: any) => c.name) : [];
      const fetchedFemaleActors = details.credits?.cast ? details.credits.cast.filter((c: any) => c.gender === 1).map((c: any) => c.name) : [];
      const fetchedLanguage = details.original_language || result.original_language || formData.language || '';
      const fetchedFranchise = details.belongs_to_collection ? details.belongs_to_collection.name : (formData.franchise || formData.franchiseName || '');
      const fetchedFranchiseId = details.belongs_to_collection ? String(details.belongs_to_collection.id) : (formData.franchiseId || null);
      
      let fetchedTrailer = formData.trailerUrl || '';
      if (!fetchedTrailer && details.videos?.results) {
        const trailer = details.videos.results.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer');
        if (trailer) {
          fetchedTrailer = `https://www.youtube.com/watch?v=${trailer.key}`;
        }
      }

      let finalRating: any = 0.0;
      let finalVotes: any = formData.votes || null;

      try {
        const titleForOmdb = details.title || details.name;
        const imdbId = details.imdb_id || details.external_ids?.imdb_id || '';
        
        // Build the proxy URL
        let proxyUrl = `/api/ratings/omdb?title=${encodeURIComponent(titleForOmdb)}&year=${encodeURIComponent(year)}`;
        if (imdbId) {
           proxyUrl += `&imdbId=${encodeURIComponent(imdbId)}`;
        }

        const omdbRes = await fetch(proxyUrl);
        const omdbData = await omdbRes.json();
        
        if (omdbData.Response === 'True' && omdbData.imdbRating && omdbData.imdbRating !== 'N/A') {
          const parsed = parseFloat(omdbData.imdbRating);
          if (!isNaN(parsed) && parsed > 0) {
            finalRating = parsed.toFixed(1);
          }
          if (omdbData.imdbVotes && omdbData.imdbVotes !== 'N/A') {
            finalVotes = parseInt(omdbData.imdbVotes.replace(/,/g, ''), 10);
          }
        }
      } catch (e) {
        console.warn("Could not fetch IMDb rating from OMDB:", e);
      }

      setFormData({
        ...formData,
        title: details.title || details.name,
        category: newCategory,
        format: type === 'series' ? 'series' : 'movie',
        year: year,
        releaseDate: releaseDate,
        language: fetchedLanguage,
        rating: finalRating,
        votes: finalVotes || formData.votes,
        description: details.overview || '',
        genres: genres,
        cast: cast,
        actorsData: fetchedActorsData.length > 0 ? fetchedActorsData : formData.actorsData,
        studiosData: fetchedStudiosData.length > 0 ? fetchedStudiosData : formData.studiosData,
        directorPhotoUrl: fetchedDirectorPhotoUrl,
        director: fetchedDirector || formData.director,
        maleActors: fetchedMaleActors.length > 0 ? fetchedMaleActors : formData.maleActors,
        femaleActors: fetchedFemaleActors.length > 0 ? fetchedFemaleActors : formData.femaleActors,
        status: details.status || '',
        network: fetchedNetwork,
        franchise: fetchedFranchise,
        franchiseName: fetchedFranchise,
        franchiseId: fetchedFranchiseId,
        posterUrl: details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : (result.poster_path ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : NO_IMAGE_PLACEHOLDER),
        backdropUrl: details.backdrop_path ? `https://image.tmdb.org/t/p/original${details.backdrop_path}` : (result.backdrop_path ? `https://image.tmdb.org/t/p/original${result.backdrop_path}` : NO_BACKDROP_PLACEHOLDER),
        trailerUrl: fetchedTrailer,
        duration: details.runtime ? `${details.runtime} min` : (details.episode_run_time?.[0] ? `${details.episode_run_time[0]} min` : formData.duration),
        episodes: details.number_of_episodes || '',
        seasons: details.number_of_seasons || '',
        seasonData: type === 'series' ? (newSeasonData.length > 0 ? newSeasonData : formData.seasonData) : []
      });
      setTmdbResults([]);
      setTmdbSearchQuery('');
      setTmdbError('');
    } catch (err) {
      setTmdbError('Unable to retrieve metadata. Please try again.');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev: any) => ({ ...prev, [name]: value }));
  };

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveError, setSaveError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSaveError('');
    
    // Parse genres and cast
    const genresArray = (formData.genres || '').split(',').map((g: string) => g.trim()).filter(Boolean);
    const castArray = formData.cast ? formData.cast.split(',').map((c: string) => c.trim()).filter(Boolean) : [];
    
    let processedSeasonData = formData.seasonData;
    if (formData.format === 'series' && Array.isArray(formData.seasonData)) {
      processedSeasonData = formData.seasonData.map((season: any) => {
        const newQualities = { ...season.qualities };
        
        for (const q in newQualities) {
          if (newQualities[q]?.enabled) {
            newQualities[q].versions = (newQualities[q].versions || []).map((v: any) => ({
              ...v,
              link: v.link && typeof v.link === 'string' && v.link.trim() !== '' ? v.link : 'https://t.me/Series_Network'
            }));
          }
        }
        
        return { ...season, qualities: newQualities };
      });
    }

    const finalPosterUrl = formData.posterUrl || NO_IMAGE_PLACEHOLDER;
    const finalBackdropUrl = formData.backdropUrl || NO_BACKDROP_PLACEHOLDER;
    
    const cleanFranchise = (formData.franchise || '').trim();

    try {
      await onSave({
        ...formData,
        franchise: cleanFranchise,
        franchiseName: cleanFranchise,
        posterUrl: finalPosterUrl,
        backdropUrl: finalBackdropUrl,
        seasonData: processedSeasonData,
        language: formData.language,
        genres: genresArray,
        cast: castArray,
        year: parseInt(formData.year, 10) || new Date().getFullYear(),
        rating: parseFloat(formData.rating) || 0.0,
        episodes: formData.episodes ? parseInt(formData.episodes, 10) : undefined,
        seasons: formData.seasons ? parseInt(formData.seasons, 10) : undefined,
      });
    } catch (err: any) {
      console.error("Save content error:", err);
      setSaveError(err?.message || "Failed to save content. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <div className="min-h-screen bg-brand-bg pt-20 pb-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="flex items-center justify-between mb-8">
          <button 
            onClick={onCancel}
            className="flex items-center gap-2 text-brand-muted hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" /> Back to Dashboard
          </button>
          <h1 className="text-2xl font-poppins font-bold text-white">
            {item ? 'Edit Content' : 'Add New Content'}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          
          {/* Auto Fetch Section */}
          {mode !== 'manual' && (
            <div className="glass-card p-6 sm:p-8 rounded-2xl border border-brand-primary/30 space-y-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/10 rounded-full blur-3xl" />
              <h2 className="text-xl font-poppins font-semibold text-white flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-brand-primary" /> Auto-Fetch from TMDb
              </h2>
              <p className="text-sm text-brand-muted">
                Enter a title to automatically fetch all metadata, posters, genres, and ratings.
              </p>
              
              <div className="flex gap-4">
                 <div className="relative flex-1">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-muted" />
                   <input 
                     type="text" 
                     placeholder="Search movie or series name..." 
                     value={tmdbSearchQuery}
                     onChange={(e) => setTmdbSearchQuery(e.target.value)}
                     onKeyDown={(e) => {
                       if (e.key === 'Enter') {
                         e.preventDefault();
                         handleTmdbSearch();
                       }
                     }}
                     className="w-full glass bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-brand-primary transition-all"
                   />
                 </div>
                 <button 
                   type="button"
                   onClick={() => handleTmdbSearch()}
                   disabled={isSearchingTmdb || !tmdbSearchQuery}
                   className="bg-brand-primary hover:bg-brand-primary/90 text-white font-semibold px-6 py-3 rounded-xl transition-all shadow-lg disabled:opacity-50 flex items-center gap-2 shrink-0"
                 >
                   {isSearchingTmdb ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'Search'}
                 </button>
              </div>

              {tmdbError && (
                 <p className="text-red-400 text-sm mt-2 font-medium">{tmdbError}</p>
              )}

              {tmdbResults.length > 0 && (
                <div className="mt-4 border border-white/10 rounded-xl overflow-hidden glass bg-black/40 relative z-10 divide-y divide-white/5">
                   {tmdbResults.map((res: any) => (
                      <div key={res.id} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors gap-4">
                         <div className="flex items-center gap-4">
                            {res.poster_path ? (
                               <img src={`https://image.tmdb.org/t/p/w92${res.poster_path}`} alt={res.title || res.name} className="w-12 h-16 object-cover rounded shadow-md" />
                            ) : (
                               <div className="w-12 h-16 bg-white/10 rounded flex items-center justify-center text-xs text-brand-muted text-center">No Img</div>
                            )}
                            <div>
                              <p className="font-semibold text-white">{res.title || res.name}</p>
                              <p className="text-xs text-brand-muted capitalize">
                                {res.media_type === 'tv' ? 'Series' : 'Movie'} • {res.release_date || res.first_air_date || 'N/A'} • {res.vote_average ? res.vote_average.toFixed(1) : 'N/A'}⭐ 
                              </p>
                            </div>
                         </div>
                         <button
                           type="button"
                           onClick={() => handleApplyTmdb(res)}
                           className="flex items-center gap-2 px-4 py-2 bg-brand-secondary/20 text-brand-secondary hover:bg-brand-secondary hover:text-white rounded-lg transition-all text-sm font-semibold"
                         >
                            <Check className="w-4 h-4" /> Select
                         </button>
                      </div>
                   ))}
                </div>
              )}
            </div>
          )}

          {/* Basic Details */}
          <div className="glass-card p-6 sm:p-8 rounded-2xl border border-white/5 space-y-6">
            <h2 className="text-xl font-poppins font-semibold text-brand-primary border-b border-white/5 pb-2">Basic Details</h2>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-brand-muted">Title *</label>
                <input required type="text" name="title" value={formData.title} onChange={handleChange} className="w-full glass bg-white/5 border-white/10 rounded-xl px-4 py-3 text-white focus:border-brand-primary focus:ring-1 focus:ring-brand-primary" placeholder="Movie or Series title" />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-brand-muted">Format *</label>
                <div className="flex bg-white/5 rounded-xl p-1 border border-white/10 relative">
                  <div
                    className="absolute inset-y-1 bg-brand-primary rounded-lg transition-all duration-300 shadow-[0_0_15px_rgba(255,107,0,0.3)] z-0"
                    style={{
                      width: 'calc(50% - 4px)',
                      left: formData.format === 'movie' ? '4px' : '50%'
                    }}
                  />
                  <button
                    type="button"
                    data-testid="format-movie-btn"
                    onClick={() => setFormData((prev: any) => ({ ...prev, format: 'movie' }))}
                    className={`flex-1 relative z-10 py-2 text-sm font-semibold transition-colors duration-300 ${formData.format === 'movie' ? 'text-[#070B14]' : 'text-white/70 hover:text-white'}`}
                  >
                    Movie
                  </button>
                  <button
                    type="button"
                    data-testid="format-series-btn"
                    onClick={() => setFormData((prev: any) => {
                      let currentSeasons = prev.seasonData || [];
                      if (currentSeasons.length === 0) {
                        currentSeasons = [
                          {
                            id: Date.now().toString(),
                            seasonNumber: 1,
                            name: 'Season 1',
                            qualities: {
                              '360P': { enabled: false, versions: [] },
                              '480P': { enabled: false, versions: [] },
                              '720P': { enabled: false, versions: [] },
                              '1080P': { enabled: false, versions: [] },
                              '2K': { enabled: false, versions: [] },
                              '4K': { enabled: false, versions: [] }
                            }
                          }
                        ];
                      }
                      return {
                        ...prev,
                        format: 'series',
                        seasonData: currentSeasons
                      };
                    })}
                    className={`flex-1 relative z-10 py-2 text-sm font-semibold transition-colors duration-300 ${formData.format === 'series' ? 'text-[#070B14]' : 'text-white/70 hover:text-white'}`}
                  >
                    Series
                  </button>
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-brand-muted">Category *</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsOpenSelect(!isOpenSelect)}
                    className="w-full flex items-center justify-between glass bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white hover:bg-white/10 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all text-left"
                  >
                    <span>{formData.category}</span>
                    <ChevronDown className={`w-4 h-4 text-brand-muted transition-transform duration-200 ${isOpenSelect ? 'rotate-180 text-white' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {isOpenSelect && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsOpenSelect(false)} />
                        <motion.ul
                          initial={{ opacity: 0, y: -8, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -8, scale: 0.95 }}
                          transition={{ duration: 0.15 }}
                          className="absolute z-20 w-full mt-2 bg-[#151B2D] border border-white/10 rounded-xl py-1 overflow-hidden shadow-2xl"
                        >
                          {categoryOptions.map((cat) => (
                            <li key={cat}>
                              <button
                                type="button"
                                onClick={() => {
                                  setFormData((prev: any) => ({ 
                                    ...prev, 
                                    category: cat,
                                    format: (cat === 'Series' || cat === 'Asian Drama') ? 'series' : (cat === 'Movies' ? 'movie' : prev.format)
                                  }));
                                  setIsOpenSelect(false);
                                }}
                                className={`w-full text-left py-2.5 px-4 text-sm transition-colors ${
                                  formData.category === cat 
                                    ? 'bg-brand-primary/20 text-brand-primary font-medium' 
                                    : 'text-white/80 hover:bg-white/5 hover:text-white'
                                }`}
                              >
                                {cat}
                              </button>
                            </li>
                          ))}
                        </motion.ul>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-brand-muted">Genres (comma separated)</label>
                <input type="text" name="genres" value={formData.genres} onChange={handleChange} className="w-full glass bg-white/5 border-white/10 rounded-xl px-4 py-3 text-white focus:border-brand-primary" placeholder="Action, Sci-Fi, Drama" />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-brand-muted">Network / Studio</label>
                <input type="text" name="network" value={formData.network} onChange={handleChange} className="w-full glass bg-white/5 border-white/10 rounded-xl px-4 py-3 text-white focus:border-brand-primary" placeholder="Netflix, HBO Max, etc." />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-brand-muted">Franchise (Optional)</label>
                <input 
                  type="text" 
                  name="franchise" 
                  value={formData.franchise} 
                  onChange={handleChange} 
                  list="existing-franchises-list"
                  className="w-full glass bg-white/5 border-white/10 rounded-xl px-4 py-3 text-white focus:border-brand-primary" 
                  placeholder="e.g., Pirates of the Caribbean" 
                />
                <datalist id="existing-franchises-list">
                  {existingFranchises.map((f: string) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium text-brand-muted">Cast (comma separated)</label>
                <input type="text" name="cast" value={formData.cast} onChange={handleChange} className="w-full glass bg-white/5 border-white/10 rounded-xl px-4 py-3 text-white focus:border-brand-primary" placeholder="Actor 1, Actor 2..." />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-brand-muted">Release Year</label>
                  <input type="number" name="year" value={formData.year} onChange={handleChange} className="w-full glass bg-white/5 border-white/10 rounded-xl px-4 py-3 text-white focus:border-brand-primary" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-brand-muted">Release Date</label>
                  <input type="date" name="releaseDate" value={formData.releaseDate} onChange={handleChange} className="w-full glass bg-[#151B2D] border-white/10 rounded-xl px-4 py-3 text-white focus:border-brand-primary" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-brand-muted">IMDb Rating</label>
                  <input type="number" step="0.1" max="10" min="0" name="rating" value={formData.rating} onChange={handleChange} className="w-full glass bg-white/5 border-white/10 rounded-xl px-4 py-3 text-white focus:border-brand-primary" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-brand-muted">Runtime / Duration</label>
                  <input type="text" name="duration" value={formData.duration} onChange={handleChange} className="w-full glass bg-white/5 border-white/10 rounded-xl px-4 py-3 text-white focus:border-brand-primary" placeholder="e.g. 120 min" />
                </div>
              </div>
              
              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium text-brand-muted">YouTube Trailer URL</label>
                <input type="text" name="trailerUrl" value={formData.trailerUrl} onChange={handleChange} className="w-full glass bg-white/5 border-white/10 rounded-xl px-4 py-3 text-white focus:border-brand-primary" placeholder="https://www.youtube.com/watch?v=..." />
              </div>
              
              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium text-brand-muted">Description</label>
                <textarea rows={4} name="description" value={formData.description} onChange={handleChange} className="w-full glass bg-white/5 border-white/10 rounded-xl px-4 py-3 text-white focus:border-brand-primary resize-none" placeholder="Enter a detailed description..." />
              </div>
              
              <div className="grid grid-cols-3 gap-4 sm:col-span-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-brand-muted">Status</label>
                  <input type="text" name="status" value={formData.status} onChange={handleChange} className="w-full glass bg-white/5 border-white/10 rounded-xl px-4 py-3 text-white focus:border-brand-primary" placeholder="e.g. Returning Series" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-brand-muted">Seasons</label>
                  <input type="number" name="seasons" value={formData.seasons} onChange={handleChange} className="w-full glass bg-white/5 border-white/10 rounded-xl px-4 py-3 text-white focus:border-brand-primary" placeholder="e.g. 5" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-brand-muted">Episodes</label>
                  <input type="number" name="episodes" value={formData.episodes} onChange={handleChange} className="w-full glass bg-white/5 border-white/10 rounded-xl px-4 py-3 text-white focus:border-brand-primary" placeholder="e.g. 24" />
                </div>
              </div>
            </div>
          </div>

          {/* Media Links */}
          <div className="glass-card p-6 sm:p-8 rounded-2xl border border-white/5 space-y-6">
            <h2 className="text-xl font-poppins font-semibold text-brand-primary border-b border-white/5 pb-2 flex items-center gap-2">
              <ImageIcon className="w-5 h-5" /> Images
            </h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-4">
                <label className="text-sm font-medium text-brand-muted">Poster Image</label>
                <div className="relative border-2 border-dashed border-white/10 rounded-2xl p-8 hover:border-brand-primary/50 transition-colors flex flex-col items-center justify-center bg-white/5 text-center cursor-pointer overflow-hidden min-h-[250px]">
                   <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'posterUrl')} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                   {formData.posterUrl ? (
                      <img src={formData.posterUrl} alt="Poster" className="absolute inset-0 w-full h-full object-cover" />
                   ) : (
                      <div className="space-y-4">
                         <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto">
                            <Plus className="w-8 h-8 text-brand-muted" />
                         </div>
                         <p className="text-sm font-medium text-brand-muted">Drag & Drop or Click to upload Poster</p>
                      </div>
                   )}
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-sm font-medium text-brand-muted">Backdrop Image</label>
                <div className="relative border-2 border-dashed border-white/10 rounded-2xl p-8 hover:border-brand-primary/50 transition-colors flex flex-col items-center justify-center bg-white/5 text-center cursor-pointer overflow-hidden min-h-[250px]">
                   <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'backdropUrl')} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                   {formData.backdropUrl ? (
                      <img src={formData.backdropUrl} alt="Backdrop" className="absolute inset-0 w-full h-full object-cover" />
                   ) : (
                      <div className="space-y-4">
                         <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto">
                            <Plus className="w-8 h-8 text-brand-muted" />
                         </div>
                         <p className="text-sm font-medium text-brand-muted">Drag & Drop or Click to upload Backdrop</p>
                      </div>
                   )}
                </div>
              </div>
            </div>
          </div>

          {/* Season / Quality config */}
          {(formData.format === 'series') ? (
             <div className="glass-card p-6 sm:p-8 rounded-2xl border border-white/5 space-y-6">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                   <h2 className="text-xl font-poppins font-semibold text-brand-primary flex items-center gap-2">
                      <LinkIcon className="w-5 h-5" /> Season Management
                   </h2>
                   <button
                      type="button"
                      data-testid="btn-add-season"
                      onClick={() => setFormData((prev: any) => ({
                         ...prev,
                         seasonData: [
                            ...prev.seasonData,
                            {
                               id: Date.now().toString(),
                               seasonNumber: prev.seasonData.length + 1,
                               name: `Season ${prev.seasonData.length + 1}`,
                               qualities: {
                                  '360P': { enabled: false, versions: [] },
                                  '480P': { enabled: false, versions: [] },
                                  '720P': { enabled: false, versions: [] },
                                  '1080P': { enabled: false, versions: [] },
                                  '2K': { enabled: false, versions: [] },
                                  '4K': { enabled: false, versions: [] }
                               }
                            }
                         ]
                      }))}
                      className="bg-brand-primary hover:bg-brand-primary/90 text-white font-semibold px-4 py-2 rounded-xl transition-all shadow-lg flex items-center gap-2 text-sm"
                   >
                     <Plus className="w-4 h-4" /> Add Season
                   </button>
                </div>

                <div className="space-y-8">
                   {formData.seasonData.map((s: any, seasonIndex: number) => (
                      <div key={s.id} className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-4">
                         <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-4">
                            <input
                               type="text"
                               value={s.name}
                               onChange={e => setFormData((prev: any) => ({
                                  ...prev,
                                  seasonData: prev.seasonData.map((sz: any) => sz.id === s.id ? { ...sz, name: e.target.value } : sz)
                               }))}
                               className="text-lg font-bold bg-transparent text-white border-0 border-b border-transparent hover:border-white/20 focus:border-brand-primary focus:outline-none focus:ring-0 transition-colors w-48"
                            />
                            <button
                               type="button"
                               onClick={() => setFormData((prev: any) => ({
                                  ...prev,
                                  seasonData: prev.seasonData.filter((sz: any) => sz.id !== s.id)
                               }))}
                               className="text-brand-muted hover:text-red-500 transition-colors p-2"
                            >
                               <Trash2 className="w-4 h-4" />
                            </button>
                         </div>
                         <QualityManager
                            qualities={s.qualities}
                            seasonIndex={seasonIndex}
                            seasonNumber={s.seasonNumber}
                            onChange={newQ => setFormData((prev: any) => ({
                               ...prev,
                               seasonData: prev.seasonData.map((sz: any) => sz.id === s.id ? { ...sz, qualities: newQ } : sz)
                            }))}
                         />
                      </div>
                   ))}
                   {formData.seasonData.length === 0 && (
                      <p className="text-center text-brand-muted py-8">No seasons added. Click "Add Season" to configure links.</p>
                   )}
                </div>
             </div>
          ) : (
             <div className="glass-card p-6 sm:p-8 rounded-2xl border border-white/5 space-y-6">
                <h2 className="text-xl font-poppins font-semibold text-brand-primary border-b border-white/5 pb-2 flex items-center gap-2">
                  <LinkIcon className="w-5 h-5" /> Quality & Links Configuration
                </h2>
                <QualityManager
                  qualities={formData.qualities}
                  onChange={newQ => setFormData((prev: any) => ({ ...prev, qualities: newQ }))}
                />
             </div>
          )}

          {saveError && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm font-medium">
              {saveError}
            </div>
          )}

          <div className="flex justify-end gap-4">
            <button 
              type="button" 
              onClick={onCancel}
              disabled={isSubmitting}
              className="px-6 py-3 rounded-xl font-semibold text-brand-muted hover:text-white hover:bg-white/5 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={isSubmitting}
              data-testid="btn-save-content"
              className="flex items-center gap-2 px-8 py-3 rounded-xl font-semibold bg-brand-primary text-white hover:bg-brand-primary/90 hover:shadow-[0_0_20px_rgba(255,107,0,0.4)] transition-all disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" /> Save Content
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
