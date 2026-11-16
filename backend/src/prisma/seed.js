import { PrismaClient } from '@prisma/client';
import { CURATED_TAMIL_SONGS, CURATED_ALBUMS, CURATED_ARTISTS } from '../services/music/localAudioProvider.js';

const prisma = new PrismaClient();

export const seedDatabase = async () => {
  console.log('Seeding PostgreSQL database with authentic Tamil music catalog...');

  // 1. Seed Songs
  for (const s of CURATED_TAMIL_SONGS) {
    try {
      await prisma.song.upsert({
        where: { id: s.id },
        create: {
          id: s.id,
          title: s.title,
          artist: s.artist || s.singers || 'Tamil Artist',
          album: s.album || null,
          duration: s.duration || 210,
          image: s.image || null,
          streamUrl: s.streamUrl || s.cdnStreamUrl || null,
          isPlayable: true,
          licenseNotice: s.licenseNotice || null
        },
        update: {
          title: s.title,
          artist: s.artist || s.singers || 'Tamil Artist',
          album: s.album || null,
          image: s.image || null,
          streamUrl: s.streamUrl || s.cdnStreamUrl || null,
          licenseNotice: s.licenseNotice || null
        }
      });
    } catch (err) {
      console.warn(`Could not seed song ${s.title}:`, err.message);
    }
  }

  // 2. Seed Albums
  for (const a of CURATED_ALBUMS) {
    try {
      await prisma.album.upsert({
        where: { id: a.id },
        create: {
          id: a.id,
          name: a.name || a.title,
          artist: a.artist || 'Tamil Artist',
          image: a.image || null,
          year: a.year || '2023'
        },
        update: {
          name: a.name || a.title,
          artist: a.artist || 'Tamil Artist',
          image: a.image || null,
          year: a.year || '2023'
        }
      });
    } catch (err) {
      console.warn(`Could not seed album ${a.name}:`, err.message);
    }
  }

  // 3. Seed Artists
  for (const art of CURATED_ARTISTS) {
    try {
      await prisma.artist.upsert({
        where: { id: art.id },
        create: {
          id: art.id,
          name: art.name,
          image: art.image || null,
          role: art.role || 'Artist'
        },
        update: {
          name: art.name,
          image: art.image || null,
          role: art.role || 'Artist'
        }
      });
    } catch (err) {
      console.warn(`Could not seed artist ${art.name}:`, err.message);
    }
  }

  console.log('PostgreSQL database seeding completed successfully');
};

// Direct script execution support
if (process.argv[1]?.endsWith('seed.js')) {
  seedDatabase()
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error('Seed execution error:', e);
      prisma.$disconnect();
      process.exit(1);
    });
}
