import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: 'https://api.erth.network',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Earth chain LCD. Points at a local `ignite chain serve` by default;
      // override with EARTH_LCD to develop against a remote node.
      '/lcd': {
        target: process.env.EARTH_LCD ?? 'http://localhost:1317',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/lcd/, ''),
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
