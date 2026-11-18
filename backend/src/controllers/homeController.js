import { buildHome, TAB_TITLES } from '../services/homeFeed/homeFeedService.js';
import { videoLookup } from '../services/music/videoLookup.js';

/**
 * GET /api/home?exclude=id1,id2&tab=melodies
 * One call builds every home section together, so a song is never shown twice. `exclude` carries the Speed dial songs
 * already on screen (also for guests, whose plays live only in the browser).
 */
export const getHome = async (req, res, next) => {
  try {
    const exclude = String(req.query.exclude || '').split(',').map((s) => s.trim()).filter((s) => /^[\w.:\-~]{1,128}$/.test(s)).slice(0, 60);
    const tab = typeof req.query.tab === 'string' && TAB_TITLES[req.query.tab] ? req.query.tab : null;
    const feed = await buildHome({ userId: req.user?.id || null, exclude, tab });
    const withVideo = (items, kind) => (kind === 'songs' ? videoLookup.attach(items) : items);
    res.json({
      success: true,
      seed: feed.seed,
      hero: feed.hero ? videoLookup.attach([feed.hero])[0] : null,
      sections: feed.sections.map((s) => ({ ...s, items: withVideo(s.items, s.kind) })),
      hidden: feed.hidden,
    });
  } catch (err) { next(err); }
};
