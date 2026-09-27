import React, { useState } from 'react';
import { Search, Edit, Trash2, Play, ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react';
import { Link } from 'react-router-dom';

interface AdminAdvancedSearchProps {
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function AdminAdvancedSearch({ onEdit, onDelete }: AdminAdvancedSearchProps) {
  const [filters, setFilters] = useState({
    year: 'All',
    alphabet: 'All',
    genre: 'All',
    rating: 'All',
  });
  
  const [results, setResults] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<'title' | 'year' | 'rating' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const limit = 50;

  const handleSort = (field: 'title' | 'year' | 'rating') => {
    const isAsc = sortField === field && sortDirection === 'asc';
    const newDirection = isAsc ? 'desc' : 'asc';
    setSortDirection(newDirection);
    setSortField(field);
    handleSearch(page, field, newDirection);
  };

  const handleSearch = async (targetPage = 1, forceSortField = sortField, forceSortDir = sortDirection) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('adminToken');
      const params = new URLSearchParams({
        page: targetPage.toString(),
        limit: limit.toString(),
        year: filters.year,
        alphabet: filters.alphabet,
        genre: filters.genre,
        rating: filters.rating,
      });

      if (forceSortField) {
        params.append('sortBy', forceSortField);
        params.append('sortDir', forceSortDir);
      }

      const res = await fetch(`/api/admin/content?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const { data, total } = await res.json();
        setResults(data || []);
        setTotal(total || 0);
        setPage(targetPage);
      }
    } catch (e) {
      console.error('Failed to fetch advanced search results', e);
    } finally {
      setLoading(false);
    }
  };

  const genres = ['All', 'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy', 'History', 'Horror', 'Music', 'Mystery', 'Romance', 'Sci-Fi', 'Thriller', 'War', 'Western'];
  const alphabets = ['All', 'A-D', 'E-H', 'I-L', 'M-P', 'Q-T', 'U-Z', '#'];
  const ratings = ['All', '9+', '8+', '7+', '6+', '5+'];
  
  const currentYear = new Date().getFullYear();
  const years = ['All', ...Array.from({length: 30}, (_, i) => (currentYear - i).toString()), 'Older'];

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-2xl border border-white/5 p-6">
        <h2 className="text-xl font-poppins font-semibold text-white mb-4">Advanced Filters</h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div>
            <label className="block text-xs font-semibold text-white/70 uppercase mb-2">Year</label>
            <select 
              value={filters.year}
              onChange={(e) => setFilters({...filters, year: e.target.value})}
              className="w-full bg-[#151B2D] border border-white/10 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-brand-primary"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-white/70 uppercase mb-2">Alphabet</label>
            <select 
              value={filters.alphabet}
              onChange={(e) => setFilters({...filters, alphabet: e.target.value})}
              className="w-full bg-[#151B2D] border border-white/10 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-brand-primary"
            >
              {alphabets.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-white/70 uppercase mb-2">Genre</label>
            <select 
              value={filters.genre}
              onChange={(e) => setFilters({...filters, genre: e.target.value})}
              className="w-full bg-[#151B2D] border border-white/10 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-brand-primary"
            >
              {genres.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-white/70 uppercase mb-2">Rating</label>
            <select 
              value={filters.rating}
              onChange={(e) => setFilters({...filters, rating: e.target.value})}
              className="w-full bg-[#151B2D] border border-white/10 rounded-lg py-2 px-3 text-sm text-white focus:outline-none focus:border-brand-primary"
            >
              {ratings.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <button 
            onClick={() => handleSearch(1)}
            disabled={loading}
            className="flex items-center gap-2 bg-brand-primary hover:bg-brand-primary/90 text-white px-6 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50"
          >
            <Search className="w-4 h-4" />
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>

      <div className="glass-card rounded-2xl border border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-brand-muted">
            <thead className="text-xs uppercase bg-white/5 text-white/70">
              <tr>
                <th className="px-6 py-4 font-semibold">Poster</th>
                <th className="px-6 py-4 font-semibold">
                  <button
                    onClick={() => handleSort('title')}
                    className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer select-none focus:outline-none uppercase text-xs font-semibold"
                  >
                    Title
                    {sortField === 'title' ? (
                      sortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-brand-primary" /> : <ChevronDown className="w-3.5 h-3.5 text-brand-primary" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-white/30" />
                    )}
                  </button>
                </th>
                <th className="px-6 py-4 font-semibold">Category</th>
                <th className="px-6 py-4 font-semibold">
                  <button
                    onClick={() => handleSort('year')}
                    className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer select-none focus:outline-none uppercase text-xs font-semibold"
                  >
                    Year
                    {sortField === 'year' ? (
                      sortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-brand-primary" /> : <ChevronDown className="w-3.5 h-3.5 text-brand-primary" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-white/30" />
                    )}
                  </button>
                </th>
                <th className="px-6 py-4 font-semibold">
                  <button
                    onClick={() => handleSort('rating')}
                    className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer select-none focus:outline-none uppercase text-xs font-semibold"
                  >
                    Rating
                    {sortField === 'rating' ? (
                      sortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5 text-brand-primary" /> : <ChevronDown className="w-3.5 h-3.5 text-brand-primary" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-white/30" />
                    )}
                  </button>
                </th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-white/50">
                    Loading content...
                  </td>
                </tr>
              ) : results.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-white/50">
                    No content found. Try adjusting your search or click Search.
                  </td>
                </tr>
              ) : (
                results.map((item) => (
                  <tr key={item.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-3">
                      <img src={item.posterUrl} alt={item.title} className="w-10 h-14 object-cover rounded shadow-md bg-white/5" />
                    </td>
                    <td className="px-6 py-3 font-medium text-white">{item.title}</td>
                    <td className="px-6 py-3">
                      <span className="bg-white/10 px-2 py-1 rounded text-xs">{item.category}</span>
                    </td>
                    <td className="px-6 py-3">{item.year}</td>
                    <td className="px-6 py-3 font-semibold text-brand-secondary">{item.rating}</td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link 
                          to={`/title/${item.id}`}
                          target="_blank"
                          className="p-2 hover:bg-green-500/20 hover:text-green-400 rounded-lg transition-colors"
                        >
                          <Play className="w-4 h-4" />
                        </Link>
                        <button 
                          onClick={() => onEdit(item.id)}
                          className="p-2 hover:bg-blue-500/20 hover:text-blue-400 rounded-lg transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => onDelete(item.id)}
                          className="p-2 hover:bg-red-500/20 hover:text-red-500 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {!loading && total > 0 && (
          <div className="p-4 border-t border-white/5 flex items-center justify-between text-sm text-brand-muted">
            <div>
              Showing <span className="font-medium text-white">{Math.min((page - 1) * limit + 1, total)}</span> to <span className="font-medium text-white">{Math.min(page * limit, total)}</span> of <span className="font-medium text-white">{total}</span> results
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => handleSearch(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <button 
                onClick={() => handleSearch(page + 1)}
                disabled={page * limit >= total}
                className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
