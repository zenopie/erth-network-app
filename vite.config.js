import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    proxy: {
      // Earth chain LCD. Points at a local node by default (the chain repo's
      // scripts/testnet-3val.sh); override with EARTH_LCD for a remote one.
      '/lcd': {
        target: process.env.EARTH_LCD ?? 'http://localhost:1317',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/lcd/, ''),
      },
      // The privacy backend (the handle directory stream).
      '/api': {
        target: process.env.EARTH_API ?? 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // CometBFT RPC. The explorer uses it for one thing the LCD cannot do:
      // fetching a range of blocks in a single request.
      '/rpc': {
        target: process.env.EARTH_RPC ?? 'http://localhost:26657',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rpc/, ''),
      },
    },
  },
  build: {
    outDir: 'build',
  },
  css: {
    modules: {
      localsConvention: 'camelCaseOnly',
    },
  },
});
