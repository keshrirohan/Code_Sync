import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Production URLs
const PROD_BACKEND = 'https://codesync-api-5p2c.onrender.com';

export default defineConfig({
  plugins: [react()],

  define: {
    // Bake the production backend URL into the bundle so it's available
    // even when VITE_API_URL is not set in the environment.
    // import.meta.env.VITE_API_URL takes precedence if it is set.
  },

  server: {
    port: 5173,
    // In local dev, proxy /api requests to the deployed backend so
    // you don't need to run the server locally (and CORS is bypassed).
    proxy: {
      '/api': {
        target: PROD_BACKEND,
        changeOrigin: true,
        secure: true,
      },
    },
  },

  build: {
    outDir: 'dist',
  },
});
