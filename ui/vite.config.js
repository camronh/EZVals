import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `npm run build` writes the UI into the Go host, which embeds it. `npm run dev` proxies the API to `ezvals serve --port 8987`.
export default defineConfig({
  plugins: [react()],
  build: { outDir: '../cmd/ezvals/web', emptyOutDir: true },
  server: {
    host: '127.0.0.1',
    proxy: { '/api': 'http://127.0.0.1:8987', '/results': 'http://127.0.0.1:8987' },
  },
})
