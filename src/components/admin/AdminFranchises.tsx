import React, { useState, useEffect, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { ContentItem } from '../../types';
import { 
  Search, Plus, Edit2, Trash2, X, Check, Loader2, Film, Tv, 
  ChevronRight, ArrowRight, Star, RefreshCw, Layers, CheckCircle
} from 'lucide-react';

interface FranchiseGroup {
  name: string;
  items: ContentItem[];
  count: number;
  yearRange: string;
  description: string;
}

export default function AdminFranchises() {
  const { content: globalContent = [], updateContentItem, loadFullContent } = useData();
  const [localContent, setLocalContent] = useState<ContentItem[]>(globalContent);

  // Ensure content is loaded
  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      if (globalContent.length > 0) {
        setLocalContent(globalContent);
        return;
      }
      try {
        const fullContent = await loadFullContent();
        if (isMounted && fullContent.length > 0) {
          setLocalContent(fullContent);
        }
      } catch (e) {
        console.error(e);
      }
    };
    load();
    return () => { isMounted = false; };
  }, [globalContent, loadFullContent]);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  
  // Managing a specific franchise's titles
  const [managingFranchise, setManagingFranchise] = useState<FranchiseGroup | null>(null);
  const [movieSearchQuery, setMovieSearchQuery] = useState('');

  // TMDB Search & Add state for adding brand new movies
  const [tmdbSearchQuery, setTmdbSearchQuery] = useState('');
  const [tmdbResults, setTmdbResults] = useState<any[]>([]);
  const [isSearchingTmdb, setIsSearchingTmdb] = useState(false);

  // Editing franchise name/description state
  const [editingFranchiseName, setEditingFranchiseName] = useState<string | null>(null);
  const [newNameInput, setNewNameInput] = useState('');
  const [newDescInput, setNewDescInput] = useState('');

  // Creation state
  const [isCreating, setIsCreating] = useState(false);
  const [newFranchiseName, setNewFranchiseName] = useState('');
  const [newFranchiseDescription, setNewFranchiseDescription] = useState('');
  const [creationSelectedItems, setCreationSelectedItems] = useState<ContentItem[]>([]);
  const [creationSearchQuery, setCreationSearchQuery] = useState('');

  // Saving state indicator
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Derived localContent logic remains since we need to resolve items
  const [cachedFranchises, setCachedFranchises] = useState<any[]>([]);
  const [isCacheLoading, setIsCacheLoading] = useState(false);

  const loadCache = async () => {
    setIsCacheLoading(true);
    try {
      const res = await fetch('/api/admin/franchise-cache');
      if (res.ok) {
        const data = await res.json();
        setCachedFranchises(data);
      }
    } catch (err) {
      console.error('Error fetching franchise cache:', err);
    } finally {
      setIsCacheLoading(false);
    }
  };

  useEffect(() => {
    loadCache();
  }, []);

  // Derive franchises from global content and cache
  const franchises = useMemo(() => {
    return cachedFranchises.map(cacheEntry => {
      const associatedIds = Array.isArray(cacheEntry.associatedIds) ? cacheEntry.associatedIds : [];
      const items = associatedIds
        .map(id => localContent.find(c => c.id === id))
        .filter(Boolean) as ContentItem[];
        
      items.sort((a, b) => (a.year || 0) - (b.year || 0));
        
      return {
        name: cacheEntry.name,
        items,
        count: cacheEntry.movieCount,
        yearRange: cacheEntry.yearRange || '',
        avgRating: cacheEntry.averageRating || 0,
        description: cacheEntry.description || ''
      };
    }).sort((a, b) => {
      if ((b.avgRating || 0) !== (a.avgRating || 0)) return (b.avgRating || 0) - (a.avgRating || 0);
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name);
    });
  }, [cachedFranchises, localContent]);

  // Filtered franchises based on search query
  const filteredFranchises = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return franchises;
    return franchises.filter(f => f.name.toLowerCase().includes(q));
  }, [franchises, searchQuery]);

  // Autocomplete suggestions for adding a movie to a franchise
  const availableMoviesForManagement = useMemo(() => {
    if (!managingFranchise) return [];
    const q = movieSearchQuery.toLowerCase().trim();

    // Filter content not in the franchise
    return localContent.filter(item => {
      const isAlreadyInFranchise = item.franchise && item.franchise.trim().toLowerCase() === managingFranchise.name.toLowerCase();
      if (isAlreadyInFranchise) return false;
      if (!q) return true;
      return item.title.toLowerCase().includes(q) || 
             (item.originalTitle && item.originalTitle.toLowerCase().includes(q));
    }).slice(0, 20);
  }, [localContent, managingFranchise, movieSearchQuery]);

  // Autocomplete suggestions for creating a franchise
  const availableMoviesForCreation = useMemo(() => {
    const q = creationSearchQuery.toLowerCase().trim();

    // Filter items not already in the selection list
    return localContent.filter(item => {
      const isAlreadySelected = creationSelectedItems.some(selected => selected.id === item.id);
      if (isAlreadySelected) return false;
      if (!q) return true;
      return item.title.toLowerCase().includes(q) || 
             (item.originalTitle && item.originalTitle.toLowerCase().includes(q));
    }).slice(0, 20);
  }, [localContent, creationSelectedItems, creationSearchQuery]);

  // TMDB search handler
  const handleTmdbSearchForFranchise = async () => {
    if (!tmdbSearchQuery.trim()) return;
    setIsSearchingTmdb(true);
    try {
      const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(tmdbSearchQuery)}`);
      const data = await res.json();
      setTmdbResults(data.results || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearchingTmdb(false);
    }
  };

  // Add brand new TMDB movie directly to franchise
  const handleAddNewTmdbMovieToFranchise = async (result: any, franchiseName: string) => {
    setIsSaving(true);
    try {
      const type = result.media_type === 'tv' ? 'series' : 'movie';
      const detailRes = await fetch(`/api/tmdb/details/${type}/${result.id}?title=${encodeURIComponent(result.title || result.name || '')}`);
      const details = await detailRes.json();

      const releaseDate = details.release_date || details.first_air_date || '';
      const year = releaseDate ? parseInt(releaseDate.substring(0, 4)) : new Date().getFullYear();

      const fetchedTrailer = details.videos?.results 
        ? details.videos.results.find((v: any) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'))?.key 
        : null;

      const newContent: any = {
        id: crypto.randomUUID(),
        title: result.title || result.name,
        originalTitle: result.original_title || result.original_name || '',
        category: result.media_type === 'tv' ? 'Series' : 'Movies',
        format: result.media_type === 'tv' ? 'series' : 'movie',
        year,
        releaseDate,
        genres: details.genres ? details.genres.map((g: any) => g.name) : [],
        description: details.overview || '',
        posterUrl: details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : 'https://placehold.co/400x600/151B2D/FFFFFF?text=No+Poster',
        backdropUrl: details.backdrop_path ? `https://image.tmdb.org/t/p/original${details.backdrop_path}` : 'https://placehold.co/1200x800/151B2D/FFFFFF?text=No+Backdrop',
        rating: details.vote_average ? parseFloat(details.vote_average.toFixed(1)) : 7.0,
        duration: details.runtime ? `${details.runtime} min` : '120 min',
        franchise: franchiseName,
        franchiseName: franchiseName,
        franchiseDescription: managingFranchise?.description || '',
        trailerUrl: fetchedTrailer ? `https://www.youtube.com/watch?v=${fetchedTrailer}` : `https://www.youtube.com/results?search_query=${encodeURIComponent((result.title || result.name) + ' trailer')}`,
        actorsData: details.credits?.cast ? details.credits.cast.slice(0, 12).map((c: any) => ({
          name: c.name,
          photoUrl: c.profile_path ? `https://image.tmdb.org/t/p/w500${c.profile_path}` : null
        })) : [],
        studiosData: details.production_companies && details.production_companies.length > 0 ? details.production_companies.map((c: any) => ({
          name: c.name,
          logoUrl: c.logo_path ? `https://image.tmdb.org/t/p/w500${c.logo_path}` : null
        })) : [],
        director: (() => {
          let dir = details.credits?.crew?.find((c: any) => c.job === 'Director');
          if (!dir && details.aggregate_credits?.crew) {
            const candidates = details.aggregate_credits.crew
              .filter((c: any) => c.jobs && c.jobs.some((j: any) => j.job === 'Director'))
              .map((c: any) => ({ name: c.name, profile_path: c.profile_path, count: c.jobs.find((j: any) => j.job === 'Director')?.episode_count || 0 }))
              .sort((a: any, b: any) => b.count - a.count);
            if (candidates.length > 0) dir = candidates[0];
          }
          if (!dir && details.created_by && details.created_by.length > 0) dir = details.created_by[0];
          if (!dir && details.credits?.crew) dir = details.credits.crew.find((c: any) => c.job === 'Creator' || c.job === 'Showrunner' || c.job === 'Executive Producer' || c.job === 'Writer');
          return dir ? dir.name : '';
        })(),
        directorPhotoUrl: (() => {
          let dir = details.credits?.crew?.find((c: any) => c.job === 'Director');
          if (!dir && details.aggregate_credits?.crew) {
            const candidates = details.aggregate_credits.crew
              .filter((c: any) => c.jobs && c.jobs.some((j: any) => j.job === 'Director'))
              .map((c: any) => ({ name: c.name, profile_path: c.profile_path, count: c.jobs.find((j: any) => j.job === 'Director')?.episode_count || 0 }))
              .sort((a: any, b: any) => b.count - a.count);
            if (candidates.length > 0) dir = candidates[0];
          }
          if (!dir && details.created_by && details.created_by.length > 0) dir = details.created_by[0];
          if (!dir && details.credits?.crew) dir = details.credits.crew.find((c: any) => c.job === 'Creator' || c.job === 'Showrunner' || c.job === 'Executive Producer' || c.job === 'Writer');
          return dir && dir.profile_path ? `https://image.tmdb.org/t/p/w500${dir.profile_path}` : null;
        })(),
        cast: details.credits?.cast ? details.credits.cast.slice(0, 8).map((c: any) => c.name).join(', ') : '',
        tmdbId: result.id
      };

      await updateContentItem(newContent);
      showNotification(`Added new movie "${newContent.title}" to ${franchiseName}!`);
      setTimeout(() => loadCache(), 1500);
      setTmdbResults([]);
      setTmdbSearchQuery('');

      if (managingFranchise) {
        setManagingFranchise(prev => prev ? {
          ...prev,
          items: [...prev.items, newContent].sort((a, b) => (a.year || 0) - (b.year || 0)),
          count: prev.count + 1
        } : null);
      }
    } catch (err) {
      console.error('Error adding brand new movie to franchise:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Action: Update franchise details (name & description)
  const handleUpdateFranchise = async (oldName: string) => {
    const cleanedNewName = newNameInput.trim();
    const cleanedNewDesc = newDescInput.trim();
    if (!cleanedNewName) {
      setEditingFranchiseName(null);
      return;
    }

    setIsSaving(true);
    try {
      const itemsToUpdate = globalContent.filter(
        item => {
          const fn = (item.franchise || item.franchiseName || '').trim().toLowerCase();
          return fn === oldName.toLowerCase();
        }
      );

      // Perform batch update on all matches
      await Promise.all(
        itemsToUpdate.map(item => 
          updateContentItem({
            ...item,
            franchise: cleanedNewName,
            franchiseName: cleanedNewName,
            franchiseDescription: cleanedNewDesc
          })
        )
      );

      showNotification('Franchise updated successfully!');
      
      setTimeout(() => loadCache(), 1500);
      
      // If we are currently managing this franchise, update local state
      if (managingFranchise && managingFranchise.name.toLowerCase() === oldName.toLowerCase()) {
        setManagingFranchise(prev => prev ? {
          ...prev,
          name: cleanedNewName,
          description: cleanedNewDesc
        } : null);
      }
    } catch (err) {
      console.error('Error updating franchise details:', err);
    } finally {
      setIsSaving(false);
      setEditingFranchiseName(null);
    }
  };

  // Action: Remove movie from franchise
  const handleRemoveMovieFromFranchise = async (item: ContentItem) => {
    setIsSaving(true);
    try {
      await updateContentItem({
        ...item,
        franchise: '' // Clear franchise
      });
      
      showNotification(`"${item.title}" removed from franchise.`);

      setTimeout(() => loadCache(), 1500);

      // Update managing franchise local state to reflect change instantly
      if (managingFranchise) {
        setManagingFranchise(prev => {
          if (!prev) return null;
          const updatedItems = prev.items.filter(i => i.id !== item.id);
          return {
            ...prev,
            items: updatedItems,
            count: updatedItems.length
          };
        });
      }
    } catch (err) {
      console.error('Error removing movie from franchise:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Action: Add movie to franchise
  const handleAddMovieToFranchise = async (item: ContentItem, franchiseName: string) => {
    setIsSaving(true);
    setMovieSearchQuery('');
    try {
      await updateContentItem({
        ...item,
        franchise: franchiseName,
        franchiseDescription: managingFranchise?.description || ''
      });

      showNotification(`"${item.title}" added to ${franchiseName}.`);

      setTimeout(() => loadCache(), 1500);

      // Update managing franchise local state to reflect change instantly
      if (managingFranchise) {
        setManagingFranchise(prev => {
          if (!prev) return null;
          const updatedItems = [...prev.items, { ...item, franchise: franchiseName, franchiseDescription: prev.description }].sort(
            (a, b) => (a.year || 0) - (b.year || 0)
          );
          return {
            ...prev,
            items: updatedItems,
            count: updatedItems.length
          };
        });
      }
    } catch (err) {
      console.error('Error adding movie to franchise:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Action: Submit creation of a franchise
  const handleCreateFranchiseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newFranchiseName.trim();
    const desc = newFranchiseDescription.trim();
    if (!name) return;

    if (creationSelectedItems.length === 0) {
      alert('Please add at least one title to create the franchise.');
      return;
    }

    setIsSaving(true);
    try {
      // Set franchise name and description for all selected items
      await Promise.all(
        creationSelectedItems.map(item => 
          updateContentItem({
            ...item,
            franchise: name,
            franchiseDescription: desc
          })
        )
      );

      showNotification(`Franchise "${name}" created successfully with ${creationSelectedItems.length} titles.`);
      setTimeout(() => loadCache(), 1500);
      
      // Reset creation state
      setIsCreating(false);
      setNewFranchiseName('');
      setNewFranchiseDescription('');
      setCreationSelectedItems([]);
      setCreationSearchQuery('');
    } catch (err) {
      console.error('Error creating franchise:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const showNotification = (message: string) => {
    setSaveSuccess(message);
    setTimeout(() => {
      setSaveSuccess(null);
    }, 4000);
  };

  return (
    <div className="space-y-6 mt-6">
      
      {/* Toast Notification */}
      {saveSuccess && (
        <div className="fixed bottom-6 right-6 bg-[#0E2E2A] border border-[#00E5BC]/30 text-[#00E5BC] px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 z-50 animate-bounce">
          <CheckCircle className="w-5 h-5 text-[#00E5BC]" />
          <span className="font-sans font-medium text-sm">{saveSuccess}</span>
        </div>
      )}

      {/* Main Franchises Dashboard List */}
      {!isCreating && !managingFranchise && (
        <>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-2xl font-poppins font-bold text-white flex items-center gap-2">
                <Layers className="w-6 h-6 text-brand-primary" />
                Franchises Management
              </h2>
              <p className="text-sm text-brand-muted mt-1">
                Organize movies and series into shared universes (e.g., Breaking Bad Universe, MCU, DCU).
              </p>
            </div>
            <button
              onClick={() => {
                setIsCreating(true);
                setNewFranchiseName('');
                setNewFranchiseDescription('');
                setCreationSelectedItems([]);
                setCreationSearchQuery('');
              }}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-primary hover:bg-brand-primary/90 text-white rounded-xl text-xs font-bold font-sans transition-all shadow-[0_0_20px_rgba(255,107,0,0.2)]"
            >
              <Plus className="w-4 h-4" />
              Create New Franchise
            </button>
          </div>

          <div className="glass-card rounded-2xl border border-white/5 overflow-hidden">
            <div className="p-6 border-b border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4">
              <h3 className="text-lg font-poppins font-semibold text-white">All Franchises</h3>
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
                <input 
                  type="text"
                  placeholder="Search franchise by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-brand-primary font-sans"
                />
              </div>
            </div>

            {filteredFranchises.length === 0 ? (
              <div className="p-12 text-center text-brand-muted">
                <Layers className="w-12 h-12 text-white/10 mx-auto mb-3" />
                <p className="text-lg font-medium text-white mb-1">No Franchises Found</p>
                <p className="text-sm text-brand-muted">
                  {searchQuery ? 'Adjust your search term or' : 'No titles currently belong to a franchise. Click'} {" "}
                  <button onClick={() => setIsCreating(true)} className="text-brand-primary hover:underline font-semibold">Create New Franchise</button> to start.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
                {filteredFranchises.map((f) => (
                  <div key={f.name} className="bg-white/5 border border-white/5 hover:border-white/10 rounded-2xl p-5 flex flex-col justify-between transition-all group">
                    <div>
                      {editingFranchiseName === f.name ? (
                        <div className="space-y-3 mb-3">
                          <div>
                            <label className="text-[10px] uppercase font-bold tracking-widest text-brand-muted block mb-1">Franchise Name</label>
                            <input
                              type="text"
                              value={newNameInput}
                              onChange={(e) => setNewNameInput(e.target.value)}
                              className="w-full bg-black/40 border border-white/15 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand-primary"
                              placeholder="Franchise Name"
                              autoFocus
                            />
                          </div>
                          <div>
                            <label className="text-[10px] uppercase font-bold tracking-widest text-brand-muted block mb-1">Franchise Description</label>
                            <textarea
                              value={newDescInput}
                              onChange={(e) => setNewDescInput(e.target.value)}
                              className="w-full bg-black/40 border border-white/15 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-brand-primary h-20 resize-none"
                              placeholder="Enter franchise description..."
                            />
                          </div>
                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              onClick={() => setEditingFranchiseName(null)}
                              className="px-3 py-1.5 bg-white/5 rounded-lg text-xs text-gray-400 hover:text-white transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleUpdateFranchise(f.name)}
                              disabled={isSaving}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-primary rounded-lg text-xs text-white font-bold hover:bg-brand-primary/80 transition-colors disabled:opacity-50"
                            >
                              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col justify-between mb-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <h4 className="text-lg font-poppins font-bold text-white group-hover:text-brand-primary transition-colors line-clamp-1">
                                {f.name}
                              </h4>
                              <div className="flex items-center gap-2 mt-1 text-xs text-brand-muted font-mono">
                                <span>{f.count} {f.count === 1 ? 'title' : 'titles'}</span>
                                <span>•</span>
                                <span>{f.yearRange}</span>
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                setEditingFranchiseName(f.name);
                                setNewNameInput(f.name);
                                setNewDescInput(f.description);
                              }}
                              className="p-2 text-brand-muted hover:text-white rounded-lg hover:bg-white/5 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0"
                              title="Edit Details"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </div>
                          {f.description && (
                            <p className="text-xs text-white/60 line-clamp-2 mt-2 italic">
                              {f.description}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Display subset of titles */}
                      <div className="space-y-2 mt-4">
                        <p className="text-[10px] uppercase font-bold tracking-widest text-brand-muted">Titles in Franchise</p>
                        <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                          {f.items.map((item) => (
                            <div key={item.id} className="flex items-center justify-between text-xs text-white/80 py-1 border-b border-white/5">
                              <span className="truncate pr-2">{item.title}</span>
                              <span className="text-brand-muted font-mono">{item.year}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 mt-4 border-t border-white/5 flex justify-end">
                      <button
                        onClick={() => {
                          setManagingFranchise(f);
                          setMovieSearchQuery('');
                        }}
                        className="flex items-center gap-1 text-xs text-brand-primary hover:text-white font-bold tracking-wide transition-colors"
                      >
                        Manage Titles
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Creation View Form */}
      {isCreating && (
        <div className="max-w-3xl mx-auto glass-card border border-white/5 rounded-2xl p-6 sm:p-8">
          <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6">
            <h3 className="text-xl font-poppins font-bold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-brand-primary" />
              Create New Franchise
            </h3>
            <button 
              type="button" 
              onClick={() => setIsCreating(false)}
              className="text-brand-muted hover:text-white p-1 rounded-lg hover:bg-white/5 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleCreateFranchiseSubmit} className="space-y-6">
            <div>
              <label className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-2 block">
                Franchise Name
              </label>
              <input
                type="text"
                required
                value={newFranchiseName}
                onChange={(e) => setNewFranchiseName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-primary font-sans"
                placeholder="e.g., Breaking Bad Universe, Marvel Cinematic Universe"
              />
              <p className="text-xs text-brand-muted mt-2">
                This name will be displayed in the Franchises section and details pages. Use the exact same name for all movies belonging to the same franchise/universe.
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-2 block">
                Franchise Description
              </label>
              <textarea
                value={newFranchiseDescription}
                onChange={(e) => setNewFranchiseDescription(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand-primary font-sans h-24"
                placeholder="Describe this universe (e.g., Walter White, a New Mexico chemistry teacher, is diagnosed with Stage III cancer...)"
              />
              <p className="text-xs text-brand-muted mt-2">
                This description will explain the background of this shared universe on the franchise detail view page.
              </p>
            </div>

            {/* Selection Engine */}
            <div>
              <label className="text-xs font-semibold text-brand-muted uppercase tracking-wider mb-2 block">
                Add Titles to Franchise
              </label>
              
              {/* Search input for adding titles */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
                <input
                  type="text"
                  value={creationSearchQuery}
                  onChange={(e) => setCreationSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-brand-primary font-sans"
                  placeholder="Type to search movies or series in your library..."
                />

                {/* Autocomplete Suggestions Box */}
                {availableMoviesForCreation.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-[#1A1F30] border border-white/10 rounded-xl overflow-hidden shadow-2xl z-20 max-h-60 overflow-y-auto">
                    {availableMoviesForCreation.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setCreationSelectedItems(prev => [...prev, item]);
                          setCreationSearchQuery('');
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-white/5 border-b border-white/5 flex items-center gap-3 transition-colors text-xs text-white"
                      >
                        <img src={item.posterUrl} alt="" className="w-8 h-10 object-cover rounded-md shrink-0 border border-white/10" />
                        <div className="truncate">
                          <p className="font-bold text-white">{item.title}</p>
                          <p className="text-brand-muted text-[10px] mt-0.5">{item.year} • {item.category}</p>
                        </div>
                        <Plus className="w-4 h-4 text-brand-primary ml-auto shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Display list of currently selected items */}
              <div className="space-y-2">
                <p className="text-[10px] uppercase font-bold tracking-widest text-brand-muted mb-2">Selected Titles ({creationSelectedItems.length})</p>
                {creationSelectedItems.length === 0 ? (
                  <div className="p-6 text-center border border-dashed border-white/10 rounded-xl text-brand-muted text-xs">
                    No titles selected. Type above and click titles to add them to this franchise.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
                    {creationSelectedItems.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 p-2 bg-white/5 border border-white/5 rounded-xl text-xs justify-between">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img src={item.posterUrl} alt="" className="w-8 h-11 object-cover rounded-md border border-white/10 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-bold text-white truncate">{item.title}</p>
                            <p className="text-[10px] text-brand-muted font-mono">{item.year}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCreationSelectedItems(prev => prev.filter(i => i.id !== item.id))}
                          className="p-1.5 text-gray-400 hover:text-red-400 rounded-lg hover:bg-white/5 transition-all shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || !newFranchiseName.trim() || creationSelectedItems.length === 0}
                className="flex items-center gap-2 px-6 py-2.5 bg-brand-primary hover:bg-brand-primary/90 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
              >
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Create Franchise
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Managing Titles View */}
      {managingFranchise && (
        <div className="max-w-4xl mx-auto glass-card border border-white/5 rounded-2xl p-6 sm:p-8">
          <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6">
            <div>
              <div className="flex items-center gap-2 text-brand-muted text-xs font-semibold mb-1 uppercase tracking-wider">
                <span>Franchises</span>
                <ChevronRight className="w-3 h-3" />
                <span>Manage</span>
              </div>
              <h3 className="text-2xl font-poppins font-bold text-white flex items-center gap-2">
                <Layers className="w-6 h-6 text-brand-primary" />
                {managingFranchise.name}
              </h3>
            </div>
            <button 
              type="button" 
              onClick={() => setManagingFranchise(null)}
              className="text-brand-muted hover:text-white p-2 rounded-xl hover:bg-white/5 transition-all flex items-center gap-1.5 text-xs font-bold"
            >
              <X className="w-4 h-4" /> Close
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Left: Current Franchise Titles */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-white flex items-center justify-between">
                <span>Titles in Franchise ({managingFranchise.items.length})</span>
                <span className="text-xs text-brand-muted font-mono">{managingFranchise.yearRange}</span>
              </h4>

              {managingFranchise.items.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-white/10 rounded-2xl text-brand-muted text-sm">
                  This franchise has no titles. Use the search tool to add some.
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
                  {managingFranchise.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-white/5 border border-white/5 hover:border-white/10 rounded-xl transition-all group">
                      <div className="flex items-center gap-3 min-w-0">
                        <img src={item.posterUrl} alt="" className="w-9 h-12 object-cover rounded-lg border border-white/10 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-white truncate">{item.title}</p>
                          <p className="text-[10px] text-brand-muted font-mono mt-0.5">{item.year} • {item.category}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveMovieFromFranchise(item)}
                        disabled={isSaving}
                        className="p-2 text-gray-400 hover:text-red-400 rounded-lg hover:bg-white/5 transition-all shrink-0"
                        title="Remove from Franchise"
                      >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4.5 h-4.5" />}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Search & Add Titles */}
            <div className="space-y-6">
              {/* Option A: Add from Existing Library */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Film className="w-4 h-4 text-brand-primary" />
                  Add Existing Title from Library
                </h4>
                <p className="text-xs text-brand-muted">
                  Pick or search titles already in your catalog to assign to <span className="text-white font-bold">{managingFranchise.name}</span>.
                </p>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
                  <input
                    type="text"
                    value={movieSearchQuery}
                    onChange={(e) => setMovieSearchQuery(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white focus:outline-none focus:border-brand-primary font-sans"
                    placeholder="Search library titles..."
                  />

                  {/* Dropdown list of searchable items */}
                  {availableMoviesForManagement.length > 0 && (
                    <div className="mt-2 bg-[#1A1F30] border border-white/10 rounded-xl overflow-hidden shadow-2xl max-h-48 overflow-y-auto divide-y divide-white/5">
                      {availableMoviesForManagement.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleAddMovieToFranchise(item, managingFranchise.name)}
                          className="w-full text-left px-3 py-2 hover:bg-white/5 flex items-center gap-3 transition-colors text-xs text-white"
                        >
                          <img src={item.posterUrl} alt="" className="w-7 h-9 object-cover rounded-md shrink-0 border border-white/10" />
                          <div className="truncate">
                            <p className="font-bold text-white">{item.title}</p>
                            <p className="text-brand-muted text-[10px]">{item.year} • {item.category}</p>
                          </div>
                          <Plus className="w-4 h-4 text-brand-primary ml-auto shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Option B: Search TMDB & Add Brand New Movie */}
              <div className="space-y-3 pt-4 border-t border-white/10">
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Plus className="w-4 h-4 text-[#00E5BC]" />
                  Search TMDB & Add New Movie/Show
                </h4>
                <p className="text-xs text-brand-muted">
                  Not in your library yet? Search TMDB to import a brand new title directly into <span className="text-white font-bold">{managingFranchise.name}</span>.
                </p>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
                    <input
                      type="text"
                      value={tmdbSearchQuery}
                      onChange={(e) => setTmdbSearchQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleTmdbSearchForFranchise(); } }}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white focus:outline-none focus:border-[#00E5BC] font-sans"
                      placeholder="e.g. Joker: Folie à Deux, Batman Begins..."
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleTmdbSearchForFranchise}
                    disabled={isSearchingTmdb || !tmdbSearchQuery.trim()}
                    className="px-4 py-2.5 bg-[#00E5BC]/20 hover:bg-[#00E5BC] text-[#00E5BC] hover:text-black rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isSearchingTmdb ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    Search TMDB
                  </button>
                </div>

                {/* TMDB Results Box */}
                {tmdbResults.length > 0 && (
                  <div className="bg-[#151B2D] border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5 max-h-56 overflow-y-auto">
                    {tmdbResults.map((res: any) => (
                      <div key={res.id} className="p-2.5 flex items-center justify-between hover:bg-white/5 transition-colors gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {res.poster_path ? (
                            <img src={`https://image.tmdb.org/t/p/w92${res.poster_path}`} alt="" className="w-8 h-11 object-cover rounded shadow shrink-0" />
                          ) : (
                            <div className="w-8 h-11 bg-white/10 rounded shrink-0 flex items-center justify-center text-[9px] text-gray-400">No Img</div>
                          )}
                          <div className="min-w-0">
                            <p className="font-bold text-xs text-white truncate">{res.title || res.name}</p>
                            <p className="text-[10px] text-brand-muted">
                              {res.media_type === 'tv' ? 'Series' : 'Movie'} • {res.release_date || res.first_air_date || 'N/A'}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAddNewTmdbMovieToFranchise(res, managingFranchise.name)}
                          disabled={isSaving}
                          className="px-3 py-1.5 bg-[#00E5BC]/20 hover:bg-[#00E5BC] text-[#00E5BC] hover:text-black rounded-lg transition-all text-xs font-bold shrink-0 flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add to Franchise
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-[#1A1F30] border border-white/5 rounded-2xl p-4 flex gap-3 text-xs text-brand-muted">
                <div className="text-brand-primary shrink-0 mt-0.5">ℹ</div>
                <div>
                  <p className="font-bold text-white/80 mb-1">Universe & Multi-Name Franchise Rule</p>
                  <p>
                    Movies or series from different franchises (e.g., Breaking Bad and Better Call Saul) can belong to the same universe. Just assign them both the exact same franchise name to group them together under the same Franchise Carousel!
                  </p>
                </div>
              </div>
            </div>

          </div>

          <div className="flex justify-end mt-8 pt-4 border-t border-white/5">
            <button
              type="button"
              onClick={() => setManagingFranchise(null)}
              className="px-6 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-all"
            >
              Done Managing
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
