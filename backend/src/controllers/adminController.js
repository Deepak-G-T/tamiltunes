import crypto from 'crypto';
import { db } from '../prisma/client.js';
import { config, isAdminEmail } from '../config/env.js';
import { verifyPassword } from '../services/auth/credentials.js';
import { recordAuditLog } from '../middleware/requireAdmin.js';
import { getStore } from '../community/store/index.js';
import {
  generateTotpSecret,
  verifyTotpToken,
  generateRecoveryCodes,
  hashRecoveryCode,
  buildOtpAuthUri
} from '../services/auth/totp.js';

// Safe user presentation (never leak passwords, hashes, recovery codes, or secrets)
/** "Online now": any request in the last 5 minutes. */
export const ONLINE_WINDOW_MS = 5 * 60 * 1000;
export const isOnline = (lastSeenAt, now = Date.now()) => Boolean(lastSeenAt) && now - new Date(lastSeenAt).getTime() <= ONLINE_WINDOW_MS;

export const presentAdminUser = (u) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  username: u.username || null,
  role: u.role || 'user',
  isActive: u.isActive !== false,
  failedLoginAttempts: u.failedLoginAttempts || 0,
  twoFactorEnabled: Boolean(u.twoFactorEnabled),
  signsInWithGoogle: Boolean(u.googleSub),
  lastSeenAt: u.lastSeenAt || null,
  lastLoginAt: u.lastLoginAt || null,
  online: isOnline(u.lastSeenAt),
  createdAt: u.createdAt,
  updatedAt: u.updatedAt
});

// Critical admin actions ask for a second confirmation. A Google-only admin has no password, so they type CONFIRM (the admin is already signed in
// with Google and on the ADMIN_EMAILS list). An account that still has a password (development, tests) confirms with it as before.
async function assertAdminConfirmation(admin, body) {
  if (admin.password && config.passwordAuth) return assertAdminPassword(admin, body?.password);
  if (body?.confirm !== 'CONFIRM') throw new Error('Type CONFIRM to continue');
}

// Helper to verify admin's password before critical operations
async function assertAdminPassword(admin, password) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password confirmation is required');
  }
  const valid = await verifyPassword(password, admin.password);
  if (!valid) {
    throw new Error('Invalid password confirmation');
  }
}

// 1. DASHBOARD
export const getDashboardStats = async (req, res, next) => {
  try {
    const now = new Date();
    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [totalUsers, signups7d, signups30d, totalSongs, totalPlaylists] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { createdAt: { gte: d7 } } }).catch(() => 0),
      db.user.count({ where: { createdAt: { gte: d30 } } }).catch(() => 0),
      db.song.count().catch(() => 0),
      db.playlist.count().catch(() => 0)
    ]);

    // Online now: any request in the last 5 minutes
    const onlineNow = await db.user.count({ where: { lastSeenAt: { gte: new Date(now.getTime() - ONLINE_WINDOW_MS) } } }).catch(() => 0);

    // Active users: users with isActive: true
    const activeUsers = await db.user.count({ where: { isActive: true } }).catch(() => totalUsers);

    // Total plays
    let totalPlays = 0;
    try {
      totalPlays = (await db.listeningHistory.count()) + (await db.playEvent.count());
    } catch {
      totalPlays = 0;
    }

    // Recent audit logs
    const recentLogs = await db.auditLog.findMany({
      take: 8,
      orderBy: { createdAt: 'desc' }
    }).catch(() => []);

    // 7-day signups breakdown
    const chartData = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 0, 0, 0);
      const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 23, 59, 59);
      const label = dayStart.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
      chartData.push({
        date: label,
        signups: Math.max(0, Math.floor(signups7d / 7)) // graceful approximation when granular grouping isn't DB-indexed
      });
    }

    res.json({
      totalUsers,
      signups7d,
      signups30d,
      activeUsers,
      onlineNow,
      totalSongs,
      totalPlaylists,
      totalPlays,
      chartData,
      recentLogs
    });
  } catch (err) {
    next(err);
  }
};

