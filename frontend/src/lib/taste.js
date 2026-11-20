// Onboarding picker: pure helpers (no network, no React). The choices come from the server (a fixed list); the rules are here so they can be tested.

export const STEPS = [
  { id: 'artists', title: 'Who do you love to hear?', hint: 'Pick a few singers. This shapes your first Daily Mixes.' },
  { id: 'composers', title: 'Which music directors?', hint: 'Whose music do you play again and again?' },
  { id: 'eras', title: 'Which eras?', hint: 'Pick the decades you like most.' },
];
export const RECOMMENDED = 3; // we suggest at least this many singers; it is never forced

/** Add or remove one choice. At the limit nothing more is added. @returns {{ list: string[], atLimit: boolean }} */
export function toggleChoice(list, value, max) {
  const has = list.includes(value);
  if (has) return { list: list.filter((v) => v !== value), atLimit: false };
  if (list.length >= max) return { list, atLimit: true };
  return { list: [...list, value], atLimit: list.length + 1 >= max };
}

/** What gets saved. Anything the server did not offer is dropped, so a stale list never produces a 400. */
export function picksPayload(picks, options) {
  const keep = (list, allowed) => (list || []).filter((v) => allowed.includes(v));
  return {
    artists: keep(picks.artists, options.artists),
    composers: keep(picks.composers, options.composers),
    eras: keep(picks.eras, options.eras.map((e) => e.id)),
  };
}

export const totalPicks = (picks) => (picks.artists?.length || 0) + (picks.composers?.length || 0) + (picks.eras?.length || 0);

/** Should the app take the person to the picker now? Once per browser session, never while they are already there or in the middle of something else. */
export function shouldOpenPicker({ shouldOnboard, pathname, askedThisSession }) {
  return Boolean(shouldOnboard) && !askedThisSession && !String(pathname || '').startsWith('/welcome') && !String(pathname || '').startsWith('/wrapped');
}

export const stepProgress = (index, total) => `${index + 1} of ${total}`;
