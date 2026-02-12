import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const frontendPort = Number(process.env.PORT || process.env.FRONTEND_PORT || 13007)

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: frontendPort,
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port: frontendPort,
    strictPort: true,
  },
})
