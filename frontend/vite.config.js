import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
// `vite build --mode nativetest` is only for scripts/native-audit.mjs: the Capacitor plugins are swapped for recording mocks and the output goes
// to dist-nativetest, so the real build is never touched.
const nativeMocks = fileURLToPath(new URL('./scripts/native-mocks/index.js', import.meta.url))
const appUpdaterReal = fileURLToPath(new URL('./src/lib/appUpdaterPlugin.js', import.meta.url))
const appUpdaterMock = fileURLToPath(new URL('./scripts/native-mocks/appUpdater.js', import.meta.url))
const NATIVE_PACKAGES = ['@capacitor/app', '@capacitor/preferences', '@capacitor/network', '@capacitor/share', '@capacitor/haptics', '@capacitor/status-bar', '@capacitor/splash-screen', 'capacitor-music-controls-plugin', '@capgo/capacitor-social-login']

export default defineConfig(({ mode }) => ({
  ...(mode === 'nativetest' ? { build: { outDir: 'dist-nativetest', emptyOutDir: true }, resolve: { alias: { ...Object.fromEntries(NATIVE_PACKAGES.map((p) => [p, nativeMocks])), '@tamiltunes/app-updater': appUpdaterMock } } } : { resolve: { alias: { '@tamiltunes/app-updater': appUpdaterReal } } }),
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      disable: mode === 'nativetest',
      strategies: 'injectManifest', // our own worker in src/sw.js: it decides exactly what may be cached
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'prompt', // a new version waits for "Reload": a silent reload would stop the music
      injectRegister: false, // registered in src/lib/pwa.js (not inside the native app)
      includeAssets: ['favicon.svg', 'offline.html', 'icons/apple-touch-icon.png'],
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'], globIgnores: ['**/splash-source.png', '**/screenshot-*.png'], maximumFileSizeToCacheInBytes: 3 * 1024 * 1024 },
      manifest: {
        id: '/',
        name: 'TamilTunes',
        short_name: 'TamilTunes',
        description: 'Discover, search and stream your favourite Tamil songs, 90s melodies and Kollywood hits.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#09090B',
        background_color: '#09090B',
        categories: ['music'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        screenshots: [
          { src: '/icons/screenshot-narrow.png', sizes: '540x960', type: 'image/png', form_factor: 'narrow', label: 'Home' },
          { src: '/icons/screenshot-wide.png', sizes: '1280x720', type: 'image/png', form_factor: 'wide', label: 'Home on a computer' },
        ],
      },
    }),
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      '/audio': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      '/local-songs': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
}))
