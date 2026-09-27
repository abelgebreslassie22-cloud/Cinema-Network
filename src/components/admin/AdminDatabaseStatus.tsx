import React, { useState, useEffect } from 'react';
import { 
  Server, 
  Database, 
  Cloud, 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  ArrowRight, 
  RefreshCw, 
  HardDrive, 
  ShieldCheck, 
  Zap, 
  Cpu, 
  Clock, 
  Layers, 
  FileText, 
  Users, 
  Download, 
  Eye, 
  Star,
  Check,
  XCircle
} from 'lucide-react';

interface DbNodeStatus {
  name: string;
  provider: string;
  role: string;
  status: 'active' | 'failed';
  latencyMs?: number;
  counts?: Record<string, number>;
  error?: string | null;
  region?: string;
  writeStatus?: string;
  collectionNames?: string[];
}

interface DatabaseStatusPayload {
  summary: {
    totalDatabases: number;
    healthyCount: number;
    currentRead: 'local' | 'supabase_primary' | 'firestore' | 'none';
    timestamp: string;
  };
  local: DbNodeStatus;
  supabasePrimary: DbNodeStatus;
  supabaseBackup: DbNodeStatus;
  firestore: DbNodeStatus;
  syncQueue: {
    pendingOperations: number;
    mode: string;
  };
}

