import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({
  plugins: [
    svelte(),
    tailwindcss(),
  ],
  server: {
    host: '127.0.0.1', // Listen only on localhost IP
    port: 3000
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
