// Generates the app icons from the site's own logo (the green rounded square with the white music note shown on the login pages:
// `bg-gradient-to-tr from-brand-600 to-brand-400` = #17a34a -> #1ed760, white lucide "eighth-note" at 24px inside a 48px square, radius 16).
// Run: node scripts/make-icons.mjs   (CHROMIUM_PATH=/path/to/chrome if Playwright's own browser is not installed)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = path.resolve('public/icons');
mkdirSync(OUT, { recursive: true });

const BG = '#09090B';
const FROM = '#17a34a'; // brand-600
const TO = '#1ed760'; // brand-400
const note = '<path d="m19 6-5.2-3.9a.5.5 0 0 0-.8.4V18"/><circle cx="9" cy="18" r="4"/>';

/** The logo alone on a transparent background (48 x 48): used for the favicon. */
export const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${FROM}"/><stop offset="1" stop-color="${TO}"/></linearGradient></defs><rect width="48" height="48" rx="16" fill="url(#g)"/><g transform="translate(12 12)" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${note}</g></svg>`;

/** The logo centred on a #09090B canvas; `scale` is the logo's share of the canvas width. */
const canvasSvg = (size, scale) => {
  const s = size * scale;
  const k = s / 48;
  const o = (size - s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${FROM}"/><stop offset="1" stop-color="${TO}"/></linearGradient></defs><rect width="${size}" height="${size}" fill="${BG}"/><g transform="translate(${o} ${o}) scale(${k})"><rect width="48" height="48" rx="16" fill="url(#g)"/><g transform="translate(12 12)" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${note}</g></g></svg>`;
};

const jobs = [
  ['icon-192.png', 192, 0.8],
  ['icon-512.png', 512, 0.8],
  ['maskable-192.png', 192, 0.56], // inside the 80% safe circle, so any launcher mask keeps the whole logo
  ['maskable-512.png', 512, 0.56],
  ['apple-touch-icon.png', 180, 0.8],
  ['splash-source.png', 2732, 0.22], // the logo small on the dark canvas (used for the Android splash screen later)
];

writeFileSync(path.resolve('public/favicon.svg'), `${logoSvg}\n`);
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
for (const [name, size, scale] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:${BG}">${canvasSvg(size, scale)}</body>`);
  await page.screenshot({ path: path.join(OUT, name), clip: { x: 0, y: 0, width: size, height: size } });
  console.log('wrote', name);
}
await browser.close();
