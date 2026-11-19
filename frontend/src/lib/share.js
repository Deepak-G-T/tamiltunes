import { isNativeApp } from './platform';

/** Can this device share a link? Android's WebView has no Web Share API, so the native app uses the Capacitor Share plugin. */
export const canShare = () => isNativeApp() || (typeof navigator !== 'undefined' && typeof navigator.share === 'function');

/**
 * Open the system share sheet (or copy the link where there is none). Resolves to 'shared', 'copied' or 'cancelled'; never throws.
 * @param {{ title?: string, text?: string, url: string }} data
 */
export async function shareLink({ title, text, url }) {
  try {
    if (isNativeApp()) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title, text, url, dialogTitle: 'Share' });
      return 'shared';
    }
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({ title, text, url });
      return 'shared';
    }
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'cancelled'; // the person closed the share sheet, or copying is not allowed
  }
}
