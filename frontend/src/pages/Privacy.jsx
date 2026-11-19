import React from 'react';

const H = ({ children }) => <h2 className="text-lg font-bold text-white mt-6 mb-2">{children}</h2>;
const P = ({ children }) => <p className="text-sm text-zinc-300 leading-6 mb-2">{children}</p>;
const L = ({ items }) => <ul className="list-disc pl-5 space-y-1 text-sm text-zinc-300 leading-6 mb-2">{items.map((t) => <li key={t}>{t}</li>)}</ul>;

/** Plain-language privacy notice. Describes what the app actually does; keep it in step with the code. */
const Privacy = () => (
  <article className="max-w-2xl mx-auto pb-10" data-testid="privacy-page">
    <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Privacy</h1>
    <p className="text-xs text-zinc-500 mt-1">TamilTunes is a personal, non-commercial project. No ads, no selling of data.</p>

    <H>What we keep when you have an account</H>
    <L items={[
      'Your name, email address, username and profile details you add (photo, bio). Your password is stored only as a secure hash.',
      'Your playlists, liked songs, comments, the songs you play (to build Speed Dial, Daily Mix and "Continue listening") and your play queue (song ids only).',
      'Reports you send when a video cannot be played (which song and video, and YouTube’s error code).',
    ]} />
    <P>This data is stored on our server (Render) and database (Neon). Password-reset emails are sent through an email service (Brevo or Resend) with only your email address and the reset link.</P>

    <H>On this device</H>
    <P>The app keeps small settings in your browser or phone: the sign-in token (in the Android app, in the app&apos;s private storage), recent searches, your queue for guests, video settings, videos that would not play for you (7 days), and whether you dismissed the install banner. Clearing the site data or uninstalling the app removes them.</P>

    <H>YouTube videos</H>
    <P>Video songs play through YouTube&apos;s official embedded player, in privacy-enhanced mode (youtube-nocookie.com). The YouTube player is only loaded when you open a video yourself. Once it plays, YouTube may set cookies or store data on your device and receives your IP address, under Google&apos;s privacy policy (policies.google.com/privacy). Video thumbnails are loaded from YouTube&apos;s image server (i.ytimg.com). Videos are never downloaded, stored or copied by TamilTunes.</P>

    <H>Music streams</H>
    <P>Audio is streamed from the music provider&apos;s servers, which receive your IP address like any website you visit. Songs are not downloaded or stored for offline use.</P>

    <H>Your choices</H>
    <L items={[
      'Make your profile private, hide your listening history, or delete your account in Settings.',
      'Turn "Prefer video" off and keep "Wi-Fi only video" on to load YouTube less often.',
      'Use the app without an account: then nothing about you is stored on our server.',
    ]} />
  </article>
);

export default Privacy;
