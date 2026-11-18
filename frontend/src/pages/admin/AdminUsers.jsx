import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Download,
  Shield,
  ShieldAlert,
  Lock,
  Unlock,
  KeyRound,
  LogOut,
  Check,
  Copy,
  AlertTriangle,
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { adminApi } from '../../services/adminApi';
import { useAuth } from '../../context/AuthContext';

const AdminUsers = () => {
  const { user: currentAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Password confirmation modal for role change
  const [roleModalUser, setRoleModalUser] = useState(null);
  const [targetRole, setTargetRole] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [roleModalError, setRoleModalError] = useState('');

  // Reset link modal
  const [resetModalUrl, setResetModalUrl] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await adminApi.getUsers({
        page,
        limit: 15,
        search: search.trim() || undefined,
        role: roleFilter,
        status: statusFilter
      });
      setUsers(res.users || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, roleFilter, statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchUsers();
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  // Block / Unblock
  const handleToggleBlock = async (u) => {
    try {
      setActionLoading(true);
      if (u.isActive) {
        await adminApi.blockUser(u.id);
        showToast(`User ${u.email} blocked`);
      } else {
        await adminApi.unblockUser(u.id);
        showToast(`User ${u.email} unblocked`);
      }
      fetchUsers();
    } catch (err) {
      showToast(err.response?.data?.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Force Logout
  const handleForceLogout = async (u) => {
    try {
      setActionLoading(true);
      await adminApi.forceLogoutUser(u.id);
      showToast(`Logged out ${u.email}`);
    } catch (err) {
      showToast(err.response?.data?.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Generate Reset Link
  const handleGenerateReset = async (u) => {
    try {
      setActionLoading(true);
      const res = await adminApi.generateResetLink(u.id);
      setResetModalUrl(res.resetUrl);
      setCopiedLink(false);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to generate reset link');
    } finally {
      setActionLoading(false);
    }
  };

  // Submit Role Change
  const submitRoleChange = async (e) => {
    e.preventDefault();
    if (!adminPassword) {
      setRoleModalError('Enter your password to confirm');
      return;
    }
    try {
      setActionLoading(true);
      setRoleModalError('');
      await adminApi.changeUserRole(roleModalUser.id, {
        role: targetRole,
        password: adminPassword
      });
      showToast(`User role changed to ${targetRole}`);
      setRoleModalUser(null);
      setAdminPassword('');
      fetchUsers();
    } catch (err) {
      setRoleModalError(err.response?.data?.message || 'Failed to change role');
    } finally {
      setActionLoading(false);
    }
  };

  // Export CSV
  const handleExportCsv = async () => {
    try {
      const blob = await adminApi.exportUsersCsv();
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `tamiltunes-users-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast('Users exported to CSV');
    } catch (err) {
      showToast('Export failed');
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-zinc-900 border border-brand-500/50 text-white text-xs font-semibold shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-3">
          <Check className="w-4 h-4 text-brand-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Users Management</h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
            {total} registered accounts • Roles, blocklist, sessions, and recovery
          </p>
        </div>

        <button
          onClick={handleExportCsv}
          className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-semibold flex items-center gap-2 self-start sm:self-auto transition-colors"
        >
          <Download className="w-4 h-4" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-[#18181B] border border-zinc-800/80 flex flex-col md:flex-row items-center gap-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs placeholder:text-zinc-500 focus:outline-none focus:border-brand-500"
          />
        </form>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 focus:outline-none focus:border-brand-500"
          >
            <option value="all">All Roles</option>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 focus:outline-none focus:border-brand-500"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>
      </div>

      {/* Users List: Mobile Cards / Desktop Table */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 bg-zinc-900/60 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-[#18181B] border border-zinc-800/80">
          <Users className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
          <p className="text-sm font-semibold text-zinc-300">No users found</p>
          <p className="text-xs text-zinc-500 mt-1">Try adjusting your search or filters.</p>
        </div>
      ) : (
        <>
          {/* Mobile View: Card List (<768px) */}
          <div className="md:hidden space-y-3">
            {users.map((u) => {
              const isSelf = u.id === currentAdmin?.id;
              return (
                <div
                  key={u.id}
                  className="p-4 rounded-2xl bg-[#18181B] border border-zinc-800/80 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-brand-600 to-brand-400 text-black font-extrabold text-xs flex items-center justify-center">
                        {(u.name || u.email)[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          <span>{u.name}</span>
                          {isSelf && (
                            <span className="text-[10px] text-zinc-500 font-normal">(You)</span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-400">{u.email}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          u.role === 'admin'
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {u.role}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          u.isActive
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {u.isActive ? 'Active' : 'Blocked'}
                      </span>
                    </div>
                  </div>

                  {/* Actions for Mobile */}
                  <div className="pt-2 border-t border-zinc-800/60 flex items-center gap-2 flex-wrap">
                    {!isSelf && (
                      <button
                        onClick={() => handleToggleBlock(u)}
                        disabled={actionLoading}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors ${
                          u.isActive
                            ? 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25'
                            : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                        }`}
                      >
                        {u.isActive ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                        <span>{u.isActive ? 'Block' : 'Unblock'}</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleGenerateReset(u)}
                      disabled={actionLoading}
                      className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold flex items-center gap-1"
                    >
                      <KeyRound className="w-3 h-3" />
                      <span>Reset Link</span>
                    </button>

                    <button
                      onClick={() => handleForceLogout(u)}
                      disabled={actionLoading}
                      className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold flex items-center gap-1"
                    >
                      <LogOut className="w-3 h-3" />
                      <span>Logout</span>
                    </button>

                    {!isSelf && (
                      <button
                        onClick={() => {
                          setRoleModalUser(u);
                          setTargetRole(u.role === 'admin' ? 'user' : 'admin');
                          setAdminPassword('');
                          setRoleModalError('');
                        }}
                        disabled={actionLoading}
                        className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-semibold flex items-center gap-1"
                      >
                        <Shield className="w-3 h-3 text-brand-400" />
                        <span>{u.role === 'admin' ? 'Demote' : 'Make Admin'}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table (>=768px) */}
          <div className="hidden md:block rounded-2xl bg-[#18181B] border border-zinc-800/80 overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900/60 border-b border-zinc-800/80 text-zinc-400 uppercase font-semibold text-[11px]">
                <tr>
                  <th className="px-5 py-3.5">User</th>
                  <th className="px-4 py-3.5">Role</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">2FA</th>
                  <th className="px-4 py-3.5">Created</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {users.map((u) => {
                  const isSelf = u.id === currentAdmin?.id;
                  return (
                    <tr key={u.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-brand-600 to-brand-400 text-black font-extrabold text-xs flex items-center justify-center">
                            {(u.name || u.email)[0].toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-white flex items-center gap-1.5">
                              <span>{u.name}</span>
                              {isSelf && (
                                <span className="text-[10px] text-zinc-500 font-normal">(You)</span>
                              )}
                            </div>
                            <div className="text-[11px] text-zinc-400">{u.email}</div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            u.role === 'admin'
                              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            u.isActive
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {u.isActive ? 'Active' : 'Blocked'}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="text-zinc-400 font-mono text-[11px]">
                          {u.twoFactorEnabled ? 'Enabled' : 'Off'}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 text-zinc-400 text-[11px]">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>

                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleGenerateReset(u)}
                            title="Generate password reset link"
                            className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleForceLogout(u)}
                            title="Force logout"
                            className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                          </button>

                          {!isSelf && (
                            <>
                              <button
                                onClick={() => handleToggleBlock(u)}
                                title={u.isActive ? 'Block user' : 'Unblock user'}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  u.isActive
                                    ? 'bg-rose-500/10 hover:bg-rose-500/25 text-rose-400'
                                    : 'bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-400'
                                }`}
                              >
                                {u.isActive ? (
                                  <Lock className="w-3.5 h-3.5" />
                                ) : (
                                  <Unlock className="w-3.5 h-3.5" />
                                )}
                              </button>

                              <button
                                onClick={() => {
                                  setRoleModalUser(u);
                                  setTargetRole(u.role === 'admin' ? 'user' : 'admin');
                                  setAdminPassword('');
                                  setRoleModalError('');
                                }}
                                title={u.role === 'admin' ? 'Demote to User' : 'Promote to Admin'}
                                className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-brand-400 hover:text-brand-300 transition-colors"
                              >
                                <Shield className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-xs text-zinc-400 pt-2">
            <span>
              Page {page} of {totalPages} ({total} users)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Role Confirmation Modal */}
      {roleModalUser && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#18181B] border border-zinc-800 p-6 shadow-2xl relative">
            <button
              onClick={() => setRoleModalUser(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Confirm Role Change</h3>
                <p className="text-xs text-zinc-400">{roleModalUser.email}</p>
              </div>
            </div>

            <p className="text-xs text-zinc-300 mb-4">
              You are changing this user&apos;s role from{' '}
              <span className="font-bold uppercase text-white">{roleModalUser.role}</span> to{' '}
              <span className="font-bold uppercase text-brand-400">{targetRole}</span>.
              Re-enter your admin password to proceed:
            </p>

            <form onSubmit={submitRoleChange} className="space-y-4">
              <div>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Your admin password"
                  autoFocus
                  className="w-full px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs focus:outline-none focus:border-brand-500"
                />
                {roleModalError && (
                  <p className="text-[11px] text-rose-400 mt-1.5">{roleModalError}</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRoleModalUser(null)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-black text-xs font-bold transition-transform active:scale-95"
                >
                  {actionLoading ? 'Verifying...' : 'Confirm Change'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Link Modal */}
      {resetModalUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#18181B] border border-zinc-800 p-6 shadow-2xl relative">
            <button
              onClick={() => setResetModalUrl('')}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-white mb-2">Password Reset Link</h3>
            <p className="text-xs text-zinc-400 mb-4">
              This single-use link expires in 1 hour. Copy and share it securely with the user:
            </p>

            <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono text-xs break-all mb-4 select-all">
              {resetModalUrl}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(resetModalUrl);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
                className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-black text-xs font-bold flex items-center gap-1.5 transition-transform active:scale-95"
              >
                {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;
