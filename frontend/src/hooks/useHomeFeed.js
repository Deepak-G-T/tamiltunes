import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';

const TAB_PARAM = { '90s': 'nineties', '2000s': 'twoThousands' }; // category chip -> server tab name

/**
 * The home page's shelves from ONE request (GET /api/home): every section is assembled together on the server, so a song
 * is never shown twice. `excludeIds` are the Speed Dial songs on screen; they are sent once per tab (a snapshot), so the page
 * does not reshuffle while you play songs and Speed Dial changes underneath.
 * @param {{ tab: string, ready: boolean, excludeIds: string[] }} args  `ready`: Speed Dial has finished loading
 */
export function useHomeFeed({ tab, ready, excludeIds }) {
  const [state, setState] = useState({ status: 'loading', hero: null, sections: [] });
  const excludeRef = useRef(excludeIds);
  excludeRef.current = excludeIds;
  const gen = useRef(0);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    if (!ready) return undefined;
    const mine = ++gen.current;
    const params = {};
    const exclude = excludeRef.current.filter(Boolean).slice(0, 60);
    if (exclude.length) params.exclude = exclude.join(',');
    if (tab !== 'all') params.tab = TAB_PARAM[tab] || tab;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((s) => ({ ...s, status: s.sections.length ? 'refreshing' : 'loading' })); // keep what is on screen while a new tab loads
    api.get('/home', { params })
      .then(({ data }) => {
        if (mine !== gen.current) return;
        setState({ status: 'ready', hero: data.hero || null, sections: data.sections || [] });
      })
      .catch(() => {
        if (mine !== gen.current) return;
        setState((s) => ({ ...s, status: 'error' }));
      });
    return () => { gen.current += 1; };
  }, [tab, ready, retryTick]);

  const retry = useCallback(() => setRetryTick((n) => n + 1), []);
  return { ...state, retry };
}
