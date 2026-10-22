import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/health': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/auth': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/profiles': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/policy': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/access-requests': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/sessions': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/sql-events': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/violations': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/stream': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/risk-scores': {
        target: 'http://localhost:5000',
        changeOrigin: true
      },
      '/alerts': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  }
});
