import React, { useState, useEffect, useCallback } from 'react';
import { Users, Search, Download, Shield, ShieldAlert, Lock, Unlock, LogOut, Check, Trash2, X, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { adminApi } from '../../services/adminApi';
import { useAuth } from '../../context/AuthContext';
import { formatLastSeen, sameText } from '../../lib/lastSeen';

const Dot = ({ online }) => (
  <span role="img" aria-label={online ? 'Online now' : 'Offline'} data-testid={online ? 'online-dot' : 'offline-dot'}
    className={`inline-block w-2.5 h-2.5 rounded-full ${online ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-zinc-600'}`} />
);
const Badge = ({ children, tone = 'zinc' }) => {
  const tones = { zinc: 'bg-zinc-800 text-zinc-300', green: 'bg-emerald-500/15 text-emerald-400', rose: 'bg-rose-500/15 text-rose-400', brand: 'bg-brand-500/15 text-brand-300' };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${tones[tone]}`}>{children}</span>;
};
const Btn = ({ onClick, disabled, tone = 'zinc', children, testId }) => {
  const tones = { zinc: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200', rose: 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25', green: 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25' };
  return <button type="button" onClick={onClick} disabled={disabled} data-testid={testId} className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition-colors disabled:opacity-50 ${tones[tone]}`}>{children}</button>;
};