// 2. USERS LIST & PAGINATION
export const listUsers = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const search = req.query.search ? String(req.query.search).trim() : '';
    const roleFilter = req.query.role && req.query.role !== 'all' ? req.query.role : undefined;
    const statusFilter = req.query.status && req.query.status !== 'all' ? req.query.status : undefined;

    const where = {};
    if (roleFilter) where.role = roleFilter;
    if (statusFilter === 'active') where.isActive = true;
    if (statusFilter === 'blocked') where.isActive = false;
    const onlineOnly = req.query.online === '1' || req.query.online === 'true';
    if (onlineOnly) where.lastSeenAt = { gte: new Date(Date.now() - ONLINE_WINDOW_MS) };

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        take: limit,
        skip,
        orderBy: onlineOnly ? { lastSeenAt: 'desc' } : { createdAt: 'desc' }
      }),
      db.user.count({ where })
    ]);

    res.json({
      users: users.map(presentAdminUser),
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    next(err);
  }
};

// 3. EXPORT USERS (CSV)
export const exportUsersCsv = async (req, res, next) => {
  try {
    const users = await db.user.findMany({
      orderBy: { createdAt: 'desc' }
    });

    const escapeCsv = (val) => {
      const str = String(val ?? '');
      return `"${str.replace(/"/g, '""')}"`;
    };

    const headers = ['ID', 'Email', 'Name', 'Username', 'Role', 'Status', '2FA Enabled', 'Created At'];
    const rows = users.map((u) => [
      escapeCsv(u.id),
      escapeCsv(u.email),
      escapeCsv(u.name),
      escapeCsv(u.username || ''),
      escapeCsv(u.role || 'user'),
      escapeCsv(u.isActive !== false ? 'Active' : 'Blocked'),
      escapeCsv(u.twoFactorEnabled ? 'Yes' : 'No'),
      escapeCsv(u.createdAt ? new Date(u.createdAt).toISOString() : '')
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');

    await recordAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'USERS_EXPORT_CSV',
      details: { count: users.length },
      ip: req.ip
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="tamiltunes-users.csv"');
    res.send(csvContent);
  } catch (err) {
    next(err);
  }
};

// 4. BLOCK USER
export const blockUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (id === req.user.id) {
      return res.status(400).json({ message: 'You cannot block your own admin account' });
    }

    const target = await db.user.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ message: 'User not found' });

    await db.user.update({
      where: { id },
      data: { isActive: false }
    });

    await recordAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'USER_BLOCK',
      targetType: 'User',
      targetId: id,
      details: { targetEmail: target.email },
      ip: req.ip
    });

    res.json({ message: `User ${target.email} has been blocked`, ok: true });
  } catch (err) {
    next(err);
  }
};

// REMOVE ACCOUNT: deletes the person and everything of theirs (playlists, likes, history, comments ...). Typed email confirmation; never yourself or an admin.
export const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (id === req.user.id) return res.status(400).json({ message: 'You cannot remove your own admin account' });
    const target = await db.user.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ message: 'User not found' });
    if (target.role === 'admin') return res.status(400).json({ message: 'An admin account cannot be removed here (remove the admin role on the server first)' });
    if (String(req.body?.confirmEmail || '').trim().toLowerCase() !== String(target.email).toLowerCase()) {
      return res.status(400).json({ message: "Type the person's email address to confirm" });
    }

    await recordAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'USER_DELETE',
      targetType: 'User',
      targetId: id,
      details: { targetEmail: target.email, targetName: target.name },
      ip: req.ip
    });
    await getStore().deleteUser(id); // foreign keys cascade
    res.json({ message: `Account ${target.email} has been removed`, ok: true });
  } catch (err) {
    next(err);
  }
};

// 5. UNBLOCK USER
export const unblockUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const target = await db.user.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ message: 'User not found' });

    await db.user.update({
      where: { id },
      data: {
        isActive: true,
        failedLoginAttempts: 0,
        lockedUntil: null
      }
    });

    await recordAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'USER_UNBLOCK',
      targetType: 'User',
      targetId: id,
      details: { targetEmail: target.email },
      ip: req.ip
    });

    res.json({ message: `User ${target.email} has been unblocked`, ok: true });
  } catch (err) {
    next(err);
  }
};

