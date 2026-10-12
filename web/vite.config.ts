import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // shared/ (styles.json, protocol fixtures) lives outside the web root.
  server: { port: 5173, strictPort: true, fs: { allow: ['..'] } },
  preview: { port: 4173, strictPort: true },
})