const AdminUsers = () => {
  const { user: currentAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [roleModal, setRoleModal] = useState(null);     // { user, role }
  const [removeModal, setRemoveModal] = useState(null); // user
  const [typed, setTyped] = useState('');
  const [modalError, setModalError] = useState('');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminApi.getUsers({ page, limit: 15, search: search.trim() || undefined, role: roleFilter, status: statusFilter, online: onlineOnly ? 1 : undefined });
      setUsers(res.users || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter, statusFilter, onlineOnly]);

  useEffect(() => { fetchUsers(); }, [page, roleFilter, statusFilter, onlineOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  // "Online now" changes by itself: refresh the list every 30 seconds while the page is open
  useEffect(() => { const t = setInterval(fetchUsers, 30000); return () => clearInterval(t); }, [fetchUsers]);

  const act = async (fn, okMsg) => {
    try { setBusy(true); await fn(); showToast(okMsg); fetchUsers(); } catch (err) { showToast(err.response?.data?.message || 'Action failed'); } finally { setBusy(false); }
  };
  const toggleBlock = (u) => act(() => (u.isActive ? adminApi.blockUser(u.id) : adminApi.unblockUser(u.id)), u.isActive ? `${u.email} blocked` : `${u.email} unblocked`);
  const terminate = (u) => act(() => adminApi.forceLogoutUser(u.id), `${u.email} signed out everywhere`);

  const openModal = (setter, value) => { setTyped(''); setModalError(''); setter(value); };
  const submitRole = async (e) => {
    e.preventDefault();
    if (typed !== 'CONFIRM') { setModalError('Type CONFIRM (capitals) to continue'); return; }
    try { setBusy(true); await adminApi.changeUserRole(roleModal.user.id, { role: roleModal.role, confirm: 'CONFIRM' }); showToast(`Role changed to ${roleModal.role}`); setRoleModal(null); fetchUsers(); }
    catch (err) { setModalError(err.response?.data?.message || 'Failed to change role'); } finally { setBusy(false); }
  };
  const submitRemove = async (e) => {
    e.preventDefault();
    if (!sameText(typed, removeModal.email)) { setModalError("Type the person's email address exactly to continue"); return; }
    try { setBusy(true); await adminApi.deleteUser(removeModal.id, typed.trim()); showToast(`${removeModal.email} removed`); setRemoveModal(null); fetchUsers(); }
    catch (err) { setModalError(err.response?.data?.message || 'Failed to remove the account'); } finally { setBusy(false); }
  };

  const exportCsv = async () => {
    try {
      const blob = await adminApi.exportUsersCsv();
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `tamiltunes-users-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      showToast('Users exported to CSV');
    } catch { showToast('Export failed'); }
  };

  const Actions = ({ u }) => {
    const self = u.id === currentAdmin?.id;
    const isAdmin = u.role === 'admin';
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        {!self && <Btn onClick={() => toggleBlock(u)} disabled={busy} tone={u.isActive ? 'rose' : 'green'} testId="user-block">{u.isActive ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}{u.isActive ? 'Block' : 'Unblock'}</Btn>}
        {!self && <Btn onClick={() => terminate(u)} disabled={busy} testId="user-terminate"><LogOut className="w-3 h-3" />Terminate session</Btn>}
        {!self && <Btn onClick={() => openModal(setRoleModal, { user: u, role: isAdmin ? 'user' : 'admin' })} disabled={busy} testId="user-role">{isAdmin ? <ShieldAlert className="w-3 h-3" /> : <Shield className="w-3 h-3" />}{isAdmin ? 'Remove admin' : 'Make admin'}</Btn>}
        {!self && !isAdmin && <Btn onClick={() => openModal(setRemoveModal, u)} disabled={busy} tone="rose" testId="user-remove"><Trash2 className="w-3 h-3" />Remove account</Btn>}
        {self && <span className="text-[11px] text-zinc-500">This is you</span>}
      </div>
    );
  };
  const Who = ({ u }) => (
    <div className="min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <Dot online={u.online} />
        <span className="text-sm font-semibold text-white truncate">{u.name}</span>
        {u.role === 'admin' && <Badge tone="brand">Admin</Badge>}
        {!u.isActive && <Badge tone="rose">Blocked</Badge>}
        {u.signsInWithGoogle && <Badge>Google</Badge>}
      </div>
      <p className="text-xs text-zinc-400 truncate">{u.email}</p>
      <p className="text-[11px] text-zinc-500" data-testid="user-last-seen">{formatLastSeen(u.lastSeenAt, { online: u.online })}{u.lastLoginAt ? ` · signed in ${formatLastSeen(u.lastLoginAt)}` : ''}</p>
    </div>
  );

  const sel = 'px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 focus:outline-none focus:border-brand-500';
  return (
    <div className="space-y-6">
      {toast && (
        <div role="status" className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-zinc-900 border border-brand-500/50 text-white text-xs font-semibold shadow-2xl flex items-center gap-2">
          <Check className="w-4 h-4 text-brand-400" /><span>{toast}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Users Management</h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">{total} accounts • Who is online, sign out, block or remove an account</p>
        </div>
        <button onClick={exportCsv} className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-semibold flex items-center gap-2 self-start sm:self-auto transition-colors">
          <Download className="w-4 h-4" /><span>Export CSV</span>
        </button>
      </div>

      <div className="p-4 rounded-2xl bg-[#18181B] border border-zinc-800/80 flex flex-col md:flex-row items-center gap-3">
        <form onSubmit={(e) => { e.preventDefault(); setPage(1); fetchUsers(); }} className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email..." aria-label="Search users"
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs placeholder:text-zinc-500 focus:outline-none focus:border-brand-500" />
        </form>
        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
          <label className="inline-flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input type="checkbox" checked={onlineOnly} onChange={(e) => { setOnlineOnly(e.target.checked); setPage(1); }} data-testid="online-only" className="accent-emerald-400" />
            Online now
          </label>
          <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }} className={sel} aria-label="Role"><option value="all">All Roles</option><option value="user">User</option><option value="admin">Admin</option></select>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className={sel} aria-label="Status"><option value="all">All Statuses</option><option value="active">Active</option><option value="blocked">Blocked</option></select>
        </div>
      </div>

      {loading && users.length === 0 ? (
        <div className="space-y-3">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-16 bg-zinc-900/60 rounded-xl animate-pulse" />)}</div>
      ) : users.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-[#18181B] border border-zinc-800/80">
          <Users className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
          <p className="text-sm font-semibold text-zinc-300">No users found</p>
          <p className="text-xs text-zinc-500 mt-1">Try adjusting your search or filters.</p>
        </div>
      ) : (
        <>
          {/* phones: cards */}
          <div className="md:hidden space-y-3" data-testid="users-cards">
            {users.map((u) => (
              <div key={u.id} className="p-4 rounded-2xl bg-[#18181B] border border-zinc-800/80 space-y-3" data-testid="user-card">
                <Who u={u} />
                <div className="pt-2 border-t border-zinc-800/60"><Actions u={u} /></div>
              </div>
            ))}
          </div>
          {/* larger screens: table */}
          <div className="hidden md:block rounded-2xl bg-[#18181B] border border-zinc-800/80 overflow-hidden" data-testid="users-table">
            <table className="w-full text-left">
              <thead className="text-[11px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800/80"><tr><th className="px-4 py-3">Person</th><th className="px-4 py-3">Actions</th></tr></thead>
              <tbody className="divide-y divide-zinc-800/60">
                {users.map((u) => <tr key={u.id} data-testid="user-row"><td className="px-4 py-3"><Who u={u} /></td><td className="px-4 py-3"><Actions u={u} /></td></tr>)}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 text-xs text-zinc-400">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label="Previous page" className="p-2 rounded-lg bg-zinc-900 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
              <span>Page {page} of {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} aria-label="Next page" className="p-2 rounded-lg bg-zinc-900 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
            </div>
          )}
        </>
      )}

      {roleModal && (
        <div role="dialog" aria-modal="true" aria-label="Change role" data-testid="role-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <form onSubmit={submitRole} className="w-full max-w-sm rounded-2xl bg-[#18181B] border border-zinc-800 p-5 space-y-3">
            <div className="flex items-start justify-between"><h3 className="text-base font-bold text-white">{roleModal.role === 'admin' ? 'Make admin' : 'Remove admin'}: {roleModal.user.email}</h3><button type="button" onClick={() => setRoleModal(null)} aria-label="Close"><X className="w-4 h-4 text-zinc-400" /></button></div>
            {roleModal.role === 'admin' && <p className="text-xs text-zinc-400">Admins are chosen on the server (ADMIN_EMAILS). This only works for an email that is already on that list.</p>}
            <label className="block text-xs font-semibold text-zinc-300">Type CONFIRM to continue
              <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} data-testid="confirm-input" className="mt-1.5 w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-white text-sm focus:outline-none focus:border-brand-500" />
            </label>
            {modalError && <p role="alert" className="text-xs text-rose-400">{modalError}</p>}
            <div className="flex gap-2 justify-end"><button type="button" onClick={() => setRoleModal(null)} className="px-3 py-2 rounded-xl bg-zinc-800 text-zinc-200 text-xs font-semibold">Cancel</button><button type="submit" disabled={busy} className="px-3 py-2 rounded-xl bg-brand-500 text-black text-xs font-bold disabled:opacity-60">Confirm</button></div>
          </form>
        </div>
      )}

      {removeModal && (
        <div role="dialog" aria-modal="true" aria-label="Remove account" data-testid="remove-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <form onSubmit={submitRemove} className="w-full max-w-sm rounded-2xl bg-[#18181B] border border-rose-500/40 p-5 space-y-3">
            <div className="flex items-start justify-between"><h3 className="text-base font-bold text-white inline-flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-rose-400" />Remove this account?</h3><button type="button" onClick={() => setRemoveModal(null)} aria-label="Close"><X className="w-4 h-4 text-zinc-400" /></button></div>
            <p className="text-xs text-zinc-300">This permanently deletes <b>{removeModal.email}</b> and their playlists, likes, history and comments. It cannot be undone.</p>
            <label className="block text-xs font-semibold text-zinc-300">Type their email address to confirm
              <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} data-testid="remove-input" autoCapitalize="off" autoCorrect="off" spellCheck={false} className="mt-1.5 w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-white text-sm focus:outline-none focus:border-rose-400" />
            </label>
            {modalError && <p role="alert" className="text-xs text-rose-400">{modalError}</p>}
            <div className="flex gap-2 justify-end"><button type="button" onClick={() => setRemoveModal(null)} className="px-3 py-2 rounded-xl bg-zinc-800 text-zinc-200 text-xs font-semibold">Cancel</button><button type="submit" disabled={busy} data-testid="remove-confirm" className="px-3 py-2 rounded-xl bg-rose-500 text-white text-xs font-bold disabled:opacity-60">Remove account</button></div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;
