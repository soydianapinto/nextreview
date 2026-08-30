import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const chromeExtensionHtml = (): Plugin => ({
  name: 'chrome-extension-html',
  apply: 'build',
  transformIndexHtml(html) {
    return html.replaceAll(' crossorigin', '')
  },
})

export default defineConfig({
  base: './',
  plugins: [react(), chromeExtensionHtml()],
  build: {
    sourcemap: false,
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: resolve(import.meta.dirname, 'index.html'),
        background: resolve(import.meta.dirname, 'src/background.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) =>
          chunkInfo.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})
