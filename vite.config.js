import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Custom plugin to copy index.html to 404.html for SPA routing on GitHub Pages
function copyIndexTo404Plugin() {
  let outDir = 'dist'; // Default Vite output directory
  return {
    name: 'vite-plugin-copy-index-to-404',
    apply: 'build', // Apply only during build
    configResolved(resolvedConfig) {
      // Store the resolved output directory from the Vite config
      outDir = resolvedConfig.build.outDir;
    },
    closeBundle() {
      const indexPath = path.join(outDir, 'index.html');
      const notFoundPath = path.join(outDir, '404.html');
      try {
        if (fs.existsSync(indexPath)) {
          fs.copyFileSync(indexPath, notFoundPath);
          console.log(`[vite-plugin-copy-index-to-404] Copied ${indexPath} to ${notFoundPath}`);
        } else {
          console.warn(`[vite-plugin-copy-index-to-404] ${indexPath} not found. Skipping copy to 404.html.`);
        }
      } catch (error) {
        console.error(`[vite-plugin-copy-index-to-404] Error copying index.html to 404.html:`, error);
      }
    }
  };
}

export default defineConfig({
  plugins: [
    svelte(),
    tailwindcss(),
    copyIndexTo404Plugin(),
    viteStaticCopy({
      targets: [
        {
          src: 'CNAME',
          dest: '.' // copies CNAME to the root of the outDir
        },
      ]
    }),
  ],
  server: {
    host: '127.0.0.1', // Listen only on localhost IP
    port: 3000,

  },
  build: {
    outDir: 'docs',
    emptyOutDir: true,
    sourcemap: false, // Explicitly enable sourcemaps for the build                                                                                                                                          
    rollupOptions: {                                                                                                                                                                                        
      input: {                                                                                                                                                                                              
        // Your main application entry (Vite usually infers this from index.html)                                                                                                                           
        main: resolve(__dirname, 'index.html'),
        // Add service-worker.ts as a separate entry point
        'service-worker': resolve(__dirname, 'service-worker.ts'),
      },
      output: {
        // Control the output file names
        entryFileNames: assetInfo => {
          // Output service-worker.js directly in the dist root
          if (assetInfo.name === 'service-worker') {
            return 'service-worker.js';
          }
          // Default naming for other entries (like your main app bundle)
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      }
    }
  }
});
