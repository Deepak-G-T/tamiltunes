import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAudio } from '../../context/AudioContext';
import { isNativeApp } from '../../lib/platform';
import { decideBack, topOverlay } from '../../lib/backAction';
import { pathFromLink } from '../../lib/native';
import { SITE_URL } from '../../config/app';

/**
 * Android-only glue (renders nothing, does nothing in a browser):
 *  - the Back button closes a menu / dialog, then the player, then the queue, then goes back a page, then exits (lib/backAction.js);
 *  - links to our site (App Links) open the right page inside the app.
 */
const NativeBridge = () => {
  const navigate = useNavigate();
  const audio = useAudio();
  const latest = useRef(audio);
  latest.current = audio;
  const nav = useRef(navigate);
  nav.current = navigate;

  useEffect(() => {
    if (!isNativeApp()) return undefined;
    let cancelled = false;
    const handles = [];
    import('@capacitor/app').then(async ({ App }) => {
      const back = await App.addListener('backButton', ({ canGoBack }) => {
        const a = latest.current;
        const overlay = topOverlay();
        const action = decideBack({ overlayOpen: Boolean(overlay), fullScreen: a.isFullScreen, queueOpen: a.isQueueOpen, canGoBack });
        if (action === 'close-overlay') overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        else if (action === 'close-player') a.setIsFullScreen(false);
        else if (action === 'close-queue') a.setIsQueueOpen(false);
        else if (action === 'back') window.history.back();
        else App.exitApp();
      });
      const link = await App.addListener('appUrlOpen', ({ url }) => {
        const path = pathFromLink(url, new URL(SITE_URL).host);
        if (path) nav.current(path);
      });
      handles.push(back, link);
      if (cancelled) handles.forEach((h) => h.remove());
    }).catch(() => { /* plugin unavailable */ });
    return () => { cancelled = true; handles.forEach((h) => h.remove()); };
  }, []);

  return null;
};

export default NativeBridge;
