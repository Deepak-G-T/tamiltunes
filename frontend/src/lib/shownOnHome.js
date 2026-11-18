// Songs the home page is showing right now. The radio keeps them out of its suggestions, so autoplay does not
// just repeat what you saw on the home page a minute ago.
let shown = [];

export const setShownOnHome = (ids) => { shown = [...new Set((ids || []).filter(Boolean))].slice(0, 60); };
export const getShownOnHome = () => shown;
