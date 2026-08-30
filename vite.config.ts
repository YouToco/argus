import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // mediainfo.js wasm is imported with `?url` and emitted as an asset; keep it as-is
    chunkSizeWarningLimit: 1600,
  },
})
