import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  UserPlus,
  PlayCircle,
  Music,
  ListMusic,
  ShieldCheck,
  TrendingUp,
  Activity,
  ArrowRight,
  AlertCircle
} from 'lucide-react';
import { adminApi } from '../../services/adminApi';

const StatCard = ({ title, value, subtext, icon: Icon, color = 'text-brand-400' }) => (
  <div className="p-5 rounded-2xl bg-[#18181B] border border-zinc-800/80 shadow-sm flex flex-col justify-between">
    <div className="flex items-center justify-between mb-3">
      <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{title}</span>
      <div className={`w-9 h-9 rounded-xl bg-zinc-800/80 flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
    </div>
    <div>
      <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">{value}</div>
      {subtext && <p className="text-xs text-zinc-400 mt-1">{subtext}</p>}
    </div>
  </div>
);

const AdminDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadStats = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await adminApi.getDashboard();
      setData(res);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-zinc-800 rounded-lg" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-zinc-800/50 rounded-2xl" />
          ))}
        </div>
        <div className="h-64 bg-zinc-800/40 rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
        <button
          onClick={loadStats}
          className="px-4 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-xs font-semibold text-white transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const chartData = data?.chartData || [];
  const maxVal = Math.max(...chartData.map((d) => d.signups), 1);

  return (
    <div className="space-y-8">
      {/* Top Banner & Quick Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">System Dashboard</h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
            Real-time platform metrics, user growth, and audit log events
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/admin/users"
            className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-black font-bold text-xs flex items-center gap-2 transition-transform active:scale-95"
          >
            <Users className="w-4 h-4" />
            <span>Manage Users</span>
          </Link>
          <Link
            to="/admin/settings"
            className="px-4 py-2 rounded-xl bg-[#18181B] hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <span>Settings</span>
          </Link>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Users"
          value={data?.totalUsers?.toLocaleString() || '0'}
          subtext={`+${data?.signups7d || 0} in last 7 days`}
          icon={Users}
          color="text-emerald-400"
        />
        <StatCard
          title="Active Users"
          value={data?.activeUsers?.toLocaleString() || '0'}
          subtext="Healthy account status"
          icon={Activity}
          color="text-blue-400"
        />
        <StatCard
          title="Total Plays"
          value={data?.totalPlays?.toLocaleString() || '0'}
          subtext="Track listening activity"
          icon={PlayCircle}
          color="text-purple-400"
        />
        <StatCard
          title="Database Songs"
          value={data?.totalSongs?.toLocaleString() || '0'}
          subtext={`${data?.totalPlaylists || 0} user playlists`}
          icon={Music}
          color="text-amber-400"
        />
      </div>

      {/* Signups Chart & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 7-Day Signups Chart */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-[#18181B] border border-zinc-800/80">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-brand-400" />
                <span>Signups (Past 7 Days)</span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">Total: {data?.signups7d || 0} registrations</p>
            </div>
          </div>

          {/* Simple Clean Responsive Bar Chart */}
          <div className="h-44 flex items-end gap-3 pt-4 border-b border-zinc-800/60 pb-2">
            {chartData.map((d, idx) => {
              const heightPct = Math.max(12, Math.round((d.signups / maxVal) * 100));
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                  <span className="text-[10px] text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    {d.signups}
                  </span>
                  <div
                    style={{ height: `${heightPct}%` }}
                    className="w-full max-w-[40px] rounded-t-lg bg-gradient-to-t from-brand-600 to-brand-400 group-hover:brightness-110 transition-all shadow-sm"
                  />
                  <span className="text-[11px] font-medium text-zinc-400 truncate max-w-[48px]">
                    {d.date.split(',')[0]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Admin Audit Logs */}
        <div className="p-6 rounded-2xl bg-[#18181B] border border-zinc-800/80 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-brand-400" />
              <span>Audit Log</span>
            </h2>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto max-h-72 pr-1">
            {data?.recentLogs && data.recentLogs.length > 0 ? (
              data.recentLogs.map((log) => (
                <div key={log.id} className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/40 text-xs">
                  <div className="flex items-center justify-between text-zinc-300 font-semibold mb-0.5">
                    <span className="text-brand-400 font-mono text-[11px]">{log.action}</span>
                    <span className="text-[10px] text-zinc-500">
                      {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 truncate">
                    {log.actorEmail || 'System'} {log.targetType ? `→ ${log.targetType}` : ''}
                  </p>
                </div>
              ))
            ) : (
              <div className="text-xs text-zinc-500 py-8 text-center">No recent audit log activity</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