// 6. FORCE LOGOUT
export const forceLogoutUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const target = await db.user.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ message: 'User not found' });

    await db.user.update({
      where: { id },
      data: { passwordChangedAt: new Date() }
    });

    await recordAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'USER_FORCE_LOGOUT',
      targetType: 'User',
      targetId: id,
      details: { targetEmail: target.email },
      ip: req.ip
    });

    res.json({ message: `User ${target.email} sessions invalidated`, ok: true });
  } catch (err) {
    next(err);
  }
};

// 7. GENERATE PASSWORD RESET LINK
export const generateResetLink = async (req, res, next) => {
  try {
    const { id } = req.params;
    const target = await db.user.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ message: 'User not found' });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // If db supports passwordResetToken
    if (db.passwordResetToken?.create) {
      await db.passwordResetToken.create({
        data: {
          userId: id,
          tokenHash,
          expiresAt
        }
      });
    }

    const frontendBase = config.frontendUrl || 'https://in-five-11.vercel.app';
    const resetUrl = `${frontendBase}/reset-password?token=${rawToken}&email=${encodeURIComponent(target.email)}`;

    await recordAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'USER_RESET_LINK_GENERATED',
      targetType: 'User',
      targetId: id,
      details: { targetEmail: target.email },
      ip: req.ip
    });

    res.json({ resetUrl, expiresAt });
  } catch (err) {
    next(err);
  }
};

// 8. CHANGE USER ROLE (Requires admin password confirmation)
export const changeUserRole = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body || {};

    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role. Must be user or admin' });
    }

    if (id === req.user.id && role !== 'admin') {
      return res.status(400).json({ message: 'You cannot remove your own admin privileges' });
    }

    try {
      await assertAdminConfirmation(req.user, req.body);
    } catch (err) {
      return res.status(401).json({ message: err.message });
    }

    const target = await db.user.findUnique({ where: { id } });
    if (!target) return res.status(404).json({ message: 'User not found' });
    if (role === 'admin' && config.adminEmailsEnforced && !isAdminEmail(target.email)) {
      return res.status(400).json({ message: 'Add this email to ADMIN_EMAILS on the server first: admins are chosen there, not in the app' });
    }

    const oldRole = target.role || 'user';
    await db.user.update({
      where: { id },
      data: { role }
    });

    await recordAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'USER_ROLE_CHANGE',
      targetType: 'User',
      targetId: id,
      details: { targetEmail: target.email, oldRole, newRole: role },
      ip: req.ip
    });

    res.json({ message: `Role for ${target.email} changed to ${role}`, role, ok: true });
  } catch (err) {
    next(err);
  }
};

// 9. SONGS LIST
export const listSongs = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const search = req.query.search ? String(req.query.search).trim() : '';
    const status = req.query.status || 'all';

    const where = {};
    if (status === 'visible') {
      where.isHidden = false;
      where.deletedAt = null;
    } else if (status === 'hidden') {
      where.isHidden = true;
      where.deletedAt = null;
    } else if (status === 'deleted') {
      where.deletedAt = { not: null };
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { artist: { contains: search, mode: 'insensitive' } },
        { movie: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [songs, total] = await Promise.all([
      db.song.findMany({
        where,
        take: limit,
        skip,
        orderBy: { createdAt: 'desc' }
      }),
      db.song.count({ where })
    ]);

    res.json({
      songs,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    next(err);
  }
};

// 10. UPDATE SONG METADATA
export const updateSongMetadata = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, artist, album, movie, year, language, image, streamUrl } = req.body || {};

    const song = await db.song.findUnique({ where: { id } });
    if (!song) return res.status(404).json({ message: 'Song not found' });

    const updateData = {};
    if (title !== undefined) updateData.title = String(title).trim();
    if (artist !== undefined) updateData.artist = String(artist).trim();
    if (album !== undefined) updateData.album = album ? String(album).trim() : null;
    if (movie !== undefined) updateData.movie = movie ? String(movie).trim() : null;
    if (year !== undefined) updateData.year = year ? parseInt(year, 10) : null;
    if (language !== undefined) updateData.language = language ? String(language).trim() : null;
    if (image !== undefined) updateData.image = image ? String(image).trim() : null;
    if (streamUrl !== undefined) updateData.streamUrl = streamUrl ? String(streamUrl).trim() : null;

    const updated = await db.song.update({
      where: { id },
      data: updateData
    });

    await recordAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'SONG_METADATA_UPDATE',
      targetType: 'Song',
      targetId: id,
      details: { changes: updateData },
      ip: req.ip
    });

    res.json({ song: updated, ok: true });
  } catch (err) {
    next(err);
  }
};

