import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path';
export default defineConfig({
  plugins: [
    svelte(),
    tailwindcss(),
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
        'CNAME': resolve(__dirname, 'CNAME'),
      },                                                                                                                                                                                                    
      output: {                                                                                                                                                                                             
        // Control the output file names                                                                                                                                                                    
        entryFileNames: assetInfo => {                                                                                                                                                                      
          // Output service-worker.js directly in the dist root                                                                                                                                             
          if (assetInfo.name === 'service-worker') {                                                                                                                                                        
            return 'service-worker.js';                                                                                                                                                                     
          } else if (assetInfo.name === 'CNAME') {
            return 'CNAME';
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
