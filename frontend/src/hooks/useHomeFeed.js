import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { newVisit, readShown, writeShown } from '../lib/homeVisit';

const TAB_PARAM = { '90s': 'nineties', '2000s': 'twoThousands' }; // category chip -> server tab name

/**
 * The home page's shelves from ONE request (GET /api/home): every section is assembled together on the server, so a song
 * is never shown twice. `excludeIds` are the Speed Dial songs on screen; they are sent once per tab (a snapshot), so the page
 * does not reshuffle while you play songs and Speed Dial changes underneath.
 * Every app open is a new `visit` and so a new mix (Daily Mix, shelf order); `refresh()` starts another one (pull to refresh). Songs shown
 * last time are sent as `avoid` so the new mix starts with songs you did not just see. Switching tabs keeps the same visit.
 * @param {{ tab: string, ready: boolean, excludeIds: string[], artists?: string[] }} args  `ready`: Speed Dial has finished loading; `artists`: a guest's favourite artists
 */
export function useHomeFeed({ tab, ready, excludeIds, artists = [] }) {
  const [state, setState] = useState({ status: 'loading', hero: null, sections: [] });
  const excludeRef = useRef(excludeIds);
  excludeRef.current = excludeIds;
  const artistsRef = useRef(artists);
  artistsRef.current = artists;
  const gen = useRef(0);
  const visit = useRef(newVisit());
  const avoid = useRef(readShown(typeof window === 'undefined' ? null : window.localStorage)); // what the last visit showed
  const [retryTick, setRetryTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    if (!ready) return undefined;
    const mine = ++gen.current;
    const params = {};
    const exclude = excludeRef.current.filter(Boolean).slice(0, 60);
    if (exclude.length) params.exclude = exclude.join(',');
    if (tab !== 'all') params.tab = TAB_PARAM[tab] || tab;
    params.visit = visit.current;
    if (avoid.current.length) params.avoid = avoid.current.join(',');
    if (artistsRef.current.length) params.artists = artistsRef.current.join(',');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((s) => ({ ...s, status: s.sections.length ? 'refreshing' : 'loading' })); // keep what is on screen while a new tab loads
    api.get('/home', { params })
      .then(({ data }) => {
        if (mine !== gen.current) return;
        setState({ status: 'ready', hero: data.hero || null, sections: data.sections || [] });
        setRefreshing(false);
        if (tab === 'all') writeShown(window.localStorage, [data.hero?.id, ...(data.sections || []).flatMap((sec) => (sec.kind === 'songs' ? sec.items.map((x) => x.id) : []))]);
      })
      .catch(() => {
        if (mine !== gen.current) return;
        setState((s) => ({ ...s, status: 'error' }));
        setRefreshing(false);
      });
    return () => { gen.current += 1; };
  }, [tab, ready, retryTick]);

  const retry = useCallback(() => setRetryTick((n) => n + 1), []);
  /** A new mix now: what is on screen is remembered (so it sinks), a new visit token is used, the shelves stay until the new ones arrive. */
  const refresh = useCallback(() => {
    const s = latest.current;
    const ids = [s.hero?.id, ...s.sections.flatMap((sec) => (sec.kind === 'songs' ? sec.items.map((x) => x.id) : []))].filter(Boolean);
    if (ids.length) avoid.current = ids.slice(0, 80);
    visit.current = newVisit();
    setRefreshing(true);
    setRetryTick((n) => n + 1);
  }, []);
  return { ...state, retry, refresh, refreshing };
}