// 11. HIDE / UNHIDE SONG
export const toggleHideSong = async (req, res, next) => {
  try {
    const { id } = req.params;
    const song = await db.song.findUnique({ where: { id } });
    if (!song) return res.status(404).json({ message: 'Song not found' });

    const nextHidden = !song.isHidden;
    const updated = await db.song.update({
      where: { id },
      data: { isHidden: nextHidden }
    });

    await recordAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'SONG_VISIBILITY_TOGGLE',
      targetType: 'Song',
      targetId: id,
      details: { isHidden: nextHidden },
      ip: req.ip
    });

    res.json({ song: updated, isHidden: nextHidden, ok: true });
  } catch (err) {
    next(err);
  }
};

// 12. SOFT DELETE SONG
export const softDeleteSong = async (req, res, next) => {
  try {
    const { id } = req.params;
    const song = await db.song.findUnique({ where: { id } });
    if (!song) return res.status(404).json({ message: 'Song not found' });

    const updated = await db.song.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isHidden: true
      }
    });

    await recordAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'SONG_SOFT_DELETE',
      targetType: 'Song',
      targetId: id,
      details: { title: song.title },
      ip: req.ip
    });

    res.json({ message: `Song "${song.title}" soft deleted`, ok: true });
  } catch (err) {
    next(err);
  }
};

// 13. FIND DUPLICATES
export const findDuplicateSongs = async (req, res, next) => {
  try {
    const songs = await db.song.findMany({
      where: { deletedAt: null }
    });

    const groupsMap = new Map();
    for (const s of songs) {
      // Normalise title: lowercase, remove punctuation
      const key = (s.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!groupsMap.has(key)) groupsMap.set(key, []);
      groupsMap.get(key).push(s);
    }

    const duplicates = [];
    for (const [key, group] of groupsMap.entries()) {
      if (group.length > 1) {
        duplicates.push({
          key,
          count: group.length,
          songs: group
        });
      }
    }

    res.json({ duplicates, count: duplicates.length });
  } catch (err) {
    next(err);
  }
};

// 14. MERGE SONGS (asks for a second confirmation)
export const mergeDuplicateSongs = async (req, res, next) => {
  try {
    const { sourceSongId, targetSongId } = req.body || {};
    if (!sourceSongId || !targetSongId) {
      return res.status(400).json({ message: 'sourceSongId and targetSongId are required' });
    }
    if (sourceSongId === targetSongId) {
      return res.status(400).json({ message: 'Cannot merge a song into itself' });
    }

    try {
      await assertAdminPassword(req.user, password);
    } catch (err) {
      return res.status(401).json({ message: err.message });
    }

    const [source, target] = await Promise.all([
      db.song.findUnique({ where: { id: sourceSongId } }),
      db.song.findUnique({ where: { id: targetSongId } })
    ]);

    if (!source || !target) {
      return res.status(404).json({ message: 'Source or target song not found' });
    }

    // Mark source song as merged into canonical target
    await db.song.update({
      where: { id: sourceSongId },
      data: {
        canonicalGroupId: targetSongId,
        isHidden: true,
        deletedAt: new Date()
      }
    });

    await recordAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'SONG_MERGE',
      targetType: 'Song',
      targetId: sourceSongId,
      details: { sourceTitle: source.title, targetSongId, targetTitle: target.title },
      ip: req.ip
    });

    res.json({ message: `Merged "${source.title}" into canonical "${target.title}"`, ok: true });
  } catch (err) {
    next(err);
  }
};

