import React, { useState, useEffect } from 'react';
import { ContentItem } from '../../types';
import { useData } from '../../context/DataContext';
import { 
  Search, Plus, Edit, Trash2, LogOut, Film, Tv, Video, PlaySquare, Play, 
  Bell, Heart, UploadCloud, ArrowLeft, Check, XCircle, Clock, Megaphone,
  User, Shield, Key, History, Eye, EyeOff, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, ArrowUpDown, Activity, Loader2,
  Globe
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import ContentForm from './ContentForm';
import { isContentSeries } from '../../utils/format';

import AdminLeaderboard from '../../components/admin/AdminLeaderboard';
import AdminAnalytics from '../../components/admin/AdminAnalytics';
import AdminAdvertisements from '../../components/admin/AdminAdvertisements';
import AdminFranchises from '../../components/admin/AdminFranchises';
import AdminDatabaseStatus from '../../components/admin/AdminDatabaseStatus';
import AdminAdvancedSearch from '../../components/admin/AdminAdvancedSearch';
import AdminUsers from './AdminUsers';

export default function Dashboard() {
  const { logout } = useAuth();
  const { addContentItem, updateContentItem, deleteContentItem } = useData();
  const [content, setContent] = useState<ContentItem[]>([]);
  
  // Pagination & Server-side States
  const [adminContent, setAdminContent] = useState<any[]>([]);
  const [adminStats, setAdminStats] = useState<Record<string, number>>({});
  const [totalContent, setTotalContent] = useState(0);
  const [totalUsersCount, setTotalUsersCount] = useState(0);
  const [contentPage, setContentPage] = useState(1);
  const [contentLimit, setContentLimit] = useState(25);
  const [contentLoading, setContentLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [editingItemData, setEditingItemData] = useState<any>(null);
  const [isFetchingItem, setIsFetchingItem] = useState(false);
  const [addMode, setAddMode] = useState<'select' | 'manual' | 'auto' | null>(null);

  const handleEdit = async (id: string) => {
    setIsFetchingItem(true);
    try {
      const res = await fetch(`/api/content/${id}`);
      if (res.ok) {
        const data = await res.json();
        setEditingItemData(data);
        setIsEditing(id);
      }
    } catch (err) {
      console.error('Failed to load full item for editing', err);
    } finally {
      setIsFetchingItem(false);
    }
  };
  const [publishRequestTitle, setPublishRequestTitle] = useState('');
  
  // Content Sorting & Filtering States
  const [sortField, setSortField] = useState<'title' | 'year' | 'rating' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [categoryFilter, setCategoryFilter] = useState<'All' | 'Movies' | 'Series' | 'Anime' | 'Animation' | 'Asian' | 'Indian'>('All');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  
  const [requests, setRequests] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'leaderboard' | 'content' | 'users' | 'advanced_search' | 'franchises' | 'requests' | 'advertisements' | 'settings' | 'security' | 'database'>('dashboard');
  const [requestDisplayStatus, setRequestDisplayStatus] = useState<'Pending' | 'Completed' | 'Rejected'>('Pending');
  const [requestToDelete, setRequestToDelete] = useState<string | null>(null);
  const [contentToDelete, setContentToDelete] = useState<string | null>(null);

  const [saveSuccess, setSaveSuccess] = useState(false);

  // Authentication & Profile States
  const [adminUsername, setAdminUsername] = useState(localStorage.getItem('adminUsername') || 'admin');
  const [isDefaultPassword, setIsDefaultPassword] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  // Security Form States (Change Password)
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Security Form States (Change Username)
  const [newUsername, setNewUsername] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameSuccess, setUsernameSuccess] = useState<string | null>(null);
  const [usernameLoading, setUsernameLoading] = useState(false);

  // Login History List
  const [loginHistory, setLoginHistory] = useState<any[]>([]);

  const navigate = useNavigate();

  // Protect Admin Pages - verify session
  useEffect(() => {
    const verifySession = async () => {
      const token = localStorage.getItem('adminToken');
      if (!token) {
        localStorage.removeItem('isAdmin');
        navigate('/login');
        return;
      }

      try {
        const res = await fetch('/api/admin/verify', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.valid) {
          localStorage.removeItem('isAdmin');
          localStorage.removeItem('adminToken');
          navigate('/login');
        } else {
          setCheckingSession(false);
        }
      } catch (err) {
        // If server fails, fallback to simple client verification but log warning
        console.warn('Session security gateway lookup failed. Operating in offline failsafe mode.');
        setCheckingSession(false);
      }
    };

    verifySession();
  }, [navigate]);

  // Debounce Search Query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setContentPage(1); // reset to page 1 on search
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchAdminStats = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch('/api/admin/content-stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const stats = await res.json();
        setAdminStats(stats);
      }
    } catch (e) {
      console.error('Failed to fetch admin stats', e);
    }
  };

  const fetchAdminContent = async () => {
    setContentLoading(true);
    try {
      const token = localStorage.getItem('adminToken');
      
      const params = new URLSearchParams({
        page: contentPage.toString(),
        limit: contentLimit.toString(),
        search: debouncedSearchQuery,
        category: categoryFilter === 'All' ? 'all' : categoryFilter,
      });

      if (sortField) {
        params.append('sortBy', sortField);
        params.append('sortDir', sortDirection);
      }

      const res = await fetch(`/api/admin/content?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const { data, total } = await res.json();
        setAdminContent(data || []);
        setTotalContent(total || 0);
      }
    } catch (e) {
      console.error('Failed to fetch paginated admin content', e);
    } finally {
      setContentLoading(false);
    }
  };

  // Re-fetch content when deps change
  useEffect(() => {
    if (checkingSession) return;
    if (activeTab === 'dashboard' || activeTab === 'content') {
      fetchAdminContent();
    }
  }, [contentPage, contentLimit, debouncedSearchQuery, sortField, sortDirection, categoryFilter, activeTab, checkingSession]);

  // Load baseline content and check default password warnings
  useEffect(() => {
    if (checkingSession) return;
    fetchAdminStats();
    fetchRequests();
    fetchUsersCount();
    checkAdminStatus();
    if (activeTab === 'security') {
      fetchLoginHistory();
    }
  }, [activeTab, checkingSession]);

  const fetchUsersCount = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      if (!token) return;
      const res = await fetch('/api/admin/users?limit=1', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.stats?.total !== undefined) {
          setTotalUsersCount(data.stats.total);
        } else if (data?.total !== undefined) {
          setTotalUsersCount(data.total);
        }
      }
    } catch {
      // ignore
    }
  };


  const checkAdminStatus = async () => {
    try {
      const res = await fetch('/api/admin/status');
      const data = await res.json();
      setIsDefaultPassword(data.isDefaultPassword);
      setAdminUsername(data.username);
      localStorage.setItem('adminUsername', data.username);
    } catch (err) {
      console.error('Failed to get admin configuration status');
    }
  };

  const fetchRequests = async () => {
    try {
      const reqsRes = await fetch('/api/requests');
      const reqsData = await reqsRes.json();
      if (Array.isArray(reqsData)) {
        setRequests(reqsData);
      } else {
        setRequests([]);
      }
    } catch (err) {
      console.error('Failed to load requests');
      setRequests([]);
    }
  };

  const fetchLoginHistory = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch('/api/admin/login-history', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setLoginHistory(data);
        } else {
          setLoginHistory([]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch login history log');
    }
  };

  const handleLogout = async () => {
    const token = localStorage.getItem('adminToken');
    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (err) {
      console.error('Logout request failed');
    }

    localStorage.removeItem('isAdmin');
    localStorage.removeItem('adminToken');
    logout();
    localStorage.removeItem('adminUsername');
    localStorage.removeItem('isDefaultPassword');
    navigate('/login');
  };

  const handleDelete = (id: string) => {
    setContentToDelete(id);
  };

  const confirmDeleteContent = async () => {
    if (contentToDelete) {
      // Optimistic delete
      setAdminContent(prev => prev.filter(c => c.id !== contentToDelete));
      setTotalContent(prev => Math.max(0, prev - 1));
      
      const ok = await deleteContentItem(contentToDelete);
      if (!ok) {
        // Revert on failure
        fetchAdminContent();
        fetchAdminStats();
      } else {
        // Update stats
        fetchAdminStats();
      }
      setContentToDelete(null);
    }
  };

  const handleDeleteRequest = async () => {
    if (requestToDelete) {
      await fetch(`/api/requests/${requestToDelete}`, { method: 'DELETE' });
      fetchRequests();
      setRequestToDelete(null);
    }
  };

  const handleUpdateRequestStatus = async (id: string, status: string) => {
    await fetch(`/api/requests/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    fetchRequests();
  };

  // Change Username Handler
  const handleUsernameChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setUsernameError(null);
    setUsernameSuccess(null);

    if (!newUsername.trim()) {
      setUsernameError('New username cannot be empty.');
      return;
    }

    if (newUsername === adminUsername) {
      setUsernameError('New username must be different from current username.');
      return;
    }

    setUsernameLoading(true);
    const token = localStorage.getItem('adminToken');

    try {
      const res = await fetch('/api/admin/change-username', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ currentUsername: adminUsername, newUsername: newUsername.trim() })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setAdminUsername(data.username);
        localStorage.setItem('adminUsername', data.username);
        setUsernameSuccess(`Username successfully updated to "${data.username}".`);
        setNewUsername('');
        checkAdminStatus();
      } else {
        setUsernameError(data.error || 'Failed to update username.');
      }
    } catch (err) {
      setUsernameError('Error connecting to authentication portal.');
    } finally {
      setUsernameLoading(false);
    }
  };

  // Change Password Handler
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword) {
      setPasswordError('Please enter your current password.');
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError('New Password and Confirm New Password do not match.');
      return;
    }

    setPasswordLoading(true);
    const token = localStorage.getItem('adminToken');

    try {
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setPasswordSuccess('Password updated successfully. You will be redirected to log in again shortly.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
        
        // Short timeout then trigger re-login as requested
        setTimeout(() => {
          handleLogout();
        }, 2000);
      } else {
        setPasswordError(data.error || 'Failed to update password.');
      }
    } catch (err) {
      setPasswordError('Error connecting to gateway.');
    } finally {
      setPasswordLoading(false);
    }
  };

  // The filteredContent is replaced by adminContent from the server

  const handleSort = (field: 'title' | 'year' | 'rating') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };
  
  const filteredRequests = requests.filter(item => 
    item.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = React.useMemo(() => {
    return {
      movies: adminStats['Movies'] || 0,
      series: adminStats['Series'] || 0,
      animation: adminStats['Animation'] || 0,
      animationSeries: 0,
      animationMovies: 0,
      anime: adminStats['Anime'] || 0,
      animeSeries: 0,
      animeMovies: 0,
      asian: adminStats['Asian'] || adminStats['Asian Drama'] || 0,
      asianSeries: 0,
      asianMovies: 0
    };
  }, [adminStats]);

  const pendingRequestsCount = requests.filter(r => r.status === 'Pending').length;

  // Fallback loading screen while checking authentication status
  if (checkingSession) {
    return (
      <div className="min-h-screen bg-[#080B11] flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 text-brand-primary animate-spin mb-4" />
        <p className="text-brand-muted text-sm font-mono">Verifying Security Session Tokens...</p>
      </div>
    );
  }

  if (addMode === 'select') {
    return (
      <div className="min-h-screen bg-brand-bg pt-20 pb-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
           <div className="flex items-center gap-4 mb-8">
             <button onClick={() => setAddMode(null)} className="glass p-2 rounded-full hover:bg-white/10 transition-colors">
               <ArrowLeft className="w-5 h-5 text-white" />
             </button>
             <h1 className="text-3xl font-poppins font-bold text-white">Choose Upload Mode</h1>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div 
                 onClick={() => setAddMode('manual')}
                 className="group cursor-pointer glass-card rounded-3xl p-8 border border-white/5 hover:border-brand-primary/50 transition-all duration-300 relative overflow-hidden"
              >
                 <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                 <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mb-6 text-brand-primary group-hover:scale-110 transition-transform">
                   <Edit className="w-8 h-8" />
                 </div>
                 <h3 className="text-2xl font-poppins font-bold text-white mb-2">Manual Upload</h3>
                 <p className="text-brand-muted">Create content completely from scratch. Manually enter all details, upload localized posters, and manage variations.</p>
              </div>

              <div 
                 onClick={() => setAddMode('auto')}
                 className="group cursor-pointer glass-card rounded-3xl p-8 border border-white/5 hover:border-brand-primary/50 transition-all duration-300 relative overflow-hidden"
              >
                 <div className="absolute inset-0 bg-gradient-to-bl from-brand-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                 <div className="w-16 h-16 bg-brand-primary/10 rounded-2xl flex items-center justify-center mb-6 text-brand-primary group-hover:scale-110 transition-transform">
                   <UploadCloud className="w-8 h-8" />
                 </div>
                 <h3 className="text-2xl font-poppins font-bold text-white mb-2">Automatic Upload</h3>
                 <p className="text-brand-muted">Search content from TMDb and automatically fill all metadata. Quickest way to add standard movies and series.</p>
              </div>
           </div>
        </div>
      </div>
    );
  }

  if (isFetchingItem) {
    return (
      <div className="min-h-screen bg-[#080B11] flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-white/10 border-t-brand-primary rounded-full animate-spin mb-4" />
        <p className="text-brand-muted font-poppins">Loading content details...</p>
      </div>
    );
  }

  if (addMode === 'manual' || addMode === 'auto' || isEditing) {
    return (
      <ContentForm 
        mode={isEditing ? 'edit' : addMode}
        item={isEditing ? editingItemData : undefined}
        initialSearchQuery={publishRequestTitle}
        onSave={async (data) => {
          if (isEditing) {
            await updateContentItem({ ...data, id: isEditing });
          } else {
            await addContentItem({ ...data, id: `item_${Date.now()}` });
          }
          
          fetchAdminContent();
          fetchAdminStats();
          
          if (!isEditing && requests && requests.length > 0) {
             const publishedTitle = data.title.toLowerCase().trim();
             const altTitle = data.originalTitle ? data.originalTitle.toLowerCase().trim() : '';
             const match = requests.find((r: any) => 
                r.status === 'Pending' && 
                (r.title.toLowerCase().trim() === publishedTitle || 
                 (altTitle && r.title.toLowerCase().trim() === altTitle))
             );
             
             if (match) {
                await fetch(`/api/requests/${match.id}/status`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ status: 'Completed' })
                });
                alert(`Request automatically completed:\n${match.title}`);
                fetchRequests();
             }
          }

          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 5000);
          setIsEditing(null);
          setEditingItemData(null);
          setAddMode(null);
          setPublishRequestTitle('');
        }}
        onCancel={() => {
          setIsEditing(null);
          setEditingItemData(null);
          setAddMode(null);
          setPublishRequestTitle('');
        }}
      />
    );
  }

  const renderContentTab = () => (
    <>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard title="Total Movies" count={stats.movies} icon={<Film className="w-6 h-6 text-brand-primary" />} />
        <StatCard title="Total Series" count={stats.series} icon={<Tv className="w-6 h-6 text-blue-400" />} />
        <StatCard title="Total Animation" count={stats.animation} icon={<Video className="w-6 h-6 text-emerald-400" />} tooltip={{ series: stats.animationSeries, movies: stats.animationMovies, label: 'Animation' }} />
        <StatCard title="Total Anime" count={stats.anime} icon={<PlaySquare className="w-6 h-6 text-purple-400" />} tooltip={{ series: stats.animeSeries, movies: stats.animeMovies, label: 'Anime' }} />
        <StatCard title="Total Asian" count={stats.asian} icon={<Globe className="w-6 h-6 text-pink-400" />} tooltip={{ series: stats.asianSeries, movies: stats.asianMovies, label: 'Asian' }} />
      </div>

      <div className="glass-card rounded-2xl border border-white/5 overflow-hidden mt-6">
        <div className="p-6 border-b border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4">
          <h2 className="text-xl font-poppins font-semibold text-white">Content Library</h2>
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
            <input 
              type="text"
              autoComplete="off"
              placeholder="Search content by title or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-brand-primary"
            />
          </div>
        </div>
        
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
                <th className="px-6 py-4 font-semibold relative">
                  <button
                    onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                    className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer select-none focus:outline-none uppercase text-xs font-semibold"
                  >
                    Category
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showCategoryDropdown ? 'rotate-180' : ''}`} />
                    {categoryFilter !== 'All' && (
                      <span className="ml-1 px-1.5 py-0.5 bg-brand-primary text-white text-[10px] rounded-full normal-case font-bold">
                        {categoryFilter}
                      </span>
                    )}
                  </button>
                  {showCategoryDropdown && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowCategoryDropdown(false)} />
                      <div className="absolute top-full left-6 mt-1 w-44 bg-[#0d1117] border border-white/10 rounded-xl shadow-2xl z-20 py-1 font-normal normal-case text-brand-muted">
                        {(['All', 'Movies', 'Series', 'Anime', 'Animation', 'Asian'] as const).map((cat) => (
                          <button
                            key={cat}
                            onClick={() => {
                              setCategoryFilter(cat);
                              setShowCategoryDropdown(false);
                            }}
                            className={`w-full text-left px-4 py-2.5 text-xs hover:bg-white/10 hover:text-white transition-colors flex items-center justify-between ${
                              categoryFilter === cat ? 'text-brand-primary font-bold bg-white/5' : ''
                            }`}
                          >
                            <span>{cat === 'All' ? 'All Categories' : cat}</span>
                            {categoryFilter === cat && <Check className="w-3.5 h-3.5 text-brand-primary" />}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </th>
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
              {contentLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-white/50">
                    Loading content...
                  </td>
                </tr>
              ) : adminContent.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-white/50">
                    No content found. Try adjusting your search.
                  </td>
                </tr>
              ) : (
                adminContent.map((item) => (
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
                          onClick={() => handleEdit(item.id)}
                          className="p-2 hover:bg-blue-500/20 hover:text-blue-400 rounded-lg transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(item.id)}
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
        
        {!contentLoading && totalContent > 0 && (
          <div className="p-4 border-t border-white/5 flex items-center justify-between text-sm text-brand-muted">
            <div>
              Showing <span className="font-medium text-white">{Math.min((contentPage - 1) * contentLimit + 1, totalContent)}</span> to <span className="font-medium text-white">{Math.min(contentPage * contentLimit, totalContent)}</span> of <span className="font-medium text-white">{totalContent}</span> results
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setContentPage(p => Math.max(1, p - 1))}
                disabled={contentPage === 1}
                className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <button 
                onClick={() => setContentPage(p => p + 1)}
                disabled={contentPage * contentLimit >= totalContent}
                className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );

  const displayedRequests = filteredRequests.filter((r: any) => requestDisplayStatus === 'Pending' ? r.status === 'Pending' || !r.status : r.status === requestDisplayStatus);

  const renderRequestsTab = () => (
    <div className="glass-card rounded-2xl border border-white/5 overflow-hidden">
      <div className="p-6 pb-0 border-b border-white/5 gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
           <div>
              <h2 className="text-xl font-poppins font-semibold text-white flex items-center gap-2">
                <Heart className="w-5 h-5 text-pink-500" /> Requested Content
              </h2>
              <p className="text-sm text-brand-muted mt-1">Manage and track content requested by users.</p>
           </div>
           <div className="relative w-full sm:w-96">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
             <input 
               type="text"
               placeholder="Search requests..."
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               className="w-full bg-white/5 border border-white/10 rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-brand-primary"
             />
           </div>
        </div>

        <div className="flex items-center gap-4">
          {['Pending', 'Completed', 'Rejected'].map(status => (
            <button
               key={status}
               onClick={() => setRequestDisplayStatus(status as any)}
               className={`pb-3 px-2 text-sm font-semibold transition-all border-b-2 ${
                  requestDisplayStatus === status 
                    ? 'border-brand-primary text-brand-primary' 
                    : 'border-transparent text-brand-muted hover:text-white'
               }`}
            >
               {status} Requests
               {status === 'Pending' && pendingRequestsCount > 0 && (
                  <span className="ml-2 bg-pink-500 text-white text-xs px-1.5 py-0.5 rounded-full inline-flex">
                     {pendingRequestsCount}
                  </span>
               )}
            </button>
          ))}
        </div>
      </div>
      
      <div className="overflow-x-auto">
         <table className="w-full text-left text-sm text-brand-muted">
            <thead className="text-xs uppercase bg-white/5 text-white/70">
                <tr>
                   <th className="px-6 py-4 font-semibold">Title</th>
                   <th className="px-6 py-4 font-semibold">Category</th>
                   <th className="px-6 py-4 font-semibold">Dates</th>
                   <th className="px-6 py-4 font-semibold text-center">Requests</th>
                   <th className="px-6 py-4 font-semibold">Status</th>
                   <th className="px-6 py-4 font-semibold text-right">Actions</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
               {displayedRequests.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8">No {requestDisplayStatus.toLowerCase()} requests found.</td></tr>
               ) : (
                  displayedRequests.map((r: any, i: number) => (
                     <tr key={r.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 font-medium text-white flex flex-col">
                           <span>{r.title}</span>
                           {r.note && <span className="text-xs text-brand-muted mt-1 truncate max-w-[200px]" title={r.note}>Note: {r.note}</span>}
                        </td>
                        <td className="px-6 py-4"><span className="text-xs bg-white/10 px-2 py-1 rounded">{r.type}</span></td>
                        <td className="px-6 py-4 flex flex-col gap-1 text-xs">
                           <div><span className="text-white/50">Sub:</span> {new Date(r.date || Date.now()).toLocaleDateString()}</div>
                           {r.completionDate && <div><span className="text-white/50">Done:</span> {new Date(r.completionDate).toLocaleDateString()}</div>}
                        </td>
                        <td className="px-6 py-4 text-center">
                           <span className={`font-bold text-lg ${i < 3 ? 'text-brand-primary' : 'text-white'}`}>
                             {r.count}
                           </span>
                        </td>
                        <td className="px-6 py-4">
                           <span className={`text-xs px-2 py-1 rounded font-medium flex items-center w-fit gap-1 ${
                              r.status === 'Completed' ? 'bg-green-500/20 text-green-400' :
                              r.status === 'Approved' ? 'bg-blue-500/20 text-blue-400' :
                              r.status === 'Rejected' ? 'bg-red-500/20 text-red-400' :
                              'bg-yellow-500/20 text-yellow-400'
                           }`}>
                              {r.status === 'Completed' && <Check className="w-3 h-3" />}
                              {r.status === 'Approved' && <Check className="w-3 h-3" />}
                              {r.status === 'Rejected' && <XCircle className="w-3 h-3" />}
                              {r.status === 'Pending' && <Clock className="w-3 h-3" />}
                              {r.status || 'Pending'}
                           </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                           <div className="flex items-center justify-end gap-2">
                             {r.status !== 'Completed' && (
                               <button 
                                 onClick={() => {
                                    setPublishRequestTitle(r.title);
                                    setAddMode('auto');
                                 }}
                                 className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-primary text-white rounded-lg text-xs font-semibold hover:bg-brand-primary/90 transition-colors shadow-[0_0_15px_rgba(255,107,0,0.3)] hover:shadow-[0_0_20px_rgba(255,107,0,0.5)]"
                                 title="Publish Requested Content"
                               >
                                 <UploadCloud className="w-3.5 h-3.5" />
                                 Publish
                               </button>
                             )}
                             
                             <div className="flex items-center bg-white/5 rounded-lg border border-white/5 p-0.5 ml-2">
                               {r.status !== 'Approved' && r.status !== 'Completed' && (
                                  <button onClick={() => handleUpdateRequestStatus(r.id, 'Approved')} className="p-1.5 hover:bg-blue-500/20 text-brand-muted hover:text-blue-400 rounded-md transition-colors" title="Mark Approved">
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                               )}
                               {r.status !== 'Rejected' && r.status !== 'Completed' && (
                                  <button onClick={() => handleUpdateRequestStatus(r.id, 'Rejected')} className="p-1.5 hover:bg-red-500/20 text-brand-muted hover:text-red-400 rounded-md transition-colors" title="Mark Rejected">
                                    <XCircle className="w-3.5 h-3.5" />
                                  </button>
                               )}
                               {r.status !== 'Completed' && (
                                  <button onClick={() => handleUpdateRequestStatus(r.id, 'Completed')} className="p-1.5 hover:bg-green-500/20 text-brand-muted hover:text-green-400 rounded-md transition-colors" title="Mark Completed">
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                               )}
                             </div>
                             
                             <button 
                               onClick={() => setRequestToDelete(r.id)}
                               className="p-1.5 ml-1 bg-white/5 hover:bg-red-500/20 text-brand-muted hover:text-red-500 rounded-lg transition-colors border border-white/5 hover:border-red-500/30"
                               title="Delete Request"
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
    </div>
  );

  const renderPlaceholderTab = (title: string) => (
    <div className="glass-card rounded-2xl border border-white/5 p-12 text-center">
       <h2 className="text-2xl font-poppins font-bold text-white mb-2">{title}</h2>
       <p className="text-brand-muted">This section is currently under construction.</p>
    </div>
  );

  // Settings Tab (Changing admin username)
  const renderSettingsTab = () => (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="glass-card rounded-2xl border border-white/5 p-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-brand-primary to-brand-secondary" />
        
        <div className="flex items-center gap-3 text-white mb-6">
          <div className="p-2 bg-brand-primary/10 rounded-xl">
            <User className="w-6 h-6 text-brand-primary" />
          </div>
          <div>
            <h2 className="text-xl font-poppins font-bold">Admin Profile Settings</h2>
            <p className="text-xs text-brand-muted mt-0.5">Customize your general administrative identifiers.</p>
          </div>
        </div>

        {usernameError && (
          <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm mb-6">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <p>{usernameError}</p>
          </div>
        )}

        {usernameSuccess && (
          <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 text-green-400 p-4 rounded-xl text-sm mb-6">
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            <p>{usernameSuccess}</p>
          </div>
        )}

        <form onSubmit={handleUsernameChange} className="space-y-5">
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-brand-muted ml-1">Current Username</label>
            <input
              type="text"
              disabled
              value={adminUsername}
              className="w-full bg-[#151B2D]/30 border border-white/5 text-white/50 rounded-xl py-3 px-4 font-mono select-none cursor-not-allowed text-sm"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-brand-muted ml-1">New Username</label>
            <input
              type="text"
              required
              value={newUsername}
              onChange={(e) => {
                setNewUsername(e.target.value);
                if (usernameError) setUsernameError(null);
              }}
              disabled={usernameLoading}
              placeholder="Enter unique new username"
              className="w-full bg-[#151B2D]/50 border border-white/10 hover:border-white/20 focus:border-brand-primary rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all text-sm font-sans"
            />
          </div>

          <button
            type="submit"
            disabled={usernameLoading}
            className="w-full bg-brand-primary hover:bg-brand-primary/90 text-white font-poppins font-bold py-3.5 rounded-xl transition-all hover:shadow-[0_0_15px_rgba(255,107,0,0.2)] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed text-sm mt-2"
          >
            {usernameLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving Username...</span>
              </>
            ) : (
              <span>Save Profile Username</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );

  // Password & Security Tab (Change Password + Login History logs)
  const renderSecurityTab = () => (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Change Password Card */}
        <div className="lg:col-span-5 glass-card rounded-2xl border border-white/5 p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-red-500 to-orange-500" />
          
          <div className="flex items-center gap-3 text-white mb-6">
            <div className="p-2 bg-red-500/10 rounded-xl">
              <Key className="w-6 h-6 text-brand-primary" />
            </div>
            <div>
              <h2 className="text-xl font-poppins font-bold">Change Password</h2>
              <p className="text-xs text-brand-muted mt-0.5">Maintain secure database server access credentials.</p>
            </div>
          </div>

          {passwordError && (
            <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm mb-6">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <p>{passwordError}</p>
            </div>
          )}

          {passwordSuccess && (
            <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 text-green-400 p-4 rounded-xl text-sm mb-6">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <p>{passwordSuccess}</p>
            </div>
          )}

          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-brand-muted ml-1">Current Password</label>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  if (passwordError) setPasswordError(null);
                }}
                disabled={passwordLoading}
                placeholder="Enter current password"
                className="w-full bg-[#151B2D]/50 border border-white/10 hover:border-white/20 focus:border-brand-primary rounded-xl py-2.5 px-4 text-white focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-brand-muted ml-1">New Password</label>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (passwordError) setPasswordError(null);
                }}
                disabled={passwordLoading}
                placeholder="Minimum 6 characters"
                className="w-full bg-[#151B2D]/50 border border-white/10 hover:border-white/20 focus:border-brand-primary rounded-xl py-2.5 px-4 text-white focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-brand-muted ml-1">Confirm New Password</label>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={confirmNewPassword}
                onChange={(e) => {
                  setConfirmNewPassword(e.target.value);
                  if (passwordError) setPasswordError(null);
                }}
                disabled={passwordLoading}
                placeholder="Confirm new password"
                className="w-full bg-[#151B2D]/50 border border-white/10 hover:border-white/20 focus:border-brand-primary rounded-xl py-2.5 px-4 text-white focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all text-sm"
              />
            </div>

            <div className="flex items-center py-1">
              <label className="flex items-center gap-2 cursor-pointer group text-brand-muted select-none text-xs">
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                  disabled={passwordLoading}
                  className="accent-brand-primary w-3.5 h-3.5 rounded border-white/10"
                />
                <span className="group-hover:text-white transition-colors">Show Passwords</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={passwordLoading}
              className="w-full bg-brand-primary hover:bg-brand-primary/90 text-white font-poppins font-bold py-3 rounded-xl transition-all hover:shadow-[0_0_15px_rgba(255,107,0,0.2)] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed text-sm mt-3"
            >
              {passwordLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Updating Credentials...</span>
                </>
              ) : (
                <span>Save New Credentials</span>
              )}
            </button>
          </form>
        </div>

        {/* Login History Activity Log */}
        <div className="lg:col-span-7 glass-card rounded-2xl border border-white/5 p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-blue-500 to-indigo-500" />
          
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3 text-white">
              <div className="p-2 bg-blue-500/10 rounded-xl">
                <History className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h2 className="text-xl font-poppins font-bold">Login History Logs</h2>
                <p className="text-xs text-brand-muted mt-0.5">Audit system access trails and authentication attempts.</p>
              </div>
            </div>
            <button 
              onClick={fetchLoginHistory}
              className="p-2 hover:bg-white/5 rounded-xl border border-white/5 text-brand-muted hover:text-white transition-all font-sans text-xs flex items-center gap-1.5"
            >
              <Activity className="w-3.5 h-3.5" />
              Refresh Logs
            </button>
          </div>

          <div className="overflow-hidden border border-white/5 rounded-xl bg-brand-bg/50 max-h-[350px] overflow-y-auto">
            <table className="w-full text-left text-xs text-brand-muted relative">
              <thead className="text-[10px] uppercase bg-white/5 text-white/70 tracking-wider sticky top-0">
                <tr>
                  <th className="px-5 py-3 font-semibold">Timestamp</th>
                  <th className="px-5 py-3 font-semibold">IP Address</th>
                  <th className="px-5 py-3 font-semibold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loginHistory.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center py-12 text-brand-muted font-sans text-sm">
                      No security audit events captured.
                    </td>
                  </tr>
                ) : (
                  loginHistory.map((log) => (
                    <tr key={log.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-5 py-3.5 font-mono text-white/95">
                        <div className="font-semibold">{log.date}</div>
                        <div className="text-[10px] text-brand-muted mt-0.5">{log.time}</div>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-brand-muted font-medium">{log.ipAddress}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider inline-block ${
                          log.status === 'Success' 
                            ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}>
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-brand-bg pt-20 pb-12 relative">
      {saveSuccess && (
        <div 
          id="save-success-message" 
          className="fixed top-24 right-4 z-50 bg-green-500/20 border border-green-500/50 text-green-400 px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-in slide-in-from-right fade-in"
        >
          <CheckCircle className="w-5 h-5" />
          <span className="font-medium">Content Saved Successfully</span>
        </div>
      )}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        
        {/* FIRST LOGIN SETUP WARNING */}
        {isDefaultPassword && (
          <div className="bg-gradient-to-r from-red-600/20 via-orange-600/15 to-amber-500/5 border border-red-500/30 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl relative overflow-hidden">
            <div className="absolute left-0 top-0 h-full w-[4px] bg-red-500" />
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 bg-red-500/20 rounded-xl text-red-400 flex-shrink-0 animate-pulse">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-poppins font-bold text-white text-base">Critical Action Required</h3>
                <p className="text-white/80 text-sm mt-0.5">For security reasons, please change your default password.</p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('security')}
              className="px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white font-poppins font-bold text-xs rounded-xl shadow-lg transition-all hover:scale-102 flex-shrink-0 self-start md:self-center"
            >
              Change Password
            </button>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-brand-card/50 p-6 rounded-2xl border border-white/5 relative z-40">
          <div>
            <h1 className="text-3xl font-poppins font-bold text-white tracking-tight">Admin Dashboard</h1>
            <p className="text-brand-muted mt-1 text-sm font-sans">Manage your content network and gateway security.</p>
          </div>
          
          <div className="flex items-center gap-4 relative">
             <Link
                to="/"
                className="flex items-center gap-2 glass hover:bg-white/10 text-white px-4 py-2 rounded-xl border border-white/10 transition-all text-sm font-medium"
             >
                <ArrowLeft className="w-4 h-4 text-brand-primary" /> Back to Home
             </Link>

             <button
                onClick={() => setAddMode('select')}
                className="flex items-center gap-2 bg-brand-primary hover:bg-brand-primary/90 text-white font-semibold px-4 py-2 rounded-xl transition-all shadow-lg hover:shadow-[0_0_15px_rgba(255,107,0,0.3)] text-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Add Content
              </button>

              {/* ADMIN PROFILE DROPDOWN SECTION */}
              <div className="relative">
                <button
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="flex items-center gap-2 glass hover:bg-white/10 text-white px-4 py-2 rounded-xl border border-white/10 transition-all text-sm font-medium"
                >
                  <div className="w-5 h-5 rounded-full bg-brand-primary/20 border border-brand-primary/30 flex items-center justify-center text-brand-primary">
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-mono max-w-[120px] truncate">{adminUsername}</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-brand-muted transition-transform duration-200 ${isProfileOpen ? 'rotate-180' : ''}`} />
                </button>

                {isProfileOpen && (
                  <>
                    {/* Overlay to close on outside click */}
                    <div className="fixed inset-0 z-40 cursor-default" onClick={() => setIsProfileOpen(false)} />
                    
                    <div className="absolute right-0 mt-2 w-56 bg-[#111625]/95 border border-white/10 rounded-2xl p-2 shadow-2xl backdrop-blur-md z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                      <div className="px-3 py-2.5 border-b border-white/5">
                        <p className="text-[10px] uppercase font-bold tracking-wider text-brand-muted">Account Profile</p>
                        <p className="text-white font-bold text-sm truncate mt-0.5">{adminUsername}</p>
                      </div>
                      
                      <div className="p-1.5 space-y-1">
                        <button
                          onClick={() => {
                            setActiveTab('settings');
                            setIsProfileOpen(false);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-left rounded-xl text-xs text-white/90 hover:text-white hover:bg-white/5 transition-all font-sans"
                        >
                          <User className="w-4 h-4 text-brand-muted" />
                          Profile Settings
                        </button>

                        <button
                          onClick={() => {
                            setActiveTab('security');
                            setIsProfileOpen(false);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-left rounded-xl text-xs text-white/90 hover:text-white hover:bg-white/5 transition-all font-sans"
                        >
                          <Shield className="w-4 h-4 text-brand-muted" />
                          Password & Security
                        </button>

                        <button
                          onClick={() => {
                            setActiveTab('database');
                            setIsProfileOpen(false);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-left rounded-xl text-xs text-white/90 hover:text-white hover:bg-white/5 transition-all font-sans"
                        >
                          <Globe className="w-4 h-4 text-brand-muted" />
                          Database Status
                        </button>

                        <button
                          onClick={() => {
                            setIsProfileOpen(false);
                            handleLogout();
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-left rounded-xl text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all font-sans font-medium"
                        >
                          <LogOut className="w-4 h-4" />
                          Logout Gateway
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
          </div>
        </div>

        {/* Navigation Tabs Menu */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-4 overflow-x-auto relative z-10">
          {[
            { id: 'dashboard', label: 'Dashboard' },
            { id: 'leaderboard', label: 'Leaderboard' },
            { id: 'content', label: 'Content' },
            { id: 'users', label: 'Users' },
            { id: 'advanced_search', label: 'Advanced Search' },
            { id: 'franchises', label: 'Franchises' },
            { id: 'requests', label: 'Requested Content', badge: pendingRequestsCount },
            { id: 'advertisements', label: 'Advertisements' },
            { id: 'settings', label: 'Settings' },
            { id: 'security', label: 'Password & Security' },
            { id: 'database', label: 'Database Status' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                 setActiveTab(tab.id as any);
                 setSearchQuery('');
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === tab.id 
                  ? 'bg-white/10 text-brand-primary border border-white/10 shadow-[0_0_15px_rgba(255,107,0,0.1)]' 
                  : 'text-brand-muted hover:text-white hover:bg-white/5'
              }`}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="bg-pink-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Contents */}
        <div className="relative z-10">
          {activeTab === 'dashboard' && <AdminAnalytics />}
          {activeTab === 'leaderboard' && <AdminLeaderboard />}
          {activeTab === 'content' && renderContentTab()}
          {activeTab === 'users' && <AdminUsers onTotalCountChange={(count) => setTotalUsersCount(count)} />}
          {activeTab === 'advanced_search' && <AdminAdvancedSearch onEdit={handleEdit} onDelete={handleDelete} />}
          {activeTab === 'franchises' && <AdminFranchises />}
          {activeTab === 'advertisements' && <AdminAdvertisements />}
          {activeTab === 'requests' && renderRequestsTab()}
          {activeTab === 'settings' && renderSettingsTab()}
          {activeTab === 'security' && renderSecurityTab()}
          {activeTab === 'database' && <AdminDatabaseStatus />}
        </div>

      </div>
      
      {/* Delete Confirmation Modal */}
      {requestToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#151B2D] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
             <div className="flex items-center gap-3 text-red-500 mb-4">
                <div className="p-2 bg-red-500/10 rounded-full">
                  <Trash2 className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-poppins font-bold">Delete Request</h3>
             </div>
             <p className="text-white/80 mb-6">Are you sure you want to permanently delete this request?</p>
             <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setRequestToDelete(null)}
                  className="px-4 py-2 rounded-lg font-semibold text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteRequest}
                  className="px-4 py-2 rounded-lg font-semibold bg-red-500 hover:bg-red-600 text-white transition-colors"
                >
                  Delete
                </button>
             </div>
          </div>
        </div>
      )}

      {/* Delete Content Item Confirmation Modal */}
      {contentToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#151B2D] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
             <div className="flex items-center gap-3 text-red-500 mb-4">
                <div className="p-2 bg-red-500/10 rounded-full">
                  <Trash2 className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-poppins font-bold">Delete Content</h3>
             </div>
             <p className="text-white/80 mb-6">Are you sure you want to permanently delete this content item?</p>
             <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setContentToDelete(null)}
                  className="px-4 py-2 rounded-lg font-semibold text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteContent}
                  className="px-4 py-2 rounded-lg font-semibold bg-red-500 hover:bg-red-600 text-white transition-colors"
                >
                  Delete
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ 
  title, 
  count, 
  icon, 
  tooltip 
}: { 
  title: string; 
  count: number; 
  icon: React.ReactNode; 
  tooltip?: { series: number; movies: number; label: string }; 
}) {
  return (
    <div className="glass-card p-6 rounded-2xl border border-white/5 flex items-center gap-4 relative group hover:border-brand-primary/30 transition-all duration-200 cursor-help">
      {tooltip && (
        <div className="absolute z-50 bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 w-52 bg-[#0d111a] border border-white/10 rounded-xl p-3 shadow-2xl opacity-0 scale-95 invisible group-hover:opacity-100 group-hover:scale-100 group-hover:visible transition-all duration-200 pointer-events-none">
          <div className="space-y-1.5 text-xs text-white font-sans">
            <p className="font-bold text-brand-primary border-b border-white/10 pb-1 mb-1.5 flex items-center justify-between">
              <span>{title}</span>
              <span className="bg-white/10 px-1.5 py-0.5 rounded text-[10px] text-white">{count}</span>
            </p>
            <div className="flex justify-between items-center">
              <span className="text-brand-muted">{tooltip.label} series:</span>
              <span className="font-mono font-bold text-white">{tooltip.series}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-brand-muted">{tooltip.label} movie:</span>
              <span className="font-mono font-bold text-white">{tooltip.movies}</span>
            </div>
          </div>
          {/* Tooltip Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-[#0d111a] z-50" />
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-white/10 -z-10 translate-y-[1px]" />
        </div>
      )}
      
      <div className="p-3 bg-white/5 rounded-xl group-hover:bg-brand-primary/10 transition-colors">
        {icon}
      </div>
      <div>
        <p className="text-brand-muted text-xs font-semibold uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-poppins font-bold text-white mt-1">{count}</p>
      </div>
    </div>
  );
}
