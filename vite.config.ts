import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
export default defineConfig({plugins:[react(),viteSingleFile()],publicDir:false,base:'./',build:{target:'es2022',assetsInlineLimit:10000000,chunkSizeWarningLimit:6000},server:{port:4173,strictPort:true}});
