import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    // local dev against the API container
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: false } },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        // keep vendor code in its own long-cached chunk
        manualChunks: { vendor: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'], markdown: ['marked', 'dompurify'] },
      },
    },
  },
});
