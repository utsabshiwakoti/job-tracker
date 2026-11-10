import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The dev server forwards /api to FastAPI, so the browser sees one origin (no CORS setup needed locally).
// API_URL lets a second copy point at a different backend (e.g. the demo used for screenshots).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': process.env.API_URL || 'http://localhost:8000',
    },
  },
})
