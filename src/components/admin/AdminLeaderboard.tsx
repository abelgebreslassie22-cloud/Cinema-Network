import React, { useState, useEffect, useMemo } from 'react';
import { Star, Loader2 } from 'lucide-react';

type TimeRange = 'daily' | 'weekly' | 'monthly';
type CategoryFilter = 'All' | 'Movies' | 'Series' | 'Anime' | 'Animation';

export default function AdminLeaderboard() {
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);
  const [totalDownloads, setTotalDownloads] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>('daily');
  const [category, setCategory] = useState<CategoryFilter>('Movies');

  useEffect(() => {
    let isMounted = true;
    const fetchCache = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/admin/leaderboard-cache?period=${timeRange}&category=${category}`);
        if (!res.ok) throw new Error('Failed to load cache');
        const data = await res.json();
        
        if (isMounted) {
          setLeaderboardData(data || []);
          const total = (data || []).reduce((acc: number, cur: any) => acc + (cur.downloads || 0), 0);
          setTotalDownloads(total);
        }
      } catch (err) {
        console.error('Error fetching leaderboard cache:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchCache();
    return () => { isMounted = false; };
  }, [timeRange, category]);

  // Calculate date range string
  const dateRangeStr = useMemo(() => {
    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    let start = now;
    if (timeRange === 'daily') {
      start = new Date(now.getTime() - msPerDay);
    } else if (timeRange === 'weekly') {
      start = new Date(now.getTime() - 7 * msPerDay);
    } else {
      start = new Date(now.getTime() - 30 * msPerDay);
    }
    
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }, [timeRange]);

  return (
    <div className="bg-[#0F1319] min-h-screen text-white p-8 rounded-3xl mt-6 relative overflow-hidden">
      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between mb-8 relative z-10 gap-4">
        <div className="flex gap-4">
          {/* Category Filter */}
          <select 
            className="bg-[#1A1F26] border border-white/10 rounded-xl px-4 py-2 text-sm font-semibold outline-none focus:border-brand-primary"
            value={category}
            onChange={(e) => setCategory(e.target.value as CategoryFilter)}
          >
            <option value="All">All Categories</option>
            <option value="Movies">Movies</option>
            <option value="Series">TV Shows</option>
            <option value="Anime">Anime</option>
            <option value="Animation">Animation</option>
          </select>

          {/* Time Range Filter */}
          <select 
            className="bg-[#1A1F26] border border-white/10 rounded-xl px-4 py-2 text-sm font-semibold outline-none focus:border-brand-primary"
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div className="bg-[#1A1F26] px-4 py-2 rounded-full text-sm font-medium border border-white/10 text-white/70">
          {dateRangeStr}
        </div>
      </div>
      <div className="mb-10 relative z-10">
        <h2 className="text-5xl md:text-7xl font-black font-poppins text-white/90 uppercase leading-none tracking-tight mb-2">THIS {timeRange === 'daily' ? 'DAY' : timeRange === 'weekly' ? 'WEEK' : 'MONTH'}</h2>
        <h2 className="text-5xl md:text-7xl font-black font-poppins text-brand-highlight uppercase leading-none tracking-tight mb-6">MOST DOWNLOADED</h2>
        
        <div className="flex items-center gap-4 text-sm font-semibold">
          <div className="bg-brand-highlight text-black px-4 py-1.5 rounded uppercase tracking-wider">
            {category} &bull; TOP {leaderboardData.length}
          </div>
          <div className="text-white/80 text-lg">
            <span className="font-bold text-white">{totalDownloads.toLocaleString()}</span> downloads this {timeRange === 'daily' ? 'day' : timeRange === 'weekly' ? 'week' : 'month'}
          </div>
        </div>
      </div>

      {leaderboardData.length > 0 ? (
        <div className="space-y-6 relative z-10">
          {/* Top 3 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {leaderboardData.slice(0, 3).map((entry, idx) => {
              const percent = totalDownloads > 0 ? ((entry.downloads / totalDownloads) * 100).toFixed(0) : '0';
              const rankColors = [
                'bg-[#F2CE6E]', // Gold
                'bg-[#D1D5DB]', // Silver
                'bg-[#D97757]'  // Bronze
              ];
              const rankColor = rankColors[idx] || 'bg-white';
              
              return (
                <div key={entry.item.id} className="bg-[#1C1C1E] rounded-2xl p-4 flex gap-4 relative">
                  <div className={`absolute -top-4 -left-4 w-10 h-10 rounded-full ${rankColor} text-black flex items-center justify-center font-black text-xl z-10`}>
                    {idx + 1}
                  </div>
                  <div className="w-1/3 aspect-[2/3] shrink-0 rounded-xl overflow-hidden shadow-lg relative">
                    <img src={entry.item.posterUrl || entry.item.backdropUrl} alt={entry.item.title} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex flex-col justify-center flex-1 py-2">
                    <h3 className="text-xl font-bold font-poppins text-white leading-tight mb-2 line-clamp-2">{entry.item.title}</h3>
                    <div className="flex items-center gap-2 text-sm text-brand-highlight mb-4">
                      <Star className="w-4 h-4 fill-current" />
                      <span className="font-bold text-white">{Number(entry.item.rating).toFixed(1)}</span>
                      <span className="text-white/50">&bull; {percent}% of {timeRange === 'daily' ? 'daily' : timeRange === 'weekly' ? 'weekly' : 'monthly'}</span>
                    </div>
                    <div>
                      <div className="text-3xl font-black text-brand-highlight">{entry.downloads.toLocaleString()}</div>
                      <div className="text-[10px] text-white/40 tracking-widest uppercase mt-1">DOWNLOADS</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Rank 4-15 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 mt-8">
            {leaderboardData.slice(3).map((entry, idx) => {
              const rank = idx + 4;
              const percent = totalDownloads > 0 ? ((entry.downloads / totalDownloads) * 100).toFixed(0) : '0';
              const maxRestDownloads = leaderboardData[3]?.downloads || 1;
              const barWidth = `${Math.max(5, (entry.downloads / maxRestDownloads) * 100)}%`;
              
              return (
                <div key={entry.item.id} className="flex items-center gap-4 bg-transparent hover:bg-white/5 transition-colors rounded-xl p-2 border-b border-white/5">
                  <div className="w-6 text-center text-white/40 font-bold text-xl">{rank}</div>
                  <div className="w-10 h-14 rounded overflow-hidden shrink-0 shadow-md relative">
                    <img src={entry.item.posterUrl || entry.item.backdropUrl} alt={entry.item.title} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0 pr-4">
                    <h4 className="font-bold text-white text-base truncate">{entry.item.title}</h4>
                    <div className="flex items-center gap-2 text-xs mt-0.5 text-white/70">
                      <Star className="w-3 h-3 text-brand-highlight fill-brand-highlight" />
                      <span>{Number(entry.item.rating).toFixed(1)}</span>
                      <span>&bull;</span>
                      <span>{percent}%</span>
                    </div>
                    <div className="h-1 bg-white/10 rounded-full mt-2 overflow-hidden w-2/3">
                      <div className="h-full bg-brand-highlight rounded-full" style={{ width: barWidth }} />
                    </div>
                  </div>
                  <div className="text-right flex items-center justify-end">
                    <div className="font-bold text-lg text-white/90">{entry.downloads.toLocaleString()}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (

        <div className="text-center py-20 text-white/50 relative z-10">
          No data available for this selection.
        </div>
      )}
    </div>
  );
}