// 15. HOME CONTENT & EDITORIAL PLAYLISTS
export const getHomeContent = async (req, res, next) => {
  try {
    const [featuredSongsSetting, chipsSetting, editorialPlaylistsSetting] = await Promise.all([
      db.appSetting.findUnique({ where: { key: 'home_featured_songs' } }),
      db.appSetting.findUnique({ where: { key: 'home_category_chips' } }),
      db.appSetting.findUnique({ where: { key: 'editorial_playlists' } })
    ]);

    res.json({
      featuredSongs: featuredSongsSetting?.value?.songIds || [],
      categoryChips: chipsSetting?.value?.chips || ['All', 'Romance', 'Mass', 'Melody', '90s Hits'],
      editorialPlaylists: editorialPlaylistsSetting?.value?.playlists || []
    });
  } catch (err) {
    next(err);
  }
};

export const updateHomeContent = async (req, res, next) => {
  try {
    const { featuredSongs, categoryChips, editorialPlaylists } = req.body || {};

    if (featuredSongs !== undefined) {
      await db.appSetting.upsert({
        where: { key: 'home_featured_songs' },
        create: { key: 'home_featured_songs', value: { songIds: featuredSongs } },
        update: { value: { songIds: featuredSongs } }
      });
    }

    if (categoryChips !== undefined) {
      await db.appSetting.upsert({
        where: { key: 'home_category_chips' },
        create: { key: 'home_category_chips', value: { chips: categoryChips } },
        update: { value: { chips: categoryChips } }
      });
    }

    if (editorialPlaylists !== undefined) {
      await db.appSetting.upsert({
        where: { key: 'editorial_playlists' },
        create: { key: 'editorial_playlists', value: { playlists: editorialPlaylists } },
        update: { value: { playlists: editorialPlaylists } }
      });
    }

    await recordAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'HOME_CONTENT_UPDATE',
      details: { featuredCount: featuredSongs?.length, chipCount: categoryChips?.length },
      ip: req.ip
    });

    res.json({ message: 'Home content updated successfully', ok: true });
  } catch (err) {
    next(err);
  }
};

// 16. MODERATION: COMMENTS
export const listReportedComments = async (req, res, next) => {
  try {
    const comments = await db.comment.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' }
    });
    res.json({ comments });
  } catch (err) {
    next(err);
  }
};

export const deleteComment = async (req, res, next) => {
  try {
    const { id } = req.params;
    await db.comment.delete({ where: { id } }).catch(() => {});

    await recordAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'COMMENT_DELETE',
      targetType: 'Comment',
      targetId: id,
      ip: req.ip
    });

    res.json({ message: 'Comment deleted', ok: true });
  } catch (err) {
    next(err);
  }
};

// 17. PLAYLISTS MANAGEMENT
export const listAdminPlaylists = async (req, res, next) => {
  try {
    const playlists = await db.playlist.findMany({
      take: 50,
      orderBy: { updatedAt: 'desc' }
    });
    res.json({ playlists });
  } catch (err) {
    next(err);
  }
};

export const toggleFeaturePlaylist = async (req, res, next) => {
  try {
    const { id } = req.params;
    const pl = await db.playlist.findUnique({ where: { id } });
    if (!pl) return res.status(404).json({ message: 'Playlist not found' });

    const isFeatured = !pl.isFeatured;
    const updated = await db.playlist.update({
      where: { id },
      data: { isFeatured }
    });

    await recordAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'PLAYLIST_FEATURE_TOGGLE',
      targetType: 'Playlist',
      targetId: id,
      details: { isFeatured },
      ip: req.ip
    });

    res.json({ playlist: updated, isFeatured, ok: true });
  } catch (err) {
    next(err);
  }
};

