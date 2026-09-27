import React, { useEffect, useState } from 'react';
import { Calendar, Clock, Film, Tv, Play, List, Target } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useData } from '../../context/DataContext';
import { getStartOfTodayUTC3, parseTimestamp } from '../../utils/dateUtils';
import { ContentItem } from '../../types';

interface AnalyticsStats {
  todayDownloads: number;
  weekDownloads: number;
  monthDownloads: number;
  movieDownloads: number;
  seriesDownloads: number;
  animeDownloads: number;
  animationDownloads: number;
  topItems: { item: ContentItem; downloads: number }[];
}

export default function AdminAnalytics() {
  const { content: globalContent = [], downloads: contextDownloads = [] } = useData();
  const [localContent, setLocalContent] = useState<ContentItem[]>(globalContent);
  const [localDownloads, setLocalDownloads] = useState<any[]>(contextDownloads);
  const [stats, setStats] = useState<AnalyticsStats | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        const [contentRes, downloadsRes] = await Promise.all([
          globalContent.length > 0 ? Promise.resolve(globalContent) : fetch('/api/content').then(r => r.ok ? r.json() : []),
          fetch('/api/analytics/downloads').then(r => r.ok ? r.json() : [])
        ]);
        if (isMounted) {
          if (Array.isArray(contentRes) && contentRes.length > 0) setLocalContent(contentRes);
          if (Array.isArray(downloadsRes)) setLocalDownloads(downloadsRes);
        }
      } catch (e) {
        console.error('Error loading analytics data:', e);
      }
    };
    loadData();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (globalContent.length > 0) setLocalContent(globalContent);
  }, [globalContent]);

  useEffect(() => {
    if (contextDownloads.length > 0) setLocalDownloads(contextDownloads);
  }, [contextDownloads]);

  useEffect(() => {
    const oneDay = 24 * 60 * 60 * 1000;

    let todayDownloads = 0;
    let weekDownloads = 0;
    let monthDownloads = 0;
    let movieDownloads = 0;
    let seriesDownloads = 0;
    let animeDownloads = 0;
    let animationDownloads = 0;

    const startOfToday = getStartOfTodayUTC3();
    const startOfWeek = startOfToday - 6 * oneDay;
    const startOfMonth = startOfToday - 29 * oneDay;

    const allDownloads = localDownloads.length > 0 ? localDownloads : contextDownloads;
    const activeContent = localContent.length > 0 ? localContent : globalContent;

    // Aggregate Downloads
    allDownloads.forEach(d => {
      const ts = parseTimestamp(d.timestamp);
      if (isNaN(ts) || ts <= 0) return;

      if (ts >= startOfToday) todayDownloads++;
      if (ts >= startOfWeek) weekDownloads++;
      if (ts >= startOfMonth) monthDownloads++;

      const targetId = String(d.contentId || d.id || '');
      const item = activeContent.find(c => String(c.id) === targetId);

      if (item) {
        const itemGenres = item.genres as any;
        const genres = Array.isArray(itemGenres) ? itemGenres : (typeof itemGenres === 'string' ? itemGenres.split(',') : []);
        const cat = (item.category || '').toLowerCase();
        const isAnimation = cat !== 'anime' && genres.some((g: string) => String(g).toLowerCase().includes('animation'));

        if (isAnimation || cat === 'animation') {
          animationDownloads++;
        } else if (cat === 'movies' || cat === 'movie') {
          movieDownloads++;
        } else if (cat === 'series' || cat === 'tv shows' || cat === 'asian drama' || cat === 'asian') {
          seriesDownloads++;
        } else if (cat === 'anime') {
          animeDownloads++;
        }
      } else {
        const cat = (d.category || '').toLowerCase();
        if (cat === 'movies' || cat === 'movie') movieDownloads++;
        else if (cat === 'series' || cat === 'tv shows' || cat === 'asian') seriesDownloads++;
        else if (cat === 'anime') animeDownloads++;
        else if (cat === 'animation') animationDownloads++;
      }
    });

    // Compute Top Items
    const downloadsCountMap: { [id: string]: number } = {};
    allDownloads.forEach(d => {
      const cid = String(d.contentId || d.id || '');
      if (cid) {
        downloadsCountMap[cid] = (downloadsCountMap[cid] || 0) + 1;
      }
    });

    const topItems = Object.entries(downloadsCountMap)
      .map(([id, count]) => {
        let item = activeContent.find(c => String(c.id) === id);
        if (!item) {
          const dlRecord = allDownloads.find(d => String(d.contentId || d.id) === id);
          item = {
            id,
            title: dlRecord?.title || 'Unknown Title',
            category: dlRecord?.category || 'Movies',
            rating: 0,
            year: new Date().getFullYear(),
            posterUrl: '',
            backdropUrl: ''
          } as any;
        }
        return { item: item!, downloads: count };
      });

    topItems.sort((a, b) => b.downloads - a.downloads);

    setStats({
      todayDownloads,
      weekDownloads,
      monthDownloads,
      movieDownloads,
      seriesDownloads,
      animeDownloads,
      animationDownloads,
      topItems: topItems.slice(0, 20)
    });
  }, [localContent, globalContent, localDownloads, contextDownloads]);

  if (!stats) return <div className="text-white p-6">Loading analytics...</div>;

  const chartData = [
    { name: 'Today', downloads: stats.todayDownloads },
    { name: 'This Week', downloads: stats.weekDownloads },
    { name: 'This Month', downloads: stats.monthDownloads },
  ];


  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Time Based Stats */}
      <div>
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-brand-primary" />
          Time-Based Downloads
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatBox title="Downloads Today" value={stats.todayDownloads} />
          <StatBox title="Downloads This Week" value={stats.weekDownloads} />
          <StatBox title="Downloads This Month" value={stats.monthDownloads} />
        </div>
      </div>

      {/* Category Based Stats */}
      <div>
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Target className="w-5 h-5 text-brand-primary" />
          Category Downloads
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatBox title="Movie Downloads" value={stats.movieDownloads} icon={<Film className="w-5 h-5 opacity-50" />} />
          <StatBox title="Series Downloads" value={stats.seriesDownloads} icon={<Tv className="w-5 h-5 opacity-50" />} />
          <StatBox title="Anime Downloads" value={stats.animeDownloads} icon={<Play className="w-5 h-5 opacity-50" />} />
          <StatBox title="Animation Downloads" value={stats.animationDownloads} icon={<Play className="w-5 h-5 opacity-50" />} />
        </div>
      </div>

      {/* Chart */}
      <div className="glass-card p-6 rounded-2xl border border-white/5 h-[400px]">
        <h2 className="text-xl font-bold text-white mb-6">Downloads Overview</h2>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
            <XAxis dataKey="name" stroke="#ffffff50" axisLine={false} tickLine={false} />
            <YAxis stroke="#ffffff50" axisLine={false} tickLine={false} />
            <Tooltip 
              cursor={{ fill: '#ffffff05' }}
              contentStyle={{ backgroundColor: '#151B2D', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }} 
            />
            <Bar dataKey="downloads" fill="#FF8C00" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top 20 Downloaded Content */}
      <div>
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <List className="w-5 h-5 text-brand-primary" />
          Top 20 Downloaded Content
        </h2>
        <div className="glass-card rounded-2xl border border-white/5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-white/5 text-brand-muted">
                <tr>
                  <th className="px-6 py-4 font-semibold w-16 text-center">Rank</th>
                  <th className="px-6 py-4 font-semibold">Title</th>
                  <th className="px-6 py-4 font-semibold">Category</th>
                  <th className="px-6 py-4 font-semibold text-right">Downloads</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-white/90">
                {stats.topItems.map((entry, idx) => (
                  <tr key={entry.item.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 text-center font-bold text-brand-muted">#{idx + 1}</td>
                    <td className="px-6 py-4 font-medium">{entry.item.title}</td>
                    <td className="px-6 py-4"><span className="text-xs bg-white/10 px-2 py-1 rounded text-white/80">{entry.item.category}</span></td>
                    <td className="px-6 py-4 text-right font-mono text-brand-primary font-bold">{entry.downloads.toLocaleString()}</td>
                  </tr>
                ))}
                {stats.topItems.length === 0 && (
                  <tr>
                     <td colSpan={4} className="px-6 py-12 text-center text-brand-muted">No download data available yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  );
}

function StatBox({ title, value, icon }: { title: string, value: number, icon?: React.ReactNode }) {
  return (
    <div className="glass-card p-6 rounded-2xl border border-white/5 hover:border-brand-primary/30 transition-colors">
      <div className="text-brand-muted text-sm font-medium mb-2 flex items-center justify-between">
        {title}
        {icon}
      </div>
      <div className="text-3xl font-poppins font-bold text-white">
        {value.toLocaleString()}
      </div>
    </div>
  );
}
