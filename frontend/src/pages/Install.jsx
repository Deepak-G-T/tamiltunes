import React, { useEffect, useState } from 'react';
import { Download, Smartphone, Monitor, Share, MoreVertical, PlusSquare } from 'lucide-react';
import { APK_URL, RELEASES_URL } from '../config/app';
import { getInstallEvent, isNativeApp, isStandalone, promptInstall } from '../lib/pwa';

const Step = ({ n, children }) => (
  <li className="flex gap-3">
    <span aria-hidden="true" className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-500/15 text-brand-300 text-xs font-bold flex items-center justify-center">{n}</span>
    <span className="text-sm text-zinc-300 leading-6">{children}</span>
  </li>
);

const Card = ({ icon: Icon, title, children }) => (
  <section className="rounded-2xl bg-surface-2 border border-white/10 p-5 space-y-4">
    <h2 className="flex items-center gap-2.5 text-lg font-bold text-white"><Icon className="w-5 h-5 text-brand-400" aria-hidden="true" />{title}</h2>
    {children}
  </section>
);

/** "Install the app": the Android APK and the install steps for the web app (PWA). Works without signing in. */
const Install = () => {
  const [canPrompt, setCanPrompt] = useState(() => Boolean(getInstallEvent()));
  const [done, setDone] = useState(false);
  useEffect(() => {
    const a = () => setCanPrompt(true);
    const d = () => { setCanPrompt(false); setDone(true); };
    window.addEventListener('tamiltunes:install-available', a);
    window.addEventListener('tamiltunes:installed', d);
    return () => { window.removeEventListener('tamiltunes:install-available', a); window.removeEventListener('tamiltunes:installed', d); };
  }, []);

  if (isNativeApp() || isStandalone()) {
    return <div className="max-w-xl mx-auto py-10 text-center space-y-2"><h1 className="text-2xl font-extrabold text-white">You are using the app</h1><p className="text-sm text-zinc-400">TamilTunes is already installed on this device.</p></div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5" data-testid="install-page">
      <div className="space-y-1">
        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Install the app</h1>
        <p className="text-sm text-zinc-400">Open TamilTunes from your home screen, with music controls on the lock screen. Free, no ads.</p>
      </div>

      <Card icon={Smartphone} title="Android app (APK)">
        <a href={APK_URL} className="press inline-flex items-center justify-center gap-2 min-h-12 px-6 rounded-full bg-brand-500 hover:bg-brand-400 text-black font-bold text-sm" data-testid="apk-link">
          <Download className="w-4 h-4" aria-hidden="true" /> Download for Android
        </a>
        <ol className="space-y-2.5">
          <Step n={1}>Tap <b>Download for Android</b> and open the file <b>TamilTunes.apk</b> when it finishes.</Step>
          <Step n={2}>If Android asks, allow your browser (for example Chrome) to <b>install unknown apps</b>, then go back and tap <b>Install</b>.</Step>
          <Step n={3}>Open <b>TamilTunes</b> from your app list. Later versions install over this one and keep your account.</Step>
        </ol>
        <p className="text-xs text-zinc-500">Only install the file from this page. All versions are listed on the <a className="underline hover:text-white" href={RELEASES_URL}>releases page</a>.</p>
      </Card>

      <Card icon={Monitor} title="Install from the browser (no download)">
        {canPrompt && !done && (
          <button type="button" onClick={async () => { const r = await promptInstall(); if (r !== 'accepted') setCanPrompt(false); }} className="press inline-flex items-center gap-2 min-h-12 px-6 rounded-full bg-white text-black font-bold text-sm" data-testid="install-now">
            <Download className="w-4 h-4" aria-hidden="true" /> Install TamilTunes now
          </button>
        )}
        {done && <p className="text-sm text-brand-300">Installed. Look for TamilTunes on your home screen.</p>}
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-white mb-2">Android (Chrome)</h3>
            <ol className="space-y-2"><Step n={1}>Open this site in <b>Chrome</b>.</Step><Step n={2}>Tap the <MoreVertical className="inline w-4 h-4 -mt-0.5" aria-hidden="true" /> menu, then <b>Install app</b> (or <b>Add to Home screen</b>).</Step><Step n={3}>Confirm. TamilTunes appears on your home screen.</Step></ol>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white mb-2">iPhone and iPad (Safari)</h3>
            <ol className="space-y-2"><Step n={1}>Open this site in <b>Safari</b>.</Step><Step n={2}>Tap <Share className="inline w-4 h-4 -mt-0.5" aria-hidden="true" /> <b>Share</b>, then <PlusSquare className="inline w-4 h-4 -mt-0.5" aria-hidden="true" /> <b>Add to Home Screen</b>.</Step></ol>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white mb-2">Computer (Chrome or Edge)</h3>
            <ol className="space-y-2"><Step n={1}>Click the <b>install</b> icon at the right end of the address bar, or open the menu and choose <b>Install TamilTunes</b>.</Step></ol>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default Install;