// 18. SETTINGS (REQUIRE_LOGIN, Maintenance Banner)
export const getAppSettings = async (req, res, next) => {
  try {
    const [loginSetting, bannerSetting, announcementSetting] = await Promise.all([
      db.appSetting.findUnique({ where: { key: 'require_login' } }),
      db.appSetting.findUnique({ where: { key: 'maintenance_banner' } }),
      db.appSetting.findUnique({ where: { key: 'announcement_text' } })
    ]);

    res.json({
      requireLogin: loginSetting?.value?.enabled !== undefined ? Boolean(loginSetting.value.enabled) : config.requireLogin,
      maintenanceBanner: bannerSetting?.value || { active: false, message: '' },
      announcementText: announcementSetting?.value || { active: false, message: '' }
    });
  } catch (err) {
    next(err);
  }
};

export const updateAppSettings = async (req, res, next) => {
  try {
    const { requireLogin, maintenanceBanner, announcementText } = req.body || {};

    if (requireLogin !== undefined) {
      const boolVal = Boolean(requireLogin);
      await db.appSetting.upsert({
        where: { key: 'require_login' },
        create: { key: 'require_login', value: { enabled: boolVal } },
        update: { value: { enabled: boolVal } }
      });
      // Synchronize in-memory config flag immediately
      config.requireLogin = boolVal;
    }

    if (maintenanceBanner !== undefined) {
      await db.appSetting.upsert({
        where: { key: 'maintenance_banner' },
        create: { key: 'maintenance_banner', value: maintenanceBanner },
        update: { value: maintenanceBanner }
      });
    }

    if (announcementText !== undefined) {
      await db.appSetting.upsert({
        where: { key: 'announcement_text' },
        create: { key: 'announcement_text', value: announcementText },
        update: { value: announcementText }
      });
    }

    await recordAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'APP_SETTINGS_UPDATE',
      details: { requireLogin, maintenanceBanner },
      ip: req.ip
    });

    res.json({
      message: 'App settings updated successfully',
      requireLogin: config.requireLogin,
      ok: true
    });
  } catch (err) {
    next(err);
  }
};

// 19. AUDIT LOGS
export const listAuditLogs = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        take: limit,
        skip,
        orderBy: { createdAt: 'desc' }
      }),
      db.auditLog.count()
    ]);

    res.json({
      logs,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    next(err);
  }
};

// 20. 2FA SETUP & VERIFY
export const setup2FA = async (req, res, next) => {
  try {
    const secret = generateTotpSecret();
    const uri = buildOtpAuthUri(req.user.email, secret);
    const recoveryCodes = generateRecoveryCodes(8);

    // Temporarily save secret until verified
    await db.user.update({
      where: { id: req.user.id },
      data: { twoFactorSecret: secret }
    });

    res.json({
      secret,
      uri,
      recoveryCodes
    });
  } catch (err) {
    next(err);
  }
};

export const verify2FA = async (req, res, next) => {
  try {
    const { token, recoveryCodes } = req.body || {};
    const user = await db.user.findUnique({ where: { id: req.user.id } });

    if (!user || !user.twoFactorSecret) {
      return res.status(400).json({ message: '2FA setup not initiated. Call setup first.' });
    }

    const isValid = verifyTotpToken(token, user.twoFactorSecret);
    if (!isValid) {
      return res.status(400).json({ message: 'Invalid 6-digit verification code' });
    }

    const hashedCodes = Array.isArray(recoveryCodes)
      ? recoveryCodes.map(hashRecoveryCode)
      : [];

    await db.user.update({
      where: { id: req.user.id },
      data: {
        twoFactorEnabled: true,
        twoFactorRecoveryCodes: hashedCodes
      }
    });

    await recordAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: '2FA_ENABLED',
      details: { recoveryCodeCount: hashedCodes.length },
      ip: req.ip
    });

    res.json({ message: 'Two-factor authentication successfully enabled', ok: true });
  } catch (err) {
    next(err);
  }
};

export const disable2FA = async (req, res, next) => {
  try {
    try {
      await assertAdminConfirmation(req.user, req.body);
    } catch (err) {
      return res.status(401).json({ message: err.message });
    }

    await db.user.update({
      where: { id: req.user.id },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorRecoveryCodes: []
      }
    });

    await recordAuditLog({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: '2FA_DISABLED',
      ip: req.ip
    });

    res.json({ message: 'Two-factor authentication disabled', ok: true });
  } catch (err) {
    next(err);
  }
};
