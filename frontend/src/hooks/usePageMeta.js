import { useEffect } from 'react';

const set = (selector, attr, key, content) => {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  const prev = el.getAttribute('content');
  el.setAttribute('content', content);
  return () => el.setAttribute('content', prev ?? '');
};

/**
 * Sets the title and description/Open Graph tags while a page is mounted, then restores them.
 * Note: this helps browsers and link-preview scripts that run JS. Crawlers that don't run JS
 * are served by the optional /api/og edge function (see frontend/api/og.js).
 */
export function usePageMeta({ title, description, image, url } = {}) {
  useEffect(() => {
    if (!title) return undefined;
    const prevTitle = document.title;
    document.title = title;
    const undo = [
      description && set('meta[name="description"]', 'name', 'description', description),
      set('meta[property="og:title"]', 'property', 'og:title', title),
      description && set('meta[property="og:description"]', 'property', 'og:description', description),
      image && set('meta[property="og:image"]', 'property', 'og:image', image),
      set('meta[property="og:url"]', 'property', 'og:url', url || window.location.href),
      set('meta[property="og:type"]', 'property', 'og:type', 'profile'),
      set('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary'),
    ].filter(Boolean);
    return () => {
      document.title = prevTitle;
      undo.forEach((fn) => fn());
    };
  }, [title, description, image, url]);
}