export default function AdminDatabaseStatus() {
  const [status, setStatus] = useState<DatabaseStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date>(new Date());
  const [syncing, setSyncing] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      setRefreshing(true);
      const res = await fetch('/api/admin/db-status');
      const data = await res.json();
      setStatus(data);
      setLastChecked(new Date());
    } catch (e) {
      console.error('Failed to fetch DB status', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRecoverLocalDb = async () => {
    try {
      setRecovering(true);
      setSyncMessage('Initiating automatic copy from Primary Supabase...');
      const res = await fetch('/api/admin/recover-local-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true })
      });
      const data = await res.json();
      if (data.success) {
        setSyncMessage(`Recovery initiated: ${data.result?.message || 'Started'}`);
      } else {
        setSyncMessage(`Recovery failed: ${data.error || 'Unknown error'}`);
      }
      await fetchStatus();
    } catch (err: any) {
      setSyncMessage(`Recovery error: ${err.message}`);
    } finally {
      setRecovering(false);
      setTimeout(() => setSyncMessage(null), 6000);
    }
  };

  const handleTriggerSync = async () => {
    try {
      setSyncing(true);
      setSyncMessage(null);
      const res = await fetch('/api/admin/trigger-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success) {
        setSyncMessage(`Sync completed: ${data.result?.succeeded || 0} operations processed.`);
      } else {
        setSyncMessage(`Sync failed: ${data.error || 'Unknown error'}`);
      }
      await fetchStatus();
    } catch (err: any) {
      setSyncMessage(`Sync error: ${err.message}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 4000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !status) {
    return (
      <div className="glass-card rounded-2xl p-12 border border-white/5 flex flex-col items-center justify-center space-y-4 text-center">
        <RefreshCw className="w-8 h-8 text-brand-primary animate-spin" />
        <p className="text-brand-muted text-sm font-poppins">Querying 4-Tier Database topology health & live failovers...</p>
      </div>
    );
  }

  const localActive = status?.local?.status === 'active';
  const supabasePrimaryActive = status?.supabasePrimary?.status === 'active';
  const supabaseBackupActive = status?.supabaseBackup?.status === 'active';
  const firestoreActive = status?.firestore?.status === 'active';

  const healthyCount = (localActive ? 1 : 0) + (supabasePrimaryActive ? 1 : 0) + (supabaseBackupActive ? 1 : 0) + (firestoreActive ? 1 : 0);

  const getReadGatewayLabel = () => {
    switch (status?.summary?.currentRead) {
      case 'local':
        return 'Local In-Memory Engine (0ms Latency)';
      case 'supabase_primary':
        return 'Primary Supabase (Direct Cloud SQL)';
      case 'firestore':
        return 'Google Cloud Firestore (Failover)';
      default:
        return 'Offline / Initializing';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-poppins font-bold text-white flex items-center gap-3">
              <HardDrive className="w-7 h-7 text-brand-primary" />
              4-Tier Multi-Database Topology
            </h2>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono border ${
              healthyCount === 4 
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                : healthyCount >= 2 
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' 
                  : 'bg-red-500/10 text-red-400 border-red-500/20'
            }`}>
              {healthyCount} / 4 ONLINE
            </span>
          </div>
          <p className="text-brand-muted text-sm mt-1">
            Real-time topology monitoring across Local In-Memory PGLite, Primary Supabase, Backup Supabase, and Cloud Firestore.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono text-brand-muted bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
            Auto-refresh: 4s • Last: {lastChecked.toLocaleTimeString()}
          </span>
          <button 
            onClick={fetchStatus}
            disabled={refreshing}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white text-xs font-semibold px-3.5 py-2 rounded-xl border border-white/10 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-brand-primary' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Sync Message Alert */}
      {syncMessage && (
        <div className="p-3 bg-brand-primary/10 border border-brand-primary/20 rounded-xl text-xs text-white flex items-center justify-between">
          <span>{syncMessage}</span>
          <button onClick={() => setSyncMessage(null)} className="text-brand-muted hover:text-white">✕</button>
        </div>
      )}

      {/* Active Routing Banner */}
      <div className="glass-card rounded-2xl border border-white/10 p-6 bg-gradient-to-r from-[#111625] via-[#151b2d] to-[#111625] relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                <Activity className="w-3.5 h-3.5 animate-pulse" /> Live Traffic Architecture
              </span>
              {healthyCount === 4 ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <ShieldCheck className="w-3.5 h-3.5" /> High Availability Normal (Quad-Resilient)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
                  <AlertTriangle className="w-3.5 h-3.5" /> Partial Node Degradation: Fallover Active
                </span>
              )}
            </div>
            <h3 className="text-lg font-bold text-white">
              {localActive 
                ? 'Local In-Memory Engine is active and serving all 0ms reads with zero database quota.' 
                : supabasePrimaryActive 
                  ? 'Local engine standby. Serving traffic directly from Primary Supabase.'
                  : 'SQL cluster unreachable. Emergency fallback to Cloud Firestore is active.'}
            </h3>
            <p className="text-xs text-brand-muted max-w-2xl">
              All write operations are continuously synchronized across all active databases in real-time. If any database goes offline, queries automatically and transparently route to the next available tier without downtime.
            </p>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-4">
            <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 min-w-[200px]">
              <span className="text-[10px] uppercase font-bold tracking-wider text-brand-muted block mb-1">
                Active Read Gateway
              </span>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${
                  status?.summary?.currentRead === 'local' 
                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' 
                    : status?.summary?.currentRead === 'supabase_primary' 
                      ? 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]' 
                      : status?.summary?.currentRead === 'firestore'
                        ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                        : 'bg-red-500'
                }`} />
                <span className="font-mono text-xs font-bold text-white uppercase tracking-wider">
                  {getReadGatewayLabel()}
                </span>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 min-w-[220px]">
              <span className="text-[10px] uppercase font-bold tracking-wider text-brand-muted block mb-1">
                Active Multi-Write Pipeline
              </span>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                <span className="font-mono text-xs font-bold text-white uppercase tracking-wider">
                  Local + Supabase 1 & 2 + Firestore
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Database Nodes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* Node 1: Local In-Memory PGLite */}
        <div className={`glass-card rounded-2xl p-5 border flex flex-col justify-between transition-all ${
          localActive ? 'border-emerald-500/20 hover:border-emerald-500/40 bg-[#111625]/70' : 'border-red-500/30 bg-red-500/5'
        }`}>
          <div>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className={`p-2.5 rounded-xl ${localActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-poppins font-bold text-white text-sm leading-tight">1. Local Database</h4>
                  <p className="text-[10px] text-brand-muted font-mono mt-0.5">In-Memory PGLite</p>
                </div>
              </div>
              {status?.local?.isRecovering ? (
                <span className="flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 animate-pulse">
                  <RefreshCw className="w-3 h-3 animate-spin" /> AUTO-COPYING
                </span>
              ) : localActive ? (
                <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <Check className="w-3 h-3" /> ACTIVE
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                  <XCircle className="w-3 h-3" /> FAILED
                </span>
              )}
            </div>

            <p className="text-xs text-brand-muted mb-3 font-sans line-clamp-2">
              {status?.local?.role || 'Primary ultra-low latency query & cache engine.'}
            </p>

            {/* Auto-Recovery Progress */}
            {status?.local?.isRecovering && (
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-300 mb-3">
                <p className="font-bold flex items-center gap-1">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Auto-Copy from Supabase Primary
                </p>
                <p className="text-[11px] mt-1 text-amber-200/80">
                  {status?.local?.recoveryProgress?.currentTable 
                    ? `Copying table: ${status.local.recoveryProgress.currentTable} (${status.local.recoveryProgress.completedTables}/${status.local.recoveryProgress.totalTables})` 
                    : 'Recreating local schema...'}
                </p>
              </div>
            )}

            {status?.local?.latencyMs !== undefined && !status?.local?.isRecovering && (
              <div className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded mb-3">
                <Clock className="w-3 h-3" /> Latency: {status.local.latencyMs}ms (Instant)
              </div>
            )}

            {/* Error Display if Failed */}
            {status?.local?.error && (
              <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-300 mb-3">
                <p className="font-bold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Error:</p>
                <p className="font-mono text-[11px] mt-0.5 break-words">{status.local.error}</p>
              </div>
            )}

            {/* Data Metrics */}
            <div className="space-y-1.5 py-2.5 border-t border-white/5 text-xs">
              <div className="flex justify-between items-center text-brand-muted">
                <span>Content:</span>
                <span className="font-mono font-bold text-white">{status?.local?.counts?.content?.toLocaleString() ?? 0}</span>
              </div>
              <div className="flex justify-between items-center text-brand-muted">
                <span>Users / Ratings:</span>
                <span className="font-mono font-bold text-white">{status?.local?.counts?.users ?? 0} / {status?.local?.counts?.ratings ?? 0}</span>
              </div>
              <div className="flex justify-between items-center text-brand-muted">
                <span>Downloads / Views:</span>
                <span className="font-mono font-bold text-white">{status?.local?.counts?.downloads ?? 0} / {status?.local?.counts?.views ?? 0}</span>
              </div>
              <div className="flex justify-between items-center text-brand-muted">
                <span>Homepage Caches:</span>
                <span className="font-mono font-bold text-white">{status?.local?.counts?.homepageCache ?? 0}</span>
              </div>
            </div>
          </div>

          <div className="pt-2.5 border-t border-white/5 text-[11px] space-y-2">
            <div className="flex justify-between items-center text-brand-muted">
              <span>Read Gateway:</span>
              <span className={`font-mono font-bold ${status?.summary?.currentRead === 'local' ? 'text-emerald-400' : 'text-brand-muted'}`}>
                {status?.summary?.currentRead === 'local' ? '● SERVING READS' : 'STANDBY'}
              </span>
            </div>

            {!localActive && !status?.local?.isRecovering && (
              <button
                onClick={handleRecoverLocalDb}
                disabled={recovering}
                className="w-full mt-2 py-1.5 px-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg text-amber-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${recovering ? 'animate-spin' : ''}`} />
                {recovering ? 'Initiating Copy...' : 'Copy from Primary Supabase'}
              </button>
            )}
          </div>
        </div>

        {/* Node 2: Primary Supabase PostgreSQL */}
        <div className={`glass-card rounded-2xl p-5 border flex flex-col justify-between transition-all ${
          supabasePrimaryActive ? 'border-blue-500/20 hover:border-blue-500/40 bg-[#111625]/70' : 'border-red-500/30 bg-red-500/5'
        }`}>
          <div>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className={`p-2.5 rounded-xl ${supabasePrimaryActive ? 'bg-blue-500/10 text-blue-400' : 'bg-red-500/10 text-red-400'}`}>
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-poppins font-bold text-white text-sm leading-tight">2. Primary Supabase</h4>
                  <p className="text-[10px] text-brand-muted font-mono mt-0.5">PostgreSQL Frankfurt</p>
                </div>
              </div>
              {supabasePrimaryActive ? (
                <span className="flex items-center gap-1 text-[11px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                  <Check className="w-3 h-3" /> ONLINE
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                  <XCircle className="w-3 h-3" /> FAILED
                </span>
              )}
            </div>

            <p className="text-xs text-brand-muted mb-3 font-sans line-clamp-2">
              {status?.supabasePrimary?.role || 'Main cloud data authority and initial hydration source.'}
            </p>

            {status?.supabasePrimary?.latencyMs !== undefined && (
              <div className="inline-flex items-center gap-1 text-[11px] font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded mb-3">
                <Clock className="w-3 h-3" /> Latency: {status.supabasePrimary.latencyMs}ms
              </div>
            )}

            {/* Error Display if Failed */}
            {status?.supabasePrimary?.error && (
              <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-300 mb-3">
                <p className="font-bold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Error:</p>
                <p className="font-mono text-[11px] mt-0.5 break-words">{status.supabasePrimary.error}</p>
              </div>
            )}

            {/* Data Metrics */}
            <div className="space-y-1.5 py-2.5 border-t border-white/5 text-xs">
              <div className="flex justify-between items-center text-brand-muted">
                <span>Cloud Content:</span>
                <span className="font-mono font-bold text-white">{status?.supabasePrimary?.counts?.content?.toLocaleString() ?? 0}</span>
              </div>
              <div className="flex justify-between items-center text-brand-muted">
                <span>Users / Ratings:</span>
                <span className="font-mono font-bold text-white">{status?.supabasePrimary?.counts?.users ?? 0} / {status?.supabasePrimary?.counts?.ratings ?? 0}</span>
              </div>
              <div className="flex justify-between items-center text-brand-muted">
                <span>Downloads / Views:</span>
                <span className="font-mono font-bold text-white">{status?.supabasePrimary?.counts?.downloads ?? 0} / {status?.supabasePrimary?.counts?.views ?? 0}</span>
              </div>
              <div className="flex justify-between items-center text-brand-muted">
                <span>Region / Cluster:</span>
                <span className="font-mono font-semibold text-white">eu-central-1</span>
              </div>
            </div>
          </div>

          <div className="pt-2.5 border-t border-white/5 text-[11px]">
            <div className="flex justify-between items-center text-brand-muted">
              <span>Write Status:</span>
              <span className="font-mono font-bold text-blue-400">
                {supabasePrimaryActive ? '● SYNC MULTI-WRITE' : 'OFFLINE'}
              </span>
            </div>
          </div>
        </div>

        {/* Node 3: Backup Supabase PostgreSQL */}
        <div className={`glass-card rounded-2xl p-5 border flex flex-col justify-between transition-all ${
          supabaseBackupActive ? 'border-purple-500/20 hover:border-purple-500/40 bg-[#111625]/70' : 'border-red-500/30 bg-red-500/5'
        }`}>
          <div>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className={`p-2.5 rounded-xl ${supabaseBackupActive ? 'bg-purple-500/10 text-purple-400' : 'bg-red-500/10 text-red-400'}`}>
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-poppins font-bold text-white text-sm leading-tight">3. Backup Supabase</h4>
                  <p className="text-[10px] text-brand-muted font-mono mt-0.5">PostgreSQL London</p>
                </div>
              </div>
              {supabaseBackupActive ? (
                <span className="flex items-center gap-1 text-[11px] font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
                  <Check className="w-3 h-3" /> ONLINE
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                  <XCircle className="w-3 h-3" /> FAILED
                </span>
              )}
            </div>

            <p className="text-xs text-brand-muted mb-3 font-sans line-clamp-2">
              {status?.supabaseBackup?.role || 'High-availability disaster recovery hot replica.'}
            </p>

            {status?.supabaseBackup?.latencyMs !== undefined && (
              <div className="inline-flex items-center gap-1 text-[11px] font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded mb-3">
                <Clock className="w-3 h-3" /> Latency: {status.supabaseBackup.latencyMs}ms
              </div>
            )}

            {/* Error Display if Failed */}
            {status?.supabaseBackup?.error && (
              <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-300 mb-3">
                <p className="font-bold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Error:</p>
                <p className="font-mono text-[11px] mt-0.5 break-words">{status.supabaseBackup.error}</p>
              </div>
            )}

            {/* Data Metrics */}
            <div className="space-y-1.5 py-2.5 border-t border-white/5 text-xs">
              <div className="flex justify-between items-center text-brand-muted">
                <span>Role:</span>
                <span className="font-semibold text-white">Hot Backup Replica</span>
              </div>
              <div className="flex justify-between items-center text-brand-muted">
                <span>Region / Cluster:</span>
                <span className="font-mono font-semibold text-white">eu-west-2</span>
              </div>
              <div className="flex justify-between items-center text-brand-muted">
                <span>Replication:</span>
                <span className="font-mono font-semibold text-purple-400">Continuous Stream</span>
              </div>
              <div className="flex justify-between items-center text-brand-muted">
                <span>Failover Tier:</span>
                <span className="font-mono font-semibold text-white">Secondary Cloud</span>
              </div>
            </div>
          </div>

          <div className="pt-2.5 border-t border-white/5 text-[11px]">
            <div className="flex justify-between items-center text-brand-muted">
              <span>Write Status:</span>
              <span className="font-mono font-bold text-purple-400">
                {supabaseBackupActive ? '● REPLICATING WRITES' : 'OFFLINE'}
              </span>
            </div>
          </div>
        </div>

        {/* Node 4: Google Cloud Firestore */}
        <div className={`glass-card rounded-2xl p-5 border flex flex-col justify-between transition-all ${
          firestoreActive ? 'border-orange-500/20 hover:border-orange-500/40 bg-[#111625]/70' : 'border-red-500/30 bg-red-500/5'
        }`}>
          <div>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className={`p-2.5 rounded-xl ${firestoreActive ? 'bg-orange-500/10 text-orange-400' : 'bg-red-500/10 text-red-400'}`}>
                  <Cloud className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-poppins font-bold text-white text-sm leading-tight">4. Cloud Firestore</h4>
                  <p className="text-[10px] text-brand-muted font-mono mt-0.5">Google Cloud NoSQL</p>
                </div>
              </div>
              {firestoreActive ? (
                <span className="flex items-center gap-1 text-[11px] font-bold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full border border-orange-500/20">
                  <Check className="w-3 h-3" /> ACTIVE
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                  <AlertTriangle className="w-3 h-3" /> QUOTA LIMIT
                </span>
              )}
            </div>

            <p className="text-xs text-brand-muted mb-3 font-sans line-clamp-2">
              {status?.firestore?.role || 'Tertiary durable cloud document fallback tier.'}
            </p>

            <div className="inline-flex items-center gap-1 text-[11px] font-mono text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded mb-3">
              <ShieldCheck className="w-3 h-3" /> Circuit Breaker Guarded
            </div>

            {/* Error Display if Failed */}
            {status?.firestore?.error && (
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-300 mb-3">
                <p className="font-bold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Circuit Breaker Active:</p>
                <p className="font-mono text-[11px] mt-0.5 break-words">{status.firestore.error}</p>
              </div>
            )}

            {/* Data Metrics */}
            <div className="space-y-1.5 py-2.5 border-t border-white/5 text-xs">
              <div className="flex justify-between items-center text-brand-muted">
                <span>Collections:</span>
                <span className="font-mono font-semibold text-white">9 Synced Collections</span>
              </div>
              <div className="flex justify-between items-center text-brand-muted">
                <span>Cloud Provider:</span>
                <span className="font-semibold text-white">GCP Firestore</span>
              </div>
              <div className="flex justify-between items-center text-brand-muted">
                <span>Region:</span>
                <span className="font-mono font-semibold text-white">europe-west2</span>
              </div>
              <div className="flex justify-between items-center text-brand-muted">
                <span>Failover Tier:</span>
                <span className="font-mono font-semibold text-orange-400">Tertiary Emergency</span>
              </div>
            </div>
          </div>

          <div className="pt-2.5 border-t border-white/5 text-[11px]">
            <div className="flex justify-between items-center text-brand-muted">
              <span>Write Status:</span>
              <span className="font-mono font-bold text-orange-400">
                {firestoreActive ? '● EVENT REPLICATION' : 'CIRCUIT SUSPENDED'}
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Sync Queue Management & Diagnostics */}
      <div className="glass-card rounded-2xl border border-white/10 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h4 className="font-poppins font-bold text-white text-base flex items-center gap-2">
              <Layers className="w-5 h-5 text-brand-primary" />
              Replication Queue & Durable Outbox Engine
            </h4>
            <p className="text-xs text-brand-muted mt-0.5">
              Guarantees cross-database eventual consistency even during transient network or provider interruptions.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-brand-muted bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
              Pending Operations: <strong className="text-white font-bold">{status?.syncQueue?.pendingOperations || 0}</strong>
            </span>
            <button
              onClick={handleTriggerSync}
              disabled={syncing}
              className="flex items-center gap-2 bg-brand-primary/20 hover:bg-brand-primary/30 text-brand-primary text-xs font-bold px-4 py-2 rounded-xl border border-brand-primary/30 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Processing Queue...' : 'Force Run Sync Queue'}
            </button>
          </div>
        </div>
      </div>

      {/* Architecture Detail Card */}
      <div className="glass-card rounded-2xl border border-white/5 p-6 space-y-4">
        <h4 className="font-poppins font-bold text-white text-sm flex items-center gap-2">
          <Zap className="w-4 h-4 text-brand-primary" /> 4-Database Failover Rules & Safeguards
        </h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs text-brand-muted">
          <div className="p-4 bg-white/5 rounded-xl border border-white/5 space-y-1.5">
            <p className="font-semibold text-white flex items-center gap-1.5">
              <ArrowRight className="w-3.5 h-3.5 text-emerald-400" /> Tier 1: Local PGLite
            </p>
            <p>
              In-memory WebAssembly engine holding full 10,033+ movies & series and all 18 homepage caches. Gives instant <strong className="text-white">0ms query latency</strong> without exhausting any external cloud database quotas.
            </p>
          </div>

          <div className="p-4 bg-white/5 rounded-xl border border-white/5 space-y-1.5">
            <p className="font-semibold text-white flex items-center gap-1.5">
              <ArrowRight className="w-3.5 h-3.5 text-blue-400" /> Tier 2: Primary Supabase
            </p>
            <p>
              Hosted in AWS Frankfurt (<strong className="text-white">eu-central-1</strong>). Acts as the primary cloud truth and supplies data on container boots. Receives all synchronous writes.
            </p>
          </div>

          <div className="p-4 bg-white/5 rounded-xl border border-white/5 space-y-1.5">
            <p className="font-semibold text-white flex items-center gap-1.5">
              <ArrowRight className="w-3.5 h-3.5 text-purple-400" /> Tier 3: Backup Supabase
            </p>
            <p>
              Hosted in AWS London (<strong className="text-white">eu-west-2</strong>). Acts as the hot disaster recovery standby. Continuously receives replicated multi-writes from all admin actions and user events.
            </p>
          </div>

          <div className="p-4 bg-white/5 rounded-xl border border-white/5 space-y-1.5">
            <p className="font-semibold text-white flex items-center gap-1.5">
              <ArrowRight className="w-3.5 h-3.5 text-orange-400" /> Tier 4: Cloud Firestore
            </p>
            <p>
              Tertiary durable document backup on Google Cloud Platform with built-in circuit breaker to prevent quota overages while maintaining emergency data persistence.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
