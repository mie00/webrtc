import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  server: {
    host: '127.0.0.1', // Listen only on localhost IP
    port: 3000
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
