import { defineConfig } from 'vite';
export default defineConfig({
  build: { ssr: 'scripts/check-staking.mjs', outDir: 'build-check', emptyOutDir: true, target: 'node18' },
  ssr: { noExternal: true, target: 'node' },
});
