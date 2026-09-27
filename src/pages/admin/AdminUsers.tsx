import React, { useState, useEffect } from 'react';
import { 
  Users, Search, Trash2, Eye, EyeOff, Calendar, ArrowUpDown, ChevronUp, ChevronDown, 
  Check, Loader2, AlertCircle, ShieldAlert, Clock, Mail, AtSign, User as UserIcon, 
  Lock, Copy, CheckCheck, RefreshCw, Filter, UserCheck, Shield, RotateCcw, Sparkles
} from 'lucide-react';

interface AdminUserItem {
  id: string;
  email: string;
  name: string | null;
  username: string | null;
  displayName: string | null;
  plainPassword: string | null;
  passwordHash: string | null;
  providers: string[] | string | null;
  createdAt: string;
  updatedAt: string;
}

interface UserStats {
  total: number;
  newToday: number;
  newThisWeek: number;
  withPassword: number;
}

interface AdminUsersProps {
  onTotalCountChange?: (count: number) => void;
}

export default function AdminUsers({ onTotalCountChange }: AdminUsersProps) {
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<UserStats>({ total: 0, newToday: 0, newThisWeek: 0, withPassword: 0 });

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7days' | '30days' | 'this_year'>('all');
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [providerFilter, setProviderFilter] = useState<'all' | 'password' | 'google'>('all');

  // Sorting state
  const [sortField, setSortField] = useState<'createdAt' | 'name' | 'username' | 'email'>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Pagination state
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);

  // Password visibility map (userId -> boolean)
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Delete modal state
  const [userToDelete, setUserToDelete] = useState<AdminUserItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Wipe all except admin modal state
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [wipeError, setWipeError] = useState<string | null>(null);
  const [wipeSuccess, setWipeSuccess] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Fetch users
  const fetchUsers = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        search: debouncedSearch,
        dateFilter,
        sortField,
        sortDirection,
        provider: providerFilter
      });

      const res = await fetch(`/api/admin/users?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        throw new Error(`Failed to load users (${res.status})`);
      }

      const data = await res.json();
      setUsers(data.users || []);
      setTotalUsers(data.total || 0);
      setTotalPages(data.totalPages || 1);
      if (data.stats) {
        setStats(data.stats);
        if (onTotalCountChange) {
          onTotalCountChange(data.stats.total || data.total || 0);
        }
      }
    } catch (err: any) {
      console.error('Error fetching admin users:', err);
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, limit, debouncedSearch, dateFilter, sortField, sortDirection, providerFilter]);

  const handleSort = (field: 'createdAt' | 'name' | 'username' | 'email') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setPage(1);
  };

  const togglePasswordVisibility = (userId: string) => {
    setRevealedPasswords(prev => ({
      ...prev,
      [userId]: !prev[userId]
    }));
  };

  const copyToClipboard = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    const token = localStorage.getItem('adminToken');
    if (!token) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/admin/users/${userToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete user');
      }

      setUserToDelete(null);
      fetchUsers();
    } catch (err: any) {
      console.error('Error deleting user:', err);
      setDeleteError(err.message || 'Failed to delete user');
    } finally {
      setDeleting(false);
    }
  };

  const handleWipeExceptAdmin = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    setWiping(true);
    setWipeError(null);
    setWipeSuccess(null);

    try {
      const res = await fetch('/api/admin/users/wipe-except-admin', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Abel Gebreslassie',
          username: 'abel2222',
          email: 'abelgebreslassie22@gmail.com'
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to wipe non-admin accounts');
      }

      setWipeSuccess(`Successfully wiped non-admin accounts. Admin account preserved with Name: Abel Gebreslassie & Username: @abel2222.`);
      fetchUsers();
      setTimeout(() => {
        setShowWipeModal(false);
        setWipeSuccess(null);
      }, 2000);
    } catch (err: any) {
      console.error('Error wiping users:', err);
      setWipeError(err.message || 'Failed to wipe accounts');
    } finally {
      setWiping(false);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  const dateFilterLabels: Record<string, string> = {
    all: 'All Dates',
    today: 'Joined Today',
    '7days': 'Last 7 Days',
    '30days': 'Last 30 Days',
    this_year: 'This Year'
  };

  return (
    <div className="space-y-6">
      {/* Metric Stat Cards - Exactly matching Content tab layout */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-5 rounded-2xl border border-white/5 relative overflow-hidden group hover:border-white/10 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-brand-muted uppercase tracking-wider">Total Users</p>
              <h3 className="text-2xl sm:text-3xl font-poppins font-bold text-white mt-1">
                {stats.total.toLocaleString()}
              </h3>
            </div>
            <div className="p-3 bg-brand-primary/10 rounded-xl border border-brand-primary/20">
              <Users className="w-6 h-6 text-brand-primary" />
            </div>
          </div>
          <p className="text-[11px] text-brand-muted mt-3 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Registered Cinema accounts
          </p>
        </div>

        <div className="glass-card p-5 rounded-2xl border border-white/5 relative overflow-hidden group hover:border-white/10 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-brand-muted uppercase tracking-wider">New Today</p>
              <h3 className="text-2xl sm:text-3xl font-poppins font-bold text-emerald-400 mt-1">
                {stats.newToday.toLocaleString()}
              </h3>
            </div>
            <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
              <UserCheck className="w-6 h-6 text-emerald-400" />
            </div>
          </div>
          <p className="text-[11px] text-brand-muted mt-3">Active signups in the last 24h</p>
        </div>

        <div className="glass-card p-5 rounded-2xl border border-white/5 relative overflow-hidden group hover:border-white/10 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-brand-muted uppercase tracking-wider">Past 7 Days</p>
              <h3 className="text-2xl sm:text-3xl font-poppins font-bold text-blue-400 mt-1">
                {stats.newThisWeek.toLocaleString()}
              </h3>
            </div>
            <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20">
              <Calendar className="w-6 h-6 text-blue-400" />
            </div>
          </div>
          <p className="text-[11px] text-brand-muted mt-3">Weekly user acquisition rate</p>
        </div>

        <div className="glass-card p-5 rounded-2xl border border-white/5 relative overflow-hidden group hover:border-white/10 transition-all">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-brand-muted uppercase tracking-wider">Saved Passwords</p>
              <h3 className="text-2xl sm:text-3xl font-poppins font-bold text-amber-400 mt-1">
                {stats.withPassword.toLocaleString()}
              </h3>
            </div>
            <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20">
              <Lock className="w-6 h-6 text-amber-400" />
            </div>
          </div>
          <p className="text-[11px] text-brand-muted mt-3">Accounts with plain/hashed creds</p>
        </div>
      </div>

      {/* Main Table Glass Card */}
      <div className="glass-card rounded-2xl border border-white/5 overflow-hidden">
        {/* Table Header & Controls Bar */}
        <div className="p-5 sm:p-6 border-b border-white/5 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg sm:text-xl font-poppins font-semibold text-white flex items-center gap-2.5">
              <span>Registered Users</span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                {totalUsers} {totalUsers === 1 ? 'user' : 'users'}
              </span>
            </h2>
            <button
              onClick={() => fetchUsers()}
              title="Refresh users list"
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-brand-muted hover:text-white transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
              <input 
                type="text"
                autoComplete="off"
                placeholder="Search name, username, email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-9 pr-4 text-xs sm:text-sm text-white focus:outline-none focus:border-brand-primary transition-colors placeholder:text-brand-muted"
              />
            </div>

            {/* Date Filter Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowDateDropdown(!showDateDropdown)}
                className="w-full sm:w-auto px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-white flex items-center justify-between sm:justify-start gap-2 transition-colors cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5 text-brand-primary" />
                <span>{dateFilterLabels[dateFilter]}</span>
                <ChevronDown className={`w-3.5 h-3.5 text-brand-muted transition-transform ${showDateDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showDateDropdown && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setShowDateDropdown(false)} />
                  <div className="absolute right-0 mt-1.5 w-48 bg-[#0d1117] border border-white/10 rounded-xl shadow-2xl z-30 py-1 font-normal text-brand-muted backdrop-blur-xl">
                    {(['all', 'today', '7days', '30days', 'this_year'] as const).map((filterKey) => (
                      <button
                        key={filterKey}
                        onClick={() => {
                          setDateFilter(filterKey);
                          setShowDateDropdown(false);
                          setPage(1);
                        }}
                        className={`w-full text-left px-4 py-2 text-xs hover:bg-white/10 hover:text-white transition-colors flex items-center justify-between cursor-pointer ${
                          dateFilter === filterKey ? 'text-brand-primary font-bold bg-white/5' : ''
                        }`}
                      >
                        <span>{dateFilterLabels[filterKey]}</span>
                        {dateFilter === filterKey && <Check className="w-3.5 h-3.5 text-brand-primary" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Provider Filter */}
            <div className="flex items-center rounded-xl bg-white/5 border border-white/10 p-0.5">
              <button
                onClick={() => { setProviderFilter('all'); setPage(1); }}
                className={`px-2.5 py-1.5 text-xs rounded-lg transition-colors cursor-pointer ${
                  providerFilter === 'all' ? 'bg-brand-primary text-black font-bold' : 'text-brand-muted hover:text-white'
                }`}
              >
                All
              </button>
              <button
                onClick={() => { setProviderFilter('password'); setPage(1); }}
                className={`px-2.5 py-1.5 text-xs rounded-lg transition-colors cursor-pointer ${
                  providerFilter === 'password' ? 'bg-brand-primary text-black font-bold' : 'text-brand-muted hover:text-white'
                }`}
              >
                Password
              </button>
              <button
                onClick={() => { setProviderFilter('google'); setPage(1); }}
                className={`px-2.5 py-1.5 text-xs rounded-lg transition-colors cursor-pointer ${
                  providerFilter === 'google' ? 'bg-brand-primary text-black font-bold' : 'text-brand-muted hover:text-white'
                }`}
              >
                OAuth/Firebase
              </button>
            </div>

            {/* Wipe / Reset Button */}
            <button
              type="button"
              onClick={() => setShowWipeModal(true)}
              title="Wipe all non-admin accounts and start fresh"
              className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-xs font-semibold text-red-400 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Wipe Other Accounts</span>
            </button>
          </div>
        </div>

        {/* Users Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm text-brand-muted">
            <thead className="text-[11px] uppercase bg-white/[0.03] text-white/70 tracking-wider border-b border-white/5">
              <tr>
                <th className="px-5 py-3.5 font-semibold">User Details</th>
                <th className="px-5 py-3.5 font-semibold">
                  <button
                    onClick={() => handleSort('name')}
                    className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer select-none uppercase font-semibold text-[11px]"
                  >
                    Name
                    {sortField === 'name' ? (
                      sortDirection === 'asc' ? <ChevronUp className="w-3 h-3 text-brand-primary" /> : <ChevronDown className="w-3 h-3 text-brand-primary" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-white/20" />
                    )}
                  </button>
                </th>
                <th className="px-5 py-3.5 font-semibold">
                  <button
                    onClick={() => handleSort('username')}
                    className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer select-none uppercase font-semibold text-[11px]"
                  >
                    Username
                    {sortField === 'username' ? (
                      sortDirection === 'asc' ? <ChevronUp className="w-3 h-3 text-brand-primary" /> : <ChevronDown className="w-3 h-3 text-brand-primary" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-white/20" />
                    )}
                  </button>
                </th>
                <th className="px-5 py-3.5 font-semibold">
                  <button
                    onClick={() => handleSort('email')}
                    className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer select-none uppercase font-semibold text-[11px]"
                  >
                    Email
                    {sortField === 'email' ? (
                      sortDirection === 'asc' ? <ChevronUp className="w-3 h-3 text-brand-primary" /> : <ChevronDown className="w-3 h-3 text-brand-primary" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-white/20" />
                    )}
                  </button>
                </th>
                <th className="px-5 py-3.5 font-semibold">Password</th>
                <th className="px-5 py-3.5 font-semibold">
                  <button
                    onClick={() => handleSort('createdAt')}
                    className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer select-none uppercase font-semibold text-[11px]"
                  >
                    Registered Date
                    {sortField === 'createdAt' ? (
                      sortDirection === 'asc' ? <ChevronUp className="w-3 h-3 text-brand-primary" /> : <ChevronDown className="w-3 h-3 text-brand-primary" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-white/20" />
                    )}
                  </button>
                </th>
                <th className="px-5 py-3.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-white/50">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <Loader2 className="w-6 h-6 animate-spin text-brand-primary" />
                      <span className="text-xs">Loading registered users...</span>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-red-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <AlertCircle className="w-6 h-6 text-red-400" />
                      <span>{error}</span>
                      <button
                        onClick={() => fetchUsers()}
                        className="mt-2 px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs"
                      >
                        Try Again
                      </button>
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-white/40">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Users className="w-8 h-8 text-white/20" />
                      <p className="text-sm font-medium text-white/70">No users found</p>
                      <p className="text-xs text-brand-muted">Try adjusting your search query or date filter.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                users.map((item) => {
                  const isRevealed = !!revealedPasswords[item.id];
                  const passwordValue = item.plainPassword || (item.passwordHash ? `Hash: ${item.passwordHash.substring(0, 14)}...` : 'OAuth/No Password');
                  const isPrimaryAdmin = item.email === 'abelgebreslassie@gmail.com' || item.email === 'abelgebreslassie22@gmail.com' || item.username === 'admin';

                  return (
                    <tr key={item.id} className="hover:bg-white/[0.02] transition-colors group">
                      {/* Avatar & ID */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FF8C00]/20 to-[#FFA726]/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary font-bold text-xs shrink-0">
                            {((item.name || item.displayName || item.username || item.email || 'U')[0]).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <span className="font-mono text-[10px] text-white/40 block truncate max-w-[100px]" title={item.id}>
                              {item.id}
                            </span>
                            {isPrimaryAdmin && (
                              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.2 rounded bg-brand-primary/20 text-brand-primary font-bold">
                                <Shield className="w-2.5 h-2.5" /> Admin
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Name */}
                      <td className="px-5 py-3.5">
                        <span className="font-semibold text-white block truncate max-w-[150px]">
                          {item.name || item.displayName || '—'}
                        </span>
                      </td>

                      {/* Username */}
                      <td className="px-5 py-3.5">
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-white text-xs font-mono">
                          <span className="text-brand-primary">@</span>
                          <span>{item.username || (item.email ? item.email.split('@')[0] : '—')}</span>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="text-white/90 truncate max-w-[180px] font-sans" title={item.email}>
                            {item.email}
                          </span>
                          <button
                            onClick={() => copyToClipboard(item.email, `email-${item.id}`)}
                            title="Copy email address"
                            className="text-white/30 hover:text-white p-1 rounded transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                          >
                            {copiedField === `email-${item.id}` ? (
                              <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Password (with Eye Reveal Toggle) */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="font-mono text-xs text-white/80 bg-black/30 px-2.5 py-1 rounded-lg border border-white/10 flex items-center gap-2 max-w-[180px]">
                            {item.plainPassword ? (
                              <span className="truncate">
                                {isRevealed ? item.plainPassword : '••••••••••••'}
                              </span>
                            ) : item.passwordHash ? (
                              <span className="text-white/50 text-[11px] truncate" title={item.passwordHash}>
                                {isRevealed ? item.passwordHash : '•••••••• (hash)'}
                              </span>
                            ) : (
                              <span className="text-white/40 italic text-[11px]">No password set</span>
                            )}
                          </div>

                          {(item.plainPassword || item.passwordHash) && (
                            <>
                              <button
                                onClick={() => togglePasswordVisibility(item.id)}
                                title={isRevealed ? "Hide password" : "Show password"}
                                className="p-1 rounded text-white/40 hover:text-brand-primary transition-colors cursor-pointer"
                              >
                                {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>

                              <button
                                onClick={() => copyToClipboard(item.plainPassword || item.passwordHash || '', `pwd-${item.id}`)}
                                title="Copy password"
                                className="p-1 rounded text-white/40 hover:text-white transition-colors cursor-pointer"
                              >
                                {copiedField === `pwd-${item.id}` ? (
                                  <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Registration Date */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5 text-white/70 text-xs">
                          <Clock className="w-3.5 h-3.5 text-white/30 shrink-0" />
                          <span className="whitespace-nowrap">{formatDate(item.createdAt)}</span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5 text-right">
                        {isPrimaryAdmin ? (
                          <span className="text-[11px] text-white/40 italic px-2 py-1">Protected</span>
                        ) : (
                          <button
                            onClick={() => setUserToDelete(item)}
                            title="Delete user account"
                            className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all cursor-pointer inline-flex items-center gap-1 text-xs"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="hidden lg:inline">Delete</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination Bar - matching Content tab style */}
        <div className="p-4 sm:p-5 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-brand-muted">
          <div className="flex items-center gap-2">
            <span>Show</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white focus:outline-none focus:border-brand-primary"
            >
              <option value={10} className="bg-[#0d1117]">10 per page</option>
              <option value={20} className="bg-[#0d1117]">20 per page</option>
              <option value={50} className="bg-[#0d1117]">50 per page</option>
              <option value={100} className="bg-[#0d1117]">100 per page</option>
            </select>
            <span>of {totalUsers} users</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors cursor-pointer"
            >
              Previous
            </button>
            <span className="px-3 py-1.5 rounded-lg bg-white/10 text-brand-primary font-bold">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Delete User Confirmation Modal */}
      {userToDelete && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[#151B2D] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-red-500 mb-4">
              <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/20">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-poppins font-semibold text-white">Delete User Account</h3>
                <p className="text-xs text-brand-muted">This action is permanent and cannot be undone.</p>
              </div>
            </div>

            {deleteError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs mb-4">
                {deleteError}
              </div>
            )}

            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5 space-y-2 mb-6">
              <div className="flex justify-between text-xs">
                <span className="text-brand-muted">Name:</span>
                <span className="text-white font-medium">{userToDelete.name || userToDelete.displayName || '—'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-brand-muted">Username:</span>
                <span className="text-brand-primary font-mono font-medium">@{userToDelete.username || '—'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-brand-muted">Email:</span>
                <span className="text-white font-medium">{userToDelete.email}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-brand-muted">User ID:</span>
                <span className="text-white/50 font-mono text-[10px]">{userToDelete.id}</span>
              </div>
            </div>

            <p className="text-xs text-white/70 mb-6">
              Deleting this user will remove their login access and all their watchlist and collection history.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-brand-muted hover:text-white bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUser}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-500 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {deleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wipe All Accounts Except Admin Modal */}
      {showWipeModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#151B2D] border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-red-400 mb-4">
              <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/20">
                <RotateCcw className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-poppins font-semibold text-white">Wipe Accounts & Start Fresh</h3>
                <p className="text-xs text-brand-muted">Reset users table and keep only the Administrator</p>
              </div>
            </div>

            {wipeError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs mb-4">
                {wipeError}
              </div>
            )}

            {wipeSuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs mb-4 flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>{wipeSuccess}</span>
              </div>
            )}

            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5 space-y-2.5 mb-4">
              <div className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-brand-primary" />
                <span>Preserved Administrator Account</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-brand-muted">Name:</span>
                <span className="text-white font-medium">Abel Gebreslassie</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-brand-muted">Username:</span>
                <span className="text-brand-primary font-mono font-medium">@abel2222</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-brand-muted">Email:</span>
                <span className="text-white font-medium">abelgebreslassie22@gmail.com</span>
              </div>
            </div>

            <p className="text-xs text-brand-muted mb-6 leading-relaxed">
              This action will permanently delete all other user accounts, passwords, and watchlist collections across both PostgreSQL and Firestore so you can start fresh. New users registering will be required to enter both their Name and unique @username.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => { setShowWipeModal(false); setWipeError(null); setWipeSuccess(null); }}
                disabled={wiping}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-brand-muted hover:text-white bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleWipeExceptAdmin}
                disabled={wiping}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-500 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {wiping ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Wiping accounts...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm Wipe & Reset</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
