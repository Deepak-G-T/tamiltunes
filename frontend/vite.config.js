import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
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
})
