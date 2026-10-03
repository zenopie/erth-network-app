import { defineConfig } from 'vite';

// Bundles scripts/check-tx.mjs with all deps inlined so it runs under
// plain node; see scripts/check-tx.sh.
export default defineConfig({
  build: { ssr: 'scripts/check-tx.mjs', outDir: 'build-check', emptyOutDir: true, target: 'node18' },
  ssr: { noExternal: true, target: 'node' },
});
