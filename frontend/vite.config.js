import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Dedicated proxy for AFA SSE stream — must come before the general /api rule
      '/api/v1/ops/events': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        // Disable buffering so SSE frames are forwarded immediately
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Accept', 'text/event-stream');
          });
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['cache-control'] = 'no-cache';
            proxyRes.headers['x-accel-buffering'] = 'no';
          });
          proxy.on('error', (err) => {
            console.warn('[Vite SSE Proxy] Error:', err.message);
          });
        },
      },
      // General API proxy
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
