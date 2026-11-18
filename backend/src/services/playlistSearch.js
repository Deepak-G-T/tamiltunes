/**
 * Search other people's PUBLIC playlists by name (for the Playlists group in search).
 * Private playlists never appear, and neither do public playlists of users whose profile is private.
 * Prisma/PostgreSQL in production, in-memory in dev and tests.
 */
import { db, usingPostgres, getPrismaClient } from '../prisma/client.js';

const view = (p, owner, songCount, cover) => ({
  id: p.id,
  name: p.name,
  description: p.description ?? null,
  songCount,
  cover: cover ?? null,
  owner: owner ? { username: owner.username ?? null, name: owner.name } : null,
});

export async function searchPublicPlaylists(query, limit = 8) {
  const q = String(query || '').trim().slice(0, 100);
  if (q.length < 2) return [];

  if (usingPostgres()) {
    const rows = await getPrismaClient().playlist.findMany({
      where: { isPublic: true, name: { contains: q, mode: 'insensitive' }, user: { isPublicProfile: true } },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: {
        user: { select: { username: true, name: true } },
        songs: { take: 1, orderBy: { position: 'asc' }, include: { song: { select: { image: true } } } },
        _count: { select: { songs: true } },
      },
    });
    return rows.map((p) => view(p, p.user, p._count.songs, p.songs[0]?.song?.image));
  }

  const needle = q.toLowerCase();
  const out = [];
  for (const p of db.playlists.values()) {
    if (!p.isPublic || !String(p.name).toLowerCase().includes(needle)) continue;
    const owner = db.users.get(p.userId);
    if (!owner || owner.isPublicProfile === false) continue;
    const entries = [...db.playlistSongs.values()].filter((ps) => ps.playlistId === p.id);
    const first = entries[0] && db.songs.get(entries[0].songId);
    out.push(view(p, owner, entries.length, first?.image));
    if (out.length >= limit) break;
  }
  return out;
}
