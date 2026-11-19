import React, { useState, useEffect } from 'react';
import { Settings, Shield, AlertTriangle, Megaphone, Check, Save } from 'lucide-react';
import { adminApi } from '../../services/adminApi';

const AdminSettings = () => {
  const [requireLogin, setRequireLogin] = useState(true);
  const [maintenanceActive, setMaintenanceActive] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [announcementActive, setAnnouncementActive] = useState(false);
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const loadSettings = async () => {
    try {
      setLoading(true);
      const res = await adminApi.getSettings();
      setRequireLogin(res.requireLogin !== false);
      setMaintenanceActive(Boolean(res.maintenanceBanner?.active));
      setMaintenanceMessage(res.maintenanceBanner?.message || '');
      setAnnouncementActive(Boolean(res.announcementText?.active));
      setAnnouncementMessage(res.announcementText?.message || '');
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await adminApi.updateSettings({
        requireLogin,
        maintenanceBanner: { active: maintenanceActive, message: maintenanceMessage },
        announcementText: { active: announcementActive, message: announcementMessage }
      });
      // Synchronize client local state as well
      localStorage.setItem('tamiltunes_require_login', String(requireLogin));
      showToast('Settings saved successfully');
    } catch (err) {
      showToast('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-zinc-500 animate-pulse">Loading settings...</div>;
  }

  return (
    <div className="space-y-6">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-zinc-900 border border-brand-500/50 text-white text-xs font-semibold shadow-2xl flex items-center gap-2">
          <Check className="w-4 h-4 text-brand-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">System Settings</h1>
        <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
          Access gate control, maintenance alerts, and system-wide announcements
        </p>
      </div>

      {/* Login Gate Setting */}
      <div className="p-6 rounded-2xl bg-[#18181B] border border-zinc-800/80 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 flex-shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Require Login (Login-First Gate)</h3>
              <p className="text-xs text-zinc-400 mt-0.5 max-w-xl leading-relaxed">
                When enabled (default), all visitors must log in to listen, browse home, search, or view playlists.
                When disabled, guest browsing and playback are permitted.
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
            <input
              type="checkbox"
              checked={requireLogin}
              onChange={(e) => setRequireLogin(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500"></div>
          </label>
        </div>
      </div>

      {/* Maintenance Banner */}
      <div className="p-6 rounded-2xl bg-[#18181B] border border-zinc-800/80 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Maintenance Banner</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Display an alert bar at the top of the application for scheduled downtime
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
            <input
              type="checkbox"
              checked={maintenanceActive}
              onChange={(e) => setMaintenanceActive(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
          </label>
        </div>

        {maintenanceActive && (
          <input
            type="text"
            value={maintenanceMessage}
            onChange={(e) => setMaintenanceMessage(e.target.value)}
            placeholder="e.g. Scheduled database maintenance on Sunday 2:00 AM IST"
            className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs"
          />
        )}
      </div>

      {/* Announcement Banner */}
      <div className="p-6 rounded-2xl bg-[#18181B] border border-zinc-800/80 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 flex-shrink-0">
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Announcement Message</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Broadcast new features, release notices, or song additions
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
            <input
              type="checkbox"
              checked={announcementActive}
              onChange={(e) => setAnnouncementActive(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
          </label>
        </div>

        {announcementActive && (
          <input
            type="text"
            value={announcementMessage}
            onChange={(e) => setAnnouncementMessage(e.target.value)}
            placeholder="e.g. New Harris Jayaraj remastered tracks added!"
            className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs"
          />
        )}
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-black text-xs font-bold flex items-center gap-2 transition-transform active:scale-95"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Saving...' : 'Save Settings'}</span>
        </button>
      </div>
    </div>
  );
};

export default AdminSettings;
