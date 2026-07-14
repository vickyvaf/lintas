import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api/mayar-sandbox': {
        target: 'https://api.mayar.club',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/mayar-sandbox/, ''),
      },
      '/api/mayar-production': {
        target: 'https://api.mayar.id',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/mayar-production/, ''),
      }
    }
  }
})
